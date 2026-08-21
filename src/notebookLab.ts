import type { Asset } from "./domain";
import type { DataRow } from "./dataPrep";
import type { ChartLayer, ExecutionResult } from "./visualizationCanvas";

export interface NotebookRange {
  start: number;
  end: number;
}

export interface NotebookMarkdownCell {
  id: string;
  type: "markdown";
  source: string;
}

export interface NotebookPreviewCell {
  id: string;
  type: "visualization-preview";
  flowAssetId: string;
  nodeId: string;
  nodeLabel: string;
  range: NotebookRange;
  rows: DataRow[];
  sourceRows: DataRow[];
  schema: ExecutionResult["schema"];
  totalRows: number;
  importedAt: string;
}

export interface NotebookChartCell {
  id: string;
  type: "visualization-chart";
  flowAssetId: string;
  nodeId: string;
  nodeLabel: string;
  result: Pick<ExecutionResult, "schema" | "rows" | "chartRows" | "metadata">;
  layers: ChartLayer[];
  importedAt: string;
}

export type VisualNotebookCell = NotebookMarkdownCell | NotebookPreviewCell | NotebookChartCell;

export interface VisualNotebookDocument {
  version: 1;
  cells: VisualNotebookCell[];
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function defaultVisualNotebook(): VisualNotebookDocument {
  return {
    version: 1,
    cells: [{ id: newId("markdown"), type: "markdown", source: "# Novo notebook\n\nRegistre sua análise e importe resultados do canvas de visualização." }]
  };
}

export function notebookAssets(assets: Asset[]) {
  return assets.filter((asset) => asset.type === "notebook" && asset.visibility !== "archived");
}

export function parseVisualNotebook(asset?: Asset): VisualNotebookDocument {
  const raw = asset?.metadata?.document;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as VisualNotebookDocument;
      if (parsed.version === 1 && Array.isArray(parsed.cells)) return parsed;
    } catch {
      // Legacy content is handled below.
    }
  }

  const legacy = asset?.metadata?.content;
  if (legacy) {
    const text = legacy.replace(/^%%markdown\n?/gm, "").replace(/^%%code\n?/gm, "```python\n").replace(/```python\n(?=\n|$)/g, "");
    return { version: 1, cells: [{ id: newId("markdown"), type: "markdown", source: text }] };
  }

  return {
    version: 1,
    cells: [{
      id: newId("legacy"),
      type: "markdown",
      source: "# Notebook legado\n\nO conteúdo original deste asset não foi persistido pelo editor anterior. Você pode editar este documento e salvá-lo como uma nova versão."
    }]
  };
}

export function snapshotPreview(options: {
  flowAssetId: string;
  nodeId: string;
  nodeLabel: string;
  result: ExecutionResult;
  range: NotebookRange;
}): NotebookPreviewCell {
  const start = Math.max(1, options.range.start);
  const end = Math.max(start + 1, options.range.end);
  // The canvas returns the complete table for an explicit notebook import.
  // A normal node preview is intentionally bounded and must never become the
  // data source for a notebook snapshot.
  const sourceRows = options.result.chartRows ?? options.result.rows;
  return {
    id: newId("preview"),
    type: "visualization-preview",
    flowAssetId: options.flowAssetId,
    nodeId: options.nodeId,
    nodeLabel: options.nodeLabel,
    range: { start, end },
    rows: sourceRows.slice(start - 1, end),
    sourceRows,
    schema: options.result.schema,
    totalRows: options.result.metadata.rowCount,
    importedAt: new Date().toISOString()
  };
}

export function updatePreviewRange(cell: NotebookPreviewCell, range: NotebookRange): NotebookPreviewCell {
  const max = Math.max(1, cell.sourceRows.length);
  const start = Math.min(max, Math.max(1, range.start));
  const end = Math.min(max, Math.max(start + 1, range.end));
  return { ...cell, range: { start, end }, rows: cell.sourceRows.slice(start - 1, end) };
}
