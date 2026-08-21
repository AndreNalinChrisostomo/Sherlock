import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { FilePlus2, FileText, ImagePlus, Plus, Save, X } from "lucide-react";
import type { Asset } from "./domain";
import { ChartRenderer } from "./VisualizationCanvasView";
import {
  defaultVisualNotebook,
  notebookAssets,
  parseVisualNotebook,
  updatePreviewRange,
  type NotebookMarkdownCell,
  type NotebookPreviewCell,
  type VisualNotebookCell,
  type VisualNotebookDocument,
} from "./notebookLab";

interface RuntimeLabViewProps {
  assets: Asset[];
  activeWorkspaceName: string;
  onSaveNotebook: (payload: { assetId?: string; suggestedName: string; document: VisualNotebookDocument }, onSaved: (asset: Pick<Asset, "id" | "name">) => void) => void;
  onOpenVisualizationPicker: (flow: Asset, insertAt: number, draft?: { assetId?: string; name?: string; document: VisualNotebookDocument }) => void;
  initialDraft?: { assetId?: string; name?: string; document: VisualNotebookDocument };
  onDraftChange?: (draft: { assetId?: string; name?: string; document: VisualNotebookDocument } | undefined) => void;
}

const markdownHtml = (source: string) =>
  DOMPurify.sanitize(marked.parse(source, { breaks: true, gfm: true }) as string, {
    USE_PROFILES: { html: true },
  });

const helpers = [
  { label: "H", title: "Título", before: "## ", after: "Título" },
  { label: "B", title: "Negrito", before: "**", after: "texto em negrito**" },
  { label: "I", title: "Itálico", before: "*", after: "texto em itálico*" },
  { label: "S", title: "Riscado", before: "~~", after: "texto riscado~~" },
  { label: "Link", title: "Link", before: "[", after: "texto](https://exemplo.com)" },
  { label: "Img", title: "Imagem", before: "![descrição]", after: "(https://exemplo.com/imagem.png)" },
  { label: "•", title: "Lista", before: "- ", after: "item" },
  { label: "1.", title: "Lista numerada", before: "1. ", after: "item" },
  { label: "☐", title: "Checklist", before: "- [ ] ", after: "tarefa" },
  { label: "❝", title: "Citação", before: "> ", after: "citação" },
  { label: "</>", title: "Código", before: "```\n", after: "código\n```" },
  { label: "Tabela", title: "Tabela", before: "| Coluna | Valor |\n| --- | --- |\n", after: "| item | valor |" },
  { label: "—", title: "Linha divisória", before: "\n---\n", after: "" },
] as const;

