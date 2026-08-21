import type { DataRow } from "./dataPrep";

export type VisualizationNodeKind =
  | "source" | "column-strip" | "select" | "filter" | "filter-out" | "dedupe" | "remove-column" | "fill-missing" | "fill-median" | "fill-mode" | "category-map"
  | "groupBy" | "aggregate" | "sortBy" | "bin" | "pivot" | "unpivot" | "regex" | "rename"
  | "topN" | "sample" | "rank" | "resample" | "calculate" | "cast" | "code" | "window" | "join" | "info" | "describe" | "unique";
export type ChartKind = "table" | "bar" | "line" | "area" | "pie" | "histogram" | "scatter2d" | "scatter3d" | "boxplot" | "heatmap";
export type NodeKind = VisualizationNodeKind | ChartKind;

export interface VisualizationNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  params: Record<string, unknown>;
  layers?: ChartLayer[];
}

/** `python-N` ports are paired channels of a Python node (N = 1..10). */
export type VisualizationPort = "primary" | `python-${number}`;

export interface VisualizationConnection {
  id: string;
  source: string;
  target: string;
  /** Python ports represent named, isolated input/output branches. */
  sourcePort?: VisualizationPort;
  targetPort?: VisualizationPort;
}
export interface ChartLayer {
  id: string;
  type: ChartKind;
  x?: string;
  y?: string;
  z?: string;
  series?: string;
  bins?: number;
  limit?: number;
  aggregation?: "count" | "sum" | "mean";
  boxplotMode?: "shared" | "separate";
  heatmapTheme?: "diverging" | "blue" | "viridis" | "spectral";
  barMode?: "simple" | "grouped" | "stacked";
  histogramMode?: "single" | "stacked" | "grid";
}
export interface VisualizationFlow { sourceAssetId: string; nodes: VisualizationNode[]; connections: VisualizationConnection[]; updatedAt: string; }
export interface ExecutionResult {
  nodeId: string;
  outputPort?: VisualizationPort;
  schema: Array<{ name: string; type: string }>;
  rows: DataRow[];
  chartRows?: DataRow[];
  metadata: {
    rowCount: number;
    numericColumns: string[];
    granularity: string;
    lineage: string[];
  };
  execution?: {
    sourceReadSeconds: number;
    totalSeconds: number;
    backendDataset: boolean;
  };
  cacheHit: boolean;
}

export const transformKinds: Array<{ kind: VisualizationNodeKind; label: string }> = [
  ["column-strip", "Column strip"], ["select", "Selecionar colunas"], ["filter", "Filtrar linhas"], ["filter-out", "Remover valor"], ["dedupe", "Remover duplicadas"],
  ["remove-column", "Remover coluna"], ["fill-missing", "Preencher nulos"], ["fill-median", "Preencher com mediana"], ["fill-mode", "Preencher com moda"],
  ["category-map", "Mapear categorias"], ["unique", "Valores unicos"], ["regex", "Regex"], ["rename", "Renomear colunas"], ["groupBy", "Agrupar"], ["aggregate", "Agregar"],
  ["sortBy", "Ordenar"], ["bin", "Criar faixas"], ["pivot", "Pivotar"], ["unpivot", "Despivote"],
  ["topN", "Top N"], ["sample", "Amostra (head)"], ["rank", "Ranking"], ["resample", "Reamostrar"], ["calculate", "Calcular"], ["cast", "Converter coluna"], ["code", "Codigo Python"],
  ["window", "Janela"], ["join", "Juntar tabelas"], ["info", "Info da tabela"], ["describe", "Descrever numéricas"]
].map(([kind, label]) => ({ kind: kind as VisualizationNodeKind, label }));

export const chartKinds: Array<{ kind: ChartKind; label: string }> = [
  ["table", "Tabela"], ["bar", "Barras"], ["line", "Linha"], ["area", "Área"], ["pie", "Pizza"],
  ["histogram", "Histograma"], ["scatter2d", "Dispersão 2D"], ["scatter3d", "Dispersão 3D"],
  ["boxplot", "Boxplot"], ["heatmap", "Heatmap"]
].map(([kind, label]) => ({ kind: kind as ChartKind, label }));

export function isChartKind(kind: NodeKind | undefined): kind is ChartKind { return Boolean(kind) && chartKinds.some((item) => item.kind === kind); }

export function defaultParams(kind: NodeKind, columns: string[]): Record<string, unknown> {
  const first = columns[0] ?? "";
  const second = columns[1] ?? first;
  if (kind === "column-strip") return { generatedColumns: [] };
  if (kind === "select") return { columns: columns.slice(0, 3) };
  if (kind === "filter") return { column: first, operator: "equals", value: "" };
  if (kind === "filter-out") return { column: first, value: "", mode: "contains" };
  if (kind === "dedupe") return {};
  if (kind === "remove-column") return { column: first };
  if (kind === "unique") return { column: first };
  if (kind === "regex") return { column: first, mode: "filter", pattern: "", as: "extraido" };
  if (kind === "rename") return { renames: Object.fromEntries(columns.map((column) => [column, ""])) };
  if (kind === "fill-missing") return { column: first, value: "" };
  if (kind === "fill-median" || kind === "fill-mode") return { column: first };
  if (kind === "category-map") return { column: first, mappingText: "com vitima => com vítima\ncom V => com vítima\ncom => com vítima\nsem vitima => sem vítima\nsem V => sem vítima\nsem => sem vítima" };
  if (kind === "groupBy") return { columns: [first] };
  if (kind === "aggregate") return { measures: [{ column: first, operation: "mean", as: `mean_${first}` }] };
  if (kind === "sortBy") return { column: first, direction: "asc" };
  if (kind === "bin") return { column: first, bins: 10, as: `${first}_bin` };
  if (kind === "pivot") return { index: [first], columns: second, values: columns[2] ?? second, operation: "mean" };
  if (kind === "unpivot") return { identifiers: [first], values: columns.slice(1, 3), variableName: "variable", valueName: "value" };
  if (kind === "topN") return { column: first, count: 10 };
  if (kind === "sample") return { count: 10 };
  if (kind === "rank") return { column: first, direction: "desc", as: `${first}_rank` };
  if (kind === "resample") return { dateColumn: first, valueColumn: second, frequency: "D", operation: "mean" };
  if (kind === "calculate") return { as: "calculated", expression: `${first} * 1` };
  if (kind === "cast") return { column: first, target: "number", dateFormat: "" };
  if (kind === "code") return { code: "# df contem a tabela de entrada como Polars DataFrame\n# Defina result como um pl.DataFrame\nresult = df.clone()" };
  if (kind === "window") return { valueColumn: first, orderBy: second, partitionBy: [], function: "running_sum", window: 3, as: "running_sum" };
  if (kind === "join") return { mode: "common", entries: [] };
  return {};
}

