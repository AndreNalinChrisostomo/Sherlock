from __future__ import annotations

import os
import re
import time
import ast
import csv
import hashlib
import json
import uuid
from datetime import datetime
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import numpy as np
import polars as pl
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.cluster import AgglomerativeClustering, DBSCAN, KMeans
from sklearn.compose import ColumnTransformer
from sklearn.decomposition import PCA
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor, VotingClassifier, VotingRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.manifold import TSNE
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, mean_squared_error, r2_score, silhouette_score
from sklearn.mixture import GaussianMixture
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.model_selection import train_test_split

app = FastAPI(title="Sherlock AutoAI", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

MAX_DATASET_ROWS = 500_000


class RunRequest(BaseModel):
    config: dict[str, Any]
    rows: list[dict[str, Any]]


class VisualizationRequest(BaseModel):
    rows: list[dict[str, Any]] = []
    datasetId: str | None = None
    nodes: list[dict[str, Any]]
    connections: list[dict[str, str]]
    targetNodeId: str | None = None
    previewLimit: int = 40
    previewStart: int = 1
    previewEnd: int = 40
    # Only direct inputs of chart nodes include their full result in the
    # response. Node previews stay bounded by previewStart/previewEnd.
    fullNodeIds: list[str] = []


class VisualizationRefineRequest(VisualizationRequest):
    name: str = ""


class RlSessionRequest(BaseModel):
    environment: str
    workspaceId: str = "default-workspace"
    candidateName: str = "candidate"
    observationSize: int = 4
    actionCount: int = 3
    targetEpisodes: int = 1
    learningRate: float = 0.1
    discount: float = 0.99
    exploration: float = 0.1
    algorithm: str = "q-learning"


class RlTransitionRequest(BaseModel):
    observation: list[float]
    action: int
    reward: float
    nextObservation: list[float]
    done: bool = False
    episode: int | None = None


class RlEpisodeSummaryRequest(BaseModel):
    episode: int
    totalReward: float
    steps: int
    success: bool = False


class RlSaveModelRequest(BaseModel):
    sessionId: str
    name: str = ""


class RlModelActionRequest(BaseModel):
    observation: list[float]


class DatasetSampleRequest(BaseModel):
    name: str = ""
    limit: int = MAX_DATASET_ROWS
    seed: int = 739


class RefineryStepRequest(BaseModel):
    id: str | None = None
    operation: str
    column: str | None = None
    value: str | None = None
    target: str | None = None
    direction: str | None = None
    parameters: dict[str, Any] | None = None


class DatasetRefineryRequest(BaseModel):
    steps: list[RefineryStepRequest] = []
    previewStart: int = 1
    previewEnd: int = 50
    name: str = ""


_visualization_cache: dict[str, pl.DataFrame] = {}
_dataset_frame_cache: dict[str, pl.DataFrame] = {}
_rl_sessions: dict[str, dict[str, Any]] = {}
_rl_saved_models: dict[str, dict[str, Any]] = {}
_dataset_store = Path(__file__).resolve().parent.parent / ".sherlock_datasets"
_dataset_store.mkdir(exist_ok=True)
_dataset_staging_store = _dataset_store / "staging"
_dataset_staging_store.mkdir(exist_ok=True)
_dataset_registry_path = _dataset_store / "registry.json"
_dataset_staging_registry: dict[str, dict[str, Any]] = {}


def load_dataset_registry() -> dict[str, dict[str, Any]]:
    if not _dataset_registry_path.exists():
        return {}
    try:
        loaded = json.loads(_dataset_registry_path.read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, dict) else {}
    except json.JSONDecodeError:
        return {}


_dataset_registry: dict[str, dict[str, Any]] = load_dataset_registry()


def save_dataset_registry() -> None:
    _dataset_registry_path.write_text(json.dumps(_dataset_registry, ensure_ascii=False, indent=2), encoding="utf-8")


def dataset_separator(delimiter: str | None, filename: str) -> str:
    if delimiter and delimiter not in {"auto", ""}:
        return delimiter
    return "\t" if filename.lower().endswith(".tsv") else ","


def detect_delimiter(path: Path, filename: str, delimiter: str | None) -> str:
    if delimiter and delimiter not in {"auto", ""}:
        return delimiter
    if filename.lower().endswith(".tsv"):
        return "\t"
    try:
        sample = path.read_text(encoding="utf-8", errors="ignore")[:8192]
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        return dialect.delimiter
    except csv.Error:
        return ","


def count_delimited_rows(path: Path) -> int:
    if path.stat().st_size == 0:
        return 0
    with path.open("rb") as handle:
        lines = 0
        last = b""
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            lines += chunk.count(b"\n")
            last = chunk[-1:]
    if last != b"\n":
        lines += 1
    return max(0, lines - 1)


def require_dataset(dataset_id: str) -> dict[str, Any]:
    dataset = _dataset_registry.get(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset backend nao encontrado.")
    dataset = migrate_dataset_if_needed(dataset_id, dataset)
    row_count = int(dataset.get("rowCount", 0) or 0)
    if row_count > MAX_DATASET_ROWS:
        raise HTTPException(status_code=422, detail={
            "code": "DATASET_OVER_LIMIT",
            "datasetId": dataset_id,
            "rowCount": row_count,
            "limit": MAX_DATASET_ROWS,
            "canSample": True,
        })
    path = dataset_path(dataset)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo do dataset backend nao encontrado.")
    return dataset


def dataset_path(dataset: dict[str, Any]) -> Path:
    return Path(str(dataset.get("parquetPath") or dataset.get("path") or ""))


def polars_read_csv(path: Path, filename: str, delimiter: str, nrows: int | None = None) -> pl.DataFrame:
    separator = detect_delimiter(path, filename, delimiter)
    return pl.read_csv(path, separator=separator, n_rows=nrows, infer_schema_length=1000, ignore_errors=True)


def polars_scan_csv(path: Path, filename: str, delimiter: str) -> pl.LazyFrame:
    separator = detect_delimiter(path, filename, delimiter)
    return pl.scan_csv(path, separator=separator, infer_schema_length=1000, ignore_errors=True)


def deterministic_sample_lazy(lazy_frame: pl.LazyFrame, sample_count: int, seed: int) -> pl.DataFrame:
    row_index = pl.col("__row_nr").cast(pl.UInt64)
    return (
        lazy_frame
        .with_row_index("__row_nr")
        .with_columns(((row_index * pl.lit(1_103_515_245, dtype=pl.UInt64) + pl.lit(seed, dtype=pl.UInt64)) % pl.lit(2_147_483_647, dtype=pl.UInt64)).alias("__sample_key"))
        .sort("__sample_key")
        .head(sample_count)
        .drop(["__row_nr", "__sample_key"])
        .collect()
    )


def schema_payload(frame: pl.DataFrame) -> list[dict[str, str]]:
    return visualization_schema(frame)


def write_parquet_from_delimited(source_path: Path, filename: str, delimiter: str, target_path: Path) -> pl.DataFrame:
    frame = polars_read_csv(source_path, filename, delimiter)
    frame.write_parquet(target_path)
    return frame.head(1000)


def migrate_dataset_if_needed(dataset_id: str, dataset: dict[str, Any]) -> dict[str, Any]:
    if dataset.get("parquetPath"):
        return dataset
    legacy_path = Path(str(dataset.get("path", "")))
    if not legacy_path.exists():
        return dataset
    row_count = int(dataset.get("rowCount") or count_delimited_rows(legacy_path))
    dataset["rowCount"] = row_count
    if row_count > MAX_DATASET_ROWS:
        _dataset_registry[dataset_id] = dataset
        save_dataset_registry()
        return dataset
    parquet_path = _dataset_store / f"{dataset_id}.parquet"
    preview_frame = write_parquet_from_delimited(
        legacy_path,
        str(dataset.get("filename", legacy_path.name)),
        str(dataset.get("delimiter", "auto")),
        parquet_path,
    )
    dataset.update({
        "parquetPath": str(parquet_path),
        "sourceFilename": dataset.get("filename", legacy_path.name),
        "columns": [str(column) for column in preview_frame.columns],
        "schema": schema_payload(preview_frame),
        "sampled": bool(dataset.get("sampled", False)),
    })
    _dataset_registry[dataset_id] = dataset
    save_dataset_registry()
    return dataset


def read_dataset_frame(dataset_id: str, nrows: int | None = None) -> pl.DataFrame:
    dataset = require_dataset(dataset_id)
    path = dataset_path(dataset)
    if path.suffix.lower() == ".parquet":
        frame = pl.read_parquet(path)
        return frame.head(nrows) if nrows is not None else frame
    return polars_read_csv(path, str(dataset.get("filename", path.name)), str(dataset.get("delimiter", "auto")), nrows)


def read_dataset_frame_from_path(path: Path, filename: str, delimiter: str, nrows: int | None = None) -> pl.DataFrame:
    return polars_read_csv(path, filename, delimiter, nrows)


def clamp_number(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def rl_state_key(values: list[float], size: int) -> str:
    padded = (values + [0.0] * size)[:size]
    buckets = [str(int(clamp_number(round((float(value) + 2.0) * 3), 0, 12))) for value in padded]
    return ":".join(buckets)


def rl_best_action(q_values: list[float]) -> int:
    return int(max(range(len(q_values)), key=lambda index: q_values[index]))


def rl_session_policy(session_id: str, session: dict[str, Any]) -> dict[str, Any]:
    rewards = session["episodeRewards"]
    return {
        "sessionId": session_id,
        "policyVersion": session["policyVersion"],
        "actionCount": session["actionCount"],
        "stateCount": len(session["q"]),
        "exploration": round(float(session["exploration"]), 6),
        "averageReward": round(float(sum(rewards) / max(len(rewards), 1)), 6),
    }


def rl_environment_status(session_id: str, session: dict[str, Any]) -> dict[str, Any]:
    rewards = session["episodeRewards"]
    successes = session.get("successes", 0)
    episodes = max(session.get("currentEpisode", 0), len(rewards), 1)
    return {
        "sessionId": session_id,
        "environment": session["environment"],
        "workspaceId": session["workspaceId"],
        "candidateName": session["candidateName"],
        "status": session["status"],
        "currentEpisode": session.get("currentEpisode", 0),
        "totalSteps": session["steps"],
        "policyVersion": session["policyVersion"],
        "averageReward": round(float(sum(rewards) / max(len(rewards), 1)), 6),
        "bestReward": round(float(session.get("bestReward", 0.0)), 6),
        "successRate": round(float(successes / episodes), 6),
        "progress": round(float(session.get("progress", 0.0)), 6),
        "updatedAt": session["updatedAt"],
    }


def require_rl_session(session_id: str) -> dict[str, Any]:
    session = _rl_sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessao de treino RL nao encontrada.")
    return session


def visualization_type(dtype: pl.DataType) -> str:
    if dtype in pl.NUMERIC_DTYPES:
        return "number"
    if dtype == pl.Boolean:
        return "boolean"
    if dtype == pl.Date or dtype == pl.Datetime or dtype == pl.Time:
        return "datetime"
    return "text"


def visualization_schema(frame: pl.DataFrame) -> list[dict[str, str]]:
    result = []
    for column, dtype in zip(frame.columns, frame.dtypes):
        kind = visualization_type(dtype)
        result.append({"name": str(column), "type": kind})
    return result


def sanitize_records(frame: pl.DataFrame) -> list[dict[str, Any]]:
    rows = frame.to_dicts()
    for row in rows:
        for key, value in list(row.items()):
            if isinstance(value, float) and not np.isfinite(value):
                row[key] = None
            elif isinstance(value, datetime):
                row[key] = value.isoformat(timespec="milliseconds")
            elif hasattr(value, "isoformat"):
                row[key] = value.isoformat()
    return rows


def visualization_result(frame: pl.DataFrame, node_id: str, preview_start: int, preview_end: int, cache_hit: bool = False, include_full: bool = False, output_port: str = "primary") -> dict[str, Any]:
    safe = frame
    numeric = [column for column, dtype in zip(safe.columns, safe.dtypes) if dtype in pl.NUMERIC_DTYPES]
    start = max(1, int(preview_start))
    end = max(start + 1, int(preview_end))
    preview = safe.slice(start - 1, max(0, end - start + 1))
    result = {
        "nodeId": node_id,
        "outputPort": output_port,
        "schema": visualization_schema(safe),
        "rows": sanitize_records(preview),
        "metadata": {"rowCount": int(safe.height), "granularity": "row" if safe.height else "empty", "numericColumns": numeric, "lineage": [node_id]},
        "cacheHit": cache_hit,
    }
    if include_full:
        result["chartRows"] = sanitize_records(safe)
    return result


def parse_visualization_date(value: Any, date_format: str) -> Any:
    if value is None or str(value).strip() == "":
        return None
    text = str(value).strip()
    parsed: datetime | None = None
    try:
        parsed = datetime.strptime(text, date_format)
    except ValueError:
        for candidate in ("%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                parsed = datetime.strptime(text, candidate)
                break
            except ValueError:
                continue
        if parsed is None:
            try:
                parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            except ValueError:
                return None
    directives = set(re.findall(r"%[a-zA-Z]", date_format))
    if date_format in {"%Y", "%y", "%m", "%d", "%H", "%M", "%S"}:
        return {
            "%Y": parsed.year,
            "%y": parsed.year % 100,
            "%m": parsed.month,
            "%d": parsed.day,
            "%H": parsed.hour,
            "%M": parsed.minute,
            "%S": parsed.second,
        }[date_format]
    if {"%d", "%m", "%Y"}.issubset(directives):
        return parsed
    return parsed.strftime(date_format)


def cast_visualization_date(frame: pl.DataFrame, column: str, date_format: str | None) -> pl.DataFrame:
    if not date_format:
        return frame.with_columns(pl.col(column).cast(pl.Utf8, strict=False).str.strptime(pl.Datetime, strict=False).alias(column))
    values = [parse_visualization_date(value, date_format) for value in frame[column].to_list()]
    return frame.with_columns(pl.Series(column, values))


def profile_type(dtype: pl.DataType) -> str:
    if dtype in pl.NUMERIC_DTYPES and dtype != pl.Boolean:
        return "number"
    if dtype == pl.Boolean:
        return "boolean"
    if dtype == pl.Date or dtype == pl.Datetime or dtype == pl.Time:
        return "date"
    return "text"


def non_missing_expr(column: str) -> pl.Expr:
    text = pl.col(column).cast(pl.Utf8, strict=False).str.strip_chars()
    return pl.col(column).is_not_null() & (text != "")


def numeric_series(frame: pl.DataFrame, column: str) -> pl.Series:
    return frame[column].cast(pl.Float64, strict=False).drop_nulls()


def rounded(value: Any, digits: int = 4) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
        if not np.isfinite(number):
            return None
        return round(number, digits)
    except (TypeError, ValueError):
        return None


def quality_score(completeness_pct: float, duplicate_pct: float) -> int:
    return int(round(max(0.0, min(100.0, completeness_pct - duplicate_pct * 0.5))))


def build_profile_suggestions(column_profiles: list[dict[str, Any]], duplicate_rows: int) -> list[str]:
    suggestions: list[str] = []
    if duplicate_rows:
        suggestions.append(f"Remover {duplicate_rows} linhas duplicadas antes do treino.")
    numeric_missing = [item for item in column_profiles if item["kind"] == "number" and item["missing"] > 0]
    categorical_missing = [item for item in column_profiles if item["kind"] not in {"number", "empty"} and item["missing"] > 0]
    if numeric_missing:
        suggestions.append("Tratar nulos numericos com media, mediana ou imputacao adequada.")
    if categorical_missing:
        suggestions.append("Tratar nulos categoricos com moda ou categoria explicita.")
    for item in column_profiles[:20]:
        if item["missing"]:
            suggestions.append(f"Tratar nulos em {item['name']} com imputacao adequada.")
        if item["kind"] == "text" and 1 < item["unique"] <= 20:
            suggestions.append(f"Codificar categorica {item['name']} com one-hot, ordinal ou target encoding.")
    return suggestions[:12]


def data_profile(frame: pl.DataFrame) -> dict[str, Any]:
    total_rows = int(frame.height)
    total_columns = int(frame.width)
    if total_columns:
        null_counts = frame.null_count().row(0, named=True)
    else:
        null_counts = {}
    duplicate_rows = max(0, total_rows - frame.unique(maintain_order=True).height) if total_rows and total_columns else 0
    column_profiles: list[dict[str, Any]] = []
    for column, dtype in zip(frame.columns, frame.dtypes):
        name = str(column)
        kind = profile_type(dtype)
        missing = int(null_counts.get(column, 0))
        if kind == "text":
            empty_count = frame.select((pl.col(column).cast(pl.Utf8, strict=False).str.strip_chars() == "").sum()).item()
            missing += int(empty_count or 0)
        valid = frame.filter(non_missing_expr(column)) if total_rows else frame
        unique = int(valid.select(pl.col(column).n_unique()).item()) if valid.height else 0
        frequency_rows = []
        if valid.height:
            try:
                frequency_rows = (
                    valid
                    .group_by(column, maintain_order=True)
                    .agg(pl.len().alias("count"))
                    .sort("count", descending=True)
                    .to_dicts()
                )
            except Exception:
                frequency_rows = []
        frequencies = [{"value": str(row.get(column, "")), "count": int(row.get("count", 0) or 0)} for row in frequency_rows]
        examples = [str(value) for value in valid[column].head(3).to_list()] if valid.height else []
        profile: dict[str, Any] = {
            "name": name,
            "kind": kind if valid.height else "empty",
            "missing": missing,
            "unique": unique,
            "uniqueCapped": False,
            "trackedValues": [item["value"] for item in frequencies[:50]],
            "examples": examples,
            "frequencies": frequencies,
        }
        if kind == "number":
            series = numeric_series(frame, column)
            profile.update({
                "min": rounded(series.min()),
                "q1": rounded(series.quantile(0.25)),
                "median": rounded(series.median()),
                "q3": rounded(series.quantile(0.75)),
                "max": rounded(series.max()),
                "mean": rounded(series.mean(), 2),
                "stdDev": rounded(series.std()),
            })
        column_profiles.append(profile)
    total_cells = max(total_rows * max(total_columns, 1), 1)
    missing_cells = int(sum(item["missing"] for item in column_profiles))
    completeness_pct = round(((total_cells - missing_cells) / total_cells) * 100, 4)
    duplicate_pct = round((duplicate_rows / max(total_rows, 1)) * 100, 4)
    quality = {
        "completenessPct": completeness_pct,
        "duplicatePct": duplicate_pct,
        "missingCells": missing_cells,
        "totalCells": total_cells,
    }
    return {
        "rows": total_rows,
        "columns": total_columns,
        "duplicateRows": duplicate_rows,
        "duplicateRowsApproximate": False,
        "qualityScore": quality_score(completeness_pct, duplicate_pct),
        "quality": quality,
        "columnProfiles": column_profiles,
        "suggestions": build_profile_suggestions(column_profiles, duplicate_rows),
    }


def dataset_signature(dataset_id: str) -> tuple[dict[str, Any], str]:
    dataset = require_dataset(dataset_id)
    source_path = dataset_path(dataset)
    payload = {
        "datasetId": dataset_id,
        "path": str(source_path),
        "bytes": source_path.stat().st_size,
        "mtime": source_path.stat().st_mtime,
        "delimiter": dataset.get("delimiter", "auto"),
    }
    return dataset, hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def read_cached_dataset_frame(dataset_id: str, signature: str) -> pl.DataFrame:
    cached = _dataset_frame_cache.get(signature)
    if cached is not None:
        return cached
    frame = read_dataset_frame(dataset_id)
    _dataset_frame_cache.clear()
    _dataset_frame_cache[signature] = frame
    return frame


def require_refinery_column(frame: pl.DataFrame, column: str | None) -> str:
    if not column or column not in frame.columns:
        raise ValueError(f"Coluna ausente no dataset: {column or 'n/a'}.")
    return column


def fill_column_missing(frame: pl.DataFrame, column: str, value: Any) -> pl.DataFrame:
    text = pl.col(column).cast(pl.Utf8, strict=False).str.strip_chars()
    return frame.with_columns(
        pl.when(pl.col(column).is_null() | (text == ""))
        .then(pl.lit(value))
        .otherwise(pl.col(column))
        .alias(column)
    )


def column_mode(frame: pl.DataFrame, column: str) -> Any:
    valid = frame.filter(non_missing_expr(column))
    if valid.is_empty():
        return None
    row = (
        valid
        .group_by(column, maintain_order=True)
        .agg(pl.len().alias("count"))
        .sort("count", descending=True)
        .head(1)
        .to_dicts()
    )
    return row[0].get(column) if row else None


def parse_refinery_fill_value(step: RefineryStepRequest) -> Any:
    parameters = step.parameters or {}
    if "fillValue" in parameters:
        return parameters.get("fillValue")
    if step.value not in {None, ""}:
        return step.value
    return ""


def parse_refinery_value_map(step: RefineryStepRequest) -> dict[str, str]:
    mappings: dict[str, str] = {}
    parameter_map = (step.parameters or {}).get("valueMap")
    if isinstance(parameter_map, dict):
        for source, target in parameter_map.items():
            source_text = str(source).strip()
            if source_text:
                mappings[source_text] = str(target)
    for raw_line in str(step.value or "").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        separator = "=>" if "=>" in line else "=" if "=" in line else "," if "," in line else ""
        if not separator:
            raise ValueError(f"Regra de mapeamento invalida: {line}. Use origem => destino.")
        source, target = line.split(separator, 1)
        source_text = source.strip()
        if not source_text:
            raise ValueError("Mapear valores requer origem preenchida.")
        mappings[source_text] = target.strip()
    if not mappings:
        raise ValueError("Mapear valores requer ao menos uma regra origem => destino.")
    return mappings


def apply_refinery_step(frame: pl.DataFrame, step: RefineryStepRequest, source_profile: dict[str, Any]) -> pl.DataFrame:
    operation = step.operation
    if operation == "dedupe":
        return frame.unique(maintain_order=True)
    if operation == "remove-column":
        column = require_refinery_column(frame, step.column)
        return frame.drop(column)
    if operation == "rename":
        column = require_refinery_column(frame, step.column)
        target = str(step.target or step.value or "").strip()
        if not target:
            raise ValueError("Renomear coluna requer um novo nome.")
        return frame.rename({column: target})
    if operation == "sort":
        column = require_refinery_column(frame, step.column)
        return frame.sort(column, descending=step.direction == "desc", maintain_order=True)
    if operation == "filter":
        column = require_refinery_column(frame, step.column)
        value = str(step.value or "")
        text = pl.col(column).cast(pl.Utf8, strict=False).str.to_lowercase()
        return frame.filter(text.str.contains(value.lower(), literal=True).fill_null(False))
    if operation == "filter-out":
        column = require_refinery_column(frame, step.column)
        value = str(step.value or "")
        if not value:
            return frame.filter(non_missing_expr(column))
        text = pl.col(column).cast(pl.Utf8, strict=False).str.to_lowercase()
        matches = text.str.contains(value.lower(), literal=True).fill_null(False)
        return frame.filter(~matches)
    if operation == "map-values":
        column = require_refinery_column(frame, step.column)
        mappings = parse_refinery_value_map(step)
        normalized = pl.col(column).cast(pl.Utf8, strict=False).str.strip_chars()
        expr = pl.when(normalized == next(iter(mappings.keys()))).then(pl.lit(next(iter(mappings.values()))))
        for source, target in list(mappings.items())[1:]:
            expr = expr.when(normalized == source).then(pl.lit(target))
        return frame.with_columns(expr.otherwise(pl.col(column).cast(pl.Utf8, strict=False)).alias(column))
    if operation == "python-code":
        result = run_table_code(frame, str(step.value or (step.parameters or {}).get("code") or ""))
        if result.height > MAX_DATASET_ROWS:
            raise ValueError(f"Codigo Python gerou {result.height} linhas; o limite operacional e {MAX_DATASET_ROWS}.")
        return result
    if operation == "drop-missing-rows":
        if step.column:
            column = require_refinery_column(frame, step.column)
            return frame.filter(non_missing_expr(column))
        for column in frame.columns:
            frame = frame.filter(non_missing_expr(column))
        return frame
    if operation == "drop-id-columns":
        id_columns = [column for column in frame.columns if re.search(r"(^id$|_id$|id$|uuid|guid)", str(column), re.IGNORECASE)]
        return frame.drop(id_columns) if id_columns else frame
    if operation == "drop-low-complete":
        threshold = max(0.0, min(100.0, float(step.value or 80))) / 100.0
        total = max(frame.height, 1)
        keep = []
        for column in frame.columns:
            complete = frame.filter(non_missing_expr(column)).height / total
            if complete >= threshold:
                keep.append(column)
        return frame.select(keep) if keep else frame
    if operation == "fill-missing":
        column = require_refinery_column(frame, step.column)
        return fill_column_missing(frame, column, parse_refinery_fill_value(step))
    if operation in {"fill-mean", "fill-median", "fill-mode", "knn-impute", "iterative-impute"}:
        column = require_refinery_column(frame, step.column)
        if operation == "fill-mode":
            value = column_mode(frame, column)
        elif operation in {"fill-median", "knn-impute"}:
            value = numeric_series(frame, column).median()
        else:
            value = numeric_series(frame, column).mean()
        return fill_column_missing(frame, column, value)
    if operation == "fill-all-numeric":
        for profile in source_profile["columnProfiles"]:
            if profile["kind"] == "number" and profile["missing"] > 0:
                frame = fill_column_missing(frame, profile["name"], profile.get("median") if profile.get("median") is not None else profile.get("mean"))
        return frame
    if operation == "fill-all-categorical":
        for profile in source_profile["columnProfiles"]:
            if profile["kind"] not in {"number", "empty"} and profile["missing"] > 0 and profile["frequencies"]:
                frame = fill_column_missing(frame, profile["name"], profile["frequencies"][0]["value"])
        return frame
    if operation == "missing-indicator":
        column = require_refinery_column(frame, step.column)
        return frame.with_columns((~non_missing_expr(column)).alias(f"{column}_missing"))
    if operation == "cast":
        column = require_refinery_column(frame, step.column)
        target = str(step.target or step.value or "number").lower()
        if target in {"number", "decimal"}:
            return frame.with_columns(pl.col(column).cast(pl.Float64, strict=False).alias(column))
        if target in {"integer", "int"}:
            return frame.with_columns(pl.col(column).cast(pl.Float64, strict=False).round(0).cast(pl.Int64, strict=False).alias(column))
        if target in {"text", "string"}:
            return frame.with_columns(pl.col(column).cast(pl.Utf8, strict=False).alias(column))
        if target in {"boolean", "bool"}:
            normalized = pl.col(column).cast(pl.Utf8, strict=False).str.strip_chars().str.to_lowercase()
            return frame.with_columns(pl.when(normalized.is_in(["true", "1", "yes", "y", "sim"])).then(True).when(normalized.is_in(["false", "0", "no", "n", "nao"])).then(False).otherwise(None).alias(column))
        if target in {"date", "datetime", "data"}:
            date_format = str((step.parameters or {}).get("dateFormat") or step.value or "").strip() or None
            return frame.with_columns(pl.col(column).cast(pl.Utf8, strict=False).str.strptime(pl.Datetime, format=date_format, strict=False).alias(column))
        raise ValueError(f"Tipo de destino invalido: {target}.")
    if operation == "one-hot":
        column = require_refinery_column(frame, step.column)
        return frame.to_dummies(columns=[column])
    if operation == "one-hot-all-categorical":
        max_unique = max(2, int(float(step.value or 20)))
        columns = [profile["name"] for profile in source_profile["columnProfiles"] if profile["kind"] == "text" and 1 < profile["unique"] <= max_unique]
        return frame.to_dummies(columns=columns) if columns else frame
    if operation in {"clip-iqr", "winsorize"}:
        column = require_refinery_column(frame, step.column)
        parameters = step.parameters or {}
        values = numeric_series(frame, column)
        q1 = float(parameters.get("lower")) if parameters.get("lower") is not None else float(values.quantile(0.25))
        q3 = float(parameters.get("upper")) if parameters.get("upper") is not None else float(values.quantile(0.75))
        if parameters.get("lower") is None or parameters.get("upper") is None:
            iqr = q3 - q1
            q1, q3 = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        return frame.with_columns(numeric_expr(column).clip(q1, q3).alias(column))
    if operation == "clip-all-numeric":
        for profile in source_profile["columnProfiles"]:
            if profile["kind"] == "number" and profile.get("q1") is not None and profile.get("q3") is not None:
                iqr = float(profile["q3"]) - float(profile["q1"])
                low = float(profile["q1"]) - 1.5 * iqr
                high = float(profile["q3"]) + 1.5 * iqr
                frame = frame.with_columns(numeric_expr(profile["name"]).clip(low, high).alias(profile["name"]))
        return frame
    if operation in {"standard-scale", "minmax-scale", "robust-scale"}:
        column = require_refinery_column(frame, step.column)
        values = numeric_series(frame, column)
        if operation == "minmax-scale":
            low, high = values.min(), values.max()
            return frame.with_columns(((numeric_expr(column) - float(low)) / max(float(high) - float(low), 1e-12)).alias(column))
        center = values.median() if operation == "robust-scale" else values.mean()
        spread = (values.quantile(0.75) - values.quantile(0.25)) if operation == "robust-scale" else values.std()
        return frame.with_columns(((numeric_expr(column) - float(center or 0)) / max(float(spread or 1), 1e-12)).alias(column))
    if operation == "scale-all-numeric":
        for profile in source_profile["columnProfiles"]:
            if profile["kind"] == "number":
                values = numeric_series(frame, profile["name"])
                frame = frame.with_columns(((numeric_expr(profile["name"]) - float(values.mean() or 0)) / max(float(values.std() or 1), 1e-12)).alias(profile["name"]))
        return frame
    if operation == "aggregate-count":
        column = require_refinery_column(frame, step.column)
        return frame.group_by(column, maintain_order=True).agg(pl.len().alias("count"))
    if operation == "train-validation-test-split":
        return frame.with_row_index("__row_nr").with_columns(
            pl.when(pl.col("__row_nr") % 10 < 7).then(pl.lit("train"))
            .when(pl.col("__row_nr") % 10 < 9).then(pl.lit("validation"))
            .otherwise(pl.lit("test")).alias("split")
        ).drop("__row_nr")
    if operation == "head-sample":
        return frame.head(max(1, int(float(step.value or 10))))
    if operation == "tail-sample":
        return frame.tail(max(1, int(float(step.value or 10))))
    if operation == "random-sample":
        count = max(1, min(frame.height, int(float(step.value or min(100, frame.height)))))
        return deterministic_sample_lazy(frame.lazy(), count, 739)
    raise ValueError(f"Operacao de Data Refinery nao suportada no backend completo: {operation}.")


def apply_refinery_steps(frame: pl.DataFrame, steps: list[RefineryStepRequest]) -> tuple[pl.DataFrame, dict[str, Any]]:
    source_profile = data_profile(frame)
    result = frame.clone()
    for step in steps:
        result = apply_refinery_step(result, step, source_profile)
    return result, source_profile


def refinery_response(frame: pl.DataFrame, source_profile: dict[str, Any], preview_start: int, preview_end: int) -> dict[str, Any]:
    if preview_start < 1 or preview_start > preview_end:
        raise ValueError("Range invalido: min precisa ser menor ou igual a max.")
    preview = frame.slice(preview_start - 1, max(0, preview_end - preview_start + 1))
    return {
        "rows": sanitize_records(preview),
        "rowCount": int(frame.height),
        "columns": [str(column) for column in frame.columns],
        "schema": visualization_schema(frame),
        "sourceProfile": source_profile,
        "profile": data_profile(frame),
    }


def require_column(frame: pl.DataFrame, column: str, label: str = "coluna") -> str:
    if not column or column not in frame.columns:
        raise ValueError(f"A {label} '{column}' nao existe na entrada deste no.")
    return column


def safe_expression(frame: pl.DataFrame, expression: str) -> pl.Series:
    if not expression or len(expression) > 500:
        raise ValueError("Informe uma expressao de calculo de ate 500 caracteres.")
    tree = ast.parse(expression, mode="eval")
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.USub, ast.UAdd, ast.Constant, ast.Name, ast.Load, ast.FloorDiv)
    if any(not isinstance(node, allowed) for node in ast.walk(tree)):
        raise ValueError("A expressao aceita somente colunas, numeros e operadores aritmeticos.")
    names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    missing = names - set(frame.columns)
    if missing:
        raise ValueError(f"Colunas ausentes na expressao: {', '.join(sorted(missing))}.")
    scope = {name: np.asarray(frame[name].cast(pl.Float64, strict=False).to_list(), dtype=float) for name in names}
    try:
        value = eval(compile(tree, "<calculate>", "eval"), {"__builtins__": {}}, scope)
    except Exception as error:
        raise ValueError(f"Expressao invalida: {error}") from error
    if isinstance(value, np.ndarray):
        return pl.Series(value.tolist())
    if isinstance(value, list):
        return pl.Series(value)
    return pl.Series([value] * frame.height)


def run_table_code(frame: pl.DataFrame, code: str, inputs: list[pl.DataFrame] | None = None) -> pl.DataFrame:
    if not isinstance(code, str) or not code.strip():
        raise ValueError("Informe o codigo Python da transformacao.")
    if len(code) > 10000:
        raise ValueError("O codigo Python deve ter no maximo 10.000 caracteres.")
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as error:
        raise ValueError(f"Codigo Python invalido: {error.msg} (linha {error.lineno}).") from error
    blocked = (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
    for item in ast.walk(tree):
        if isinstance(item, blocked):
            raise ValueError("O codigo Python nao aceita imports ou definicoes de classes e funcoes.")
        if isinstance(item, ast.Name) and item.id.startswith("__"):
            raise ValueError("Nomes internos nao sao permitidos no codigo Python.")
        if isinstance(item, ast.Attribute) and item.attr.startswith("__"):
            raise ValueError("Atributos internos nao sao permitidos no codigo Python.")
    scope: dict[str, Any] = {
        # Every code node receives isolated clones. A script may reassign df or
        # inputs, but it cannot change a parent table or a sibling code node.
        "df": frame.clone(),
        "inputs": [item.clone() for item in (inputs or [frame])],
        "pl": pl,
        "np": np,
        "abs": abs,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "float": float,
        "int": int,
        "len": len,
        "list": list,
        "max": max,
        "min": min,
        "range": range,
        "round": round,
        "set": set,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "zip": zip,
    }
    try:
        exec(compile(tree, "<visualization-code>", "exec"), {"__builtins__": {}}, scope)
    except Exception as error:
        raise ValueError(f"Falha ao executar o codigo Python: {error}") from error
    result = scope.get("result")
    if not isinstance(result, pl.DataFrame):
        raise ValueError("O codigo deve atribuir um Polars DataFrame a variavel 'result'.")
    return result.clone()



def numeric_expr(column: str) -> pl.Expr:
    return pl.col(column).cast(pl.Float64, strict=False)


def _rename_join_frame(frame: pl.DataFrame, config: Any) -> pl.DataFrame:
    renames = config.get("renames", {}) if isinstance(config, dict) else {}
    if not isinstance(renames, dict):
        raise ValueError("Renomeacao do Join invalida.")
    mapping = {column: str(renames.get(column, "")).strip() or column for column in frame.columns}
    if len(set(mapping.values())) != len(mapping):
        raise ValueError("Nomes de colunas duplicados no Join.")
    return frame.rename(mapping)


def apply_visualization_node(kind: str, frame: pl.DataFrame, params: dict[str, Any], secondary: pl.DataFrame | None = None, inputs: list[pl.DataFrame] | None = None) -> pl.DataFrame:
    if kind == "source":
        return frame.clone()
    if kind == "column-strip":
        return frame.clone()
    if kind == "info":
        total = frame.height
        schema = {item["name"]: item["type"] for item in visualization_schema(frame)}
        null_counts = frame.null_count().row(0, named=True) if frame.width else {}
        rows = []
        for column in frame.columns:
            missing = int(null_counts.get(column, 0))
            rows.append({
                "column": str(column),
                "type": schema.get(str(column), "text"),
                "rows": total,
                "non_null": total - missing,
                "missing": missing,
                "missing_pct": round((missing / total * 100) if total else 0.0, 4),
                "unique": int(frame.select(pl.col(column).n_unique()).item()),
            })
        return pl.DataFrame(rows, schema=["column", "type", "rows", "non_null", "missing", "missing_pct", "unique"])
    if kind == "describe":
        numeric_columns = [column for column, dtype in zip(frame.columns, frame.dtypes) if dtype in pl.NUMERIC_DTYPES and dtype != pl.Boolean]
        if not numeric_columns:
            raise ValueError("Describe requer ao menos uma coluna numerica na entrada.")
        rows = []
        for column in numeric_columns:
            series = frame.select(numeric_expr(column).alias(column)).drop_nulls(column)[column]
            rows.append({
                "column": str(column),
                "count": int(series.len()),
                "mean": series.mean(),
                "std": series.std(),
                "min": series.min(),
                "q1": series.quantile(0.25),
                "median": series.median(),
                "q3": series.quantile(0.75),
                "max": series.max(),
            })
        return pl.DataFrame(rows, schema=["column", "count", "mean", "std", "min", "q1", "median", "q3", "max"])
    if kind == "select":
        columns = params.get("columns", [])
        if not columns:
            raise ValueError("Select requer ao menos uma coluna.")
        for column in columns:
            require_column(frame, column)
        return frame.select(columns)
    if kind == "dedupe":
        return frame.unique(maintain_order=True)
    if kind == "remove-column":
        column = require_column(frame, params.get("column", ""))
        return frame.drop(column)
    if kind == "unique":
        column = require_column(frame, params.get("column", ""))
        return frame.select(column).unique(maintain_order=True)
    if kind == "regex":
        column = require_column(frame, params.get("column", ""))
        pattern = str(params.get("pattern", ""))
        try:
            compiled = re.compile(pattern)
        except re.error as error:
            raise ValueError(f"Regex invalido: {error}") from error
        text = pl.col(column).cast(pl.Utf8, strict=False)
        if params.get("mode", "filter") == "extract":
            group = 1 if compiled.groups else 0
            name = str(params.get("as", "")).strip()
            if not name:
                raise ValueError("Regex extrair requer o nome da nova coluna.")
            if name in frame.columns:
                raise ValueError(f"A coluna '{name}' ja existe.")
            return frame.with_columns(text.str.extract(pattern, group).alias(name))
        return frame.filter(text.str.contains(pattern).fill_null(False))
    if kind == "rename":
        renames = params.get("renames", {})
        if not isinstance(renames, dict):
            raise ValueError("Renomeacao invalida.")
        mapping = {}
        for column in frame.columns:
            name = str(renames.get(column, "")).strip() or column
            if not name:
                raise ValueError("Nome de coluna invalido.")
            mapping[column] = name
        if len(set(mapping.values())) != len(mapping):
            raise ValueError("Nomes de colunas duplicados.")
        return frame.rename(mapping)
    if kind == "filter-out":
        column = require_column(frame, params.get("column", ""))
        value = str(params.get("value", ""))
        if value == "":
            return frame.filter(non_missing_expr(column))
        text = pl.col(column).cast(pl.Utf8, strict=False)
        if params.get("mode", "contains") == "equals":
            return frame.filter((text != value).fill_null(True))
        return frame.filter(text.str.contains(value, literal=True).not_().fill_null(True))
    if kind == "fill-missing":
        column = require_column(frame, params.get("column", ""))
        value = params.get("value", "")
        dtype = frame.schema[column]
        if dtype in pl.NUMERIC_DTYPES and dtype != pl.Boolean:
            value = float(value) if str(value).strip() else 0.0
        return frame.with_columns(pl.col(column).fill_null(value).alias(column))
    if kind == "fill-median":
        column = require_column(frame, params.get("column", ""))
        if frame.schema[column] not in pl.NUMERIC_DTYPES or frame.schema[column] == pl.Boolean:
            raise ValueError("Mediana requer coluna numerica.")
        return frame.with_columns(numeric_expr(column).fill_null(numeric_expr(column).median()).alias(column))
    if kind == "fill-mode":
        column = require_column(frame, params.get("column", ""))
        mode = frame.select(pl.col(column).drop_nulls().mode().first()).item()
        return frame.with_columns(pl.col(column).fill_null(mode).alias(column))
    if kind == "category-map":
        column = require_column(frame, params.get("column", ""))
        mapping: dict[str, str] = {}
        for line in str(params.get("mappingText", "")).splitlines():
            if "=>" in line:
                left, right = line.split("=>", 1)
            elif ":" in line:
                left, right = line.split(":", 1)
            else:
                continue
            source, target = left.strip(), right.strip()
            if source:
                mapping[source] = target
        if not mapping:
            return frame.clone()
        return frame.with_columns(pl.col(column).cast(pl.Utf8, strict=False).replace(mapping).alias(column))
    if kind == "filter":
        column = require_column(frame, params.get("column", ""))
        operator = params.get("operator", "equals")
        value = params.get("value")
        if operator in {"gt", "gte", "lt", "lte"}:
            target = float(value)
            expr = {"gt": numeric_expr(column) > target, "gte": numeric_expr(column) >= target, "lt": numeric_expr(column) < target, "lte": numeric_expr(column) <= target}[operator]
            return frame.filter(expr.fill_null(False))
        text = pl.col(column).cast(pl.Utf8, strict=False)
        if operator == "contains":
            return frame.filter(text.str.contains(str(value), literal=True).fill_null(False))
        if operator == "notEquals":
            return frame.filter((text != str(value)).fill_null(False))
        return frame.filter((text == str(value)).fill_null(False))
    if kind == "groupBy":
        columns = params.get("columns", [])
        if not columns:
            raise ValueError("Group by requer uma ou mais colunas.")
        for column in columns:
            require_column(frame, column)
        measures = params.get("measures", [])
        if not measures:
            return frame.group_by(columns, maintain_order=True).len(name="count")
        aggregations = []
        for measure in measures:
            column = require_column(frame, measure.get("column", ""))
            operation = measure.get("operation", "count")
            name = measure.get("as") or f"{operation}_{column}"
            if operation == "count":
                aggregations.append(pl.col(column).count().alias(name))
            elif operation in {"sum", "mean", "min", "max", "median"}:
                aggregations.append(getattr(numeric_expr(column), operation)().alias(name))
            else:
                raise ValueError(f"Operacao de agrupamento nao suportada: {operation}.")
        return frame.group_by(columns, maintain_order=True).agg(aggregations)
    if kind == "aggregate":
        measures = params.get("measures", [])
        if not measures:
            raise ValueError("Aggregate requer pelo menos uma medida.")
        expressions = []
        for measure in measures:
            column = require_column(frame, measure.get("column", ""))
            operation = measure.get("operation", "mean")
            name = measure.get("as") or f"{operation}_{column}"
            if operation == "count":
                expressions.append(pl.col(column).count().alias(name))
            elif operation in {"sum", "mean", "min", "max", "median"}:
                expressions.append(getattr(numeric_expr(column), operation)().alias(name))
            else:
                raise ValueError(f"Operacao de agregacao nao suportada: {operation}.")
        return frame.select(expressions)
    if kind == "sortBy":
        column = require_column(frame, params.get("column", ""))
        return frame.sort(column, descending=params.get("direction", "asc") == "desc", maintain_order=True)
    if kind == "bin":
        column = require_column(frame, params.get("column", ""))
        bins = int(params.get("bins", 10))
        if bins < 2 or bins > 100:
            raise ValueError("Bins deve estar entre 2 e 100.")
        values = frame[column].cast(pl.Float64, strict=False)
        minimum, maximum = values.min(), values.max()
        name = params.get("as") or f"{column}_bin"
        if minimum is None or maximum is None or minimum == maximum:
            return frame.with_columns(pl.lit("sem_faixa").alias(name))
        width = (float(maximum) - float(minimum)) / bins
        labels = ((numeric_expr(column) - float(minimum)) / width).floor().clip(0, bins - 1).cast(pl.Int64, strict=False).cast(pl.Utf8)
        return frame.with_columns(labels.alias(name))
    if kind == "pivot":
        index = params.get("index", [])
        columns = require_column(frame, params.get("columns", ""))
        values = require_column(frame, params.get("values", ""))
        operation = params.get("operation", "mean")
        for column in index:
            require_column(frame, column)
        return frame.pivot(index=index, columns=columns, values=values, aggregate_function=operation)
    if kind == "unpivot":
        identifiers = params.get("identifiers", [])
        values = params.get("values", [])
        for column in identifiers + values:
            require_column(frame, column)
        if not values:
            raise ValueError("Unpivot requer colunas de valor.")
        return frame.unpivot(index=identifiers, on=values, variable_name=params.get("variableName") or "variable", value_name=params.get("valueName") or "value")
    if kind == "topN":
        column = require_column(frame, params.get("column", ""))
        count = int(params.get("count", 10))
        if count < 1:
            raise ValueError("Top N deve ser maior que zero.")
        return frame.sort(column, descending=True).head(count)
    if kind == "sample":
        count = int(params.get("count", 10))
        if count < 1:
            raise ValueError("Amostra deve conter ao menos uma linha.")
        return frame.head(count)
    if kind == "rank":
        column = require_column(frame, params.get("column", ""))
        descending = params.get("direction", "desc") == "desc"
        return frame.with_columns(numeric_expr(column).rank(method="dense", descending=descending).alias(params.get("as") or f"{column}_rank"))
    if kind == "resample":
        date_column = require_column(frame, params.get("dateColumn", ""))
        value_column = require_column(frame, params.get("valueColumn", ""))
        interval = {"D": "1d", "W": "1w", "M": "1mo", "Y": "1y"}.get(str(params.get("frequency", "D")).upper(), str(params.get("frequency", "D")))
        operation = params.get("operation", "mean")
        parsed = frame.with_columns(pl.col(date_column).cast(pl.Datetime, strict=False).alias(date_column)).drop_nulls(date_column).sort(date_column)
        if parsed.is_empty():
            raise ValueError("Resample exige uma coluna de data valida.")
        op = operation if operation in {"sum", "min", "max", "median", "mean"} else "mean"
        return parsed.group_by_dynamic(date_column, every=interval).agg(getattr(numeric_expr(value_column), op)().alias(value_column))
    if kind == "calculate":
        name = params.get("as", "calculated")
        if not name:
            raise ValueError("Informe o nome da coluna calculada.")
        return frame.with_columns(safe_expression(frame, params.get("expression", "")).alias(name))
    if kind == "cast":
        column = require_column(frame, params.get("column", ""))
        target = str(params.get("target", "number"))
        if target in {"number", "decimal"}:
            return frame.with_columns(pl.col(column).cast(pl.Float64, strict=False).alias(column))
        if target == "integer":
            return frame.with_columns(pl.col(column).cast(pl.Float64, strict=False).round(0).cast(pl.Int64, strict=False).alias(column))
        if target == "text":
            return frame.with_columns(pl.col(column).cast(pl.Utf8, strict=False).alias(column))
        if target == "boolean":
            normalized = pl.col(column).cast(pl.Utf8, strict=False).str.strip_chars().str.to_lowercase()
            return frame.with_columns(pl.when(normalized.is_in(["true", "1", "yes", "y", "sim"])).then(True).when(normalized.is_in(["false", "0", "no", "n", "nao"])).then(False).otherwise(None).alias(column))
        if target == "date":
            date_format = str(params.get("dateFormat", "")).strip() or None
            try:
                return cast_visualization_date(frame, column, date_format)
            except Exception as error:
                raise ValueError(f"Formato de data invalido: {error}") from error
        raise ValueError("Tipo de destino invalido.")
    if kind == "code":
        return run_table_code(frame, params.get("code", ""), inputs)
    if kind == "window":
        value_column = require_column(frame, params.get("valueColumn", ""))
        order_column = require_column(frame, params.get("orderBy", ""))
        partitions = params.get("partitionBy", [])
        for column in partitions:
            require_column(frame, column)
        function = params.get("function", "running_sum")
        result = frame.sort(order_column, maintain_order=True)
        output = params.get("as") or function
        if function == "row_number":
            expr = pl.cum_count(order_column).over(partitions).alias(output) if partitions else pl.int_range(1, pl.len() + 1).alias(output)
        elif function == "rolling_mean":
            rolling = numeric_expr(value_column).rolling_mean(int(params.get("window", 3)), min_periods=1)
            expr = rolling.over(partitions).alias(output) if partitions else rolling.alias(output)
        else:
            cumulative = numeric_expr(value_column).cum_sum()
            expr = cumulative.over(partitions).alias(output) if partitions else cumulative.alias(output)
        return result.with_columns(expr)
    if kind == "join":
        tables = inputs or ([frame, secondary] if secondary is not None else [frame])
        entries = params.get("entries", [])
        if not isinstance(entries, list):
            entries = []
        if len(tables) < 1:
            raise ValueError("Juntar tabelas requer ao menos uma tabela conectada.")
        mode = str(params.get("mode", "common"))
        if mode == "horizontal":
            renamed = [_rename_join_frame(table, entries[index] if index < len(entries) else {}) for index, table in enumerate(tables)]
            names: set[str] = set()
            unique_tables = []
            for index, table in enumerate(renamed):
                mapping = {}
                for column in table.columns:
                    name = column
                    if name in names:
                        name = f"{name}_table_{index + 1}"
                    names.add(name)
                    mapping[column] = name
                unique_tables.append(table.rename(mapping))
            return pl.concat(unique_tables, how="horizontal")
        if mode == "append":
            renamed = [_rename_join_frame(table, entries[index] if index < len(entries) else {}) for index, table in enumerate(tables)]
            return pl.concat(renamed, how="diagonal_relaxed", rechunk=True)
        if len(tables) < 2:
            raise ValueError("Combinar por coluna comum requer ao menos duas tabelas conectadas.")
        current = _rename_join_frame(tables[0], entries[0] if entries else {})
        for index, table in enumerate(tables[1:], 1):
            config = entries[index] if index < len(entries) and isinstance(entries[index], dict) else {}
            right = _rename_join_frame(table, config)
            left_key = str(config.get("leftKey", ""))
            right_key = str(config.get("rightKey", ""))
            require_column(current, left_key, "chave do resultado")
            require_column(right, right_key, "chave da tabela")
            how = str(config.get("how", "left"))
            if how not in {"left", "inner", "right", "full"}:
                raise ValueError("Tipo de Join invalido.")
            current = current.join(right, how=how, left_on=left_key, right_on=right_key, suffix=f"_table_{index + 1}")
        return current
    raise ValueError(f"Tipo de no nao suportado: {kind}.")

def execute_visualization_frames(request: VisualizationRequest) -> tuple[str, pl.DataFrame, dict[tuple[str, str], pl.DataFrame], dict[tuple[str, str], bool], float, float]:
    started_at = time.perf_counter()
    source_read_seconds = 0.0
    # FastAPI runs this sync route outside the event loop. Avoid an extra
    # thread pool here: duplicating large DataFrames across workers increases
    # memory pressure more than it helps most canvas DAGs.
    if request.previewStart < 1 or request.previewStart >= request.previewEnd:
        raise ValueError("O intervalo do preview deve ter minimo maior ou igual a 1 e minimo menor que maximo.")
    nodes = {str(node.get("id")): node for node in request.nodes}
    if not nodes: raise ValueError("Adicione ao menos um no ao canvas.")
    target = request.targetNodeId or next(reversed(nodes))
    if target not in nodes: raise ValueError("No de destino nao encontrado.")
    parents: dict[str, list[dict[str, str]]] = {node_id: [] for node_id in nodes}
    for connection in request.connections:
        source, destination = str(connection.get("source", "")), str(connection.get("target", ""))
        if source not in nodes or destination not in nodes: raise ValueError("Conexao referencia um no inexistente.")
        parents[destination].append({
            "id": str(connection.get("id", "")),
            "source": source,
            "sourcePort": str(connection.get("sourcePort", "primary")),
            "targetPort": str(connection.get("targetPort", "primary")),
        })
    if request.datasetId:
        source_dataset, source_signature = dataset_signature(request.datasetId)
        source_read_started = time.perf_counter()
        source_frame = read_cached_dataset_frame(request.datasetId, source_signature)
        source_read_seconds = time.perf_counter() - source_read_started
    else:
        source_frame = pl.DataFrame(request.rows)
        source_signature = hashlib.sha1(
            json.dumps(sanitize_records(source_frame), sort_keys=True, default=str).encode()
        ).hexdigest()
    visiting: set[tuple[str, str]] = set(); results: dict[tuple[str, str], pl.DataFrame] = {}; cache_hits: dict[tuple[str, str], bool] = {}; signatures: dict[tuple[str, str], str] = {}
    def run(node_id: str, output_port: str = "primary") -> pl.DataFrame:
        key = (node_id, output_port)
        if key in results: return results[key]
        if key in visiting: raise ValueError("O fluxo contem um ciclo. Conexoes devem formar um DAG.")
        visiting.add(key); node = nodes[node_id]; incoming = parents[node_id]
        kind = str(node.get("kind"))
        execution_edges = incoming
        if kind == "join":
            configured = node.get("params", {}).get("entries", [])
            order = {str(item.get("connectionId")): index for index, item in enumerate(configured) if isinstance(item, dict) and item.get("connectionId")}
            execution_edges = sorted(incoming, key=lambda edge: order.get(str(edge.get("id", "")), len(order)))
        if kind == "code" and output_port.startswith("python-"):
            matching = [edge for edge in execution_edges if edge["targetPort"] == output_port]
            if not matching:
                value = pl.DataFrame({"resultado": [None]})
                signature = f"null:{node_id}:{output_port}"
                cache_hits[key] = False
                signatures[key] = signature
                results[key] = value
                visiting.remove(key)
                return value
            input_frames = [run(edge["source"], edge["sourcePort"]) for edge in matching]
        else:
            input_frames = [run(edge["source"], edge["sourcePort"]) for edge in execution_edges]
        base = source_frame.clone() if kind == "source" else (input_frames[0].clone() if input_frames else None)
        if base is None: raise ValueError(f"O no '{node.get('label') or node_id}' precisa de uma entrada.")
        signature = hashlib.sha1(json.dumps({
            "kind": kind,
            "outputPort": output_port,
            "params": node.get("params", {}),
            "parentSignatures": [signatures[(edge["source"], edge["sourcePort"])] for edge in execution_edges if (edge["source"], edge["sourcePort"]) in signatures],
            "sourceSignature": source_signature if kind == "source" else None,
            "schema": [(str(column), str(dtype)) for column, dtype in zip(base.columns, base.dtypes)],
        }, sort_keys=True, default=str).encode()).hexdigest()
        cached = _visualization_cache.get(signature)
        if cached is not None: value = cached.clone(); cache_hits[key] = True
        else:
            value = apply_visualization_node(
                kind,
                base,
                node.get("params", {}),
                input_frames[1] if len(input_frames) > 1 else None,
                input_frames,
            )
            _visualization_cache[signature] = value.clone(); cache_hits[key] = False
        signatures[key] = signature
        results[key] = value; visiting.remove(key); return value
    output = run(target)
    # Preview ranges are global to the canvas. Refresh every executable branch
    # so previews opened on sibling nodes never retain rows from an old range.
    for node_id in nodes:
        if (node_id, "primary") in results:
            continue
        try:
            run(node_id)
        except ValueError:
            # An unconnected node is incomplete by definition. It should not
            # prevent valid branches from refreshing their previews.
            visiting.clear()
            continue
    full_node_ids = set(request.fullNodeIds)
    for edge in request.connections:
        source_port = str(edge.get("sourcePort", "primary"))
        source_node_id = str(edge["source"])
        target_port = str(edge.get("targetPort", "primary"))
        target_node_id = str(edge["target"])
        if source_port.startswith("python-") and str(nodes[source_node_id].get("kind")) == "code":
            run(source_node_id, source_port)
        if target_port.startswith("python-") and str(nodes[target_node_id].get("kind")) == "code":
            run(target_node_id, target_port)
    return target, output, results, cache_hits, source_read_seconds, started_at


def execute_visualization(request: VisualizationRequest) -> dict[str, Any]:
    target, output, results, cache_hits, source_read_seconds, started_at = execute_visualization_frames(request)
    full_node_ids = set(request.fullNodeIds)
    payload = visualization_result(output, target, request.previewStart, request.previewEnd, cache_hits.get((target, "primary"), False), target in full_node_ids)
    payload["executedNodes"] = [visualization_result(frame, node_id, request.previewStart, request.previewEnd, cache_hits.get((node_id, port), False), node_id in full_node_ids, port) for (node_id, port), frame in results.items()]
    payload["execution"] = {
        "sourceReadSeconds": round(source_read_seconds, 6),
        "totalSeconds": round(time.perf_counter() - started_at, 6),
        "backendDataset": bool(request.datasetId),
    }
    return payload


def numeric(value: Any) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def feature_frame(rows: list[dict[str, Any]], features: list[str]) -> pl.DataFrame:
    frame = pl.DataFrame(rows)
    if not features:
        raise ValueError("Selecione pelo menos uma feature.")
    missing = [name for name in features if name not in frame.columns]
    if missing:
        raise ValueError(f"Features ausentes: {', '.join(missing)}.")
    return frame.select(features)


def numeric_feature_indices(frame: pl.DataFrame) -> list[int]:
    indices: list[int] = []
    for index, column in enumerate(frame.columns):
        series = frame[column].cast(pl.Float64, strict=False)
        ratio = series.is_not_null().mean()
        if ratio is not None and float(ratio) >= 0.8:
            indices.append(index)
    return indices


def object_matrix(frame: pl.DataFrame) -> np.ndarray:
    if frame.width == 0:
        return np.empty((frame.height, 0), dtype=object)
    values = [frame[column].to_list() for column in frame.columns]
    rows = [[np.nan if value is None else value for value in row] for row in zip(*values)]
    return np.array(rows, dtype=object)


def preprocessor_for(frame: pl.DataFrame) -> ColumnTransformer:
    numeric_columns = numeric_feature_indices(frame)
    categorical_columns = [index for index in range(frame.width) if index not in numeric_columns]
    return ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric_columns),
        ("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), categorical_columns),
    ])


def target_values(frame: pl.DataFrame, target: str, regression: bool) -> tuple[pl.DataFrame, np.ndarray]:
    if target not in frame.columns:
        raise ValueError("Selecione uma coluna alvo valida.")
    target_series = frame[target].cast(pl.Float64, strict=False) if regression else frame[target].cast(pl.Utf8, strict=False)
    valid = target_series.is_not_null()
    filtered = frame.filter(valid)
    values = np.array(filtered[target].cast(pl.Float64, strict=False).to_list(), dtype=float) if regression else np.array(filtered[target].cast(pl.Utf8, strict=False).to_list(), dtype=str)
    return filtered, values


def numeric_array(frame: pl.DataFrame, column: str) -> np.ndarray:
    return np.array(frame[column].cast(pl.Float64, strict=False).to_list(), dtype=float)


def trial(algorithm: str, metric: str, score: float, secondary: float, started: float, parameters: dict[str, Any], techniques: list[str], output: str = "", projection: dict[str, Any] | None = None, regression_plot: dict[str, Any] | None = None, regression_plot_3d: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": f"trial-{algorithm}-{int(started * 1_000_000)}",
        "rank": 0,
        "algorithm": algorithm,
        "metric": metric,
        "score": round(float(score), 6),
        "secondaryScore": round(float(secondary), 6),
        "durationSeconds": round(time.perf_counter() - started, 4),
        "estimatedCost": 0,
        "status": "Succeeded",
        "parameters": {**parameters, **({"output": output} if output else {})},
        "techniques": techniques,
        "preprocessing": ["imputacao", "codificacao categorica"],
        "featureImportance": [],
        **({"projection3d": projection} if projection else {}),
        **({"regressionPlot": regression_plot} if regression_plot else {}),
        **({"regressionPlot3d": regression_plot_3d} if regression_plot_3d else {}),
    }


def rank_trials(items: list[dict[str, Any]], lower_is_better: bool = False) -> list[dict[str, Any]]:
    items.sort(key=lambda item: item["score"], reverse=not lower_is_better)
    for index, item in enumerate(items, 1):
        item["rank"] = index
    return items


def supervised(request: RunRequest, regression: bool) -> list[dict[str, Any]]:
    config, rows = request.config, request.rows
    target, features = config.get("target", ""), config.get("features", [])
    frame = pl.DataFrame(rows)
    if frame.height < 12 or target not in frame.columns:
        raise ValueError("O dataset precisa ter ao menos 12 linhas com alvo.")
    frame, y = target_values(frame, target, regression)
    x_frame = feature_frame(frame.to_dicts(), features)
    x = object_matrix(x_frame)
    if len(x) < 12 or (not regression and len(set(y.tolist())) < 2):
        raise ValueError("O alvo nao possui dados suficientes para esta tarefa.")
    label_counts = Counter(y.tolist()) if not regression else Counter()
    stratify = y if not regression and label_counts and min(label_counts.values()) >= 2 else None
    validation_size = float(config.get("testSize", 20))
    validation_size = validation_size / 100 if validation_size > 1 else validation_size
    if not 0.05 <= validation_size <= 0.9:
        raise ValueError("A validacao deve ficar entre 5% e 90%.")
    train_x, test_x, train_y, test_y = train_test_split(x, y, test_size=validation_size, random_state=739, stratify=stratify)
    processors = preprocessor_for(x_frame)
    candidates: dict[str, Any] = (
        {"linear": Ridge(alpha=1.0), "tree": DecisionTreeRegressor(max_depth=6, random_state=739), "random-forest": RandomForestRegressor(n_estimators=160, random_state=739, n_jobs=-1), "gradient-boosting": GradientBoostingRegressor(random_state=739), "neural-network": MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=500, early_stopping=True, random_state=739), "ensemble": VotingRegressor([("ridge", Ridge()), ("forest", RandomForestRegressor(n_estimators=100, random_state=739, n_jobs=-1))])}
        if regression else
        {"linear": LogisticRegression(max_iter=1000, class_weight="balanced" if config.get("balancing") == "class-weights" else None), "tree": DecisionTreeClassifier(max_depth=6, random_state=739, class_weight="balanced" if config.get("balancing") == "class-weights" else None), "random-forest": RandomForestClassifier(n_estimators=160, random_state=739, n_jobs=-1, class_weight="balanced" if config.get("balancing") == "class-weights" else None), "gradient-boosting": GradientBoostingClassifier(random_state=739), "neural-network": MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=500, early_stopping=True, random_state=739), "ensemble": VotingClassifier([("logistic", LogisticRegression(max_iter=1000)), ("forest", RandomForestClassifier(n_estimators=100, random_state=739, n_jobs=-1))], voting="hard")}
    )
    requested = [name for name in config.get("algorithms", []) if name in candidates] or list(candidates)
    results = []
    for index in range(max(1, int(config.get("maxTrials", 1)))):
        name = requested[index % len(requested)]
        started = time.perf_counter()
        model = Pipeline([("prepare", processors), ("model", candidates[name])])
        model.fit(train_x, train_y)
        predicted = model.predict(test_x)
        if regression:
            train_prediction = model.predict(train_x)
            numeric_indices = numeric_feature_indices(x_frame)
            numeric_index = numeric_indices[0] if numeric_indices else 0
            numeric_feature = features[numeric_index]
            def plot_rows(source_x, actual, predicted_values):
                values = [{"x": float(source_x[position][numeric_index]), "actual": float(actual[position]), "predicted": float(predicted_values[position])} for position in range(len(source_x)) if numeric(source_x[position][numeric_index])]
                return sorted([value for value in values if np.isfinite(value["x"])][:300], key=lambda item: item["x"])
            regression_plot = {"feature": numeric_feature, "train": plot_rows(train_x, train_y, train_prediction), "validation": plot_rows(test_x, test_y, predicted)} if len(features) == 1 else None
            regression_plot_3d = None
            if len(features) == 2:
                first, second = features
                def points_3d(source_x, actual, prediction, validation):
                    return [{"x": float(source_x[position][0]), "y": float(source_x[position][1]), "actual": float(actual[position]), "predicted": float(prediction[position]), "validation": validation} for position in range(min(300, len(source_x))) if numeric(source_x[position][0]) and numeric(source_x[position][1])]
                regression_plot_3d = {"features": [first, second], "points": points_3d(train_x, train_y, train_prediction, False) + points_3d(test_x, test_y, predicted, True)}
            rmse = mean_squared_error(test_y, predicted) ** 0.5
            metric = config.get("metric", "rmse")
            score = {"rmse": rmse, "mae": mean_absolute_error(test_y, predicted), "r2": r2_score(test_y, predicted), "mape": np.mean(np.abs((test_y - predicted) / np.maximum(np.abs(test_y), 1e-9)))}.get(metric, rmse)
            results.append(trial(name, metric, score, r2_score(test_y, predicted), started, {"validationRows": len(test_y)}, ["pipeline sklearn", "holdout"], "", regression_plot=regression_plot, regression_plot_3d=regression_plot_3d))
        else:
            metric = config.get("metric", "f1")
            values = {"accuracy": accuracy_score(test_y, predicted), "f1": f1_score(test_y, predicted, average="macro", zero_division=0), "precision": f1_score(test_y, predicted, average="macro", zero_division=0), "recall": f1_score(test_y, predicted, average="macro", zero_division=0)}
            results.append(trial(name, metric, values.get(metric, values["f1"]), values["accuracy"], started, {"validationRows": len(test_y)}, ["pipeline sklearn", "holdout estratificado"], ""))
    return rank_trials(results, config.get("metric") in {"rmse", "mae", "mape"})