function PreviewCell({ cell, onChange }: { cell: NotebookPreviewCell; onChange: (next: NotebookPreviewCell) => void }) {
  const max = cell.totalRows || cell.sourceRows.length;
  return <section className="notebook-embedded notebook-preview-cell">
    <header><strong>Preview: {cell.nodeLabel}</strong><span>{cell.range.start}-{cell.range.end} de {max.toLocaleString("pt-BR")} linhas</span></header>
    <div className="notebook-range">
      <label>Início<input type="number" min="1" max={max} value={cell.range.start} onChange={(event) => onChange(updatePreviewRange(cell, { start: Number(event.target.value), end: cell.range.end }))} /></label>
      <label>Fim<input type="number" min="1" max={max} value={cell.range.end} onChange={(event) => onChange(updatePreviewRange(cell, { start: cell.range.start, end: Number(event.target.value) }))} /></label>
    </div>
    <div className="notebook-table-wrap">
      <table><thead><tr>{cell.schema.map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead>
        <tbody>{cell.rows.map((row, rowIndex) => <tr key={rowIndex}>{cell.schema.map((column) => <td key={column.name}>{String(row[column.name] ?? "")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function MarkdownCell({ cell, onChange }: { cell: NotebookMarkdownCell; onChange: (next: NotebookMarkdownCell) => void }) {
  const [editing, setEditing] = useState(false);
  const insert = (before: string, after: string) => {
    const input = document.querySelector<HTMLTextAreaElement>(`textarea[data-markdown-cell="${cell.id}"]`);
    const start = input?.selectionStart ?? cell.source.length;
    const end = input?.selectionEnd ?? start;
    const selected = cell.source.slice(start, end);
    const next = `${cell.source.slice(0, start)}${before}${selected || after}${cell.source.slice(end)}`;
    onChange({ ...cell, source: next });
    window.requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + before.length + (selected || after).length;
      input?.setSelectionRange(cursor, cursor);
    });
  };
  const pasteImage = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (!image) return;
    event.preventDefault();
    const reader = new FileReader();
    reader.onload = () => insert("![imagem colada]", `(${String(reader.result)})`);
    reader.readAsDataURL(image);
  };

  return <div className="notebook-markdown-cell" onMouseEnter={() => setEditing(true)} onMouseLeave={() => setEditing(false)}>
    {editing ? <div className="notebook-markdown-editor">
      <div className="notebook-markdown-tools" role="toolbar" aria-label="Ajuda para Markdown">
        {helpers.map((helper) => <button key={helper.title} onClick={() => insert(helper.before, helper.after)} title={helper.title} type="button">{helper.label}</button>)}
      </div>
      <div className="notebook-markdown-grid">
        <textarea data-markdown-cell={cell.id} aria-label="Texto Markdown" onChange={(event) => onChange({ ...cell, source: event.target.value })} onFocus={() => setEditing(true)} onPaste={pasteImage} value={cell.source} />
        <div className="notebook-markdown-output" dangerouslySetInnerHTML={{ __html: markdownHtml(cell.source) }} />
      </div>
    </div> : <div className="notebook-markdown-output notebook-markdown-readonly" dangerouslySetInnerHTML={{ __html: markdownHtml(cell.source) }} />}
  </div>;
}

function NotebookCellView({ cell, onChange, onRemove }: { cell: VisualNotebookCell; onChange: (cell: VisualNotebookCell) => void; onRemove: () => void }) {
  return <article className="notebook-cell">
    <button aria-label="Remover célula" className="notebook-cell-remove" onClick={onRemove} type="button"><X size={16} /></button>
    {cell.type === "markdown" ? <MarkdownCell cell={cell} onChange={onChange} /> : null}
    {cell.type === "visualization-preview" ? <PreviewCell cell={cell} onChange={onChange} /> : null}
    {cell.type === "visualization-chart" ? <section className="notebook-embedded notebook-chart-cell"><header><strong>Gráfico: {cell.nodeLabel}</strong><span>Snapshot importado</span></header><ChartRenderer result={{ nodeId: cell.nodeId, ...cell.result, cacheHit: true }} layers={cell.layers} /></section> : null}
  </article>;
}

function InsertZone({ onText, onAsset }: { onText: () => void; onAsset: () => void }) {
  return <div className="notebook-insert-zone">
    <span />
    <div><button onClick={onText} type="button"><Plus size={15} />Texto</button><button onClick={onAsset} type="button"><ImagePlus size={15} />Asset</button></div>
    <span />
  </div>;
}

export function RuntimeLabView({ activeWorkspaceName, assets, onSaveNotebook, onOpenVisualizationPicker, initialDraft, onDraftChange }: RuntimeLabViewProps) {
  const notebooks = useMemo(() => notebookAssets(assets), [assets]);
  const visualizations = useMemo(() => assets.filter((asset) => asset.type === "data-visualization-flow" && asset.visibility !== "archived"), [assets]);
  const [document, setDocument] = useState<VisualNotebookDocument>();
  const [assetId, setAssetId] = useState<string>();
  const [name, setName] = useState("novo_notebook");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetInsertIndex, setAssetInsertIndex] = useState(0);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialDraft) return;
    setAssetId(initialDraft.assetId);
    if (initialDraft.name) setName(initialDraft.name);
    setDocument(initialDraft.document);
  }, [initialDraft]);
  useEffect(() => { if (document) onDraftChange?.({ assetId, name, document }); }, [assetId, document, name, onDraftChange]);

  const openNotebook = (asset: Asset) => { setAssetId(asset.id); setName(asset.name.replace(/\.ipynb$/i, "")); setDocument(parseVisualNotebook(asset)); };
  const createNotebook = () => { setAssetId(undefined); setName("novo_notebook"); setDocument(defaultVisualNotebook()); };
  const closeEditor = () => { setDocument(undefined); onDraftChange?.(undefined); };
  const updateCell = (index: number, next: VisualNotebookCell) => setDocument((current) => current ? { ...current, cells: current.cells.map((cell, cellIndex) => cellIndex === index ? next : cell) } : current);
  const removeCell = (index: number) => setDocument((current) => current ? { ...current, cells: current.cells.filter((_, cellIndex) => cellIndex !== index) } : current);
  const addText = (index: number) => setDocument((current) => current ? { ...current, cells: [...current.cells.slice(0, index), { id: `markdown-${Date.now()}`, type: "markdown", source: "## Nova seção\n" }, ...current.cells.slice(index)] } : current);
  const openAssetPicker = (index: number) => {
    setAssetInsertIndex(index);
    if (document) onDraftChange?.({ assetId, name, document });
    setAssetPickerOpen(true);
  };
  const save = () => document && onSaveNotebook(
    { assetId, suggestedName: `${name.replace(/\.ipynb$/i, "")}.ipynb`, document },
    (saved) => {
      setAssetId(saved.id);
      setName(saved.name.replace(/\.ipynb$/i, ""));
    },
  );
  const exportPdf = async () => {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight();
    const imageHeight = canvas.height * pageWidth / canvas.width; const image = canvas.toDataURL("image/png");
    for (let offset = 0; offset < imageHeight; offset += pageHeight) { if (offset) pdf.addPage(); pdf.addImage(image, "PNG", 0, -offset, pageWidth, imageHeight); }
    pdf.save(`${name.replace(/[^a-z0-9_-]+/gi, "_") || "notebook"}.pdf`);
  };

  if (!document) return <section className="notebook-home"><header><div><span className="eyebrow">NOTEBOOKS</span><h2>{activeWorkspaceName}</h2><p>Documente análises com Markdown e resultados importados dos fluxos de visualização.</p></div><button className="button primary" onClick={createNotebook} type="button"><FilePlus2 size={17} />Novo notebook</button></header><div className="notebook-list">{notebooks.map((asset) => <article className="panel" key={asset.id}><FileText size={22} /><div><strong>{asset.name}</strong><span>v{asset.version} · atualizado em {new Date(asset.updatedAt).toLocaleDateString("pt-BR")}</span><p>{asset.description}</p></div><button className="button secondary" onClick={() => openNotebook(asset)} type="button">Editar</button></article>)}{!notebooks.length ? <p className="empty-state">Ainda não há notebooks neste workspace.</p> : null}</div></section>;

  return <section className="notebook-editor-page"><header className="notebook-editor-header"><div><button className="link-button" onClick={closeEditor} type="button">Notebooks</button><input aria-label="Nome do notebook" onChange={(event) => setName(event.target.value)} value={name} /></div><div><button className="button secondary" onClick={exportPdf} type="button">Exportar PDF</button><button className="button primary" onClick={save} type="button"><Save size={16} />Salvar asset</button></div></header><main className="notebook-document" ref={exportRef}><InsertZone onText={() => addText(0)} onAsset={() => openAssetPicker(0)} />{document.cells.map((cell, index) => <div className="notebook-cell-slot" key={cell.id}><NotebookCellView cell={cell} onChange={(next) => updateCell(index, next)} onRemove={() => removeCell(index)} /><InsertZone onText={() => addText(index + 1)} onAsset={() => openAssetPicker(index + 1)} /></div>)}</main>{assetPickerOpen ? <div className="notebook-modal-backdrop" role="presentation"><section className="notebook-asset-picker" role="dialog" aria-modal="true"><header><h2>Importar asset</h2><button className="icon-button" onClick={() => setAssetPickerOpen(false)} type="button"><X /></button></header><p>Fluxos de visualização estão disponíveis agora. Outros tipos serão suportados em uma etapa futura.</p>{visualizations.map((flow) => <button className="notebook-asset-option" key={flow.id} onClick={() => { setAssetPickerOpen(false); onOpenVisualizationPicker(flow, assetInsertIndex); }} type="button"><strong>{flow.name}</strong><span>Fluxo de visualização</span></button>)}{assets.filter((asset) => asset.type !== "data-visualization-flow" && asset.type !== "notebook").map((asset) => <button className="notebook-asset-option" disabled key={asset.id} type="button"><strong>{asset.name}</strong><span>{asset.type} · em breve</span></button>)}</section></div> : null}</section>;
}