export function defaultLayer(
  kind: ChartKind,
  columns: string[],
  numericColumns: string[] = columns,
  datetimeColumns: string[] = [],
): ChartLayer {
  const numeric = numericColumns.length ? numericColumns : columns;
  const temporal = datetimeColumns.filter((column) => columns.includes(column));
  const categorical = columns.find((column) => !numeric.includes(column) && !temporal.includes(column)) ?? columns[0] ?? "";
  const temporalOrNumeric = temporal[0] ?? numeric[0] ?? "";
  if (kind === "table") return { id: `layer-${Date.now()}`, type: kind, limit: 12 };
  if (kind === "heatmap") return { id: `layer-${Date.now()}`, type: kind, heatmapTheme: "diverging" };
  if (kind === "histogram") return { id: `layer-${Date.now()}`, type: kind, x: numeric[0] ?? "", bins: 12, histogramMode: "single" };
  if (kind === "boxplot") return { id: `layer-${Date.now()}`, type: kind, boxplotMode: "shared" };
  if (kind === "bar") return { id: `layer-${Date.now()}`, type: kind, x: temporal[0] ?? categorical, y: numeric[0] ?? "", series: "", barMode: "simple" };
  if (kind === "pie") return { id: `layer-${Date.now()}`, type: kind, x: categorical, y: "", aggregation: "count" };
  if (kind === "scatter3d") return { id: `layer-${Date.now()}`, type: kind, x: numeric[0] ?? "", y: numeric[1] ?? numeric[0] ?? "", z: numeric[2] ?? "", series: "" };
  return { id: `layer-${Date.now()}`, type: kind, x: temporalOrNumeric, y: numeric.find((column) => column !== temporalOrNumeric) ?? numeric[0] ?? "", series: "" };
}

export function normalizeChartLayerForInput(
  layer: ChartLayer,
  inputColumns: string[],
  numeric: string[],
  temporal: string[],
): ChartLayer {
  if (layer.type === "bar") {
    const categorical = inputColumns.filter((column) => !numeric.includes(column) && !temporal.includes(column));
    const xOptions = Array.from(new Set([...temporal, ...categorical, ...inputColumns]));
    const currentX = layer.x ?? "";
    const nextX = xOptions.includes(currentX)
      ? currentX
      : temporal[0] ?? categorical[0] ?? inputColumns.find((column) => column !== numeric[0]) ?? inputColumns[0] ?? "";
    const seriesOptions = categorical.filter((column) => column !== nextX);
    const nextSeries = layer.series && seriesOptions.includes(layer.series) ? layer.series : "";
    const patch: Partial<ChartLayer> = {};
    if (currentX !== nextX) patch.x = nextX;
    if (!numeric.includes(layer.y ?? "")) patch.y = numeric[0] ?? "";
    if ((layer.series ?? "") !== nextSeries) patch.series = nextSeries;
    if (!nextSeries && (layer.barMode ?? "simple") !== "simple") patch.barMode = "simple";
    if (nextSeries && (layer.barMode ?? "simple") === "simple") patch.barMode = "grouped";
    return Object.keys(patch).length ? { ...layer, ...patch } : layer;
  }
  if (layer.type === "pie") {
    const categorical = inputColumns.filter((column) => !numeric.includes(column) && !temporal.includes(column));
    const nextX = inputColumns.includes(layer.x ?? "")
      ? layer.x
      : categorical[0] ?? inputColumns[0] ?? "";
    const patch: Partial<ChartLayer> = {};
    if ((layer.x ?? "") !== nextX) patch.x = nextX;
    if ((layer.aggregation ?? "count") !== "count" && !numeric.includes(layer.y ?? "")) patch.y = numeric[0] ?? "";
    return Object.keys(patch).length ? { ...layer, ...patch } : layer;
  }
  const requiresMeasure = ["line", "area", "scatter2d", "scatter3d"].includes(layer.type);
  const supportsTemporalX = ["line", "area", "scatter2d"].includes(layer.type);
  const validX = supportsTemporalX
    ? [...numeric, ...temporal].includes(layer.x ?? "")
    : numeric.includes(layer.x ?? "");
  const patch: Partial<ChartLayer> = {};
  const isInitialNumericX = layer.x === numeric[0] && layer.y === numeric[0];
  if (!validX || (supportsTemporalX && temporal.length > 0 && isInitialNumericX)) {
    patch.x = supportsTemporalX ? temporal[0] ?? numeric[0] ?? "" : numeric[0] ?? "";
  }
  if (requiresMeasure && !numeric.includes(layer.y ?? "")) patch.y = numeric[0] ?? "";
  return Object.keys(patch).length ? { ...layer, ...patch } : layer;
}