def matrix_and_projection(rows: list[dict[str, Any]], features: list[str], algorithm: str) -> tuple[np.ndarray, list[dict[str, Any]]]:
    frame = feature_frame(rows, features)
    transformed = preprocessor_for(frame).fit_transform(object_matrix(frame))
    dense = transformed.toarray() if hasattr(transformed, "toarray") else np.asarray(transformed)
    dense = StandardScaler().fit_transform(dense)
    if len(dense) < 3:
        raise ValueError("Sao necessarias ao menos tres linhas.")
    if algorithm == "tsne":
        coords = TSNE(n_components=3, perplexity=max(2, min(30, len(dense) // 3)), random_state=739).fit_transform(dense)
    else:
        coords = PCA(n_components=min(3, dense.shape[1], len(dense))).fit_transform(dense)
        if coords.shape[1] < 3: coords = np.pad(coords, ((0, 0), (0, 3 - coords.shape[1])))
    return dense, [{"x": float(row[0]), "y": float(row[1]), "z": float(row[2]), "cluster": 0, "row": index + 1} for index, row in enumerate(coords)]


def unsupervised(request: RunRequest) -> list[dict[str, Any]]:
    config = request.config
    task = config.get("task")
    algorithms = [name for name in config.get("algorithms", []) if name in {"k-means", "dbscan", "gaussian-mixture", "hierarchical", "pca", "tsne"}]
    if not algorithms: algorithms = ["pca"] if task == "dimensionality-reduction" else ["k-means"]
    results = []
    for index in range(max(1, int(config.get("maxTrials", 1)))):
        name = algorithms[index % len(algorithms)]
        started = time.perf_counter()
        data, points = matrix_and_projection(request.rows, config.get("features", []), name)
        if task == "dimensionality-reduction":
            components = min(3, data.shape[1])
            reducer = PCA(n_components=components).fit(data)
            reconstructed = reducer.inverse_transform(reducer.transform(data))
            error = float(np.mean((data - reconstructed) ** 2))
            results.append(trial(name, config.get("metric", "reconstruction_error"), error, 1 - error, started, {"components": components}, ["padronizacao", name], "", {"axes": ["Componente 1", "Componente 2", "Componente 3"], "clusterCount": 1, "source": "asset-preview", "points": points}))
            continue
        count = int(config.get("clusterCount", 3))
        if name == "k-means": labels = KMeans(n_clusters=count, n_init=10, random_state=739 + index).fit_predict(data)
        elif name == "dbscan": labels = DBSCAN(eps=0.75, min_samples=5).fit_predict(data)
        elif name == "gaussian-mixture": labels = GaussianMixture(n_components=count, random_state=739 + index).fit_predict(data)
        else: labels = AgglomerativeClustering(n_clusters=count).fit_predict(data)
        unique = [label for label in set(labels) if label >= 0]
        score = silhouette_score(data, labels) if len(unique) > 1 and len(unique) < len(data) else -1.0
        for point, label in zip(points, labels): point["cluster"] = int(label)
        results.append(trial(name, config.get("metric", "silhouette"), score, len(unique), started, {"clusters": len(unique), "requestedClusters": count}, ["padronizacao", name], "", {"axes": ["PC1", "PC2", "PC3"], "clusterCount": len(unique), "source": "asset-preview", "points": points}))
    return rank_trials(results)


def text_task(request: RunRequest) -> list[dict[str, Any]]:
    config, rows, task = request.config, request.rows, request.config.get("task")
    features = config.get("features", [])
    texts = [" ".join(str(row.get(column, "")) for column in features).strip() for row in rows]
    texts = [text for text in texts if text]
    if not texts: raise ValueError("Selecione ao menos uma coluna com texto.")
    started = time.perf_counter()
    vectorizer = TfidfVectorizer(stop_words=None, max_features=1200)
    matrix = vectorizer.fit_transform(texts)
    terms = vectorizer.get_feature_names_out()
    if task == "extraction":
        found = sorted(set(item for text in texts for item in re.findall(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{2,}\b", text)))
        output = ", ".join(found[:10]) or "Nenhuma entidade numerica, e-mail ou identificador encontrada."
        score = min(1.0, len(found) / max(len(texts), 1))
        return [trial("extractive", "coverage", score, len(found), started, {"entities": len(found)}, ["regex", "processamento textual local"], output)]
    weights = np.asarray(matrix.sum(axis=0)).ravel(); top = terms[np.argsort(weights)[-8:]][::-1].tolist()
    if task == "summarization":
        output = "Topicos mais representativos: " + ", ".join(top)
        return [trial("extractive", "coverage", min(1, len(top) / 8), len(texts), started, {"documents": len(texts)}, ["TF-IDF", "sumarizacao extrativa"], output)]
    query = config.get("target") or " ".join(top[:3])
    q = vectorizer.transform([query]); similarities = (matrix @ q.T).toarray().ravel(); best = np.argsort(similarities)[-3:][::-1]
    context = " ".join(texts[item] for item in best)
    output = f"Consulta: {query}. Contexto recuperado: {context[:600]}"
    label = "retrieval-agent" if task == "agent" else "retrieval-agent"
    return [trial(label, "retrieval_score", float(similarities[best[0]]), len(best), started, {"documents": len(texts), "retrieved": len(best)}, ["TF-IDF", "recuperacao semantica local"], output)]


def forecast_or_rank(request: RunRequest) -> list[dict[str, Any]]:
    config, rows = request.config, request.rows
    task, target = config.get("task"), config.get("target")
    frame = pl.DataFrame(rows)
    if target not in frame.columns: raise ValueError("Selecione um alvo numerico.")
    y_series = frame[target].cast(pl.Float64, strict=False)
    valid = y_series.is_not_null()
    filtered = frame.filter(valid)
    y = np.array(filtered[target].cast(pl.Float64, strict=False).to_list(), dtype=float)
    if len(y) < 16: raise ValueError("Sao necessarias ao menos 16 linhas numericas no alvo.")
    started = time.perf_counter()
    if task == "forecasting":
        x = np.column_stack([y[:-3], y[1:-2], y[2:-1]])
        response = y[3:]
        train_x, test_x, train_y, test_y = train_test_split(x, response, test_size=0.2, shuffle=False)
        model = RandomForestRegressor(n_estimators=160, random_state=739, n_jobs=-1).fit(train_x, train_y)
        prediction = model.predict(test_x); rmse = mean_squared_error(test_y, prediction) ** .5
        return [trial("random-forest", config.get("metric", "rmse"), rmse, mean_absolute_error(test_y, prediction), started, {"lagFeatures": 3}, ["lags temporais", "holdout temporal"], "")]
    x_frame = feature_frame(filtered.to_dicts(), config.get("features", []))
    x = object_matrix(x_frame)
    model = Pipeline([("prepare", preprocessor_for(x_frame)), ("model", RandomForestRegressor(n_estimators=160, random_state=739, n_jobs=-1))])
    model.fit(x, y); prediction = model.predict(x)
    ordering = np.argsort(prediction)[::-1]; gain = y[ordering]; discounts = 1 / np.log2(np.arange(2, len(gain) + 2)); ndcg = float((gain * discounts).sum() / max((np.sort(y)[::-1] * discounts).sum(), 1e-9))
    return [trial("random-forest", config.get("metric", "ndcg"), ndcg, r2_score(y, prediction), started, {"rankedRows": len(y)}, ["regressao de relevancia", "ordenacao por score"], "")]


@app.post("/api/rl/session")
def rl_create_session(request: RlSessionRequest):
    if request.algorithm != "q-learning":
        raise HTTPException(status_code=422, detail="Somente q-learning incremental esta disponivel neste treinador.")
    if request.observationSize < 1 or request.observationSize > 64:
        raise HTTPException(status_code=422, detail="observationSize deve ficar entre 1 e 64.")
    if request.actionCount < 2 or request.actionCount > 32:
        raise HTTPException(status_code=422, detail="actionCount deve ficar entre 2 e 32.")
    session_id = f"rl-trainer-{int(time.time() * 1000)}-{len(_rl_sessions) + 1}"
    _rl_sessions[session_id] = {
        "environment": request.environment,
        "workspaceId": request.workspaceId,
        "candidateName": request.candidateName,
        "observationSize": request.observationSize,
        "actionCount": request.actionCount,
        "targetEpisodes": max(1, int(request.targetEpisodes)),
        "learningRate": clamp_number(float(request.learningRate), 0.0001, 1.0),
        "discount": clamp_number(float(request.discount), 0.0, 0.999),
        "exploration": clamp_number(float(request.exploration), 0.0, 1.0),
        "algorithm": request.algorithm,
        "q": {},
        "policyVersion": 0,
        "episodeReward": 0.0,
        "episodeRewards": [],
        "bestReward": -1_000_000.0,
        "successes": 0,
        "currentEpisode": 0,
        "progress": 0.0,
        "steps": 0,
        "status": "active",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    return {
        "sessionId": session_id,
        "environment": request.environment,
        "workspaceId": request.workspaceId,
        "candidateName": request.candidateName,
        "observationSize": request.observationSize,
        "actionCount": request.actionCount,
        "targetEpisodes": max(1, int(request.targetEpisodes)),
        "policyVersion": 0,
        "algorithm": request.algorithm,
    }


@app.get("/api/rl/environments")
def rl_list_environments(workspaceId: str = ""):
    items = [
        rl_environment_status(session_id, session)
        for session_id, session in _rl_sessions.items()
        if not workspaceId or session["workspaceId"] == workspaceId
    ]
    items.sort(key=lambda item: item["updatedAt"], reverse=True)
    return {"environments": items}


@app.delete("/api/rl/environments/{session_id}")
def rl_delete_environment(session_id: str):
    existed = session_id in _rl_sessions
    _rl_sessions.pop(session_id, None)
    return {"status": "deleted" if existed else "missing", "sessionId": session_id}


@app.post("/api/rl/session/{session_id}/step")
def rl_train_step(session_id: str, request: RlTransitionRequest):
    session = require_rl_session(session_id)
    if len(request.observation) != session["observationSize"] or len(request.nextObservation) != session["observationSize"]:
        raise HTTPException(status_code=422, detail="observation e nextObservation devem ter observationSize elementos.")
    if request.action < 0 or request.action >= session["actionCount"]:
        raise HTTPException(status_code=422, detail="action fora do intervalo declarado na sessao.")
    q: dict[str, list[float]] = session["q"]
    state_key = rl_state_key(request.observation, session["observationSize"])
    next_key = rl_state_key(request.nextObservation, session["observationSize"])
    row = q.setdefault(state_key, [0.0] * session["actionCount"])
    next_row = q.setdefault(next_key, [0.0] * session["actionCount"])
    old_value = row[request.action]
    target = float(request.reward) + (0.0 if request.done else session["discount"] * max(next_row))
    row[request.action] = old_value + session["learningRate"] * (target - old_value)
    session["policyVersion"] += 1
    session["episodeReward"] += float(request.reward)
    session["steps"] += 1
    session["currentEpisode"] = max(session.get("currentEpisode", 0), int(request.episode or 0))
    session["progress"] = min(0.999, max(float(session.get("progress", 0.0)), session.get("currentEpisode", 0) / max(session.get("targetEpisodes", session.get("currentEpisode", 1)), 1)))
    session["exploration"] = max(0.01, session["exploration"] * 0.9995)
    session["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    next_action = rl_best_action(next_row)
    loss = abs(target - old_value)
    if request.done:
        session["episodeRewards"].append(session["episodeReward"])
        session["episodeReward"] = 0.0
    return {
        "nextAction": next_action,
        "loss": round(float(loss), 6),
        "episodeReward": round(float(session["episodeReward"]), 6),
        "policyVersion": session["policyVersion"],
        "corrections": {
            "exploration": round(float(session["exploration"]), 6),
            "targetBalance": "reduzir erro e velocidade angular" if len(request.nextObservation) >= 4 else "aproximar observacao do alvo",
            "qValue": round(float(row[request.action]), 6),
            "tdTarget": round(float(target), 6),
        },
    }


@app.post("/api/rl/session/{session_id}/episode")
def rl_finish_episode(session_id: str, request: RlEpisodeSummaryRequest):
    session = require_rl_session(session_id)
    if request.steps < 1:
        raise HTTPException(status_code=422, detail="steps deve ser maior que zero.")
    session["episodeRewards"].append(float(request.totalReward))
    session["episodeReward"] = 0.0
    session["currentEpisode"] = max(session.get("currentEpisode", 0), request.episode)
    session["bestReward"] = max(float(session.get("bestReward", -1_000_000.0)), float(request.totalReward))
    if request.success:
        session["successes"] = int(session.get("successes", 0)) + 1
    session["progress"] = max(float(session.get("progress", 0.0)), request.episode / max(session.get("targetEpisodes", request.episode), 1))
    session["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    session["lastEpisode"] = {
        "episode": request.episode,
        "totalReward": request.totalReward,
        "steps": request.steps,
        "success": request.success,
    }
    return rl_session_policy(session_id, session)


@app.get("/api/rl/session/{session_id}/policy")
def rl_get_policy(session_id: str):
    return rl_session_policy(session_id, require_rl_session(session_id))


@app.post("/api/rl/models")
def rl_save_model(request: RlSaveModelRequest):
    session = require_rl_session(request.sessionId)
    model_id = f"rl-model-{int(time.time() * 1000)}-{len(_rl_saved_models) + 1}"
    rewards = session["episodeRewards"]
    model = {
        "modelId": model_id,
        "sessionId": request.sessionId,
        "workspaceId": session["workspaceId"],
        "environment": session["environment"],
        "candidateName": session["candidateName"],
        "name": request.name or f"{session['environment']} - {session['candidateName']}",
        "policyVersion": session["policyVersion"],
        "averageReward": round(float(sum(rewards) / max(len(rewards), 1)), 6),
        "stateCount": len(session["q"]),
        "actionCount": session["actionCount"],
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "actionUrl": f"/api/rl/models/{model_id}/action",
        "q": {key: list(value) for key, value in session["q"].items()},
        "observationSize": session["observationSize"],
    }
    _rl_saved_models[model_id] = model
    session["status"] = "saved"
    session["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {key: value for key, value in model.items() if key != "q"}


@app.get("/api/rl/models")
def rl_list_models(workspaceId: str = ""):
    models = [
        {key: value for key, value in model.items() if key != "q"}
        for model in _rl_saved_models.values()
        if not workspaceId or model["workspaceId"] == workspaceId
    ]
    models.sort(key=lambda item: item["createdAt"], reverse=True)
    return {"models": models}


@app.get("/api/rl/models/{model_id}")
def rl_get_model(model_id: str):
    model = _rl_saved_models.get(model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Modelo RL salvo nao encontrado.")
    return {key: value for key, value in model.items() if key != "q"}


@app.post("/api/rl/models/{model_id}/action")
def rl_model_action(model_id: str, request: RlModelActionRequest):
    model = _rl_saved_models.get(model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Modelo RL salvo nao encontrado.")
    if len(request.observation) != model["observationSize"]:
        raise HTTPException(status_code=422, detail="observation tem tamanho diferente do modelo.")
    state_key = rl_state_key(request.observation, model["observationSize"])
    row = model["q"].get(state_key, [0.0] * model["actionCount"])
    return {"modelId": model_id, "action": rl_best_action(row), "policyVersion": model["policyVersion"], "qValues": row}


@app.delete("/api/rl/session/{session_id}")
def rl_delete_session(session_id: str):
    existed = session_id in _rl_sessions
    _rl_sessions.pop(session_id, None)
    return {"status": "deleted" if existed else "missing", "sessionId": session_id}


@app.post("/api/datasets/upload")
async def dataset_upload(request: Request):
    raw_filename = request.headers.get("x-file-name", "dataset.csv")
    filename = Path(os.path.basename(unquote(raw_filename))).name or "dataset.csv"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".csv", ".tsv", ".txt"}:
        raise HTTPException(status_code=422, detail="Upload backend suporta CSV, TSV e TXT delimitado nesta etapa.")
    delimiter = request.headers.get("x-delimiter", "auto") or "auto"
    staging_id = f"staging-{uuid.uuid4().hex}"
    path = _dataset_staging_store / f"{staging_id}{suffix}"
    bytes_written = 0
    with path.open("wb") as handle:
        async for chunk in request.stream():
            if chunk:
                bytes_written += len(chunk)
                handle.write(chunk)
    if bytes_written == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Arquivo vazio.")
    try:
        actual_delimiter = detect_delimiter(path, filename, delimiter)
        preview_frame = read_dataset_frame_from_path(path, filename, actual_delimiter, nrows=1000)
    except Exception as error:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Nao foi possivel ler o dataset: {error}") from error
    row_count = count_delimited_rows(path)
    schema = visualization_schema(preview_frame)
    columns = [str(column) for column in preview_frame.columns]
    if row_count > MAX_DATASET_ROWS:
        _dataset_staging_registry[staging_id] = {
            "filename": filename,
            "path": str(path),
            "delimiter": actual_delimiter,
            "rowCount": row_count,
            "columns": columns,
            "schema": schema,
            "bytes": bytes_written,
            "createdAt": time.time(),
        }
        return {
            "requiresSampling": True,
            "stagingId": staging_id,
            "name": filename,
            "rowCount": row_count,
            "limit": MAX_DATASET_ROWS,
            "columns": columns,
            "schema": schema,
            "bytes": bytes_written,
        }
    dataset_id = f"dataset-{uuid.uuid4().hex}"
    parquet_path = _dataset_store / f"{dataset_id}.parquet"
    preview_frame = write_parquet_from_delimited(path, filename, actual_delimiter, parquet_path)
    path.unlink(missing_ok=True)
    _dataset_registry[dataset_id] = {
        "filename": filename,
        "sourceFilename": filename,
        "path": str(parquet_path),
        "parquetPath": str(parquet_path),
        "delimiter": actual_delimiter,
        "rowCount": row_count,
        "columns": [str(column) for column in preview_frame.columns],
        "schema": visualization_schema(preview_frame),
        "bytes": bytes_written,
        "sampled": False,
        "createdAt": time.time(),
    }
    save_dataset_registry()
    return {
        "datasetId": dataset_id,
        "name": filename,
        "rowCount": row_count,
        "columns": [str(column) for column in preview_frame.columns],
        "schema": visualization_schema(preview_frame),
        "bytes": bytes_written,
        "parquet": True,
        "sampled": False,
    }


@app.post("/api/datasets/{dataset_id}/sample")
def dataset_sample(dataset_id: str, request: DatasetSampleRequest):
    limit = max(1, min(int(request.limit or MAX_DATASET_ROWS), MAX_DATASET_ROWS))
    seed = int(request.seed)
    source: dict[str, Any] | None = _dataset_staging_registry.get(dataset_id)
    source_is_staging = source is not None
    if source is None:
        source = _dataset_registry.get(dataset_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Dataset para amostragem nao encontrado.")
    source_path = dataset_path(source)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo para amostragem nao encontrado.")
    row_count = int(source.get("rowCount", 0) or 0)
    sample_count = min(limit, row_count if row_count > 0 else limit)
    try:
        if source_path.suffix.lower() == ".parquet":
            lazy = pl.scan_parquet(source_path)
        else:
            lazy = polars_scan_csv(source_path, str(source.get("filename", source_path.name)), str(source.get("delimiter", "auto")))
        sampled = deterministic_sample_lazy(lazy, sample_count, seed) if row_count > sample_count else lazy.collect()
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Nao foi possivel criar a amostra: {error}") from error
    new_id = f"dataset-{uuid.uuid4().hex}"
    requested_name = request.name.strip() or f"{Path(str(source.get('filename', source_path.name))).stem}_sample_500k.parquet"
    filename = Path(os.path.basename(requested_name)).name or f"{new_id}.parquet"
    parquet_path = _dataset_store / f"{new_id}.parquet"
    sampled.write_parquet(parquet_path)
    _dataset_registry[new_id] = {
        "filename": filename,
        "sourceFilename": source.get("filename", filename),
        "path": str(parquet_path),
        "parquetPath": str(parquet_path),
        "delimiter": source.get("delimiter", "auto"),
        "rowCount": sampled.height,
        "columns": [str(column) for column in sampled.columns],
        "schema": visualization_schema(sampled),
        "bytes": parquet_path.stat().st_size,
        "sampled": True,
        "sampledFromRowCount": row_count,
        "sampleSeed": seed,
        "createdAt": time.time(),
    }
    if source_is_staging:
        source_path.unlink(missing_ok=True)
        _dataset_staging_registry.pop(dataset_id, None)
    save_dataset_registry()
    return {
        "datasetId": new_id,
        "name": filename,
        "rowCount": sampled.height,
        "columns": [str(column) for column in sampled.columns],
        "schema": visualization_schema(sampled),
        "bytes": parquet_path.stat().st_size,
        "parquet": True,
        "sampled": True,
        "sampledFromRowCount": row_count,
    }


@app.delete("/api/datasets/staging/{staging_id}")
def dataset_cancel_staging(staging_id: str):
    staging = _dataset_staging_registry.pop(staging_id, None)
    if staging:
        Path(str(staging.get("path", ""))).unlink(missing_ok=True)
    return {"status": "deleted" if staging else "missing", "stagingId": staging_id}


@app.get("/api/datasets/{dataset_id}/preview")
def dataset_preview(dataset_id: str, start: int = 1, end: int = 50):
    if start < 1 or start > end:
        raise HTTPException(status_code=422, detail="Range invalido: min precisa ser menor ou igual a max.")
    dataset = require_dataset(dataset_id)
    row_count = int(dataset.get("rowCount", 0))
    try:
        frame = read_dataset_frame(dataset_id)
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Nao foi possivel ler o preview: {error}") from error
    result = visualization_result(frame, "source", start, end)
    result["metadata"]["rowCount"] = row_count
    return result


@app.post("/api/datasets/{dataset_id}/refinery/profile")
def dataset_refinery_profile(dataset_id: str, request: DatasetRefineryRequest):
    try:
        frame = read_dataset_frame(dataset_id)
        result, source_profile = apply_refinery_steps(frame, request.steps)
        return refinery_response(result, source_profile, request.previewStart, request.previewEnd)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Nao foi possivel calcular o perfil completo: {error}") from error


@app.post("/api/datasets/{dataset_id}/refinery/run")
def dataset_refinery_run(dataset_id: str, request: DatasetRefineryRequest):
    try:
        frame = read_dataset_frame(dataset_id)
        result, source_profile = apply_refinery_steps(frame, request.steps)
        if result.height > MAX_DATASET_ROWS:
            raise ValueError(f"Resultado possui {result.height} linhas e excede o teto operacional de {MAX_DATASET_ROWS}.")
        new_id = f"dataset-{uuid.uuid4().hex}"
        source_dataset = require_dataset(dataset_id)
        requested_name = request.name.strip() or f"{Path(str(source_dataset.get('filename', dataset_id))).stem}_refined.parquet"
        filename = Path(os.path.basename(requested_name)).name or f"{new_id}.parquet"
        parquet_path = _dataset_store / f"{new_id}.parquet"
        result.write_parquet(parquet_path)
        _dataset_registry[new_id] = {
            "filename": filename,
            "sourceFilename": source_dataset.get("filename", filename),
            "path": str(parquet_path),
            "parquetPath": str(parquet_path),
            "delimiter": source_dataset.get("delimiter", "auto"),
            "rowCount": result.height,
            "columns": [str(column) for column in result.columns],
            "schema": visualization_schema(result),
            "bytes": parquet_path.stat().st_size,
            "sampled": False,
            "createdAt": time.time(),
            "refinedFromDatasetId": dataset_id,
        }
        save_dataset_registry()
        payload = refinery_response(result, source_profile, request.previewStart, request.previewEnd)
        payload.update({
            "datasetId": new_id,
            "name": filename,
            "bytes": parquet_path.stat().st_size,
            "parquet": True,
        })
        return payload
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Nao foi possivel executar a receita completa: {error}") from error


@app.get("/api/autoai/health")
def health(): return {"status": "ok", "engine": "scikit-learn"}


@app.post("/api/autoai/run")
def run(request: RunRequest):
    try:
        task = request.config.get("task")
        if task == "classification": return supervised(request, False)
        if task == "regression": return supervised(request, True)
        if task in {"clustering", "dimensionality-reduction"}: return unsupervised(request)
        if task in {"extraction", "summarization", "rag", "agent"}: return text_task(request)
        if task in {"forecasting", "ranking"}: return forecast_or_rank(request)
        raise ValueError("Esta tarefa e executada no motor de reforco dedicado.")
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/visualization/execute")
def visualization_execute(request: VisualizationRequest):
    try:
        return execute_visualization(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/visualization/refine")
def visualization_refine(request: VisualizationRefineRequest):
    try:
        target, result, _, _, _, _ = execute_visualization_frames(request)
        if result.height > MAX_DATASET_ROWS:
            raise ValueError(f"Resultado possui {result.height} linhas e excede o teto operacional de {MAX_DATASET_ROWS}.")
        new_id = f"dataset-{uuid.uuid4().hex}"
        source_dataset = require_dataset(request.datasetId) if request.datasetId else {}
        source_name = str(source_dataset.get("filename", request.datasetId or "dataset"))
        requested_name = request.name.strip() or f"{Path(source_name).stem}_canvas_refined.parquet"
        filename = Path(os.path.basename(requested_name)).name or f"{new_id}.parquet"
        parquet_path = _dataset_store / f"{new_id}.parquet"
        result.write_parquet(parquet_path)
        schema = visualization_schema(result)
        _dataset_registry[new_id] = {
            "filename": filename,
            "sourceFilename": source_dataset.get("filename", filename),
            "path": str(parquet_path),
            "parquetPath": str(parquet_path),
            "delimiter": source_dataset.get("delimiter", "auto"),
            "rowCount": result.height,
            "columns": [str(column) for column in result.columns],
            "schema": schema,
            "bytes": parquet_path.stat().st_size,
            "sampled": False,
            "createdAt": time.time(),
            "refinedFromDatasetId": request.datasetId or "",
            "visualizationTargetNodeId": target,
        }
        save_dataset_registry()
        preview = visualization_result(result, target, request.previewStart, request.previewEnd)
        return {
            "datasetId": new_id,
            "name": filename,
            "rowCount": result.height,
            "columns": [str(column) for column in result.columns],
            "schema": schema,
            "bytes": parquet_path.stat().st_size,
            "parquet": True,
            "rows": preview["rows"],
        }
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")
