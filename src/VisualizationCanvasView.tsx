import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  BarChart3,
  ChevronLeft,
  Eye,
  Link2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Asset } from "./domain";
import type { DataRow } from "./dataPrep";
import {
  chartKinds,
  defaultLayer,
  defaultParams,
  isChartKind,
  normalizeChartLayerForInput,
  transformKinds,
  type ChartKind,
  type ChartLayer,
  type ExecutionResult,
  type VisualizationConnection,
  type VisualizationFlow,
  type VisualizationNode,
  type VisualizationPort,
} from "./visualizationCanvas";

interface Props {
  dataAssets: Asset[];
  flows: Asset[];
  initialAssetId: string;
  initialFlowId?: string;
  onBack: () => void;
  onSave: (flow: VisualizationFlow, existingId?: string) => void;
  onRequestAssetName?: (suggestedName: string, onConfirm: (name: string) => void) => void;
  onSaveRefinedAsset?: (payload: {
    sourceName: string;
    name: string;
    datasetId: string;
    rowCount: number;
    bytes: number;
    rows: DataRow[];
    schema: Array<{ name: string; type: string }>;
    nodes: VisualizationNode[];
  }) => void;
  selectionMode?: boolean;
  onSelectNodeForNotebook?: (payload: { node: VisualizationNode; result: ExecutionResult; layers?: ChartLayer[]; range: { start: number; end: number } }) => void;
}

const sourceNode = (columns: string[]): VisualizationNode => ({
  id: "source",
  kind: "source",
  label: "Dataset de origem",
  x: 80,
  y: 180,
  params: defaultParams("source", columns),
});
const pythonPorts = Array.from({ length: 10 }, (_, index) => `python-${index + 1}` as VisualizationPort);
const isPythonPort = (port?: VisualizationPort) => Boolean(port?.startsWith("python-"));
const portResultKey = (nodeId: string, port: VisualizationPort = "primary") => `${nodeId}:${port}`;
const portOrder = (port: VisualizationPort) => Number(port.replace("python-", "")) || 0;

function codePortOffset(
  nodeId: string,
  port: VisualizationPort,
  connections: VisualizationConnection[],
  direction: "input" | "output",
): number {
  if (!isPythonPort(port)) return .5;
  const field = direction === "input" ? "targetPort" : "sourcePort";
  const nodeField = direction === "input" ? "target" : "source";
  const connected = Array.from(new Set(
    connections
      .filter((edge) => edge[nodeField] === nodeId && isPythonPort(edge[field]))
      .map((edge) => edge[field] as VisualizationPort),
  )).sort((left, right) => portOrder(left) - portOrder(right));
  const foundIndex = connected.indexOf(port);
  // While dragging a new connection, the not-yet-confirmed port is shown
  // beneath existing ports. Once confirmed the whole group is re-centered.
  const index = foundIndex >= 0 ? foundIndex : connected.length;
  return (index + 1) / (connected.length + (foundIndex >= 0 ? 1 : 2));
}

function visibleCodePorts(
  nodeId: string,
  direction: "input" | "output",
  connections: VisualizationConnection[],
  activePort?: VisualizationPort,
): VisualizationPort[] {
  const field = direction === "input" ? "targetPort" : "sourcePort";
  const nodeField = direction === "input" ? "target" : "source";
  const connected = Array.from(new Set(
    connections
      .filter((edge) => edge[nodeField] === nodeId && isPythonPort(edge[field]))
      .map((edge) => edge[field] as VisualizationPort),
  )).sort((left, right) => portOrder(left) - portOrder(right));
  const next = pythonPorts.find((port) => !connected.includes(port));
  return Array.from(new Set([...connected, ...(next ? [next] : []), ...(activePort && isPythonPort(activePort) ? [activePort] : [])]))
    .sort((left, right) => portOrder(left) - portOrder(right));
}
const normalizeNode = (node: VisualizationNode, columns: string[]): VisualizationNode => ({
  ...node,
  params: node.params ?? defaultParams(node.kind, columns),
  layers: isChartKind(node.kind)
    ? [node.layers?.[0] ?? defaultLayer(node.kind, columns)]
    : node.layers,
});
const transformMenuGroups = [
  { label: "Inspecionar dados", kinds: ["info", "describe"] },
  { label: "Limpeza básica", kinds: ["dedupe", "remove-column", "filter-out", "fill-missing", "fill-median", "fill-mode"] },
  { label: "Selecionar e ordenar", kinds: ["select", "filter", "unique", "sample", "sortBy", "topN", "rank"] },
  { label: "Preparar valores", kinds: ["category-map", "regex", "rename", "bin", "calculate", "cast", "code", "window", "resample"] },
  { label: "Estruturar tabela", kinds: ["column-strip", "groupBy", "aggregate", "pivot", "unpivot"] },
  { label: "Combinar dados", kinds: ["join"] },
] as const;
const deprecatedTransformKinds = new Set<VisualizationNode["kind"]>(["sample"]);
const deprecatedTransformHint: Record<string, string> = {
  sample: "Desativado: use o ícone de olho em qualquer nó para ver o preview.",
};
const columnList = (result?: ExecutionResult, fallback: string[] = []) =>
  Array.isArray(result?.schema)
    ? result.schema.map((column) => column.name)
    : fallback;
const previewTextWidth = (text: string) => {
  if (typeof document === "undefined") return text.length * 7 + 12;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return text.length * 7 + 12;
  context.font = "11px Arial";
  return Math.ceil(context.measureText(text).width) + 12;
};
const previewColumnWidths = (result?: ExecutionResult) => {
  if (!result || !Array.isArray(result.schema) || !Array.isArray(result.rows))
    return [96, 96, 96, 96, 96];
  return result.schema.map((column) => {
    // The header is data too for sizing purposes. Otherwise short values make
    // labels such as "target" or "count" collapse into an ellipsis.
    const values = [column.name, ...result.rows.slice(0, 10).map((row) => String(row[column.name] ?? ""))];
    const widest = values.reduce(
      (current, value) => (previewTextWidth(value) > previewTextWidth(current) ? value : current),
      "",
    );
    return Math.max(72, previewTextWidth(widest) + 12);
  });
};
const previewTableWidth = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0);
const previewLayout = (result: ExecutionResult | undefined, availableWidth: number) => {
  const naturalWidths = previewColumnWidths(result);
  const visibleCount = Math.min(5, naturalWidths.length);
  const visibleNaturalWidth = previewTableWidth(naturalWidths.slice(0, visibleCount));
  const totalNaturalWidth = previewTableWidth(naturalWidths);
  if (!visibleCount || availableWidth < visibleNaturalWidth) {
    return { widths: naturalWidths, tableWidth: previewTableWidth(naturalWidths), horizontalOverflow: true };
  }
  if (availableWidth < totalNaturalWidth) {
    return { widths: naturalWidths, tableWidth: totalNaturalWidth, horizontalOverflow: true };
  }
  const factor = availableWidth / totalNaturalWidth;
  const widths = naturalWidths.map((width) => Math.round(width * factor));
  return {
    widths,
    tableWidth: previewTableWidth(widths),
    horizontalOverflow: false,
  };
};
const nodeWidth = (node: VisualizationNode) => {
  if (node.kind === "sample") return 320;
  if (node.kind === "code") return 540;
  return isChartKind(node.kind) ? 470 : 210;
};

const descendantIds = (
  nodeId: string,
  connections: VisualizationConnection[],
): Set<string> => {
  const ids = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    connections.forEach((edge) => {
      if (ids.has(edge.source) && !ids.has(edge.target)) {
        ids.add(edge.target);
        changed = true;
      }
    });
  }
  return ids;
};

const outputColumnsForNode = (
  nodeId: string,
  nodes: VisualizationNode[],
  connections: VisualizationConnection[],
  sourceColumns: string[],
  visited = new Set<string>(),
): string[] => {
  if (visited.has(nodeId)) return sourceColumns;
  visited.add(nodeId);
  const node = nodes.find((item) => item.id === nodeId);
  if (!node || node.kind === "source") return sourceColumns;
  const parent = connections.find((edge) => edge.target === nodeId)?.source;
  const input = parent
    ? outputColumnsForNode(parent, nodes, connections, sourceColumns, visited)
    : sourceColumns;
  if (node.kind === "join") {
    const entries = Array.isArray(node.params?.entries) ? node.params.entries as Array<Record<string, unknown>> : [];
    const inputTables = connections.filter((edge) => edge.target === nodeId).map((edge) => {
      const sourceColumnsForTable = outputColumnsForNode(edge.source, nodes, connections, sourceColumns, new Set());
      const config = entries.find((entry) => String(entry.connectionId ?? "") === edge.id) ?? {};
      const renames = config.renames as Record<string, string> | undefined;
      return sourceColumnsForTable.map((column) => String(renames?.[column] ?? "").trim() || column);
    });
    if (node.params?.mode === "horizontal") {
      const seen = new Set<string>();
      return inputTables.flatMap((tableColumns, tableIndex) => tableColumns.map((column) => {
        const name = seen.has(column) ? `${column}_table_${tableIndex + 1}` : column;
        seen.add(name);
        return name;
      }));
    }
    return Array.from(new Set(inputTables.flat()));
  }
  if (node.kind === "select") {
    const selected = node.params?.columns;
    return Array.isArray(selected)
      ? selected.map(String).filter((column) => input.includes(column))
      : input;
  }
  if (node.kind === "remove-column") {
    const removed = String(node.params?.column ?? "");
    return input.filter((column) => column !== removed);
  }
  if (node.kind === "unique") {
    const column = String(node.params?.column ?? "");
    return input.includes(column) ? [column] : input;
  }
  if (node.kind === "regex") {
    const name = String(node.params?.as ?? "").trim();
    return node.params?.mode === "extract" && name && !input.includes(name) ? [...input, name] : input;
  }
  if (node.kind === "rename") {
    const renames = node.params?.renames;
    return input.map((column) => String((renames as Record<string, string> | undefined)?.[column] ?? "").trim() || column);
  }
  if (node.kind === "calculate") {
    const name = String(node.params?.as ?? "").trim();
    return name && !input.includes(name) ? [...input, name] : input;
  }
  if (node.kind === "groupBy") {
    const groups = node.params?.columns;
    return Array.isArray(groups)
      ? [...groups.map(String).filter((column) => input.includes(column)), "count"]
      : input;
  }
  if (node.kind === "aggregate") {
    const measures = node.params?.measures;
    return Array.isArray(measures)
      ? measures.map((measure) => String((measure as { as?: string }).as ?? "")).filter(Boolean)
      : input;
  }
  if (node.kind === "info") {
    return ["column", "type", "rows", "non_null", "missing", "missing_pct", "unique"];
  }
  if (node.kind === "describe") {
    return ["column", "count", "mean", "std", "min", "q1", "median", "q3", "max"];
  }
  if (node.kind === "bin" || node.kind === "rank" || node.kind === "window") {
    const name = String(node.params?.as ?? "").trim();
    return name && !input.includes(name) ? [...input, name] : input;
  }
  if (node.kind === "unpivot") {
    const identifiers = Array.isArray(node.params?.identifiers)
      ? node.params.identifiers.map(String).filter((column) => input.includes(column))
      : [];
    return [
      ...identifiers,
      String(node.params?.variableName ?? "variable"),
      String(node.params?.valueName ?? "value"),
    ];
  }
  if (node.kind === "resample") {
    return [String(node.params?.dateColumn ?? ""), String(node.params?.valueColumn ?? "")].filter(Boolean);
  }
  return input;
};
const parseRows = (asset?: Asset): DataRow[] => {
  try {
    const raw = JSON.parse(asset?.metadata?.rowsJson ?? "[]") as DataRow[];
    const columns = raw[0] ? Object.keys(raw[0]) : [];
    const kinds = new Map(
      columns.map((column) => {
        const values = raw
          .map((row) => row[column])
          .filter(
            (value) =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== "",
          );
        const booleanLike =
          values.length > 0 &&
          values.every((value) => /^(true|false)$/i.test(String(value)));
        const numericLike =
          values.length > 0 &&
          values.filter((value) => Number.isFinite(Number(value))).length /
            values.length >=
            0.9;
        return [
          column,
          booleanLike ? "boolean" : numericLike ? "number" : "text",
        ] as const;
      }),
    );
    return raw.map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([column, value]) => {
            if (value === null || value === undefined || value === "")
              return [column, null];
            if (kinds.get(column) === "boolean")
              return [column, String(value).toLowerCase() === "true"];
            if (kinds.get(column) === "number") return [column, Number(value)];
            return [column, value];
          }),
        ) as DataRow,
    );
  } catch {
    return [];
  }
};
const schemaTypesFromAsset = (asset?: Asset): Array<{ name: string; type: string }> => {
  try {
    const parsedBackend = JSON.parse(asset?.metadata?.backendSchema ?? "[]") as Array<{ name: string; type: string }>;
    if (Array.isArray(parsedBackend) && parsedBackend.some((item) => item?.name && item?.type)) {
      return parsedBackend.filter((item) => item?.name && item?.type);
    }
  } catch {
    // Fall back to the legacy schemaTypes field.
  }
  try {
    const parsed = JSON.parse(asset?.metadata?.schemaTypes ?? "[]") as Array<{ name: string; type: string }>;
    return Array.isArray(parsed) ? parsed.filter((item) => item?.name && item?.type) : [];
  } catch {
    return [];
  }
};

function numericColumnsForResult(result: ExecutionResult) {
  const rows = result.chartRows ?? result.rows;
  const declared = new Set(result.metadata?.numericColumns ?? []);
  return result.schema
    .map((item) => item.name)
    .filter((column) => {
      if (declared.has(column)) return true;
      const present = rows
        .map((row) => row[column])
        .filter((value) => value !== null && value !== undefined && value !== "");
      return present.length > 0 && present.filter((value) => Number.isFinite(Number(value))).length / present.length >= 0.9;
    });
}

function datetimeColumnsForResult(result?: ExecutionResult) {
  return (result?.schema ?? [])
    .filter((column) => column.type === "datetime")
    .map((column) => column.name);
}

