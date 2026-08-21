from __future__ import annotations

import calendar
import json
from datetime import date, datetime, time
from pathlib import Path
from typing import Any

import polars as pl


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\achri\OneDrive\DATA SCIENCE\Car-Crash-Research\demostrativo_acidentes_aco.csv")
STORE = ROOT / ".sherlock_datasets"
REGISTRY = STORE / "registry.json"
DOCS = ROOT / "docs"
ASSET_TS = ROOT / "src" / "carCrashStudyAssets.ts"

RAW_DATASET_ID = "dataset-0a60488afe9944b9ab9eb6bb4135550a"
REFINED_DATASET_ID = "dataset-car-crash-study-refined"
REFINED_PARQUET = STORE / f"{REFINED_DATASET_ID}.parquet"


def normalize_occurrence(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    lower = text.lower()
    if lower.startswith("sem") or lower.startswith("acidente s"):
        return "sem vitima"
    if lower.startswith("com") or lower.startswith("acidente c") or "atropel" in lower:
        return "com vitima"
    return lower


def normalize_direction(value: Any) -> str | None:
    if value is None:
        return None
    lower = str(value).strip().lower()
    if lower in {"n", "norte", "pista norte", "rj", "crescente"}:
        return "Norte"
    if lower in {"s", "sul", "pista sul", "decrescente"}:
        return "Sul"
    return str(value).strip()


def minute_of_day(value: Any) -> int | None:
    if value is None:
        return None
    parts = str(value).strip().split(":")
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None


def month_abbr(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return calendar.month_abbr[int(value)]
    except (ValueError, TypeError):
        return None


def type_name(dtype: pl.DataType) -> str:
    if is_numeric_dtype(dtype):
        return "number"
    if dtype in {pl.Date, pl.Datetime, pl.Time}:
        return "datetime"
    if dtype == pl.Boolean:
        return "boolean"
    return "text"


def is_numeric_dtype(dtype: pl.DataType) -> bool:
    return dtype.is_numeric() and dtype != pl.Boolean


def json_safe(value: Any) -> Any:
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


def schema_for(frame: pl.DataFrame) -> list[dict[str, str]]:
    return [{"name": name, "type": type_name(dtype)} for name, dtype in zip(frame.columns, frame.dtypes)]


def registry_schema(frame: pl.DataFrame) -> dict[str, str]:
    return {name: type_name(dtype) for name, dtype in zip(frame.columns, frame.dtypes)}


def result_payload(frame: pl.DataFrame, limit: int | None = None) -> dict[str, Any]:
    data = frame if limit is None else frame.head(limit)
    numeric = [name for name, dtype in zip(frame.columns, frame.dtypes) if is_numeric_dtype(dtype)]
    rows = json_safe(data.to_dicts())
    return {
        "schema": schema_for(frame),
        "rows": rows,
        "previewRows": rows,
        "chartRows": rows,
        "metadata": {"rowCount": frame.height, "columnCount": frame.width, "numericColumns": numeric},
    }


def chart_cell(cell_id: str, node_id: str, label: str, result: dict[str, Any], layer: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": cell_id,
        "type": "visualization-chart",
        "flowAssetId": "asset-car-crash-visualization-flow",
        "nodeId": node_id,
        "nodeLabel": label,
        "result": result,
        "layers": [{"id": f"{cell_id}-layer", "color": "#0f62fe", "aggregation": "sum", **layer}],
        "importedAt": "2026-08-20T12:00:00-03:00",
    }


def preview_cell(cell_id: str, node_id: str, label: str, frame: pl.DataFrame, start: int = 1, end: int = 10) -> dict[str, Any]:
    rows = json_safe(frame.slice(start - 1, end - start + 1).to_dicts())
    return {
        "id": cell_id,
        "type": "visualization-preview",
        "flowAssetId": "asset-car-crash-visualization-flow",
        "nodeId": node_id,
        "nodeLabel": label,
        "range": {"start": start, "end": end},
        "rows": rows,
        "sourceRows": json_safe(frame.to_dicts()),
        "schema": schema_for(frame),
        "totalRows": frame.height,
        "importedAt": "2026-08-20T12:00:00-03:00",
    }


def ts_string(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def build_study() -> tuple[pl.DataFrame, dict[str, pl.DataFrame]]:
    frame = pl.read_csv(SOURCE, separator=";", infer_schema_length=2000, ignore_errors=True).drop_nulls()

    number_columns = [
        "n_da_ocorrencia",
        "automovel",
        "bicicleta",
        "caminhao",
        "moto",
        "onibus",
        "outros",
        "tracao_animal",
        "transporte_de_cargas_especiais",
        "trator_maquinas",
        "utilitarios",
        "ilesos",
        "levemente_feridos",
        "moderadamente_feridos",
        "gravemente_feridos",
        "mortos",
    ]

    frame = frame.with_columns(
        pl.col("tipo_de_ocorrencia").map_elements(normalize_occurrence, return_dtype=pl.Utf8).alias("tipo_de_ocorrencia"),
        pl.col("sentido").map_elements(normalize_direction, return_dtype=pl.Utf8).alias("sentido"),
        pl.col("km").cast(pl.Utf8).str.replace_all(",", ".").cast(pl.Float64, strict=False).alias("km"),
        pl.col("data").str.strptime(pl.Date, "%d/%m/%Y", strict=False).alias("data"),
        pl.col("horario").map_elements(minute_of_day, return_dtype=pl.Int64).alias("hora_minuto"),
    )
    frame = frame.filter(~pl.col("tipo_de_ocorrencia").cast(pl.Utf8).str.contains("ac", literal=True).fill_null(False))
    frame = frame.with_columns(
        pl.col("data").dt.year().alias("ano"),
        pl.col("data").dt.month().alias("mes"),
        pl.col("km").round(0).cast(pl.Int64, strict=False).alias("km_arredondado"),
        *[pl.col(column).cast(pl.Float64, strict=False).alias(column) for column in number_columns if column in frame.columns],
    )
    frame = frame.with_columns(pl.col("mes").map_elements(month_abbr, return_dtype=pl.Utf8).alias("mes_nome"))

    tables = {
        "occurrence_counts": frame.group_by("tipo_de_ocorrencia", maintain_order=True).len(name="count").sort("count", descending=True),
        "annual_counts": frame.group_by("ano", maintain_order=True).len(name="count").sort("ano"),
        "monthly_2010_2014": frame.filter(pl.col("ano").is_between(2010, 2014))
        .group_by(["ano", "mes", "mes_nome"], maintain_order=True)
        .len(name="count")
        .sort(["ano", "mes"]),
        "km_sentido": frame.group_by(["km_arredondado", "sentido"], maintain_order=True).len(name="count").sort(["km_arredondado", "sentido"]),
        "km_acidente_2017": frame.filter(pl.col("ano") == 2017)
        .group_by(["km_arredondado", "tipo_de_acidente"], maintain_order=True)
        .len(name="count")
        .sort(["km_arredondado", "tipo_de_acidente"]),
    }
    return frame, tables


def update_registry(frame: pl.DataFrame) -> None:
    STORE.mkdir(exist_ok=True)
    frame.write_parquet(REFINED_PARQUET)
    registry = json.loads(REGISTRY.read_text(encoding="utf-8")) if REGISTRY.exists() else {}
    now = datetime.now().isoformat(timespec="seconds")
    registry[REFINED_DATASET_ID] = {
        "id": REFINED_DATASET_ID,
        "filename": "demostrativo_acidentes_aco_refined_study.parquet",
        "sourceFilename": SOURCE.name,
        "path": str(REFINED_PARQUET),
        "parquetPath": str(REFINED_PARQUET),
        "delimiter": ";",
        "rowCount": frame.height,
        "columns": frame.columns,
        "schema": registry_schema(frame),
        "bytes": REFINED_PARQUET.stat().st_size,
        "sampled": False,
        "createdAt": now,
    }
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")


def flow_definition() -> dict[str, Any]:
    nodes = [
        {"id": "source", "kind": "source", "label": "Dataset refinado do estudo", "x": 80, "y": 120, "params": {}, "width": 320, "height": 150},
        {"id": "occurrence", "kind": "groupBy", "label": "Ocorrencias por tipo", "x": 480, "y": 40, "params": {"columns": ["tipo_de_ocorrencia"], "measures": []}, "width": 380, "height": 180},
        {"id": "pie-occurrence", "kind": "chart", "label": "Sem vitimas x com vitimas", "x": 940, "y": 40, "params": {}, "layers": [{"id": "pie-layer", "type": "pie", "x": "tipo_de_ocorrencia", "y": "count", "aggregation": "sum", "color": "#0f62fe"}], "width": 560, "height": 420},
        {"id": "select-boxes", "kind": "select", "label": "Colunas numericas principais", "x": 480, "y": 280, "params": {"columns": ["km", "n_da_ocorrencia", "hora_minuto"]}, "width": 430, "height": 180},
        {"id": "box-main", "kind": "chart", "label": "Distribuicoes numericas", "x": 940, "y": 520, "params": {}, "layers": [{"id": "box-layer", "type": "boxplot", "x": "km", "y": "km", "color": "#0f62fe"}], "width": 680, "height": 460},
        {"id": "annual", "kind": "groupBy", "label": "Acidentes por ano", "x": 480, "y": 540, "params": {"columns": ["ano"], "measures": []}, "width": 380, "height": 180},
        {"id": "line-annual", "kind": "chart", "label": "Acidentes por ano", "x": 940, "y": 1020, "params": {}, "layers": [{"id": "line-layer", "type": "line", "x": "ano", "y": "count", "aggregation": "sum", "color": "#0f62fe"}], "width": 680, "height": 420},
        {"id": "km-sentido", "kind": "groupBy", "label": "KM por sentido", "x": 480, "y": 800, "params": {"columns": ["km_arredondado", "sentido"], "measures": []}, "width": 380, "height": 180},
        {"id": "bar-km-sentido", "kind": "chart", "label": "Acidentes por KM e sentido", "x": 1660, "y": 520, "params": {}, "layers": [{"id": "bar-km-layer", "type": "bar", "x": "km_arredondado", "y": "count", "series": "sentido", "barMode": "grouped", "aggregation": "sum", "color": "#0f62fe"}], "width": 760, "height": 500},
        {"id": "filter-2017", "kind": "filter", "label": "Somente 2017", "x": 480, "y": 1060, "params": {"column": "ano", "operator": "equals", "value": "2017"}, "width": 360, "height": 180},
        {"id": "km-acidente-2017", "kind": "groupBy", "label": "2017 por KM e acidente", "x": 900, "y": 1500, "params": {"columns": ["km_arredondado", "tipo_de_acidente"], "measures": []}, "width": 420, "height": 180},
        {"id": "bar-2017", "kind": "chart", "label": "2017: tipo por KM", "x": 1460, "y": 1420, "params": {}, "layers": [{"id": "bar-2017-layer", "type": "bar", "x": "km_arredondado", "y": "count", "series": "tipo_de_acidente", "barMode": "stacked", "aggregation": "sum", "color": "#0f62fe"}], "width": 800, "height": 520},
    ]
    connections = [
        {"id": "c-source-occurrence", "from": "source", "to": "occurrence"},
        {"id": "c-occurrence-pie", "from": "occurrence", "to": "pie-occurrence"},
        {"id": "c-source-select", "from": "source", "to": "select-boxes"},
        {"id": "c-select-box", "from": "select-boxes", "to": "box-main"},
        {"id": "c-source-annual", "from": "source", "to": "annual"},
        {"id": "c-annual-line", "from": "annual", "to": "line-annual"},
        {"id": "c-source-km", "from": "source", "to": "km-sentido"},
        {"id": "c-km-bar", "from": "km-sentido", "to": "bar-km-sentido"},
        {"id": "c-source-2017", "from": "source", "to": "filter-2017"},
        {"id": "c-filter-2017-group", "from": "filter-2017", "to": "km-acidente-2017"},
        {"id": "c-km-2017-bar", "from": "km-acidente-2017", "to": "bar-2017"},
    ]
    return {"sourceAssetId": "asset-car-crash-refined-study", "nodes": nodes, "connections": connections, "updatedAt": "2026-08-20T12:00:00-03:00"}


def build_notebook(frame: pl.DataFrame, tables: dict[str, pl.DataFrame]) -> dict[str, Any]:
    drop_pct = None
    annual = tables["annual_counts"]
    last_year = annual["ano"].max()
    if 2013 in annual["ano"].to_list() and last_year in annual["ano"].to_list():
        by_year = {row["ano"]: row["count"] for row in annual.to_dicts()}
        drop_pct = round((by_year[2013] - by_year[last_year]) / by_year[2013] * 100, 2)
    intro = (
        "# Estudo de acidentes na BR-393/RJ\n\n"
        "Recriacao do notebook original no Sherlock usando dataset completo no backend. "
        "O CSV foi lido com separador `;`, limpo, enriquecido com ano/mes/hora em minutos e salvo como Parquet operacional.\n\n"
        f"- Linhas refinadas: **{frame.height}**\n"
        f"- Colunas refinadas: **{frame.width}**\n"
        f"- Queda 2013 -> {last_year}: **{drop_pct}%**\n"
    )
    return {
        "version": 1,
        "cells": [
            {"id": "md-intro", "type": "markdown", "source": intro},
            preview_cell("preview-refined", "source", "Dataset refinado", frame.select(["data", "horario", "tipo_de_ocorrencia", "km", "sentido", "tipo_de_acidente", "ano", "mes_nome"]).head(30)),
            chart_cell("chart-occurrence", "pie-occurrence", "Sem vitimas x com vitimas", result_payload(tables["occurrence_counts"]), {"type": "pie", "x": "tipo_de_ocorrencia", "y": "count"}),
            chart_cell("chart-km-box", "box-main", "Boxplot KM", result_payload(frame.select("km")), {"type": "boxplot", "x": "km", "y": "km"}),
            chart_cell("chart-occurrence-number-box", "box-occurrence-number", "Boxplot n_da_ocorrencia", result_payload(frame.select("n_da_ocorrencia")), {"type": "boxplot", "x": "n_da_ocorrencia", "y": "n_da_ocorrencia"}),
            chart_cell("chart-time-box", "box-time", "Boxplot horario em minutos", result_payload(frame.select("hora_minuto")), {"type": "boxplot", "x": "hora_minuto", "y": "hora_minuto"}),
            chart_cell("chart-annual-line", "line-annual", "Acidentes por ano", result_payload(tables["annual_counts"]), {"type": "line", "x": "ano", "y": "count"}),
            chart_cell("chart-monthly-bar", "bar-monthly", "Meses de 2010 a 2014", result_payload(tables["monthly_2010_2014"]), {"type": "bar", "x": "mes_nome", "y": "count", "series": "ano", "barMode": "grouped"}),
            chart_cell("chart-km-sentido", "bar-km-sentido", "Acidentes por KM e sentido", result_payload(tables["km_sentido"]), {"type": "bar", "x": "km_arredondado", "y": "count", "series": "sentido", "barMode": "grouped"}),
            chart_cell("chart-2017", "bar-2017", "2017: tipo de acidente por KM", result_payload(tables["km_acidente_2017"]), {"type": "bar", "x": "km_arredondado", "y": "count", "series": "tipo_de_acidente", "barMode": "stacked"}),
        ],
    }


def write_assets(frame: pl.DataFrame, notebook: dict[str, Any]) -> None:
    updated = "2026-08-20T12:00:00-03:00"
    flow = flow_definition()
    content = f'''import type {{ Asset, Workspace }} from "./domain";

export const carCrashStudyWorkspaces: Workspace[] = [
  {{
    id: "project-estrada-study",
    type: "project",
    name: "Estrada",
    description: "Workspace com a recriacao do estudo de acidentes da BR-393/RJ.",
    status: "Active",
    updatedAt: "{updated}",
    tags: ["estrada", "acidentes", "estudo"],
    storage: "Storage local",
    serviceIds: ["service-runtime", "service-object-storage"]
  }}
];

export const carCrashStudyAssets: Asset[] = [
  {{
    id: "asset-car-crash-raw",
    workspaceId: "project-estrada-study",
    type: "data",
    name: "demostrativo_acidentes_aco.csv",
    description: "CSV original do estudo, carregado com separador ponto e virgula.",
    status: "Ready",
    version: 1,
    tags: ["csv", "estrada", "raw"],
    updatedAt: "{updated}",
    lineage: [],
    dependencies: [],
    visibility: "active",
    metadata: {{
      backendDatasetId: "{RAW_DATASET_ID}",
      rowCount: "12581",
      delimiter: ";"
    }}
  }},
  {{
    id: "asset-car-crash-refined-study",
    workspaceId: "project-estrada-study",
    type: "data",
    name: "demostrativo_acidentes_aco_refined_study.parquet",
    description: "Dataset refinado reproduzindo a limpeza e enriquecimento do notebook original.",
    status: "Ready",
    version: 1,
    tags: ["parquet", "estrada", "refined"],
    updatedAt: "{updated}",
    lineage: ["asset-car-crash-raw"],
    dependencies: ["asset-car-crash-raw"],
    visibility: "active",
    metadata: {{
      backendDatasetId: "{REFINED_DATASET_ID}",
      rowCount: "{frame.height}",
      columns: {ts_string(",".join(frame.columns))},
      backendSchema: {ts_string(json.dumps(registry_schema(frame), ensure_ascii=False))}
    }}
  }},
  {{
    id: "asset-car-crash-visualization-flow",
    workspaceId: "project-estrada-study",
    type: "data-visualization-flow",
    name: "Fluxo visual - estudo acidentes BR-393",
    description: "Fluxo no data visualizer com as visualizacoes recriadas do estudo.",
    status: "Ready",
    version: 1,
    tags: ["visualizacao", "estrada", "estudo"],
    updatedAt: "{updated}",
    lineage: ["asset-car-crash-refined-study"],
    dependencies: ["asset-car-crash-refined-study"],
    visibility: "active",
    metadata: {{
      sourceAssetId: "asset-car-crash-refined-study",
      definition: {ts_string(json.dumps(flow, ensure_ascii=False))}
    }}
  }},
  {{
    id: "asset-car-crash-notebook",
    workspaceId: "project-estrada-study",
    type: "notebook",
    name: "Notebook - estudo acidentes BR-393",
    description: "Notebook visual com markdown e snapshots das visualizacoes do estudo.",
    status: "Ready",
    version: 1,
    tags: ["notebook", "estrada", "estudo"],
    updatedAt: "{updated}",
    lineage: ["asset-car-crash-visualization-flow"],
    dependencies: ["asset-car-crash-visualization-flow"],
    visibility: "active",
    metadata: {{
      format: "visual-notebook-v1",
      document: {ts_string(json.dumps(notebook, ensure_ascii=False))}
    }}
  }}
];
'''
    ASSET_TS.write_text(content, encoding="utf-8")


def write_documentation(frame: pl.DataFrame, tables: dict[str, pl.DataFrame]) -> None:
    DOCS.mkdir(exist_ok=True)
    source_rows = pl.read_csv(SOURCE, separator=";", infer_schema_length=100, ignore_errors=True).height
    text = f"""# Recriacao do estudo Car Crash Research no Sherlock

## Acoes executadas

1. Li o notebook original em `C:\\Users\\achri\\OneDrive\\DATA SCIENCE\\Car-Crash-Research\\main.ipynb`.
2. Identifiquei o CSV usado no estudo: `demostrativo_acidentes_aco.csv`.
3. Recarreguei o CSV com separador `;`, preservando o dataset completo no backend.
4. Apliquei as limpezas do notebook: `drop_nulls`, normalizacao de `tipo_de_ocorrencia`, filtro de residuos com `ac`, conversao de `data`, conversao de `km`, normalizacao de `sentido` e criacao de `ano`, `mes`, `mes_nome`, `hora_minuto` e `km_arredondado`.
5. Gravei o dataset refinado em Parquet como `{REFINED_DATASET_ID}`.
6. Criei assets seedados para workspace, data asset bruto, data asset refinado, fluxo de visualizacao e notebook visual.
7. Recriei visualizacoes principais no Data Visualizer e no notebook.

## Resultado

- Linhas no CSV original: {source_rows}
- Linhas depois da limpeza: {frame.height}
- Colunas depois da limpeza: {frame.width}
- Ocorrencias por tipo: {tables["occurrence_counts"].to_dicts()}
- Anos analisados: {tables["annual_counts"]["ano"].min()} a {tables["annual_counts"]["ano"].max()}

## Visualizacoes recriadas

- Pizza: sem vitima x com vitima.
- Boxplot: `km`.
- Boxplot: `n_da_ocorrencia`.
- Boxplot: `hora_minuto`.
- Linha: acidentes por ano.
- Barras agrupadas: meses de 2010 a 2014.
- Barras agrupadas: acidentes por `km_arredondado` e `sentido`.
- Barras empilhadas: 2017 por `km_arredondado` e `tipo_de_acidente`.

## Dificuldades anotadas

- O notebook original usa acentos em categorias, mas o projeto evita depender de normalizacao textual instavel. Mantive `com vitima` e `sem vitima` sem acento no asset refinado para evitar divergencias de encoding.
- O estudo original mistura limpeza, analise e graficos em celulas soltas. No Sherlock isso foi separado em data asset refinado, fluxo visual e notebook visual.
- O app ainda nao tem todos os controles interativos do Plotly original, entao recriei as visualizacoes como snapshots funcionais do Data Visualizer.
- Nao havia uma branch git anterior normal para checkout seguro; mantive a implementacao atual e preservei o salvamento de asset por node de tabela.
"""
    (DOCS / "car-crash-sherlock-recreation.md").write_text(text, encoding="utf-8")


def main() -> None:
    frame, tables = build_study()
    update_registry(frame)
    notebook = build_notebook(frame, tables)
    write_assets(frame, notebook)
    write_documentation(frame, tables)
    print(f"created {REFINED_DATASET_ID}: {frame.height} rows, {frame.width} columns")


if __name__ == "__main__":
    main()