function temporalAxisValue(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return Number.NaN;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function formatTemporalValue(value: unknown) {
  const timestamp = temporalAxisValue(value);
  if (!Number.isFinite(timestamp)) return String(value ?? "");
  const date = new Date(timestamp);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
  return new Intl.DateTimeFormat("pt-BR", hasTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" },
  ).format(date);
}

function mergeChartInputResults(inputs: ExecutionResult[]): ExecutionResult | undefined {
  if (!inputs.length) return undefined;
  if (inputs.length === 1) return inputs[0];
  const seen = new Set<string>();
  const schema = inputs.flatMap((input) => input.schema).filter((column) => {
    if (seen.has(column.name)) return false;
    seen.add(column.name);
    return true;
  });
  const mergeRows = (items: DataRow[][]) => Array.from({ length: Math.max(...items.map((rows) => rows.length)) }, (_, index) =>
    Object.assign({}, ...items.map((itemRows) => itemRows[index] ?? {})),
  );
  const rows = mergeRows(inputs.map((input) => input.rows));
  const fullInputs = inputs.map((input) => input.chartRows ?? input.rows);
  const chartRows = mergeRows(fullInputs);
  return {
    nodeId: inputs.map((input) => input.nodeId).join("+"),
    schema,
    rows,
    chartRows,
    metadata: {
      rowCount: Math.max(...inputs.map((input) => input.metadata.rowCount)),
      numericColumns: Array.from(new Set(inputs.flatMap((input) => input.metadata.numericColumns))),
      granularity: "row",
      lineage: inputs.flatMap((input) => input.metadata.lineage),
    },
    cacheHit: inputs.every((input) => input.cacheHit),
  };
}

function ChartFilters({
  options,
  selected,
  onChange,
}: {
  options: Array<{ column: string; values: string[] }>;
  selected: Record<string, string>;
  onChange: (column: string, value: string) => void;
}) {
  if (!options.length) return null;
  return <div className="viz-chart-filters" aria-label="Filtros do gráfico">{options.map(({ column, values }) => <label key={column}><span>{column}</span><select value={selected[column] ?? ""} onChange={(event) => onChange(column, event.target.value)}>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>;
}

export function ChartRenderer({
  result,
  layers,
}: {
  result?: ExecutionResult;
  layers: ChartLayer[];
}) {
  const layer = layers[0];
  const baseRows = result?.chartRows ?? result?.rows ?? [];
  const numericColumns = result ? numericColumnsForResult(result) : [];
  const filterColumns = layer && ["bar", "line", "area", "scatter2d"].includes(layer.type)
    ? numericColumns.filter((column) => column !== layer.x && column !== layer.y)
    : [];
  const filterOptions = filterColumns.map((column) => ({
    column,
    values: Array.from(new Set(baseRows.map((row) => String(row[column] ?? "")).filter(Boolean))).sort((left, right) => {
      const leftNumber = Number(left), rightNumber = Number(right);
      return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? leftNumber - rightNumber : left.localeCompare(right);
    }),
  })).filter((item) => item.values.length);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const filterSignature = filterOptions.map(({ column, values }) => `${column}:${values.join("\u0001")}`).join("\u0002");
  useEffect(() => {
    setSelectedFilters((current) => {
      const next: Record<string, string> = {};
      filterOptions.forEach(({ column, values }) => { next[column] = values.includes(current[column]) ? current[column] : values[0]; });
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
  }, [filterSignature]);
  const activeFilters = Object.fromEntries(filterOptions.map(({ column, values }) => [column, selectedFilters[column] ?? values[0]]));
  const filteredRows = filterOptions.length
    ? baseRows.filter((row) => filterOptions.every(({ column }) => String(row[column] ?? "") === activeFilters[column]))
    : undefined;
  if (!result)
    return <ChartBody result={result} layers={layers} />;
  return <div className="viz-chart-output"><ChartFilters options={filterOptions} selected={activeFilters} onChange={(column, value) => setSelectedFilters((current) => ({ ...current, [column]: value }))} /><ChartBody result={result} layers={layers} rowsOverride={filteredRows} /></div>;
}

function ChartBody({
  result,
  layers,
  rowsOverride,
}: {
  result?: ExecutionResult;
  layers: ChartLayer[];
  rowsOverride?: DataRow[];
}) {
  if (!result) return <div className="viz-chart-empty">Execute o nó para gerar a visualização.</div>;
  const layer = layers[0];
  if (!layer) return <div className="viz-chart-empty">Adicione uma camada de gráfico.</div>;
  const previewRows = result.rows;
  const rows = rowsOverride ?? result.chartRows ?? previewRows;
  const numericColumns = numericColumnsForResult(result);
  const datetimeColumns = datetimeColumnsForResult(result);
  if (layer.type === "table") {
    const limit = Math.max(1, Math.min(100, Number(layer.limit) || 12));
    return (
      <div className="viz-table">
        <table>
          <thead>
            <tr>
              {result.schema.map((column) => (
                <th key={column.name}>{column.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.slice(0, limit).map((row, index) => (
              <tr key={index}>
                {result.schema.map((column) => (
                  <td key={column.name} className="viz-hover-target" title={`${column.name}: ${String(row[column.name] ?? "")}`}>{String(row[column.name] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const x = layer.x ?? "";
  const y = layer.y ?? "";
  const numeric = (value: unknown) => Number(value);
  const xIsTemporal = datetimeColumns.includes(x);
  const xValue = (value: unknown) => xIsTemporal ? temporalAxisValue(value) : numeric(value);
  const valid = rows.filter(
    (row) =>
      Number.isFinite(xValue(row[x])) && Number.isFinite(numeric(row[y])),
  );
  if (
    ["scatter2d", "scatter3d", "line", "area"].includes(layer.type) &&
    valid.length === 0
  )
    return (
      <div className="viz-chart-empty">
        O eixo X precisa conter valores numéricos ou datas válidas; o eixo Y precisa ser numérico.
      </div>
    );
  if (layer.type === "scatter3d")
    return <ThreeScatter rows={rows} layer={layer} />;
  if (layer.type === "histogram") {
    const mode = layer.histogramMode ?? "single";
    const selected = mode === "single" ? [x] : numericColumns;
    return <Histogram rows={rows} columns={selected} bins={layer.bins ?? 12} mode={mode} />;
  }
  if (layer.type === "bar") {
    if (result.schema.length === 1 && numericColumns.length === 1) return <Histogram rows={rows} columns={[numericColumns[0]]} bins={layer.bins ?? 12} mode="single" />;
    if (!x || !y) return <div className="viz-chart-empty">Escolha categoria e medida numérica.</div>;
    return <GroupedBars rows={rows} x={x} y={y} series={layer.series ?? ""} mode={layer.barMode ?? "simple"} temporalX={xIsTemporal} />;
  }
  if (layer.type === "pie") {
    const aggregation = layer.aggregation ?? (y ? "sum" : "count");
    if (aggregation !== "count" && !y)
      return <div className="viz-chart-empty">Escolha uma medida numérica para esta agregação.</div>;
    const groups = new Map<string, { total: number; valid: number; count: number }>();
    rows.forEach((row) => {
      const key = String(row[x] ?? "(vazio)");
      const group = groups.get(key) ?? { total: 0, valid: 0, count: 0 };
      group.count += 1;
      const value = numeric(row[y]);
      if (Number.isFinite(value)) {
        group.total += value;
        group.valid += 1;
      }
      groups.set(key, group);
    });
    const values = [...groups.entries()]
      .map(([label, group]) => [label, aggregation === "count" ? group.count : aggregation === "mean" ? group.total / Math.max(group.valid, 1) : group.total] as [string, number])
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12);
    return <Pie values={values} />;
  }
  if (layer.type === "heatmap")
    return <Heatmap rows={rows} columns={numericColumns} theme={layer.heatmapTheme ?? "diverging"} />;
  if (layer.type === "boxplot") return <Box rows={rows} columns={numericColumns} mode={layer.boxplotMode ?? "shared"} />;
  if (layer.type === "line" || layer.type === "area") return <SeriesLine rows={rows} x={x} y={y} series={layer.series ?? ""} type={layer.type} temporalX={xIsTemporal} />;
  const minX = Math.min(...valid.map((row) => xValue(row[x]))),
    maxX = Math.max(...valid.map((row) => xValue(row[x])));
  const minY = 0,
    maxY = Math.max(0, ...valid.map((row) => numeric(row[y])));
  const point = (row: DataRow) =>
    `${30 + ((xValue(row[x]) - minX) / (maxX - minX || 1)) * 400},${220 - ((numeric(row[y]) - minY) / (maxY - minY || 1)) * 180}`;
  return (
    <svg className="viz-svg" viewBox="0 0 460 260">
      <line x1="30" y1="220" x2="440" y2="220" />
      <line x1="30" y1="20" x2="30" y2="220" />
      {valid.map((row, index) => (
          <circle
            key={index}
            className="viz-point viz-hover-target"
            cx={point(row).split(",")[0]}
            cy={point(row).split(",")[1]}
            r="4"
          >
            <title>{`${x}: ${xIsTemporal ? formatTemporalValue(row[x]) : row[x]} | ${y}: ${row[y]}`}</title>
          </circle>
        ))}
      <text x="420" y="248">
        {x}
      </text>
      <text x="4" y="26">
        {y}
      </text>
    </svg>
  );
}

function SeriesLine({ rows, x, y, series, type, temporalX }: { rows: DataRow[]; x: string; y: string; series: string; type: "line" | "area"; temporalX: boolean }) {
  const points = rows.map((row) => ({ x: temporalX ? temporalAxisValue(row[x]) : Number(row[x]), y: Number(row[y]), series: series ? String(row[series] ?? "(vazio)") : "", row })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!points.length) return <div className="viz-chart-empty">Os eixos precisam conter valores numéricos.</div>;
  const seen = new Set<string>();
  if (points.some((point) => { const key = `${point.x}\u0000${point.series}`; if (seen.has(key)) return true; seen.add(key); return false; })) return <div className="viz-chart-empty">Há mais de uma linha para a mesma combinação de X e série. Use Agrupar antes do gráfico.</div>;
  const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x)); const minY = 0, maxY = Math.max(0, ...points.map((point) => point.y));
  const groups = [...new Set(points.map((point) => point.series))];
  const position = (point: typeof points[number]) => ({ x: 35 + ((point.x - minX) / (maxX - minX || 1)) * 400, y: 220 - ((point.y - minY) / (maxY - minY || 1)) * 180 });
  return <div className="viz-chart-with-legend"><svg className="viz-svg" viewBox="0 0 460 260"><line x1="30" y1="220" x2="440" y2="220" /><line x1="30" y1="20" x2="30" y2="220" />
    {groups.map((group, index) => { const items = points.filter((point) => point.series === group).sort((a, b) => a.x - b.x); const coords = items.map(position); const color = chartPalette[index % chartPalette.length]; return <g key={group}>{type === "area" ? <polygon className="viz-area" style={{ fill: color, fillOpacity: .15 }} points={`35,220 ${coords.map((point) => `${point.x},${point.y}`).join(" ")} 435,220`} /> : null}<polyline className="viz-line" style={{ stroke: color }} points={coords.map((point) => `${point.x},${point.y}`).join(" ")} />{items.map((item, pointIndex) => <circle key={pointIndex} className="viz-point viz-hover-target" style={{ fill: color }} cx={coords[pointIndex].x} cy={coords[pointIndex].y} r="4"><title>{`${x}: ${temporalX ? formatTemporalValue(item.row[x]) : item.x} | ${series ? `${series}: ${group} | ` : ""}${y}: ${item.y}`}</title></circle>)}</g>; })}
    <text x="410" y="245">{x}</text><text x="4" y="28">{y}</text></svg>{series ? <div className="viz-legend">{groups.map((group, index) => <span key={group}><i style={{ background: chartPalette[index % chartPalette.length] }} />{group}</span>)}</div> : null}</div>;
}

function chartInputHint(layer?: ChartLayer) {
  if (layer && ["boxplot"].includes(layer.type)) return "Conecte uma tabela: cada coluna numerica recebida vira um boxplot.";
  if (!layer) return "Conecte uma tabela ao ponto de entrada e configure uma camada.";
  if (layer.type === "table") return "Conecte qualquer tabela para visualizar suas linhas.";
  if (layer.type === "heatmap") return "Conecte uma tabela com duas ou mais colunas numéricas.";
  if (layer.type === "histogram") return `Conecte uma tabela com valores numéricos em ${layer.x || "uma coluna"}.`;
  if (layer.type === "boxplot") return `Conecte uma tabela com valores numéricos em ${layer.x || "uma coluna"}.`;
  if (layer.type === "bar" || layer.type === "pie") return `Conecte uma tabela com a categoria ${layer.x || "configurada"}${layer.aggregation !== "count" ? ` e a medida numérica ${layer.y || "configurada"}` : ""}.`;
  if (layer.type === "scatter3d") return `Conecte uma tabela com três colunas numéricas: ${layer.x || "X"}, ${layer.y || "Y"} e ${layer.z || "Z"}.`;
  return `Conecte uma tabela com X numérico ou data e Y numérico: ${layer.x || "X"} e ${layer.y || "Y"}.`;
}

function SampleNodePreview({ result, availableWidth, maxHeight }: { result?: ExecutionResult; availableWidth: number; maxHeight?: number }) {
  if (
    !result ||
    !Array.isArray(result.schema) ||
    !Array.isArray(result.rows) ||
    !result.metadata
  ) {
    return <p className="viz-sample-empty">Execute este nó ou use o ícone de olho para ver a amostra.</p>;
  }
  const columns = result.schema;
  const { widths, tableWidth, horizontalOverflow } = previewLayout(result, availableWidth);
  return (
    <div className="viz-sample-preview" style={{ maxHeight, overflowX: horizontalOverflow ? "auto" : "hidden" }}>
      <span>
        {result.rows.length < result.metadata.rowCount
          ? `${result.rows.length} de ${result.metadata.rowCount}`
          : result.metadata.rowCount} linha(s) na amostra
      </span>
      <table style={{ width: tableWidth }}>
        <colgroup>{widths.map((width, index) => <col key={columns[index]?.name ?? index} style={{ width }} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead>
        <tbody>{result.rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.name}>{String(row[column.name] ?? "")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function TransformNodePreview({ result, error, availableWidth, maxHeight }: { result?: ExecutionResult; error?: string; availableWidth: number; maxHeight?: number }) {
  if (error) {
    return <p className="viz-sample-empty">Falha ao carregar preview: {error}</p>;
  }
  if (!result || !Array.isArray(result.schema) || !Array.isArray(result.rows)) {
    return <p className="viz-sample-empty">Carregando preview...</p>;
  }
  const columns = result.schema;
  const rows = result.rows;
  const { widths, tableWidth, horizontalOverflow } = previewLayout(result, availableWidth);
  return (
    <div className="viz-transform-preview" style={{ maxHeight, overflowX: horizontalOverflow ? "auto" : "hidden" }}>
      <span>Preview: {rows.length} de {result.metadata.rowCount} linha(s)</span>
      <table style={{ width: tableWidth }}>
        <colgroup>{widths.map((width, index) => <col key={columns[index]?.name ?? index} style={{ width }} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.name}>{String(row[column.name] ?? "")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function CodeNodeOutput({ result, error, availableWidth, maxHeight }: { result?: ExecutionResult; error?: string; availableWidth: number; maxHeight?: number }) {
  if (error) return <p className="viz-code-output-error">Erro: {error}</p>;
  if (!result) return <p className="viz-sample-empty">Execute o codigo para gerar uma tabela de saida.</p>;
  const rows = result.rows.slice(0, 10);
  const { widths, tableWidth, horizontalOverflow } = previewLayout(result, availableWidth);
  return <div className="viz-code-output" style={{ maxHeight, overflowX: horizontalOverflow ? "auto" : "hidden" }}>
    <span>Saida: {result.metadata.rowCount} linha(s), {result.schema.length} coluna(s)</span>
    <table style={{ width: tableWidth }}>
      <colgroup>{widths.map((width, index) => <col key={result.schema[index]?.name ?? index} style={{ width }} />)}</colgroup>
      <thead><tr>{result.schema.map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{result.schema.map((column) => <td key={column.name}>{String(row[column.name] ?? "")}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

const chartPalette = ["#1463ee", "#15a56d", "#ee8c13", "#9a5af7", "#e84562", "#0a9db5"];

function GroupedBars({ rows, x, y, series, mode, temporalX }: { rows: DataRow[]; x: string; y: string; series: string; mode: NonNullable<ChartLayer["barMode"]>; temporalX: boolean }) {
  if (series && series === x) {
    return <div className="viz-chart-empty">A serie nao pode ser a mesma coluna da categoria X.</div>;
  }
  const points = rows.map((row) => ({ category: temporalX ? formatTemporalValue(row[x]) : String(row[x] ?? "(vazio)"), order: temporalX ? temporalAxisValue(row[x]) : 0, series: series ? String(row[series] ?? "(vazio)") : "", value: Number(row[y]) })).filter((item) => Number.isFinite(item.value) && (!temporalX || Number.isFinite(item.order)));
  if (!points.length) return <div className="viz-chart-empty">A medida selecionada não possui valores numéricos.</div>;
  if (!series) return <RawBars points={points} temporalX={temporalX} />;
  const keys = new Set<string>();
  if (points.some((item) => { const key = `${item.category}\u0000${item.series}`; if (keys.has(key)) return true; keys.add(key); return false; })) return <div className="viz-chart-empty">Há mais de uma linha para a mesma categoria e série. Use Agrupar antes do gráfico.</div>;
  const categories = [...new Set(points.map((item) => item.category))].sort((left, right) => temporalX ? (points.find((item) => item.category === left)?.order ?? 0) - (points.find((item) => item.category === right)?.order ?? 0) : 0).slice(0, 16);
  const visibleCategories = new Set(categories);
  const visiblePoints = points.filter((item) => visibleCategories.has(item.category));
  const seriesValues = [...new Set(visiblePoints.map((item) => item.series))];
  const lookup = new Map(visiblePoints.map((item) => [`${item.category}\u0000${item.series}`, item.value]));
  const max = Math.max(1, ...(mode === "stacked" ? categories.map((category) => seriesValues.reduce((sum, item) => sum + (lookup.get(`${category}\u0000${item}`) ?? 0), 0)) : visiblePoints.map((item) => item.value)));
  const groupWidth = 350 / categories.length;
  return <div className="viz-chart-with-legend"><svg className="viz-svg" viewBox="0 0 460 260"><line x1="42" y1="200" x2="440" y2="200" /><line x1="42" y1="24" x2="42" y2="200" />
    {categories.map((category, categoryIndex) => {
      let stack = 0;
      return <g key={category}>{seriesValues.map((item, seriesIndex) => {
        const value = lookup.get(`${category}\u0000${item}`) ?? 0;
        const height = (value / max) * 176;
        const stacked = mode === "stacked";
        const width = stacked ? groupWidth * .7 : (groupWidth * .76) / seriesValues.length;
        const left = 48 + categoryIndex * groupWidth + (stacked ? groupWidth * .15 : groupWidth * .12 + seriesIndex * width);
        const top = stacked ? 200 - ((stack + value) / max) * 176 : 200 - height;
        stack += value;
        return <rect key={item} className="viz-bar viz-hover-target" style={{ fill: chartPalette[seriesIndex % chartPalette.length] }} x={left} y={top} width={Math.max(3, width - 2)} height={Math.max(0, height)}><title>{`${category}${series ? ` | ${item}` : ""}: ${value}`}</title></rect>;
      })}<text x={48 + categoryIndex * groupWidth + groupWidth / 2} y="220" textAnchor="middle">{category.slice(0, 10)}</text></g>;
    })}</svg>{series ? <div className="viz-legend">{seriesValues.map((item, index) => <span key={item}><i style={{ background: chartPalette[index % chartPalette.length] }} />{item}</span>)}</div> : null}</div>;
}

function RawBars({ points, temporalX }: { points: Array<{ category: string; series: string; value: number; order: number }>; temporalX: boolean }) {
  const sortedPoints = temporalX ? [...points].sort((left, right) => left.order - right.order) : points;
  const max = Math.max(1, ...sortedPoints.map((point) => point.value));
  const width = 350 / sortedPoints.length;
  const labelEvery = Math.max(1, Math.ceil(sortedPoints.length / 10));
  return <svg className="viz-svg" viewBox="0 0 460 260"><line x1="42" y1="200" x2="440" y2="200" /><line x1="42" y1="24" x2="42" y2="200" />
    {sortedPoints.map((point, index) => { const height = (point.value / max) * 176; const left = 48 + index * width; return <g key={`${point.category}-${index}`}><rect className="viz-bar viz-hover-target" x={left} y={200 - height} width={Math.max(1, width - 1)} height={height}><title>{`${point.category}: ${point.value}`}</title></rect>{index % labelEvery === 0 ? <text x={left + width / 2} y="220" textAnchor="middle">{point.category.slice(0, 8)}</text> : null}</g>; })}
  </svg>;
}

function histogramBins(values: number[], min: number, max: number, count: number) {
  return Array.from({ length: count }, (_, index) => values.filter((value) => value >= min + ((max - min) * index) / count && (index === count - 1 ? value <= max : value < min + ((max - min) * (index + 1)) / count)).length);
}

function Histogram({ rows, columns, bins, mode }: { rows: DataRow[]; columns: string[]; bins: number; mode: NonNullable<ChartLayer["histogramMode"]> }) {
  const datasets = columns.map((column) => ({ column, values: rows.map((row) => Number(row[column])).filter(Number.isFinite) })).filter((item) => item.values.length);
  if (!datasets.length) return <div className="viz-chart-empty">Conecte colunas numéricas para construir o histograma.</div>;
  const count = Math.max(2, Math.min(60, Number(bins) || 12));
  if (mode === "grid") return <div className="viz-hist-grid">{datasets.map((dataset, index) => <section key={dataset.column}><strong><i style={{ background: chartPalette[index % chartPalette.length] }} />{dataset.column}</strong><HistogramSvg datasets={[dataset]} count={count} /></section>)}</div>;
  return <div className="viz-chart-with-legend"><HistogramSvg datasets={datasets} count={count} stacked={mode === "stacked"} />{datasets.length > 1 ? <div className="viz-legend">{datasets.map((dataset, index) => <span key={dataset.column}><i style={{ background: chartPalette[index % chartPalette.length] }} />{dataset.column}</span>)}</div> : null}</div>;
}

function HistogramSvg({ datasets, count, stacked = false }: { datasets: Array<{ column: string; values: number[] }>; count: number; stacked?: boolean }) {
  const all = datasets.flatMap((dataset) => dataset.values); const min = Math.min(...all); const max = Math.max(...all); const binSets = datasets.map((dataset) => histogramBins(dataset.values, min, max, count));
  const maximum = Math.max(1, ...(stacked ? Array.from({ length: count }, (_, index) => binSets.reduce((sum, set) => sum + set[index], 0)) : binSets.flat()));
  const width = 380 / count;
  return <svg className="viz-svg" viewBox="0 0 460 260"><line x1="30" y1="220" x2="440" y2="220" />{Array.from({ length: count }, (_, bin) => { let offset = 0; const lower = min + ((max - min) * bin) / count; const upper = min + ((max - min) * (bin + 1)) / count; return <g key={bin}>{binSets.map((set, index) => { const value = set[bin]; const height = (value / maximum) * 180; const barWidth = stacked ? width * .78 : (width * .78) / datasets.length; const left = 42 + bin * width + (stacked ? width * .1 : width * .1 + index * barWidth); const top = stacked ? 220 - ((offset + value) / maximum) * 180 : 220 - height; offset += value; return <rect key={datasets[index].column} className="viz-bar viz-hover-target" style={{ fill: chartPalette[index % chartPalette.length] }} x={left} y={top} width={Math.max(2, barWidth - 1)} height={height}><title>{`${datasets[index].column} | ${lower.toFixed(2)} a ${upper.toFixed(2)}: ${value}`}</title></rect>; })}{bin % Math.ceil(count / 6) === 0 ? <text x={42 + bin * width} y="240">{lower.toFixed(1)}</text> : null}</g>; })}</svg>;
}
function Pie({ values }: { values: Array<[string, number]> }) {
  const total = values.reduce((sum, [, value]) => sum + value, 0) || 1;
  let cursor = 0;
  return (
    <div className="viz-pie-wrap">
      <svg className="viz-svg" viewBox="0 0 460 260">
        {values.map(([label, value], index) => {
          const start = cursor;
          cursor += (value / total) * Math.PI * 2;
          const end = cursor;
          const path = `M 150 130 L ${150 + 90 * Math.cos(start)} ${130 + 90 * Math.sin(start)} A 90 90 0 ${end - start > Math.PI ? 1 : 0} 1 ${150 + 90 * Math.cos(end)} ${130 + 90 * Math.sin(end)} Z`;
          return (
            <path
              key={label}
              d={path}
              className={`viz-pie-slice viz-hover-target slice-${index % 6}`}
            >
              <title>{`${label}: ${value} (${((value / total) * 100).toFixed(1)}%)`}</title>
            </path>
          );
        })}
      </svg>
      <div className="viz-legend">
        {values.map(([label, value], index) => (
          <span key={label}>
            <i className={`slice-${index % 6}`} />
            {label}: {value}
          </span>
        ))}
      </div>
    </div>
  );
}
function BoxSingle({ rows, column }: { rows: DataRow[]; column: string }) {
  const values = rows
    .map((row) => Number(row[column]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!values.length)
    return (
      <div className="viz-chart-empty">Selecione uma coluna numérica.</div>
    );
  const q = (ratio: number) => values[Math.floor((values.length - 1) * ratio)];
  const min = values[0],
    max = values.at(-1) ?? min,
    q1 = q(0.25),
    median = q(0.5),
    q3 = q(0.75);
  const map = (value: number) => 35 + ((value - min) / (max - min || 1)) * 380;
  return (
    <svg className="viz-svg" viewBox="0 0 460 260">
      <line x1={map(min)} y1="130" x2={map(max)} y2="130" />
      <rect
        className="viz-box"
        x={map(q1)}
        y="90"
        width={map(q3) - map(q1)}
        height="80"
      />
      <line x1={map(median)} y1="90" x2={map(median)} y2="170" />
      <text x="30" y="220">
        min {min.toFixed(2)}
      </text>
      <text x="330" y="220">
        max {max.toFixed(2)}
      </text>
    </svg>
  );
}
type BoxSeries = { column: string; values: number[]; color: string };
const boxColors = ["#1463ee", "#15a56d", "#ee8c13", "#9a5af7", "#e84562", "#0a9db5"];

function BoxPlotPanel({ series }: { series: BoxSeries[] }) {
  const allValues = series.flatMap((item) => item.values);
  const min = 0;
  const max = Math.max(0, ...allValues);
  const mapY = (value: number) => 30 + (1 - (value - min) / (max - min || 1)) * 170;
  const boxWidth = Math.min(56, 280 / series.length);
  return <svg className="viz-svg" viewBox="0 0 460 260">
    <line x1="42" y1="200" x2="440" y2="200" />
    <line x1="42" y1="24" x2="42" y2="200" />
    <text x="4" y="34">{max.toFixed(2)}</text>
    <text x="4" y="198">{min.toFixed(2)}</text>
    {series.map(({ column, values, color }, index) => {
      const quantile = (ratio: number) => values[Math.floor((values.length - 1) * ratio)];
      const q1 = quantile(0.25);
      const median = quantile(0.5);
      const q3 = quantile(0.75);
      const low = values[0];
      const high = values.at(-1) ?? low;
      const center = 70 + ((index + 0.5) * 350) / series.length;
      const top = mapY(q3);
      const bottom = mapY(q1);
      return <g key={column} className="viz-hover-target"><title>{`${column}: mínimo ${low.toFixed(2)}, Q1 ${q1.toFixed(2)}, mediana ${median.toFixed(2)}, Q3 ${q3.toFixed(2)}, máximo ${high.toFixed(2)}`}</title>
        <line style={{ stroke: color }} x1={center} y1={mapY(high)} x2={center} y2={top} />
        <line style={{ stroke: color }} x1={center} y1={bottom} x2={center} y2={mapY(low)} />
        <line style={{ stroke: color }} x1={center - 10} y1={mapY(high)} x2={center + 10} y2={mapY(high)} />
        <line style={{ stroke: color }} x1={center - 10} y1={mapY(low)} x2={center + 10} y2={mapY(low)} />
        <rect className="viz-box" style={{ fill: color, fillOpacity: 0.35, stroke: color }} x={center - boxWidth / 2} y={top} width={boxWidth} height={Math.max(2, bottom - top)} />
        <line style={{ stroke: color, strokeWidth: 2 }} x1={center - boxWidth / 2} y1={mapY(median)} x2={center + boxWidth / 2} y2={mapY(median)} />
        <text x={center} y="220" textAnchor="middle">{column}</text>
      </g>;
    })}
  </svg>;
}

function Box({ rows, columns, mode }: { rows: DataRow[]; columns: string[]; mode: "shared" | "separate" }) {
  const series = columns
    .map((column, index) => ({
      column,
      color: boxColors[index % boxColors.length],
      values: rows.map((row) => Number(row[column])).filter(Number.isFinite).sort((a, b) => a - b),
    }))
    .filter((item) => item.values.length);
  if (!series.length) return <div className="viz-chart-empty">Selecione uma coluna numerica.</div>;
  if (mode === "separate") return <div className="viz-boxplot-grid">
    {series.map((item) => <section key={item.column} className="viz-boxplot-panel">
      <strong><i style={{ backgroundColor: item.color }} />{item.column}</strong>
      <BoxPlotPanel series={[item]} />
    </section>)}
  </div>;
  return <div className="viz-boxplot-wrap">
    <BoxPlotPanel series={series} />
    <div className="viz-legend">
      {series.map(({ column, color }) => <span key={column}><i style={{ backgroundColor: color }} />{column}</span>)}
    </div>
  </div>;
}

function Heatmap({ rows, columns, theme }: { rows: DataRow[]; columns: string[]; theme: NonNullable<ChartLayer["heatmapTheme"]> }) {
  const displayed = columns.slice(0, 10);
  if (displayed.length < 2)
    return <div className="viz-chart-empty">Conecte pelo menos duas colunas numéricas para calcular a correlação.</div>;
  return (
    <div className="viz-heatmap-scroll">
      <div className="viz-heatmap" style={{ gridTemplateColumns: `minmax(76px, auto) repeat(${displayed.length}, minmax(52px, 1fr))` }}>
        <div className="viz-heatmap-corner" />
        {displayed.map((column) => <div className="viz-heatmap-label viz-heatmap-column-label" key={`column-${column}`} title={column}>{column}</div>)}
        {displayed.flatMap((left) => [
          <div className="viz-heatmap-label viz-heatmap-row-label" key={`row-${left}`} title={left}>{left}</div>,
          ...displayed.map((right) => {
          const pairs = rows
            .map((row) => [Number(row[left]), Number(row[right])])
            .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
          const mean = (index: number) =>
            pairs.reduce((sum, pair) => sum + pair[index], 0) /
            (pairs.length || 1);
          const correlation =
            pairs.length < 2
              ? 0
              : pairs.reduce(
                  (sum, [a, b]) => sum + (a - mean(0)) * (b - mean(1)),
                  0,
                ) /
                Math.sqrt(
                  pairs.reduce((sum, [a]) => sum + (a - mean(0)) ** 2, 0) *
                    pairs.reduce((sum, [, b]) => sum + (b - mean(1)) ** 2, 0) ||
                    1,
                );
          const color = heatmapColor(correlation, theme);
          return <div
              key={`${left}-${right}`}
              className="viz-heatmap-cell viz-hover-target"
              style={{
                backgroundColor: color.background,
                color: color.text,
              }}
              title={`${left} x ${right}: ${correlation.toFixed(2)} | tema: ${theme}`}
            >
              {correlation.toFixed(2)}
            </div>;
          }),
        ])}
      </div>
    </div>
  );
}

function heatmapColor(value: number, theme: NonNullable<ChartLayer["heatmapTheme"]>) {
  const strength = Math.min(1, Math.abs(value));
  const interpolate = (from: [number, number, number], to: [number, number, number], amount: number) =>
    from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount)) as [number, number, number];
  let rgb: [number, number, number];
  if (theme === "blue") rgb = interpolate([244, 248, 255], [20, 99, 238], strength);
  else if (theme === "viridis") rgb = strength < 0.5
    ? interpolate([68, 1, 84], [33, 145, 140], strength * 2)
    : interpolate([33, 145, 140], [253, 231, 37], (strength - 0.5) * 2);
  else if (theme === "spectral") rgb = value < 0
    ? interpolate([248, 240, 250], [124, 58, 237], strength)
    : interpolate([255, 246, 235], [234, 88, 12], strength);
  else rgb = value < 0
    ? interpolate([245, 247, 251], [220, 38, 38], strength)
    : interpolate([241, 246, 255], [20, 99, 238], strength);
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return { background: `rgb(${rgb.join(",")})`, text: luminance < 0.57 ? "#ffffff" : "#14233b" };
}
function ThreeScatter({ rows, layer }: { rows: DataRow[]; layer: ChartLayer }) {
  const x = layer.x ?? "",
    y = layer.y ?? "",
    z = layer.z ?? "";
  const [rotation, setRotation] = useState({ yaw: -0.55, pitch: 0.3 });
  const [zoom, setZoom] = useState(1);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    yaw: number;
    pitch: number;
  }>();
  const valid = rows.filter((row) =>
    [x, y, z].every((column) => Number.isFinite(Number(row[column]))),
  );
  if (!valid.length)
    return (
      <div className="viz-chart-empty">
        Dispersão 3D exige X, Y e Z numéricos.
      </div>
    );
  const range = (column: string) =>
    [
      Math.min(...valid.map((row) => Number(row[column]))),
      Math.max(...valid.map((row) => Number(row[column]))),
    ] as const;
  const [minX, maxX] = range(x);
  const [, maxY] = range(y);
  const [minZ, maxZ] = range(z);
  const project = (rawX: number, rawY: number, rawZ: number) => {
    const cosYaw = Math.cos(rotation.yaw), sinYaw = Math.sin(rotation.yaw);
    const cosPitch = Math.cos(rotation.pitch), sinPitch = Math.sin(rotation.pitch);
    const yawX = rawX * cosYaw + rawZ * sinYaw;
    const yawZ = -rawX * sinYaw + rawZ * cosYaw;
    const pitchY = rawY * cosPitch - yawZ * sinPitch;
    const depth = 2.9 + rawY * sinPitch + yawZ * cosPitch;
    return { x: 230 + (yawX * 155 * zoom) / depth, y: 132 - (pitchY * 155 * zoom) / depth };
  };
  const normalized = (row: DataRow) => [
    ((Number(row[x]) - minX) / (maxX - minX || 1)) * 2 - 1,
    ((Number(row[y]) - 0) / (maxY || 1)) * 2 - 1,
    ((Number(row[z]) - minZ) / (maxZ - minZ || 1)) * 2 - 1,
  ] as const;
  const origin = project(0, 0, 0);
  const axes = [
    { label: "X", color: "#1463ee", point: project(1, 0, 0) },
    { label: "Y", color: "#15a56d", point: project(0, 1, 0) },
    { label: "Z", color: "#ee8c13", point: project(0, 0, 1) },
  ];
  const grid = [-1, -.5, 0, .5, 1];
  return <div className="viz-3d" title="Use o gizmo para girar a visualização tridimensional.">
    <div className="viz-3d-controls" aria-label="Controles de visualização 3D" onMouseDown={(event) => event.stopPropagation()}>
      <label>Zoom <input type="range" min="0.5" max="2.2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <button title="Restaurar perspectiva" onClick={() => { setRotation({ yaw: -0.55, pitch: 0.3 }); setZoom(1); }}><RotateCcw size={14} /></button>
    </div>
    <svg className="viz-svg" viewBox="0 0 460 260">
      <g className="viz-3d-plane" aria-label="Plano de referência y igual a zero">
        {grid.map((value) => { const start = project(-1, 0, value); const end = project(1, 0, value); return <line key={`x-${value}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
        {grid.map((value) => { const start = project(value, 0, -1); const end = project(value, 0, 1); return <line key={`z-${value}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />; })}
      </g>
      {axes.map((item) => <g key={item.label}><line x1={origin.x} y1={origin.y} x2={item.point.x} y2={item.point.y} style={{ stroke: item.color, strokeWidth: 1.5 }} /><text x={item.point.x} y={item.point.y} style={{ fill: item.color }}>{item.label}</text></g>)}
      {valid.map((row, index) => {
        const point = project(...normalized(row));
        return <circle className="viz-point viz-hover-target" key={index} cx={point.x} cy={point.y} r="3"><title>{`${x}: ${row[x]}, ${y}: ${row[y]}, ${z}: ${row[z]}`}</title></circle>;
      })}
    </svg>
    <button className="viz-3d-gizmo" title="Arraste para girar a visualização" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragStart({ x: event.clientX, y: event.clientY, ...rotation }); }} onPointerMove={(event) => { if (!dragStart) return; setRotation({ yaw: dragStart.yaw + (event.clientX - dragStart.x) * 0.015, pitch: Math.max(-1.45, Math.min(1.45, dragStart.pitch + (event.clientY - dragStart.y) * 0.015)) }); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragStart(undefined); }} onPointerCancel={() => setDragStart(undefined)}>
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="23" />{axes.map((item) => <g key={item.label}><line x1="32" y1="32" x2={32 + (item.point.x - origin.x) * 0.18} y2={32 + (item.point.y - origin.y) * 0.18} style={{ stroke: item.color }} /><text x={32 + (item.point.x - origin.x) * 0.22} y={32 + (item.point.y - origin.y) * 0.22} style={{ fill: item.color }}>{item.label}</text></g>)}</svg>
    </button>
    <span>X: {x} | Y: {y} | Z: {z}</span>
  </div>;
  /* Static projection replaced by the interactive gizmo above.
  return (
    <div
      className="viz-3d"
      title="Arraste para girar; a projeção usa os três eixos selecionados."
    >
      <svg className="viz-svg" viewBox="0 0 460 260">
        {valid.map((row, index) => {
          const px =
            50 +
            ((Number(row[x]) - minX) / (maxX - minX || 1)) * 340 +
            ((Number(row[z]) - minZ) / (maxZ - minZ || 1)) * 45;
          const py =
            215 -
            ((Number(row[y]) - minY) / (maxY - minY || 1)) * 170 -
            ((Number(row[z]) - minZ) / (maxZ - minZ || 1)) * 25;
          return (
            <circle className="viz-point" key={index} cx={px} cy={py} r="3">
              <title>{`${x}: ${row[x]}, ${y}: ${row[y]}, ${z}: ${row[z]}`}</title>
            </circle>
          );
        })}
      </svg>
      <span>
        X: {x} | Y: {y} | Z: {z}
      </span>
    </div>
  ); */
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.setState({ message: error.message });
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="visualization-recovery">
          <h1>Não foi possível renderizar este fluxo.</h1>
          <p>
            O fluxo atual contém uma configuração inválida. Volte aos dados e
            abra novamente a visualização para iniciar um fluxo limpo.
          </p>
          {this.state.message ? <small>Detalhe técnico: {this.state.message}</small> : null}
          <button className="button primary" onClick={this.props.onBack}>
            Voltar aos dados
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

function VisualizationCanvasBody({
  dataAssets,
  flows,
  initialAssetId,
  initialFlowId,
  onBack,
  onSave,
  onRequestAssetName,
  onSaveRefinedAsset,
  selectionMode,
  onSelectNodeForNotebook,
}: Props) {
  const [assetId, setAssetId] = useState(
    initialAssetId || dataAssets[0]?.id || "",
  );
  const asset = dataAssets.find((item) => item.id === assetId);
  const backendDatasetId = asset?.metadata?.backendDatasetId ?? "";
  const rows = useMemo(() => parseRows(asset), [asset]);
  const assetSchemaTypes = useMemo(() => schemaTypesFromAsset(asset), [asset]);
  const sourceColumns = useMemo(
    () =>
      assetSchemaTypes.length
        ? assetSchemaTypes.map((item) => item.name)
        : rows[0]
        ? Object.keys(rows[0])
        : (asset?.metadata?.schema ?? "").split(", ").filter(Boolean),
    [asset, assetSchemaTypes, rows],
  );
  const sourceTypeLabels = useMemo(() => {
    const labels: Record<string, string> = {
      number: "Número",
      text: "Texto",
      boolean: "Booleano",
      datetime: "Data",
      date: "Data",
    };
    return new Map(assetSchemaTypes.map((item) => [item.name, labels[item.type] ?? item.type]));
  }, [assetSchemaTypes]);
  const [nodes, setNodes] = useState<VisualizationNode[]>(() => [
    sourceNode(sourceColumns),
  ]);
  const nodesRef = useRef<VisualizationNode[]>(nodes);
  const sourceColumnsRef = useRef<string[]>(sourceColumns);
  const [connections, setConnections] = useState<VisualizationConnection[]>([]);
  const connectionsRef = useRef<VisualizationConnection[]>(connections);
  const [selectedId, setSelectedId] = useState("source");
  const [selectedIds, setSelectedIds] = useState<string[]>(["source"]);
  const nodeClipboard = useRef<{ nodes: VisualizationNode[]; connections: VisualizationConnection[] } | undefined>(undefined);
  const [result, setResult] = useState<ExecutionResult>();
  const [nodeResults, setNodeResults] = useState<Record<string, ExecutionResult>>({});
  const [nodeErrors, setNodeErrors] = useState<Record<string, string>>({});
  const [dirtyNodeIds, setDirtyNodeIds] = useState<Set<string>>(new Set());
  const [previewStart, setPreviewStart] = useState(1);
  const [previewEnd, setPreviewEnd] = useState(10);
  const [previewHeightOverrides, setPreviewHeightOverrides] = useState<Record<string, number>>({});
  const [previewNodeIds, setPreviewNodeIds] = useState<string[]>([]);
  const [pendingSource, setPendingSource] = useState("");
  const [pendingSourcePort, setPendingSourcePort] = useState<VisualizationPort>("primary");
  const [portPointer, setPortPointer] = useState<{ x: number; y: number }>();
  const [connectionDrop, setConnectionDrop] = useState<{ source: string; x: number; y: number }>();
  const [placement, setPlacement] = useState<{ kind: VisualizationNode["kind"]; x: number; y: number }>();
  const [nodeMenu, setNodeMenu] = useState<{ nodeId: string; x: number; y: number }>();
  const [connectionMenu, setConnectionMenu] = useState<"transform" | "chart">();
  const [connectionTransformGroup, setConnectionTransformGroup] = useState<string>();
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [loading, setLoading] = useState(false);
  const [liveRunNodeId, setLiveRunNodeId] = useState("");
  const [codeTabs, setCodeTabs] = useState<Record<string, "code" | "output">>({});
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const previewRangeValid = Number.isInteger(previewStart) && Number.isInteger(previewEnd) && previewStart >= 1 && previewStart < previewEnd;
  const drag = useRef<{
    ids: string[];
    startX: number;
    startY: number;
    positions: Record<string, { x: number; y: number }>;
  } | undefined>(
    undefined,
  );
  const resize = useRef<{
    id: string;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | undefined>(undefined);
  const previewRestoreSize = useRef<Record<string, { width?: number; height?: number }>>({});
  const previewNodeIdsRef = useRef<Set<string>>(new Set());
  const nodeElements = useRef<Map<string, HTMLElement>>(new Map());
  const [nodeBounds, setNodeBounds] = useState<Record<string, { width: number; height: number }>>({});
  const portDrag = useRef<{ id: string; port: VisualizationPort } | undefined>(undefined);
  const cameraRef = useRef(camera);
  const pan = useRef<{ startX: number; startY: number; x: number; y: number } | undefined>(undefined);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; x: number; y: number }>();
  const selectionBoxRef = useRef<{ startX: number; startY: number; x: number; y: number } | undefined>(undefined);
  const canvasRef = useRef<HTMLElement>(null);
  const hidePreview = (nodeId: string) => {
    const originalSize = previewRestoreSize.current[nodeId];
    if (originalSize) {
      setNodes((current) => current.map((node) =>
        node.id === nodeId
          ? { ...node, width: originalSize.width, height: originalSize.height }
          : node,
      ));
      delete previewRestoreSize.current[nodeId];
    }
    setPreviewHeightOverrides((current) => {
      const { [nodeId]: _, ...remaining } = current;
      return remaining;
    });
    setPreviewNodeIds((current) => current.filter((id) => id !== nodeId));
  };
  const showPreview = (node: VisualizationNode, trigger: HTMLElement) => {
    const element = trigger.closest("article.viz-node") as HTMLElement | null;
    previewRestoreSize.current[node.id] = {
      width: node.width,
      height: node.height,
    };
    // A preview uses its natural height; the saved dimensions are restored when it closes.
    if (element?.offsetHeight) {
      setNodes((current) => current.map((item) =>
        item.id === node.id ? { ...item, height: undefined } : item,
      ));
    }
    setPreviewHeightOverrides((current) => {
      const { [node.id]: _, ...remaining } = current;
      return remaining;
    });
    setPreviewNodeIds((current) => current.includes(node.id) ? current : [...current, node.id]);
  };
  useEffect(() => {
    if (initialAssetId) setAssetId(initialAssetId);
  }, [initialAssetId]);
  useEffect(() => {
    const saved = flows.find((flow) => flow.id === initialFlowId);
    if (!saved?.metadata?.definition) return;
    try {
      const definition = JSON.parse(
        saved.metadata.definition,
      ) as VisualizationFlow;
      setAssetId(definition.sourceAssetId);
      setNodes(
        Array.isArray(definition.nodes)
          ? definition.nodes.map((node) => normalizeNode(node, sourceColumns))
          : [sourceNode(sourceColumns)],
      );
      setConnections(definition.connections);
      setSelectedId(definition.nodes[0]?.id ?? "source");
    } catch {
      setMessage("O fluxo salvo possui uma definicao invalida.");
    }
  }, [initialFlowId, flows]);
  useEffect(() => {
    if (!initialFlowId) {
      setNodes([sourceNode(sourceColumns)]);
      setConnections([]);
      setSelectedId("source");
      setSelectedIds(["source"]);
      setResult(undefined);
    }
  }, [assetId, initialFlowId, sourceColumns]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    setNodes((current) => current.map((node) => {
      if (node.kind !== "join") return node;
      const incoming = connections.filter((edge) => edge.target === node.id);
      const existing = Array.isArray(node.params?.entries) ? node.params.entries as Array<Record<string, unknown>> : [];
      const entries = incoming.map((edge) => existing.find((entry) => String(entry.connectionId ?? "") === edge.id) ?? { connectionId: edge.id, renames: {} });
      if (JSON.stringify(entries) === JSON.stringify(existing)) return node;
      return { ...node, params: { ...node.params, entries } };
    }));
  }, [connections]);
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);
  useEffect(() => {
    sourceColumnsRef.current = sourceColumns;
  }, [sourceColumns]);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);
  useEffect(() => {
    previewNodeIdsRef.current = new Set(previewNodeIds);
  }, [previewNodeIds]);
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setNodeBounds((current) => {
        let changed = false;
        const next = { ...current };
        entries.forEach((entry) => {
          const nodeId = entry.target.getAttribute("data-node-id");
          if (!nodeId) return;
          const width = Math.round(entry.contentRect.width);
          const height = Math.round(entry.contentRect.height);
          if (next[nodeId]?.width !== width || next[nodeId]?.height !== height) {
            next[nodeId] = { width, height };
            changed = true;
          }
        });
        return changed ? next : current;
      });
    });
    nodeElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [nodes, nodeResults, previewNodeIds]);
  useEffect(() => {
    if (!previewRangeValid || (!backendDatasetId && !rows.length)) return;
    // The range changes what is displayed in every preview, never the table
    // used by the execution engine. Clear stale previews before refreshing the
    // complete DAG so connected branches update together.
    setDirtyNodeIds((current) => new Set([...current, ...descendantIds("source", connectionsRef.current)]));
  }, [backendDatasetId, previewStart, previewEnd, previewRangeValid, rows.length]);
  useEffect(() => {
    const cancelPlacement = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlacement(undefined);
    };
    window.addEventListener("keydown", cancelPlacement);
    return () => window.removeEventListener("keydown", cancelPlacement);
  }, []);
  useEffect(() => {
    const removeSelectedNodes = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      )
        return;
      const removed = new Set(selectedIds.filter((id) => id !== "source"));
      if (!removed.size) return;
      event.preventDefault();
      setResult(undefined);
      setNodes((current) => current.filter((node) => !removed.has(node.id)));
      setConnections((current) =>
        current.filter(
          (edge) => !removed.has(edge.source) && !removed.has(edge.target),
        ),
      );
      setSelectedIds([]);
      setSelectedId("source");
    };
    window.addEventListener("keydown", removeSelectedNodes);
    return () => window.removeEventListener("keydown", removeSelectedNodes);
  }, [selectedIds]);
  useEffect(() => {
    const handleClipboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        const copiedIds = new Set(selectedIds.filter((id) => id !== "source"));
        if (!copiedIds.size) return;
        nodeClipboard.current = {
          nodes: nodes.filter((node) => copiedIds.has(node.id)),
          connections: connections.filter((edge) => copiedIds.has(edge.source) || copiedIds.has(edge.target)),
        };
        event.preventDefault();
        setMessage(`${copiedIds.size} nó(s) copiado(s) com conexões.`);
      }
      if (key === "v" && nodeClipboard.current?.nodes.length) {
        const clipboard = nodeClipboard.current;
        const stamp = Date.now();
        const idMap = new Map(clipboard.nodes.map((node, index) => [node.id, `${node.kind}-${stamp}-${index}`]));
        const pastedNodes = clipboard.nodes.map((node, index) => ({
          ...node,
          id: idMap.get(node.id) ?? `${node.kind}-${stamp}-${index}`,
          x: node.x + 40,
          y: node.y + 40,
          params: JSON.parse(JSON.stringify(node.params ?? {})),
          layers: node.layers ? JSON.parse(JSON.stringify(node.layers)) : undefined,
        }));
        const existingIds = new Set([...nodes.map((node) => node.id), ...pastedNodes.map((node) => node.id)]);
        const pastedConnections = clipboard.connections
          .map((edge, index) => ({
            ...edge,
            id: `${edge.id}-copy-${stamp}-${index}`,
            source: idMap.get(edge.source) ?? edge.source,
            target: idMap.get(edge.target) ?? edge.target,
          }))
          .filter((edge) => existingIds.has(edge.source) && existingIds.has(edge.target));
        setNodes((current) => [...current, ...pastedNodes]);
        setConnections((current) => [...current, ...pastedConnections]);
        setSelectedIds(pastedNodes.map((node) => node.id));
        setSelectedId(pastedNodes[0].id);
        setResult(undefined);
        event.preventDefault();
        setMessage(`${pastedNodes.length} nó(s) colado(s) com conexões.`);
      }
    };
    window.addEventListener("keydown", handleClipboard);
    return () => window.removeEventListener("keydown", handleClipboard);
  }, [connections, nodes, selectedIds]);
  useEffect(() => {
    const nodeId = (element: Element | null) =>
      element?.closest("article.viz-node")?.getAttribute("data-node-id") ??
      undefined;
    const output = (element: Element | null) =>
      Boolean(element?.closest("button.viz-output"));
    const input = (element: Element | null) =>
      Boolean(element?.closest("button.viz-input"));
    const down = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("[data-direct-port], [data-node-resize]")) return;
      if (!output(element)) return;
      const id = nodeId(element);
      if (!id) return;
      const port = (element?.closest("[data-port-kind]")?.getAttribute("data-port-kind") as VisualizationPort | null) ?? "primary";
      portDrag.current = { id, port };
      setPendingSource(id);
      setPendingSourcePort(port);
      const box = canvasRef.current?.getBoundingClientRect();
      if (box)
        setPortPointer({
          x: (event.clientX - box.left - cameraRef.current.x) / cameraRef.current.scale,
          y: (event.clientY - box.top - cameraRef.current.y) / cameraRef.current.scale,
        });
      event.preventDefault();
      event.stopPropagation();
    };
    const move = (event: PointerEvent) => {
      const activeResize = resize.current;
      if (activeResize) {
        const node = nodesRef.current.find((item) => item.id === activeResize.id);
        const minimumWidth = node?.kind === "sample" ? 320 : isChartKind(node?.kind) ? 360 : 180;
        const scale = cameraRef.current.scale;
        const width = Math.max(minimumWidth, activeResize.width + (event.clientX - activeResize.startX) / scale);
        const height = Math.max(112, activeResize.height + (event.clientY - activeResize.startY) / scale);
        setNodes((current) => current.map((item) => item.id === activeResize.id ? { ...item, width, height } : item));
        if (previewNodeIdsRef.current.has(activeResize.id)) {
          setPreviewHeightOverrides((current) => ({ ...current, [activeResize.id]: height }));
        }
        return;
      }
      const activeDrag = drag.current;
      if (activeDrag) {
        const box = canvasRef.current?.getBoundingClientRect();
        if (!box) return;
        const currentCamera = cameraRef.current;
        const pointerX = (event.clientX - box.left - currentCamera.x) / currentCamera.scale;
        const pointerY = (event.clientY - box.top - currentCamera.y) / currentCamera.scale;
        setNodes((current) =>
          current.map((node) =>
            activeDrag.positions[node.id]
              ? {
                  ...node,
                  x: activeDrag.positions[node.id].x + pointerX - activeDrag.startX,
                  y: activeDrag.positions[node.id].y + pointerY - activeDrag.startY,
                }
              : node,
          ),
        );
        return;
      }
      if (!portDrag.current) return;
      const box = canvasRef.current?.getBoundingClientRect();
      if (box)
        setPortPointer({
          x: (event.clientX - box.left - cameraRef.current.x) / cameraRef.current.scale,
          y: (event.clientY - box.top - cameraRef.current.y) / cameraRef.current.scale,
        });
    };
    const up = (event: PointerEvent) => {
      if (resize.current) {
        resize.current = undefined;
        event.preventDefault();
        return;
      }
      if (drag.current) {
        drag.current = undefined;
        return;
      }
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("[data-direct-port]")) return;
      const source = portDrag.current;
      if (!source) return;
      const target = input(element) ? nodeId(element) : undefined;
      const targetPort = (element?.closest("[data-port-kind]")?.getAttribute("data-port-kind") as VisualizationPort | null) ?? "primary";
      if (target && target !== source.id) {
        const destination = nodesRef.current.find((node) => node.id === target);
        setResult(undefined);
        setConnections((current) =>
          current.some(
            (edge) => edge.source === source.id && edge.target === target && edge.sourcePort === source.port && edge.targetPort === targetPort,
          )
            ? current
            : [
                ...current,
                { id: `${source.id}-${target}-${Date.now()}`, source: source.id, target, sourcePort: source.port, targetPort },
              ],
        );
        if (destination?.kind === "column-strip") {
          const existing = new Set(
            nodesRef.current
              .filter((node) => node.params?.generatedBy === target)
              .map((node) =>
                String(
                  (node.params.columns as string[] | undefined)?.[0] ?? "",
                ),
              ),
          );
          const inputColumns = outputColumnsForNode(
            source.id,
            nodesRef.current,
            connectionsRef.current,
            sourceColumnsRef.current,
          );
          const branches = inputColumns
            .filter((column) => !existing.has(column))
            .map(
              (column, index): VisualizationNode => ({
                id: `column-${target}-${column}`,
                kind: "select",
                label: column,
                x: destination.x + 280,
                y: destination.y + index * 88,
                params: { columns: [column], generatedBy: target },
              }),
            );
          if (branches.length) {
            setNodes((current) => [...current, ...branches]);
            setConnections((current) => [
              ...current,
              ...branches.map((branch) => ({
                id: `${target}-${branch.id}`,
                source: target,
                target: branch.id,
              })),
            ]);
            setMessage(
              `${branches.length} ramificações foram geradas a partir da entrada conectada.`,
            );
          }
        }
        setLiveRunNodeId(isChartKind(destination?.kind) ? source.id : target);
      } else {
        const box = canvasRef.current?.getBoundingClientRect();
        if (box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) {
          setConnectionDrop({ source: source.id, x: (event.clientX - box.left - cameraRef.current.x) / cameraRef.current.scale, y: (event.clientY - box.top - cameraRef.current.y) / cameraRef.current.scale });
        }
      }
      portDrag.current = undefined;
      setPendingSource("");
      setPendingSourcePort("primary");
      setPortPointer(undefined);
      event.preventDefault();
      event.stopPropagation();
    };
    const cancel = () => {
      portDrag.current = undefined;
      setPendingSource("");
      setPendingSourcePort("primary");
      setPortPointer(undefined);
    };
    const cut = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const id = nodeId(element);
      if (!id || (!output(element) && !input(element))) return;
      event.preventDefault();
      setConnections((current) =>
        current.filter((edge) =>
          output(element) ? edge.source !== id : edge.target !== id,
        ),
      );
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("contextmenu", cut, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("contextmenu", cut, true);
    };
  }, []);
  const selected = nodes.find((node) => node.id === selectedId);
  const selectedInputId = selected && isChartKind(selected.kind)
    ? connections.find((edge) => edge.target === selected.id)?.source
    : undefined;
  const selectedResult = nodeResults[selectedId] ?? (selectedInputId ? nodeResults[selectedInputId] : undefined) ?? result;
  const renderedNodeWidth = (node: VisualizationNode) => {
    const automaticWidth = nodeWidth(node);
    return Math.max(node.width ?? 0, automaticWidth);
  };
  const scheduleRun = (nodeId: string) => {
    if (!nodeId) return;
    setLiveRunNodeId(nodeId);
  };
  // Preview output is intentionally not a source of truth for new nodes.
  // It can belong to a node that has since been removed from the DAG.
  const columns = sourceColumns;
  const selectedInputColumns = useMemo(() => {
    if (!selected) return sourceColumns;
    const upstreamId = connections.find((edge) => edge.target === selected.id)?.source;
    return upstreamId
      ? outputColumnsForNode(upstreamId, nodes, connections, sourceColumns)
      : sourceColumns;
  }, [connections, nodes, selected, sourceColumns]);
  const numericColumns = sourceColumns.filter((column) => {
    const declared = assetSchemaTypes.find((item) => item.name === column)?.type;
    if (declared === "number") return true;
    const values = rows.map((row) => row[column]).filter((value) => value !== null && value !== undefined && value !== "");
    return values.length > 0 && values.filter((value) => Number.isFinite(Number(value))).length / values.length >= 0.9;
  });
  const selectedInputNumericColumns = numericColumns.filter((column) =>
    selectedInputColumns.includes(column),
  );
  const selectedInputTables = useMemo(() => {
    if (!selected || selected.kind !== "join") return [];
    return connections
      .filter((edge) => edge.target === selected.id)
      .map((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const result = nodeResults[portResultKey(edge.source, edge.sourcePort)];
        return {
          connectionId: edge.id,
          sourceId: edge.source,
          label: source?.label ?? edge.source,
          columns: columnList(result, outputColumnsForNode(edge.source, nodes, connections, sourceColumns)),
        };
      });
  }, [connections, nodeResults, nodes, selected, sourceColumns]);
  // Generated columns (for example groupBy.count) only exist in the executed
  // upstream result, not in the original asset schema. Prefer that contract.
  const chartInputResult = selected && isChartKind(selected.kind)
    ? mergeChartInputResults(
        connections
          .filter((edge) => edge.target === selected.id)
          .map((edge) => nodeResults[portResultKey(edge.source, edge.sourcePort)])
          .filter((item): item is ExecutionResult => Boolean(item)),
      )
    : undefined;
  const chartInputColumns = chartInputResult
    ? columnList(chartInputResult, selectedInputColumns)
    : selectedInputColumns;
  const chartInputNumericColumns = chartInputResult
    ? numericColumnsForResult(chartInputResult)
    : selectedInputNumericColumns;
  const chartInputDatetimeColumns = chartInputResult
    ? datetimeColumnsForResult(chartInputResult)
    : assetSchemaTypes.filter((column) => column.type === "datetime" && selectedInputColumns.includes(column.name)).map((column) => column.name);
  useEffect(() => {
    if (!Object.keys(nodeResults).length) return;
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (!isChartKind(node.kind)) return node;
        const inputs = connections
          .filter((edge) => edge.target === node.id)
          .map((edge) => nodeResults[portResultKey(edge.source, edge.sourcePort)])
          .filter((item): item is ExecutionResult => Boolean(item));
        const input = mergeChartInputResults(inputs);
        const numeric = input ? numericColumnsForResult(input) : [];
        const temporal = input ? datetimeColumnsForResult(input) : [];
        if (!numeric.length && !temporal.length) return node;
        const inputColumns = input ? columnList(input, []) : [];
        const layers = (node.layers ?? []).map((layer) => {
          const nextLayer = normalizeChartLayerForInput(layer, inputColumns, numeric, temporal);
          if (nextLayer !== layer) changed = true;
          return nextLayer;
        });
        return layers.some((layer, index) => layer !== node.layers?.[index])
          ? { ...node, layers }
          : node;
      });
      return changed ? next : current;
    });
  }, [connections, nodeResults]);
  const selectedFlow = flows.find(
    (flow) => flow.metadata?.sourceAssetId === assetId,
  );
  const addNode = (kind: VisualizationNode["kind"], connection?: { source: string; sourcePort?: VisualizationPort; x: number; y: number }, position?: { x: number; y: number }) => {
    if (deprecatedTransformKinds.has(kind)) {
      setMessage(deprecatedTransformHint[kind] ?? "Este nó está desativado para novos fluxos.");
      setConnectionDrop(undefined);
      setPlacement(undefined);
      return;
    }
    const id = `${kind}-${Date.now()}`;
    const inputColumns = connection
      ? outputColumnsForNode(
          connection.source,
          nodesRef.current,
          connectionsRef.current,
          sourceColumnsRef.current,
        )
      : columns;
    const inputNumericColumns = numericColumns.filter((column) =>
      inputColumns.includes(column),
    );
    const executedDatetimeColumns = connection
      ? datetimeColumnsForResult(nodeResults[portResultKey(connection.source, connection.sourcePort)])
      : [];
    const inputDatetimeColumns = executedDatetimeColumns.length
      ? executedDatetimeColumns
      : assetSchemaTypes.filter((column) => column.type === "datetime" && inputColumns.includes(column.name)).map((column) => column.name);
    const node: VisualizationNode = {
      id,
      kind,
      label:
        transformKinds.find((item) => item.kind === kind)?.label ??
        chartKinds.find((item) => item.kind === kind)?.label ??
        kind,
      x: connection?.x ?? position?.x ?? 360 + nodes.length * 30,
      y: connection?.y ?? position?.y ?? 100 + nodes.length * 35,
      params: defaultParams(kind, inputColumns),
      ...(isChartKind(kind)
        ? { layers: [defaultLayer(kind, inputColumns, inputNumericColumns, inputDatetimeColumns)] }
        : {}),
    };
    setResult(undefined);
    setNodes((current) => [...current, node]);
    if (connection) {
      setConnections((current) => [...current, { id: `${connection.source}-${id}-${Date.now()}`, source: connection.source, target: id }]);
      if (kind === "column-strip") {
        const inputColumns = outputColumnsForNode(
          connection.source,
          nodesRef.current,
          connectionsRef.current,
          sourceColumnsRef.current,
        );
        const branches = inputColumns.map((column, index): VisualizationNode => ({ id: `column-${id}-${column}`, kind: "select", label: column, x: node.x + 280, y: node.y + index * 88, params: { columns: [column], generatedBy: id } }));
        setNodes((current) => [...current, ...branches]);
        setConnections((current) => [...current, ...branches.map((branch) => ({ id: `${id}-${branch.id}`, source: id, target: branch.id }))]);
      }
    }
    if (kind === "column-strip")
      setMessage(
        "Conecte uma tabela ao Column strip para gerar as ramificacoes por coluna.",
      );
    setSelectedId(id);
    setSelectedIds([id]);
    setConnectionDrop(undefined);
    setPlacement(undefined);
    scheduleRun(connection && isChartKind(kind) ? connection.source : id);
  };
  const connect = (
    target: string,
    source = pendingSource,
    sourcePort: VisualizationPort = pendingSourcePort,
    targetPort: VisualizationPort = "primary",
  ) => {
    if (!source || source === target) return;
    if (
      connections.some(
        (edge) => edge.source === source && edge.target === target && edge.sourcePort === sourcePort && edge.targetPort === targetPort,
      )
    )
      return setPendingSource("");
    const destination = nodes.find((node) => node.id === target);
    const inputColumns = outputColumnsForNode(
      source,
      nodes,
      connections,
      sourceColumns,
    );
    const inputNumericColumns = numericColumns.filter((column) =>
      inputColumns.includes(column),
    );
    const inputDatetimeColumns = datetimeColumnsForResult(nodeResults[portResultKey(source, sourcePort)]).length
      ? datetimeColumnsForResult(nodeResults[portResultKey(source, sourcePort)])
      : assetSchemaTypes.filter((column) => column.type === "datetime" && inputColumns.includes(column.name)).map((column) => column.name);
    setResult(undefined);
    setNodes((current) =>
      current.map((node) =>
        node.id !== target
          ? node
          : {
              ...node,
              params: defaultParams(node.kind, inputColumns),
              ...(isChartKind(node.kind)
                ? { layers: [defaultLayer(node.kind, inputColumns, inputNumericColumns, inputDatetimeColumns)] }
                : {}),
            },
      ),
    );
    setConnections((current) => [
      ...current,
      {
        id: `${source}-${target}-${Date.now()}`,
        source,
        target,
        sourcePort,
        targetPort,
      },
    ]);
    if (destination?.kind === "column-strip") {
      const inputColumns = outputColumnsForNode(
        source,
        nodesRef.current,
        connectionsRef.current,
        sourceColumnsRef.current,
      );
      const branches = inputColumns.map(
        (column, index): VisualizationNode => ({
          id: `column-${target}-${column}`,
          kind: "select",
          label: column,
          x: destination.x + 280,
          y: destination.y + index * 88,
          params: { columns: [column], generatedBy: target },
        }),
      );
      setNodes((current) => [...current, ...branches]);
      setConnections((current) => [
        ...current,
        ...branches.map((branch) => ({
          id: `${target}-${branch.id}`,
          source: target,
          target: branch.id,
        })),
      ]);
      setMessage(
        `${branches.length} ramificacoes foram geradas a partir da entrada conectada.`,
      );
    }
    scheduleRun(isChartKind(destination?.kind) ? source : target);
    setPendingSource("");
  };
  const startConnection = (event: ReactMouseEvent<HTMLButtonElement>, source: string, port: VisualizationPort = "primary") => {
    event.preventDefault();
    event.stopPropagation();
    portDrag.current = { id: source, port };
    setPendingSource(source);
    setPendingSourcePort(port);
    const box = canvasRef.current?.getBoundingClientRect();
    if (box) setPortPointer({ x: (event.clientX - box.left - camera.x) / camera.scale, y: (event.clientY - box.top - camera.y) / camera.scale });
  };
  const finishConnection = (event: ReactMouseEvent<HTMLButtonElement>, target: string, targetPort: VisualizationPort = "primary") => {
    event.preventDefault();
    event.stopPropagation();
    const source = portDrag.current;
    if (source && source.id !== target) connect(target, source.id, source.port, targetPort);
    portDrag.current = undefined;
    setPendingSource("");
    setPendingSourcePort("primary");
    setPortPointer(undefined);
  };
  const run = async (targetNodeId = selectedId) => {
    if (!previewRangeValid) {
      setMessage("O intervalo do preview precisa ter minimo menor que maximo.");
      return;
    }
    if (!backendDatasetId && !rows.length)
      return setMessage(
        "Este data asset ainda não possui linhas locais disponíveis para visualização.",
      );
    const chart = nodes.find((node) => node.id === targetNodeId);
    const target =
      chart && isChartKind(chart.kind)
        ? (connections.find((edge) => edge.target === chart.id)?.source ?? "")
        : targetNodeId;
    if (!target)
      return setMessage(
        "Conecte uma tabela ao nó de gráfico antes de executar.",
      );
    const sampleTarget = nodes.find(
      (node) => node.id === target && node.kind === "sample",
    );
    // The selected preview interval is presentation-only, but the backend
    // must still return every requested row so notebook snapshots are real.
    const previewLimit = sampleTarget
      ? Math.max(1, Math.min(500, Number(sampleTarget.params?.count ?? 10)))
      : Math.max(60, Math.min(1000, previewEnd));
    setLoading(true);
    setMessage("");
    setNodeErrors((current) => {
      const { [target]: _, ...remaining } = current;
      return remaining;
    });
    try {
      const response = await fetch("/api/visualization/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: backendDatasetId ? [] : rows,
          datasetId: backendDatasetId || undefined,
          nodes: nodes.filter((node) => !isChartKind(node.kind)),
          connections: connections.filter(
            (edge) =>
              !isChartKind(
                nodes.find((node) => node.id === edge.source)?.kind,
              ) &&
              !isChartKind(nodes.find((node) => node.id === edge.target)?.kind),
          ),
          targetNodeId: target,
          previewLimit,
          previewStart,
          previewEnd,
          fullNodeIds: connections
            .filter((edge) => isChartKind(nodes.find((node) => node.id === edge.target)?.kind))
            .map((edge) => edge.source)
            .concat(selectionMode && selectedId ? [selectedId] : []),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.detail ?? "Falha ao executar o fluxo.");
      setResult(payload);
      setNodeResults((current) => ({
        ...current,
        ...Object.fromEntries(
          (Array.isArray(payload.executedNodes) ? payload.executedNodes : [payload])
            .filter((item: ExecutionResult) => Boolean(item?.nodeId))
            .flatMap((item: ExecutionResult) =>
              item.outputPort && item.outputPort !== "primary"
                ? [[portResultKey(item.nodeId, item.outputPort), item]]
                : [[portResultKey(item.nodeId, item.outputPort), item], [item.nodeId, item]],
            ),
        ),
      }));
      setNodeErrors((current) => {
        const next = { ...current };
        (Array.isArray(payload.executedNodes) ? payload.executedNodes : [payload])
          .forEach((item: ExecutionResult) => delete next[item.nodeId]);
        return next;
      });
      setDirtyNodeIds((current) => {
        const next = new Set(current);
        (Array.isArray(payload.executedNodes) ? payload.executedNodes : [payload]).forEach((item: ExecutionResult) => next.delete(item.nodeId));
        return next;
      });
      setMessage(
        `${payload.metadata.rowCount.toLocaleString("pt-BR")} linhas processadas${payload.cacheHit ? " (cache)" : ""}.`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Falha ao executar.";
      setMessage(detail);
      setNodeErrors((current) => ({ ...current, [target]: detail }));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!liveRunNodeId) return;
    const timer = window.setTimeout(() => {
      setLiveRunNodeId("");
      void run(liveRunNodeId);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [liveRunNodeId, nodes, connections, assetId, previewStart, previewEnd, previewRangeValid]);
  const updateParams = (params: Record<string, unknown>) => {
      setNodes((current) =>
      current.map((node) =>
        node.id === selectedId
          ? { ...node, params: { ...node.params, ...params } }
          : node,
      ),
      );
      const descendants = new Set<string>([selectedId]);
      let changed = true;
      while (changed) {
        changed = false;
        connections.forEach((edge) => {
          if (descendants.has(edge.source) && !descendants.has(edge.target)) {
            descendants.add(edge.target);
            changed = true;
          }
        });
      }
      setDirtyNodeIds((current) => new Set([...current, ...descendants]));
    };
  const updateCode = (nodeId: string, code: string) => {
    setNodes((current) => current.map((node) =>
      node.id === nodeId ? { ...node, params: { ...node.params, code } } : node,
    ));
    const descendants = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      connectionsRef.current.forEach((edge) => {
        if (descendants.has(edge.source) && !descendants.has(edge.target)) {
          descendants.add(edge.target);
          changed = true;
        }
      });
    }
    setNodeResults((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => !descendants.has(id)),
    ));
    setNodeErrors((current) => {
      const next = { ...current };
      descendants.forEach((id) => delete next[id]);
      return next;
    });
    setDirtyNodeIds((current) => new Set([...current, ...descendants]));
    setCodeTabs((current) => ({ ...current, [nodeId]: "code" }));
  };
  const expandColumnStrip = (node: VisualizationNode) => {
    const generated = Array.from(new Set(columns));
    if (!generated.length)
      return setMessage(
        "Execute ou conecte o Column strip para descobrir suas colunas.",
      );
    const existing = new Set(
      nodes
        .filter((item) => item.params?.generatedBy === node.id)
        .map((item) =>
          String((item.params.columns as string[] | undefined)?.[0] ?? ""),
        ),
    );
    const additions = generated
      .filter((column) => !existing.has(column))
      .map(
        (column, index): VisualizationNode => ({
          id: `column-${node.id}-${column}`,
          kind: "select",
          label: column,
          x: node.x + 280,
          y: node.y + index * 88,
          params: { columns: [column], generatedBy: node.id },
        }),
      );
    if (!additions.length)
      return setMessage("Todas as colunas desta ramificacao ja foram geradas.");
    setNodes((current) => [...current, ...additions]);
    setConnections((current) => [
      ...current,
      ...additions.map((item) => ({
        id: `${node.id}-${item.id}`,
        source: node.id,
        target: item.id,
      })),
    ]);
    setNodes((current) =>
      current.map((item) =>
        item.id === node.id
          ? { ...item, params: { ...item.params, generatedColumns: generated } }
          : item,
      ),
    );
    setMessage(`${additions.length} nos de coluna foram gerados.`);
  };
  const updateLayer = (index: number, patch: Partial<ChartLayer>) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedId
          ? {
              ...node,
              layers: (node.layers ?? []).map((layer, layerIndex) =>
                layerIndex === index ? { ...layer, ...patch } : layer,
              ),
            }
          : node,
      ),
    );
    setDirtyNodeIds((current) => new Set([...current, ...descendantIds(selectedId, connections)]));
  };
  const save = () => {
    if (!asset) return;
    onSave(
      {
        sourceAssetId: asset.id,
        nodes,
        connections,
        updatedAt: new Date().toISOString(),
      },
      selectedFlow?.id,
    );
    setMessage("Fluxo versionado e salvo como asset do workspace.");
  };
  const saveRefinedDataset = (nodeId = selectedId) => {
    if (!asset) return;
    if (!backendDatasetId) {
      setMessage("Salvamento refinado exige um data asset carregado no backend.");
      return;
    }
    const selectedNode = nodes.find((node) => node.id === nodeId);
    const targetNodeId = selectedNode && isChartKind(selectedNode.kind)
      ? (connections.find((edge) => edge.target === selectedNode.id)?.source ?? "")
      : nodeId;
    if (!targetNodeId || isChartKind(nodes.find((node) => node.id === targetNodeId)?.kind ?? "source")) {
      setMessage("Selecione um nó de tabela para salvar como dataset refinado.");
      return;
    }
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const nodeSlug = (targetNode?.label ?? "node").toLowerCase().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    const suggestedName = `${asset.name.replace(/\.[^.]+$/, "")}_${nodeSlug || "node"}.parquet`;
    const askName = onRequestAssetName ?? ((name: string, confirm: (value: string) => void) => confirm(name));
    askName(suggestedName, async (name) => {
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch("/api/visualization/refine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            rows: [],
            datasetId: backendDatasetId,
            nodes: nodes.filter((node) => !isChartKind(node.kind)),
            connections: connections.filter(
              (edge) =>
                !isChartKind(nodes.find((node) => node.id === edge.source)?.kind) &&
                !isChartKind(nodes.find((node) => node.id === edge.target)?.kind),
            ),
            targetNodeId,
            previewStart,
            previewEnd,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail ?? "Falha ao salvar dataset refinado.");
        onSaveRefinedAsset?.({
          sourceName: asset.name,
          name: payload.name,
          datasetId: payload.datasetId,
          rowCount: Number(payload.rowCount ?? 0),
          bytes: Number(payload.bytes ?? 0),
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          schema: Array.isArray(payload.schema) ? payload.schema : [],
          nodes: nodes.filter((node) => !isChartKind(node.kind)),
        });
        setMessage(`${payload.name} salvo com ${Number(payload.rowCount ?? 0).toLocaleString("pt-BR")} linhas.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Falha ao salvar dataset refinado.");
      } finally {
        setLoading(false);
      }
    });
  };
  return (
    <section className="visualization-workbench">
      <header className="viz-header">
        <button className="icon-button" title="Voltar" onClick={onBack}>
          <ChevronLeft />
        </button>
        <div>
          <span className="eyebrow">DADOS NO CANVAS</span>
          <h1>{asset?.name ?? "Selecione um data asset"}</h1>
        </div>
        <select
          value={assetId}
          onChange={(event) => setAssetId(event.target.value)}
          disabled={selectionMode}
        >
          {dataAssets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {!selectionMode ? <button
          className="button secondary"
          onClick={() => run()}
          disabled={loading}
        >
          {loading ? <LoaderCircle className="spin" /> : <BarChart3 />} Executar
        </button> : null}
        {!selectionMode ? <button className="button primary" onClick={save}>
          <Save /> Salvar fluxo
        </button> : null}
      </header>
      <div className="viz-layout">
        <aside className="viz-columns">
          <div className="viz-sidebar-title">
            <strong>Colunas</strong>
            <label>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar"
              />
            </label>
          </div>
          {sourceColumns
            .filter((column) =>
              column.toLowerCase().includes(query.toLowerCase()),
            )
            .map((column) => (
              <button
                className="viz-column"
                draggable={!selectionMode}
                key={column}
                onDragStart={(event) =>
                  event.dataTransfer.setData("column", column)
                }
                onClick={() => {
                  if (selectionMode) return;
                  if (selected && !isChartKind(selected.kind))
                    updateParams({ column });
                }}
              >
                <span>{column}</span>
                <small>
                  {sourceTypeLabels.get(column) ?? (typeof rows[0]?.[column] === "number" ? "Número" : "Texto")}
                </small>
              </button>
            ))}
        </aside>
        <main
          ref={canvasRef}
          className="viz-canvas"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const column = event.dataTransfer.getData("column");
            if (column && selected && !isChartKind(selected.kind))
              updateParams({ column });
          }}
          onMouseDown={(event) => {
            setNodeMenu(undefined);
            if ((event.target as Element).closest(".viz-node, .viz-palette, .viz-connection-menu, .viz-camera-controls")) return;
            const box = event.currentTarget.getBoundingClientRect();
            if (placement) {
              if (event.button !== 0) return;
              addNode(placement.kind, undefined, {
                x: (event.clientX - box.left - camera.x) / camera.scale,
                y: (event.clientY - box.top - camera.y) / camera.scale,
              });
              return;
            }
            if (event.button === 0) {
              const nextSelection = {
                startX: (event.clientX - box.left - camera.x) / camera.scale,
                startY: (event.clientY - box.top - camera.y) / camera.scale,
                x: (event.clientX - box.left - camera.x) / camera.scale,
                y: (event.clientY - box.top - camera.y) / camera.scale,
              };
              selectionBoxRef.current = nextSelection;
              setSelectionBox(nextSelection);
              event.preventDefault();
              return;
            }
            if (event.button !== 1) return;
            pan.current = { startX: event.clientX, startY: event.clientY, x: camera.x, y: camera.y };
            event.preventDefault();
          }}
          onMouseMove={(event) => {
            if (placement) {
              const box = event.currentTarget.getBoundingClientRect();
              setPlacement((current) => current ? {
                ...current,
                x: (event.clientX - box.left - camera.x) / camera.scale,
                y: (event.clientY - box.top - camera.y) / camera.scale,
              } : current);
              return;
            }
            if (selectionBoxRef.current) {
              const box = event.currentTarget.getBoundingClientRect();
              const nextSelection = {
                ...selectionBoxRef.current,
                x: (event.clientX - box.left - camera.x) / camera.scale,
                y: (event.clientY - box.top - camera.y) / camera.scale,
              };
              selectionBoxRef.current = nextSelection;
              setSelectionBox(nextSelection);
              return;
            }
            if (pan.current) {
              setCamera({
                ...cameraRef.current,
                x: pan.current.x + event.clientX - pan.current.startX,
                y: pan.current.y + event.clientY - pan.current.startY,
              });
              return;
            }
            const activeDrag = drag.current;
            if (!activeDrag) return;
            const box = event.currentTarget.getBoundingClientRect();
            const currentCamera = cameraRef.current;
            const pointerX = (event.clientX - box.left - currentCamera.x) / currentCamera.scale;
            const pointerY = (event.clientY - box.top - currentCamera.y) / currentCamera.scale;
            setNodes((current) =>
              current.map((node) =>
                activeDrag.positions[node.id]
                  ? {
                      ...node,
                      x: activeDrag.positions[node.id].x + pointerX - activeDrag.startX,
                      y: activeDrag.positions[node.id].y + pointerY - activeDrag.startY,
                    }
                  : node,
              ),
            );
          }}
          onMouseUp={() => {
            const completedSelection = selectionBoxRef.current;
            if (completedSelection) {
              const left = Math.min(completedSelection.startX, completedSelection.x);
              const top = Math.min(completedSelection.startY, completedSelection.y);
              const right = Math.max(completedSelection.startX, completedSelection.x);
              const bottom = Math.max(completedSelection.startY, completedSelection.y);
              const isBox = right - left > 6 || bottom - top > 6;
              const matches = nodes.filter((node) => {
                const width = renderedNodeWidth(node);
                const height = 112;
                return node.x < right && node.x + width > left && node.y < bottom && node.y + height > top;
              }).map((node) => node.id);
              if (isBox) {
                setSelectedIds(matches);
                if (matches[0]) setSelectedId(matches[0]);
              } else {
                setSelectedIds([]);
                setSelectedId("");
              }
              selectionBoxRef.current = undefined;
              setSelectionBox(undefined);
            }
            drag.current = undefined;
            pan.current = undefined;
          }}
          onWheel={(event) => {
            if ((event.target as Element).closest(".viz-node, .viz-palette, .viz-connection-menu, .viz-submenu")) return;
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            const current = cameraRef.current;
            const nextScale = Math.max(0.3, Math.min(2.5, current.scale * (event.deltaY < 0 ? 1.12 : 0.89)));
            const worldX = (event.clientX - box.left - current.x) / current.scale;
            const worldY = (event.clientY - box.top - current.y) / current.scale;
            setCamera({ x: event.clientX - box.left - worldX * nextScale, y: event.clientY - box.top - worldY * nextScale, scale: nextScale });
          }}
        >
          <div className="viz-camera-controls">
            <button title="Aproximar" onClick={() => setCamera((current) => ({ ...current, scale: Math.min(2.5, current.scale * 1.2) }))}><ZoomIn size={17} /></button>
            <button title="Afastar" onClick={() => setCamera((current) => ({ ...current, scale: Math.max(0.3, current.scale / 1.2) }))}><ZoomOut size={17} /></button>
            <button title="Recentralizar canvas" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}><RotateCcw size={17} /></button>
            <span>{Math.round(camera.scale * 100)}%</span>
          </div>
          {!selectionMode ? <div className="viz-palette">
            <details>
              <summary><Plus /> Transformação</summary>
              {transformKinds.map((item) => {
                const disabled = deprecatedTransformKinds.has(item.kind);
                return <button key={item.kind} disabled={disabled} title={disabled ? deprecatedTransformHint[item.kind] : undefined} onClick={() => setPlacement({ kind: item.kind, x: 0, y: 0 })}>{item.label}{disabled ? " (desativado)" : ""}</button>;
              })}
            </details>
            <details>
              <summary><Plus /> Gráfico</summary>
              {chartKinds.map((item) => <button key={item.kind} onClick={() => setPlacement({ kind: item.kind, x: 0, y: 0 })}>{item.label}</button>)}
            </details>
          </div> : null}
          {connectionDrop ? (
            <div className="viz-connection-menu viz-cascade-menu" onMouseLeave={() => { setConnectionMenu(undefined); setConnectionTransformGroup(undefined); }} style={{ left: camera.x + connectionDrop.x * camera.scale, top: camera.y + connectionDrop.y * camera.scale }}>
              <strong>Adicionar à conexão</strong>
              <button onMouseEnter={() => setConnectionMenu("transform")}>Transformação <span>›</span></button>
              <button onMouseEnter={() => { setConnectionMenu("chart"); setConnectionTransformGroup(undefined); }}>Gráfico <span>›</span></button>
              {connectionMenu ? <div className={`viz-submenu ${connectionMenu === "transform" ? "viz-category-menu" : ""}`}>
                {connectionMenu === "chart" ? chartKinds.map((item) => <button key={item.kind} onClick={() => addNode(item.kind, connectionDrop)}>{item.label}</button>) : transformMenuGroups.map((group) => <button key={group.label} onMouseEnter={() => setConnectionTransformGroup(group.label)}>{group.label} <span>›</span></button>)}
                {connectionMenu === "transform" && connectionTransformGroup ? <div className="viz-submenu viz-third-menu">
                  {transformKinds.filter((item) => transformMenuGroups.find((group) => group.label === connectionTransformGroup)?.kinds.includes(item.kind as never)).map((item) => {
                    const disabled = deprecatedTransformKinds.has(item.kind);
                    return <button key={item.kind} disabled={disabled} title={disabled ? deprecatedTransformHint[item.kind] : undefined} onClick={() => addNode(item.kind, connectionDrop)}>{item.label}{disabled ? " (desativado)" : ""}</button>;
                  })}
                </div> : null}
              </div> : null}
              <button className="viz-connection-cancel" onClick={() => { setConnectionDrop(undefined); setConnectionMenu(undefined); setConnectionTransformGroup(undefined); }}>Cancelar</button>
            </div>
          ) : null}
          {nodeMenu ? (() => {
            const menuNode = nodes.find((node) => node.id === nodeMenu.nodeId);
            const disabled = !menuNode || isChartKind(menuNode.kind) || loading || !onSaveRefinedAsset;
            return (
              <div
                className="viz-node-menu"
                style={{ left: nodeMenu.x, top: nodeMenu.y }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  disabled={disabled}
                  title={disabled ? "Disponível apenas para nós de tabela com backend ativo." : "Executa este nó no backend e salva o resultado completo como asset."}
                  onClick={() => {
                    if (!disabled) saveRefinedDataset(nodeMenu.nodeId);
                    setNodeMenu(undefined);
                  }}
                  type="button"
                >
                  Salvar como asset
                </button>
              </div>
            );
          })() : null}
          <div className="viz-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
          {placement ? <div className={`viz-node-ghost ${isChartKind(placement.kind) ? "chart-node" : ""} ${placement.kind === "sample" ? "sample-node" : ""}`} style={{ left: placement.x, top: placement.y }}>
            {transformKinds.find((item) => item.kind === placement.kind)?.label ?? chartKinds.find((item) => item.kind === placement.kind)?.label ?? placement.kind}
          </div> : null}
          {selectionBox ? <div className="viz-selection-box" style={{
            left: Math.min(selectionBox.startX, selectionBox.x),
            top: Math.min(selectionBox.startY, selectionBox.y),
            width: Math.abs(selectionBox.x - selectionBox.startX),
            height: Math.abs(selectionBox.y - selectionBox.startY),
          }} /> : null}
          <svg className="viz-edges">
            {connections.map((edge) => {
              const from = nodes.find((node) => node.id === edge.source);
              const to = nodes.find((node) => node.id === edge.target);
              const fromHeight = from ? nodeBounds[from.id]?.height ?? from.height ?? 112 : 0;
              const toHeight = to ? nodeBounds[to.id]?.height ?? to.height ?? 112 : 0;
              const fromY = from ? from.y + fromHeight * codePortOffset(from.id, edge.sourcePort ?? "primary", connections, "output") : 0;
              const toY = to ? to.y + toHeight * codePortOffset(to.id, edge.targetPort ?? "primary", connections, "input") : 0;
              const isPythonEdge = isPythonPort(edge.sourcePort) || isPythonPort(edge.targetPort);
              return from && to ? (
                <path
                  key={edge.id}
                  className={isPythonEdge ? "viz-python-edge" : undefined}
                  d={`M${from.x + renderedNodeWidth(from)},${fromY} C${from.x + renderedNodeWidth(from) + 60},${fromY} ${to.x - 60},${toY} ${to.x},${toY}`}
                />
              ) : null;
            })}
            {portPointer && pendingSource
              ? (() => {
                  const from = nodes.find((node) => node.id === pendingSource);
                  if (!from) return null;
                  const width = renderedNodeWidth(from);
                  const fromY = from.y + (nodeBounds[from.id]?.height ?? from.height ?? 112) * codePortOffset(from.id, pendingSourcePort, connections, "output");
                  return (
                    <path
                      className={isPythonPort(pendingSourcePort) ? "viz-pending-edge viz-python-edge" : "viz-pending-edge"}
                      d={`M${from.x + width},${fromY} C${from.x + width + 60},${fromY} ${portPointer.x - 60},${portPointer.y} ${portPointer.x},${portPointer.y}`}
                    />
                  );
                })()
              : null}
          </svg>
          {nodes.map((node) => (
            (() => {
              const previewOpen = previewNodeIds.includes(node.id) && !isChartKind(node.kind) && node.kind !== "sample" && node.kind !== "code";
              const previewHeight = previewOpen
                ? previewHeightOverrides[node.id]
                : node.height;
              const previewMaxHeight = previewHeight
                ? Math.max(86, previewHeight - 122)
                : undefined;
              const nodeHeight = nodeBounds[node.id]?.height ?? node.height ?? 112;
              const pythonPortsVisible = node.kind === "code" && Boolean(
                pendingSource === node.id || (
                  portPointer &&
                  portPointer.x >= node.x - 40 &&
                  portPointer.x <= node.x + renderedNodeWidth(node) + 80 &&
                  portPointer.y >= node.y - 56 &&
                  portPointer.y <= node.y + nodeHeight + 56
                ),
              );
              const pythonInputPorts = visibleCodePorts(node.id, "input", connections);
              const pythonOutputPorts = visibleCodePorts(
                node.id,
                "output",
                connections,
                pendingSource === node.id ? pendingSourcePort : undefined,
              );
              const chartInputResults = isChartKind(node.kind)
                ? connections
                    .filter((edge) => edge.target === node.id)
                    .map((edge) => nodeResults[portResultKey(edge.source, edge.sourcePort)])
                    .filter((item): item is ExecutionResult => Boolean(item))
                : [];
              const chartResult = isChartKind(node.kind)
                ? mergeChartInputResults(chartInputResults)
                : result;
              return (
            <article
              key={node.id}
              data-node-id={node.id}
              ref={(element) => {
                if (element) nodeElements.current.set(node.id, element);
                else nodeElements.current.delete(node.id);
              }}
                className={`viz-node ${selectedIds.includes(node.id) ? "selected" : ""} ${dirtyNodeIds.has(node.id) ? "dirty" : ""} ${isChartKind(node.kind) ? "chart-node" : ""} ${node.kind === "sample" ? "sample-node" : ""} ${node.kind === "code" ? "code-node" : ""} ${previewOpen ? "preview-open" : ""}`}
              style={{ left: node.x, top: node.y, width: renderedNodeWidth(node), height: previewOpen ? previewHeightOverrides[node.id] : node.height }}
              onContextMenu={(event) => {
                if (
                  selectionMode ||
                  (event.target as Element).closest("button, input, select, textarea, [data-direct-port], [data-node-resize]")
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                setSelectedId(node.id);
                setSelectedIds([node.id]);
                setNodeMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
              }}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                if ((event.target as Element).closest("button, input, select, textarea, .viz-3d-gizmo, .viz-3d-controls, [data-direct-port], [data-node-resize]")) return;
                if (selectionMode) {
                  setSelectedIds([node.id]);
                  setSelectedId(node.id);
                  void run(node.id);
                  return;
                }
                const box = canvasRef.current?.getBoundingClientRect();
                if (!box) return;
                const currentCamera = cameraRef.current;
                if (event.ctrlKey || event.metaKey) {
                  const next = selectedIds.includes(node.id)
                    ? selectedIds.filter((id) => id !== node.id)
                    : [...selectedIds, node.id];
                  setSelectedIds(next);
                  setSelectedId(node.id);
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                const group = selectedIds.includes(node.id) ? selectedIds : [node.id];
                const positions = Object.fromEntries(
                  nodesRef.current
                    .filter((item) => group.includes(item.id))
                    .map((item) => [item.id, { x: item.x, y: item.y }]),
                );
                setSelectedIds(group);
                drag.current = {
                  ids: group,
                  startX: (event.clientX - box.left - currentCamera.x) / currentCamera.scale,
                  startY: (event.clientY - box.top - currentCamera.y) / currentCamera.scale,
                  positions,
                };
                setSelectedId(node.id);
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <header>
                <strong>{node.label}</strong>{dirtyNodeIds.has(node.id) ? <span className="viz-dirty-dot" title="Alterado; execute para atualizar" /> : null}
                <div>
                  <button
                    title="Preview do resultado"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (previewNodeIds.includes(node.id)) {
                        hidePreview(node.id);
                        return;
                      }
                      setSelectedId(node.id);
                      setSelectedIds([node.id]);
                      showPreview(node, event.currentTarget);
                      void run(node.id);
                    }}
                  >
                    <Eye size={16} />
                  </button>
                  {!selectionMode && node.kind !== "code" ? <button
                    data-direct-port
                    title={
                      pendingSource === node.id
                        ? "Arraste até a entrada de outro nó"
                        : "Arraste para criar conexão"
                    }
                    onMouseDown={(event) => startConnection(event, node.id)}
                    className={`viz-output ${pendingSource === node.id ? "active" : ""}`}
                  >
                    <Link2 size={16} />
                  </button> : null}
                  {!selectionMode && node.kind === "code" && false ? <button
                    data-direct-port
                    data-port-kind="python-1"
                    title="Saída Python adicional"
                    onMouseDown={(event) => startConnection(event, node.id, "python-1")}
                    className={`viz-output viz-python-port visible ${pendingSource === node.id && pendingSourcePort === "python-1" ? "active" : ""}`}
                  >
                    Saída Python
                  </button> : null}
                  {!selectionMode ? <button
                    title="Excluir nó"
                    disabled={node.kind === "source"}
                    onClick={() => {
                      setResult(undefined);
                      setNodes((current) =>
                        current.filter((item) => item.id !== node.id),
                      );
                      setConnections((current) =>
                        current.filter(
                          (edge) =>
                            edge.source !== node.id && edge.target !== node.id,
                        ),
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button> : null}
                  {!selectionMode && node.kind === "code" ? pythonOutputPorts.map((port) => <button
                    key={port}
                    data-direct-port
                    data-port-kind={port}
                    title={`Saida Python ${portOrder(port)}`}
                    style={{ top: `${codePortOffset(node.id, port, connections, "output") * 100}%` }}
                    onMouseDown={(event) => startConnection(event, node.id, port)}
                    className={`viz-output viz-python-port ${pythonPortsVisible ? "visible" : ""} ${pendingSource === node.id && pendingSourcePort === port ? "active" : ""}`}
                  >{portOrder(port)}</button>) : null}
                </div>
              </header>
              <p>
                {isChartKind(node.kind)
                  ? "Visualização única"
                  : Object.keys(node.params ?? {}).length
                    ? "Parâmetros configuráveis"
                    : "Fonte do fluxo"}
              </p>
              {!selectionMode && node.kind === "code" ? pythonInputPorts.map((port) => <button
                key={port}
                data-direct-port
                data-port-kind={port}
                className={`viz-input viz-python-port ${pythonPortsVisible ? "visible" : ""}`}
                style={{ top: `${codePortOffset(node.id, port, connections, "input") * 100}%` }}
                title={`Entrada Python ${portOrder(port)}`}
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onMouseUp={(event) => finishConnection(event, node.id, port)}
              >{portOrder(port)}</button>) : null}
              {isChartKind(node.kind) ? (
                <p className="viz-node-instruction">{chartInputHint(node.layers?.[0])}</p>
              ) : null}
              {node.kind === "code" ? (
                <section className="viz-code-node-content" onMouseDown={(event) => event.stopPropagation()}>
                  <div className="viz-code-tabs" role="tablist" aria-label="Codigo Python">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={(codeTabs[node.id] ?? "code") === "code"}
                      className={(codeTabs[node.id] ?? "code") === "code" ? "active" : ""}
                      onClick={() => setCodeTabs((current) => ({ ...current, [node.id]: "code" }))}
                    >Codigo</button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={codeTabs[node.id] === "output"}
                      className={codeTabs[node.id] === "output" ? "active" : ""}
                      onClick={() => setCodeTabs((current) => ({ ...current, [node.id]: "output" }))}
                    >Saida</button>
                  </div>
                  {(codeTabs[node.id] ?? "code") === "code" ? (
                    <>
                      <p className="viz-code-help">Entrada principal: <code>df</code> como <code>pl.DataFrame</code>. Todas as entradas ficam em <code>inputs</code>, como copias isoladas. Defina <code>result</code> como <code>pl.DataFrame</code>. Disponiveis: <code>pl</code> e <code>np</code>.</p>
                      <textarea
                        aria-label="Codigo Python"
                        className="viz-code-editor"
                        maxLength={10000}
                        spellCheck={false}
                        value={String(node.params.code ?? "")}
                        onChange={(event) => updateCode(node.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="button primary viz-code-run"
                        disabled={loading}
                        onClick={() => {
                          setCodeTabs((current) => ({ ...current, [node.id]: "output" }));
                          void run(node.id);
                        }}
                      >{loading ? "Executando..." : "Executar codigo"}</button>
                    </>
                  ) : <CodeNodeOutput result={nodeResults[node.id]} error={nodeErrors[node.id]} availableWidth={Math.max(120, renderedNodeWidth(node) - 30)} maxHeight={previewMaxHeight ?? 300} />}
                </section>
              ) : null}
              {node.kind === "sample" ? <SampleNodePreview result={nodeResults[node.id]} availableWidth={Math.max(120, renderedNodeWidth(node) - 22)} maxHeight={previewMaxHeight} /> : null}
              {previewNodeIds.includes(node.id) && !isChartKind(node.kind) && node.kind !== "sample" && node.kind !== "code" ? (
                <TransformNodePreview result={nodeResults[node.id]} error={nodeErrors[node.id]} availableWidth={Math.max(120, renderedNodeWidth(node) - 22)} maxHeight={previewMaxHeight} />
              ) : null}
              {!selectionMode && node.kind !== "code" ? <button
                data-direct-port
                className="viz-input"
                disabled={node.kind === "source"}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseUp={(event) => finishConnection(event, node.id)}
              >
                Entrada
              </button> : null}
              {!selectionMode && node.kind === "code" && false ? <button
                data-direct-port
                data-port-kind="python-1"
                className="viz-input viz-python-port"
                title="Entrada Python adicional"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseUp={(event) => finishConnection(event, node.id, "python-1")}
              >
                Entrada Python
              </button> : null}
              {isChartKind(node.kind) ? (
                <div className="viz-node-chart">
                  <ChartRenderer result={chartResult} layers={node.layers ?? []} />
                </div>
              ) : null}
              {!selectionMode ? <button
                data-node-resize
                className="viz-node-resize"
                title="Redimensionar nó"
                onMouseDown={(event) => {
                  const element = event.currentTarget.closest("article.viz-node") as HTMLElement | null;
                  if (!element) return;
                  event.preventDefault();
                  event.stopPropagation();
                  resize.current = {
                    id: node.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    width: element.offsetWidth,
                    height: element.offsetHeight,
                  };
                }}
              /> : null}
            </article>
              );
            })()
          ))}
          </div>
        </main>
        <aside className="viz-inspector">
          <h2>{selected?.label ?? "Selecione um nó"}</h2>
          {!selectionMode ? (
            <button
              className={`button secondary viz-inspector-run ${dirtyNodeIds.has(selectedId) ? "pending" : ""}`}
              onClick={() => run(selectedId || "source")}
              disabled={loading || !selectedId}
              type="button"
            >
              {loading ? <LoaderCircle className="spin" /> : <BarChart3 />} Executar
            </button>
          ) : null}
          {!selectionMode && selected &&
          !isChartKind(selected.kind) &&
          selected.kind !== "source" ? (
            <NodeParams
              node={selected}
              columns={selected.kind === "join" || (selected.kind === "rename" && !connections.some((edge) => edge.target === selected.id)) ? [] : selectedInputColumns}
              tables={selectedInputTables}
              onChange={updateParams}
            />
          ) : null}
          {!selectionMode && selected && isChartKind(selected.kind) ? (
            <ChartParams
              node={selected}
              columns={chartInputColumns}
              numericColumns={chartInputNumericColumns}
              datetimeColumns={chartInputDatetimeColumns}
              onUpdate={updateLayer}
            />
          ) : null}
          {selectedResult ? (
            <div className="viz-preview">
              <h3>Preview</h3>
              {(selected?.kind === "source" || selectionMode) ? (
                <>
                  <div className="viz-preview-range" aria-label="Intervalo de linhas do preview">
                    <label>
                      <span>Min</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={previewStart}
                        onChange={(event) => setPreviewStart(Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span>Max</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={previewEnd}
                        onChange={(event) => setPreviewEnd(Number(event.target.value))}
                      />
                    </label>
                  </div>
                  {!previewRangeValid ? <p className="viz-range-error">O minimo deve ser menor que o maximo.</p> : null}
                </>
              ) : null}
              <p>
                Linhas {previewStart} a {Math.min(previewEnd, selectedResult.metadata.rowCount)} de {selectedResult.metadata.rowCount.toLocaleString("pt-BR")},{" "}
                {selectedResult.schema.length} colunas
              </p>
              <div>
                {selectedResult.schema.slice(0, 5).map((column) => (
                  <span key={column.name}>{column.name}</span>
                ))}
              </div>
              {selectionMode && selected ? (
                <button
                  className="button primary viz-import-button"
                  disabled={!onSelectNodeForNotebook}
                  onClick={() => onSelectNodeForNotebook?.({
                    node: selected,
                    result: selected.kind && isChartKind(selected.kind) ? (chartInputResult ?? selectedResult) : selectedResult,
                    layers: isChartKind(selected.kind) ? selected.layers : undefined,
                    range: { start: previewStart, end: previewEnd },
                  })}
                  type="button"
                >
                  {isChartKind(selected.kind) ? "Importar gráfico" : "Importar preview"}
                </button>
              ) : null}
            </div>
          ) : null}
          {message ? <p className="viz-message">{message}</p> : null}
        </aside>
      </div>
    </section>
  );
}

export function VisualizationCanvasView(props: Props) {
  return (
    <CanvasErrorBoundary onBack={props.onBack}>
      <VisualizationCanvasBody {...props} />
    </CanvasErrorBoundary>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="viz-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function NodeParams({
  node,
  columns,
  tables = [],
  onChange,
}: {
  node: VisualizationNode;
  columns: string[];
  tables?: Array<{ connectionId: string; sourceId: string; label: string; columns: string[] }>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const p = node.params;
  if (node.kind === "info")
    return <p className="viz-help">Gera uma tabela com o schema, tipo, valores preenchidos, nulos, percentual de nulos e cardinalidade de cada coluna recebida.</p>;
  if (node.kind === "describe")
    return <p className="viz-help">Gera uma tabela estatística para todas as colunas numéricas recebidas: contagem, média, desvio padrão, mínimo, quartis, mediana e máximo.</p>;
  const select = (key: string) => (
    <select
      value={String(p[key] ?? "")}
      onChange={(event) => onChange({ [key]: event.target.value })}
    >
      {columns.map((column) => (
        <option key={column}>{column}</option>
      ))}
    </select>
  );
  if (node.kind === "dedupe")
    return <p className="viz-help">Remove linhas duplicadas considerando todas as colunas recebidas por este nó.</p>;
  if (node.kind === "remove-column")
    return <Field label="Coluna">{select("column")}</Field>;
  if (node.kind === "unique")
    return <><p className="viz-help">Mantém apenas os valores únicos da coluna selecionada.</p><Field label="Coluna">{select("column")}</Field></>;
  if (node.kind === "regex")
    return (
      <>
        <Field label="Coluna">{select("column")}</Field>
        <Field label="Modo"><select value={String(p.mode ?? "filter")} onChange={(event) => onChange({ mode: event.target.value })}><option value="filter">Filtrar linhas</option><option value="extract">Extrair correspondência</option></select></Field>
        <Field label="Padrão Regex"><input value={String(p.pattern ?? "")} onChange={(event) => onChange({ pattern: event.target.value })} placeholder="Ex.: pedido-(\\d+)" /></Field>
        {p.mode === "extract" ? <Field label="Nova coluna"><input value={String(p.as ?? "extraido")} onChange={(event) => onChange({ as: event.target.value })} /></Field> : null}
        <p className="viz-help">Sensível a maiúsculas/minúsculas. Nulos não correspondem. Extração usa o primeiro grupo capturado; sem grupo, usa a correspondência inteira.</p>
      </>
    );
  if (node.kind === "rename") {
    const renames = (p.renames as Record<string, string> | undefined) ?? {};
    return (
      <>
        {!columns.length ? <p className="viz-help">Conecte uma tabela para listar as colunas.</p> : <div className="viz-column-editor">
          {columns.map((column) => <Field key={column} label={column}><input value={String(renames[column] ?? "")} placeholder={column} onChange={(event) => onChange({ renames: { ...renames, [column]: event.target.value } })} /></Field>)}
        </div>}
      </>
    );
  }
  if (node.kind === "join") {
    const rawEntries = Array.isArray(p.entries) ? p.entries as Array<Record<string, unknown>> : [];
    const configuredOrder = new Map(rawEntries.map((entry, index) => [String(entry.connectionId ?? ""), index]));
    const orderedTables = [...tables].sort((left, right) => (configuredOrder.get(left.connectionId) ?? tables.length) - (configuredOrder.get(right.connectionId) ?? tables.length));
    const entries = orderedTables.map((table, index) => rawEntries.find((entry) => String(entry.connectionId ?? "") === table.connectionId) ?? rawEntries[index] ?? { connectionId: table.connectionId, renames: {} });
    const normalized = entries.map((entry, index) => ({
      ...entry,
      connectionId: orderedTables[index]?.connectionId ?? entry.connectionId,
      renames: (entry.renames as Record<string, string> | undefined) ?? {},
    }));
    const updateEntry = (index: number, patch: Record<string, unknown>) => onChange({ entries: normalized.map((entry, item) => item === index ? { ...entry, ...patch } : entry) });
    const moveEntry = (index: number, direction: -1 | 1) => {
      const next = [...normalized];
      const target = index + direction;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      onChange({ entries: next });
    };
    const namesFor = (tableIndex: number) => orderedTables[tableIndex]?.columns.map((column) => String(normalized[tableIndex]?.renames?.[column] ?? "").trim() || column) ?? [];
    return (
      <>
        <Field label="Modo"><select value={String(p.mode ?? "common")} onChange={(event) => onChange({ mode: event.target.value })}><option value="common">Combinar por coluna comum</option><option value="horizontal">Combinar por posição</option><option value="append">Empilhar linhas</option></select></Field>
        {!orderedTables.length ? <p className="viz-help">Conecte uma ou mais tabelas a este nó. O asset global não é usado aqui.</p> : <div className="viz-join-list">
          {String(p.mode ?? "common") === "horizontal" ? <p className="viz-help">Combina as tabelas pela posição das linhas. Linhas ausentes recebem nulo.</p> : null}
          {orderedTables.map((table, index) => {
            const entry = normalized[index] as Record<string, any>;
            const names = namesFor(index);
            return <div className="viz-join-entry" key={table.connectionId}>
              <div className="viz-join-title"><strong>{index + 1}. {table.label}</strong><span><button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => moveEntry(index, 1)} disabled={index === orderedTables.length - 1}>↓</button></span></div>
              <div className="viz-column-editor">{table.columns.map((column) => <Field key={column} label={column}><input value={String(entry.renames?.[column] ?? "")} placeholder={column} onChange={(event) => updateEntry(index, { renames: { ...entry.renames, [column]: event.target.value } })} /></Field>)}</div>
              {index > 0 && String(p.mode ?? "common") === "common" ? <><Field label="Chave do resultado"><select value={String(entry.leftKey ?? names[0] ?? "")} onChange={(event) => updateEntry(index, { leftKey: event.target.value })}>{Array.from(new Set(normalized.slice(0, index).flatMap((item, itemIndex) => namesFor(itemIndex)))).map((name) => <option key={name}>{name}</option>)}</select></Field><Field label="Chave desta tabela"><select value={String(entry.rightKey ?? names[0] ?? "")} onChange={(event) => updateEntry(index, { rightKey: event.target.value })}>{names.map((name) => <option key={name}>{name}</option>)}</select></Field><Field label="Tipo"><select value={String(entry.how ?? "left")} onChange={(event) => updateEntry(index, { how: event.target.value })}><option value="left">left</option><option value="inner">inner</option><option value="right">right</option><option value="full">full</option></select></Field></> : null}
            </div>;
          })}
        </div>}
      </>
    );
  }
  if (node.kind === "filter-out")
    return (
      <>
        <p className="viz-help">Remove linhas onde o valor aparece na coluna selecionada. Se o texto ficar vazio, remove linhas nulas/vazias.</p>
        <Field label="Coluna">{select("column")}</Field>
        <Field label="Comparação">
          <select value={String(p.mode ?? "contains")} onChange={(event) => onChange({ mode: event.target.value })}>
            <option value="contains">contém</option>
            <option value="equals">igual a</option>
          </select>
        </Field>
        <Field label="Valor">
          <input value={String(p.value ?? "")} onChange={(event) => onChange({ value: event.target.value })} />
        </Field>
        {!String(p.value ?? "").trim() ? <p className="viz-warning">Sem texto: esta transformação removerá linhas nulas/vazias e afetará todas as outras colunas dessas linhas.</p> : null}
      </>
    );
  if (node.kind === "fill-missing")
    return (
      <>
        <Field label="Coluna">{select("column")}</Field>
        <Field label="Valor">
          <input value={String(p.value ?? "")} onChange={(event) => onChange({ value: event.target.value })} />
        </Field>
      </>
    );
  if (node.kind === "fill-median" || node.kind === "fill-mode")
    return <Field label="Coluna">{select("column")}</Field>;
  if (node.kind === "category-map")
    return (
      <>
        <p className="viz-help">Uma regra por linha: valor original =&gt; valor final.</p>
        <Field label="Coluna">{select("column")}</Field>
        <Field label="Mapeamento">
          <textarea
            className="viz-code-editor"
            value={String(p.mappingText ?? "")}
            onChange={(event) => onChange({ mappingText: event.target.value })}
          />
        </Field>
      </>
    );
  if (node.kind === "select")
    return (
      <Field label="Colunas">
        <div className="viz-checkbox-list">
          {columns.map((column) => {
            const selected = ((p.columns as string[]) ?? []).includes(column);
            return (
              <label key={column}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current = (p.columns as string[]) ?? [];
                    onChange({
                      columns: selected
                        ? current.filter((item) => item !== column)
                        : [...current, column],
                    });
                  }}
                />
                <span>{column}</span>
              </label>
            );
          })}
        </div>
      </Field>
    );
  if (node.kind === "groupBy") {
    const measure = (p.measures as Array<{ column?: string; operation?: string; as?: string }> | undefined)?.[0];
    return <>
      <Field label="Dimensões">
        <div className="viz-checkbox-list">
          {columns.map((column) => {
            const selected = ((p.columns as string[]) ?? []).includes(column);
            return <label key={column}><input type="checkbox" checked={selected} onChange={() => {
              const current = (p.columns as string[]) ?? [];
              onChange({ columns: selected ? current.filter((item) => item !== column) : [...current, column] });
            }} /><span>{column}</span></label>;
          })}
        </div>
      </Field>
      <Field label="Medida (opcional)">
        <select value={measure?.column ?? ""} onChange={(event) => {
          const column = event.target.value;
          onChange({ measures: column ? [{ column, operation: measure?.operation ?? "sum", as: measure?.as || `${measure?.operation ?? "sum"}_${column}` }] : [] });
        }}>
          <option value="">Contagem de linhas</option>
          {columns.map((column) => <option key={column}>{column}</option>)}
        </select>
      </Field>
      {measure?.column ? <Field label="Operação">
        <select value={measure.operation ?? "sum"} onChange={(event) => onChange({ measures: [{ column: measure.column, operation: event.target.value, as: `${event.target.value}_${measure.column}` }] })}>
          <option value="count">contagem</option><option value="sum">soma</option><option value="mean">média</option><option value="min">mínimo</option><option value="max">máximo</option><option value="median">mediana</option>
        </select>
      </Field> : null}
    </>;
  }
  if (node.kind === "filter")
    return (
      <>
        <Field label="Coluna">{select("column")}</Field>
        <Field label="Operador">
          <select
            value={String(p.operator)}
            onChange={(event) => onChange({ operator: event.target.value })}
          >
            <option value="equals">igual a</option>
            <option value="notEquals">diferente de</option>
            <option value="contains">contém</option>
            <option value="gt">maior que</option>
            <option value="gte">maior ou igual</option>
            <option value="lt">menor que</option>
            <option value="lte">menor ou igual</option>
          </select>
        </Field>
        <Field label="Valor">
          <input
            value={String(p.value ?? "")}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        </Field>
      </>
    );
  if (node.kind === "calculate")
    return (
      <>
        <Field label="Nova coluna">
          <input
            value={String(p.as)}
            onChange={(event) => onChange({ as: event.target.value })}
          />
        </Field>
        <Field label="Expressão">
          <input
            value={String(p.expression)}
            onChange={(event) => onChange({ expression: event.target.value })}
          />
        </Field>
      </>
    );
  if (node.kind === "cast")
    return (
      <>
        <p className="viz-help">Converte os valores da coluna. Valores incompatÃ­veis com o tipo escolhido passam a ser nulos.</p>
        <Field label="Coluna">{select("column")}</Field>
        <Field label="Converter para">
          <select value={String(p.target ?? "number")} onChange={(event) => onChange({ target: event.target.value })}>
            <option value="number">NÃºmero</option>
            <option value="integer">Inteiro</option>
            <option value="decimal">Decimal</option>
            <option value="text">Texto</option>
            <option value="boolean">Booleano</option>
            <option value="date">Data</option>
          </select>
        </Field>
        {p.target === "date" ? <Field label="Formato da data (opcional)">
          <input
            placeholder="Ex.: %d/%m/%Y ou %Y-%m-%d"
            value={String(p.dateFormat ?? "")}
            onChange={(event) => onChange({ dateFormat: event.target.value })}
          />
          <p className="viz-help">Informe qualquer formato Python, como <code>%Y</code> (ano), <code>%m</code> (mês), <code>%H:%M</code> (horário), <code>%m/%Y</code> ou <code>%d-%m-%Y %H:%M</code>.</p>
        </Field> : null}
      </>
    );
  if (node.kind === "code")
    return <p className="viz-help">Edite e execute o codigo diretamente no no do canvas.</p>;
  /*
    return (
      <>
        <p className="viz-help">Use <code>df</code> como tabela Polars de entrada e atribua a tabela final a <code>result</code>. Estão disponíveis <code>pl</code> (Polars) e <code>np</code> (NumPy).</p>
        <Field label="Codigo Python">
          <textarea
            aria-label="Codigo Python da transformacao"
            className="viz-code-editor"
            maxLength={10000}
            spellCheck={false}
            value={String(p.code ?? "")}
            onChange={(event) => onChange({ code: event.target.value })}
          />
        </Field>
      </>
    ); */
  if (node.kind === "sample")
    return (
      <>
        <p className="viz-help">Retorna as primeiras linhas da entrada, na ordem atual do fluxo.</p>
        <Field label="Quantidade de linhas">
          <input
            type="number"
            min="1"
            value={Number(p.count ?? 10)}
            onChange={(event) => onChange({ count: Number(event.target.value) })}
          />
        </Field>
      </>
    );
  if (node.kind === "aggregate")
    return (
      <>
        <Field label="Coluna">
          <select
            value={String((p.measures as Array<{ column: string }>)[0]?.column ?? columns[0] ?? "")}
            onChange={(event) => {
              const current = (p.measures as Array<{ column?: string; operation?: string; as?: string }>)[0] ?? {};
              const column = event.target.value;
              const operation = current.operation ?? "mean";
              onChange({
                measures: [{ column, operation, as: current.as || `${operation}_${column}` }],
              });
            }}
          >
            {columns.map((column) => <option key={column}>{column}</option>)}
          </select>
        </Field>
        <Field label="Operação">
          <select
            value={String(
              (p.measures as Array<{ operation: string }>)[0]?.operation ??
                "mean",
            )}
            onChange={(event) =>
              onChange({
                measures: [
                  {
                    column:
                      (p.measures as Array<{ column: string }>)[0]?.column ??
                      columns[0],
                    operation: event.target.value,
                    as: `${event.target.value}_${(p.measures as Array<{ column: string }>)[0]?.column ?? columns[0]}`,
                  },
                ],
              })
            }
          >
            <option value="mean">média</option>
            <option value="sum">soma</option>
            <option value="count">contagem</option>
            <option value="min">mínimo</option>
            <option value="max">máximo</option>
            <option value="median">mediana</option>
          </select>
        </Field>
      </>
    );
  const primary =
    node.kind === "resample"
      ? "valueColumn"
      : node.kind === "window"
        ? "valueColumn"
        : node.kind === "pivot"
          ? "values"
          : "column";
  return (
    <>
      <Field label="Coluna">{select(primary)}</Field>
      {["sortBy", "rank"].includes(node.kind) ? (
        <Field label="Direção">
          <select
            value={String(p.direction ?? "asc")}
            onChange={(event) => onChange({ direction: event.target.value })}
          >
            <option value="asc">crescente</option>
            <option value="desc">decrescente</option>
          </select>
        </Field>
      ) : null}
      {["bin", "topN"].includes(node.kind) ? (
        <Field
          label={node.kind === "bin" ? "Quantidade de faixas" : "Quantidade"}
        >
          <input
            type="number"
            min="1"
            value={Number(p.bins ?? p.count ?? 10)}
            onChange={(event) =>
              onChange({
                [node.kind === "bin" ? "bins" : "count"]: Number(
                  event.target.value,
                ),
              })
            }
          />
        </Field>
      ) : null}
    </>
  );
}
function ChartParams({
  node,
  columns,
  numericColumns,
  datetimeColumns,
  onUpdate,
}: {
  node: VisualizationNode;
  columns: string[];
  numericColumns: string[];
  datetimeColumns: string[];
  onUpdate: (index: number, patch: Partial<ChartLayer>) => void;
}) {
  const categories = columns.filter((column) => !numericColumns.includes(column));
  const categoryColumns = categories.length ? categories : columns;
  const xAxisColumns = Array.from(new Set([...datetimeColumns, ...numericColumns]));
  const numericSelect = (value: string | undefined, set: (value: string) => void) => numericColumns.length ? (
    <select value={value ?? ""} onChange={(event) => set(event.target.value)}>{numericColumns.map((column) => <option key={column} value={column}>{column}</option>)}</select>
  ) : <p className="viz-help">Sem coluna numérica neste resultado.</p>;
  const xAxisSelect = (value: string | undefined, set: (value: string) => void) => xAxisColumns.length ? (
    <select value={value ?? ""} onChange={(event) => set(event.target.value)}>{xAxisColumns.map((column) => <option key={column} value={column}>{column}</option>)}</select>
  ) : <p className="viz-help">Sem coluna numérica ou de data neste resultado.</p>;
  return (
    <>
      {(node.layers ?? []).slice(0, 1).map((layer, index) => (
        <div className="viz-layer" key={layer.id}>
          <strong>Configuração do gráfico</strong>
          <Field label="Tipo">
            <select
              value={layer.type}
              onChange={(event) => {
                const next = defaultLayer(event.target.value as ChartKind, columns, numericColumns, datetimeColumns);
                onUpdate(index, { ...next, id: layer.id });
              }}
            >
              {chartKinds.map((kind) => (
                <option key={kind.kind} value={kind.kind}>
                  {kind.label}
                </option>
              ))}
            </select>
          </Field>
          {layer.type === "table" ? <p className="viz-help">Exibe as colunas e linhas recebidas do nó conectado.</p> : null}
          {layer.type === "heatmap" ? <>
            <p className="viz-help">Calcula a correlação de todas as colunas numéricas recebidas.</p>
            <Field label="Tema de cores">
              <select
                value={layer.heatmapTheme ?? "diverging"}
                onChange={(event) => onUpdate(index, {
                  heatmapTheme: event.target.value as NonNullable<ChartLayer["heatmapTheme"]>,
                })}
              >
                <option value="diverging">Divergente: azul e vermelho</option>
                <option value="blue">Azul monocromático</option>
                <option value="viridis">Viridis</option>
                <option value="spectral">Espectral</option>
              </select>
            </Field>
          </> : null}
          {layer.type === "table" ? <Field label="Linhas no preview"><input type="number" min="1" max="100" value={layer.limit ?? 12} onChange={(event) => onUpdate(index, { limit: Number(event.target.value) })} /></Field> : null}
          {layer.type === "histogram" ? <>
            <Field label="Exibição"><select value={layer.histogramMode ?? "single"} onChange={(event) => onUpdate(index, { histogramMode: event.target.value as ChartLayer["histogramMode"] })}><option value="single">Uma coluna</option><option value="stacked">Empilhado</option><option value="grid">Grade</option></select></Field>
            {(layer.histogramMode ?? "single") === "single" ? <Field label="Coluna numérica">{numericSelect(layer.x, (x) => onUpdate(index, { x }))}</Field> : <p className="viz-help">Usa todas as colunas numéricas recebidas.</p>}
          </> : null}
          {layer.type === "boxplot" ? <>
            <p className="viz-help">Usa todas as colunas numericas recebidas, uma caixa por coluna.</p>
            <Field label="Escala">
              <select value={layer.boxplotMode ?? "shared"} onChange={(event) => onUpdate(index, { boxplotMode: event.target.value as "shared" | "separate" })}>
                <option value="shared">Todos no mesmo grafico</option>
                <option value="separate">Um grafico por coluna</option>
              </select>
            </Field>
          </> : null}
          {layer.type === "histogram" ? <Field label="Quantidade de faixas"><input type="number" min="2" max="60" value={layer.bins ?? 12} onChange={(event) => onUpdate(index, { bins: Number(event.target.value) })} /></Field> : null}
          {["scatter2d", "line", "area"].includes(layer.type) ? (
            <>
              <Field label="Eixo X">{xAxisSelect(layer.x, (x) => onUpdate(index, { x }))}</Field>
              <Field label="Eixo Y">{numericSelect(layer.y, (y) => onUpdate(index, { y }))}</Field>
              {["line", "area"].includes(layer.type) ? <Field label="Série (opcional)"><select value={layer.series ?? ""} onChange={(event) => onUpdate(index, { series: event.target.value })}><option value="">Sem série</option>{categoryColumns.map((column) => <option key={column}>{column}</option>)}</select></Field> : null}
            </>
          ) : null}
          {layer.type === "bar" ? (
            <>
              {columns.length === 1 && numericColumns.length === 1 ? <>
                <p className="viz-help">Uma coluna numérica é exibida como histograma de distribuição.</p>
                <Field label="Quantidade de faixas"><input type="number" min="2" max="60" value={layer.bins ?? 12} onChange={(event) => onUpdate(index, { bins: Number(event.target.value) })} /></Field>
              </> : <>
                <p className="viz-help">Sem série, cada linha recebida vira uma barra. Use Agrupar somente para barras agrupadas ou empilhadas por série.</p>
              <Field label="Categoria X"><select value={categoryColumns.includes(layer.x ?? "") ? layer.x : ""} onChange={(event) => onUpdate(index, { x: event.target.value, series: layer.series === event.target.value ? "" : layer.series })}><option value="" disabled>Escolha categoria</option>{categoryColumns.map((column) => <option key={column}>{column}</option>)}</select></Field>
              <Field label="Medida numérica">{numericSelect(layer.y, (y) => onUpdate(index, { y }))}</Field>
              <Field label="Série (opcional)"><select value={categoryColumns.filter((column) => column !== layer.x).includes(layer.series ?? "") ? layer.series : ""} onChange={(event) => onUpdate(index, { series: event.target.value, barMode: event.target.value ? (layer.barMode ?? "grouped") : "simple" })}><option value="">Sem série</option>{categoryColumns.filter((column) => column !== layer.x).map((column) => <option key={column}>{column}</option>)}</select></Field>
              {categoryColumns.filter((column) => column !== layer.x).includes(layer.series ?? "") ? <Field label="Exibição"><select value={layer.barMode ?? "grouped"} onChange={(event) => onUpdate(index, { barMode: event.target.value as ChartLayer["barMode"] })}><option value="grouped">Barras agrupadas</option><option value="stacked">Barras empilhadas</option></select></Field> : null}
              </>}
            </>
          ) : null}
          {layer.type === "pie" ? (
            <>
              <Field label="Categoria"><select value={layer.x ?? ""} onChange={(event) => onUpdate(index, { x: event.target.value })}>{categoryColumns.map((column) => <option key={column} value={column}>{column}</option>)}</select></Field>
              <Field label="Agregação"><select value={layer.aggregation ?? "count"} onChange={(event) => onUpdate(index, { aggregation: event.target.value as ChartLayer["aggregation"] })}><option value="count">Contagem de linhas</option><option value="sum">Soma</option><option value="mean">Média</option></select></Field>
              {(layer.aggregation ?? "count") !== "count" ? <Field label="Medida numérica">{numericSelect(layer.y, (y) => onUpdate(index, { y }))}</Field> : null}
            </>
          ) : null}
          {layer.type === "scatter3d" ? (
            <>
              <Field label="Eixo X">{numericSelect(layer.x, (x) => onUpdate(index, { x }))}</Field>
              <Field label="Eixo Y">{numericSelect(layer.y, (y) => onUpdate(index, { y }))}</Field>
              <Field label="Eixo Z">{numericSelect(layer.z, (z) => onUpdate(index, { z }))}</Field>
            </>
          ) : null}
        </div>
      ))}
    </>
  );
}
