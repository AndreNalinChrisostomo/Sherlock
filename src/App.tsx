import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  Bell,
  Boxes,
  BrainCircuit,
  Braces,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Download,
  Filter,
  FileText,
  FlaskConical,
  Gauge,
  Home,
  KeyRound,
  Layers3,
  MoreVertical,
  NotebookTabs,
  PackageOpen,
  Play,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  SidebarClose,
  SidebarOpen,
  Sparkles,
  Trash2,
  Upload,
  Workflow,
  X
} from "lucide-react";
import { AgentLabView } from "./AgentLabView";
import type { AgentConfig, AgentEvaluationResult } from "./agentLab";
import { AutoAiView } from "./AutoAiView";
import type { AutoAiConfig, TrialResult } from "./autoAi";
import { DataPrepView } from "./DataPrepView";
import { VisualizationCanvasView } from "./VisualizationCanvasView";
import { isChartKind, type VisualizationFlow } from "./visualizationCanvas";
import { type DataRow, type ParseProgress, type PrepStep } from "./dataPrep";
import type { Asset, AssetStatus, AssetType, PlatformService, ResourceTemplate, StudioNotification, StudioState, Workspace } from "./domain";
import { PromptLabView } from "./PromptLabView";
import type { PromptMode, PromptParameters, PromptTask } from "./promptLab";
import { RagLabView } from "./RagLabView";
import { RuntimeLabView } from "./RuntimeLabView";
import type { RuntimeExecution, RuntimeKind } from "./runtimeLab";
import { snapshotPreview, type VisualNotebookDocument } from "./notebookLab";
import { appendAuditEvent, loadStudioState, saveStudioState } from "./storage";
import { assetTypeLabel, formatDateTime, statusTone, workspaceTypeLabel } from "./utils";
import { closeStudioTab, restoreStudioTabs, tabIdentity, type StudioTab } from "./studioTabs";

type ViewId = "home" | "projects" | "assets" | "data" | "visualization" | "autoai" | "prompt" | "rag" | "agent" | "runtime" | "recent" | "resources" | "services" | "notifications";
type ProjectTab = "overview" | "assets" | "jobs" | "manage" | "activity";
type AssetAction = "open" | "refine" | "visualize" | "duplicate" | "version" | "archive" | "remove";
type WorkspaceUpload = {
  id: string;
  name: string;
  status: "queued" | "uploading" | "success" | "error";
  progress: ParseProgress;
  error?: string;
};
type SamplingRequest = BackendDatasetRequiresSampling & {
  file: File;
  jobId: string;
  suggestedName: string;
  value: string;
  onResolve: (name: string | null) => void;
};

const STUDIO_TABS_STORAGE_KEY = "sherlock-studio-tabs-v1";

const homeTab: StudioTab<ViewId> = { id: "tab-home", view: "home" };

type BackendDatasetReady = {
  datasetId: string;
  name: string;
  rowCount: number;
  columns: string[];
  schema?: Array<{ name: string; type: string }>;
  bytes: number;
  parquet?: boolean;
  sampled?: boolean;
  sampledFromRowCount?: number;
};

type BackendDatasetRequiresSampling = {
  requiresSampling: true;
  stagingId: string;
  name: string;
  rowCount: number;
  limit: number;
  columns: string[];
  schema?: Array<{ name: string; type: string }>;
  bytes: number;
};

type BackendDatasetUpload = BackendDatasetReady | BackendDatasetRequiresSampling;

function isSamplingResponse(payload: BackendDatasetUpload): payload is BackendDatasetRequiresSampling {
  return "requiresSampling" in payload && payload.requiresSampling;
}

async function uploadDatasetToBackend(
  file: File,
  delimiter: string,
  onProgress: (progress: ParseProgress) => void,
): Promise<BackendDatasetUpload> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["csv", "tsv", "txt"].includes(extension)) {
    throw new Error("Upload backend nesta etapa aceita CSV, TSV e TXT delimitado.");
  }
  onProgress({
    phase: "reading",
    percent: 5,
    loadedBytes: 0,
    totalBytes: file.size,
    rows: 0,
    message: "Enviando arquivo completo para o backend.",
  });
  const response = await fetch("/api/datasets/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-Delimiter": delimiter || "auto",
    },
    body: file,
  });
  onProgress({
    phase: "finalizing",
    percent: 90,
    loadedBytes: file.size,
    totalBytes: file.size,
    rows: 0,
    message: "Backend contando linhas e inferindo schema.",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail ?? "Falha ao salvar o dataset no backend.");
  }
  return payload as BackendDatasetUpload;
}

async function sampleDatasetInBackend(stagingOrDatasetId: string, name: string, limit = 500_000, seed = 739): Promise<BackendDatasetReady> {
  const response = await fetch(`/api/datasets/${encodeURIComponent(stagingOrDatasetId)}/sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, limit, seed }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail?.message ?? payload.detail ?? "Falha ao criar amostra do dataset.");
  }
  return payload as BackendDatasetReady;
}

async function cancelDatasetStaging(stagingId: string): Promise<void> {
  await fetch(`/api/datasets/staging/${encodeURIComponent(stagingId)}`, { method: "DELETE" });
}

function loadStudioTabs() {
  const validViews = new Set<ViewId>(["home", "projects", "assets", "data", "visualization", "autoai", "prompt", "rag", "agent", "runtime", "recent", "resources", "services", "notifications"]);
  return restoreStudioTabs(window.localStorage.getItem(STUDIO_TABS_STORAGE_KEY), homeTab, (view): view is ViewId => validViews.has(view as ViewId));
}

const navItems: Array<{ id: ViewId; label: string; icon: React.ElementType; planned?: boolean }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "recent", label: "Recentes", icon: Clock3 },
  { id: "resources", label: "Resource Hub", icon: PackageOpen },
  { id: "services", label: "Servicos", icon: Settings },
  { id: "notifications", label: "Notificacoes", icon: Bell },
  { id: "projects", label: "Projetos", icon: Layers3 },
  { id: "assets", label: "Assets", icon: Archive },
  { id: "data", label: "Dados", icon: Database },
  { id: "autoai", label: "AutoAI", icon: FlaskConical },
  { id: "prompt", label: "Prompt Lab", icon: Braces },
  { id: "rag", label: "RAG Lab", icon: Database },
  { id: "agent", label: "Agent Lab", icon: BrainCircuit },
  { id: "runtime", label: "Notebooks", icon: NotebookTabs },
  { id: "home", label: "Deployments", icon: Rocket, planned: true },
  { id: "home", label: "Governanca", icon: ShieldCheck, planned: true },
  { id: "home", label: "Pipelines", icon: Workflow, planned: true },
  { id: "home", label: "Catalogo", icon: Boxes, planned: true }
];

const quickActions = [
  { label: "AutoAI", target: "AutoAI", icon: FlaskConical },
  { label: "Prompt Lab", target: "Prompt Lab", icon: Sparkles },
  { label: "RAG Lab", target: "RAG Lab", icon: Database },
  { label: "Agent Lab", target: "Agent Lab", icon: BrainCircuit },
  { label: "Notebooks", target: "Notebooks", icon: NotebookTabs },
  { label: "Projetos", target: "Projetos", icon: Layers3 },
  { label: "Assets", target: "Assets", icon: Archive },
  { label: "Dados", target: "Dados", icon: Database },
  { label: "Deployments", target: "Deployments", icon: Rocket, planned: true },
  { label: "Catalogo", target: "Catalogo", icon: Boxes, planned: true },
  { label: "Governanca", target: "Governanca", icon: ShieldCheck, planned: true },
  { label: "Recursos", target: "Resource Hub", icon: PackageOpen }
];

const assetTypes: AssetType[] = [
  "data",
  "connection",
  "notebook",
  "script",
  "prompt-template",
  "model",
  "tuned-model",
  "data-refinery-flow",
  "pipeline",
  "function",
  "environment",
  "job",
  "ai-service",
  "agent",
  "vector-index",
  "evaluation"
];

const assetStatuses: AssetStatus[] = ["Draft", "Ready", "Running", "Failed", "Deployed", "Archived"];

function countByStatus(assets: Asset[], status: Asset["status"]) {
  return assets.filter((asset) => asset.status === status).length;
}

function workspaceAssets(workspace: Workspace, assets: Asset[]) {
  return assets.filter((asset) => asset.workspaceId === workspace.id);
}

function serviceTone(status: PlatformService["status"]) {
  if (status === "Online") return "success";
  if (status === "Needs setup") return "attention";
  return "danger";
}

function notificationTone(tone: StudioNotification["tone"]) {
  if (tone === "success") return "success";
  if (tone === "warning") return "attention";
  if (tone === "danger") return "danger";
  return "neutral";
}

function ShellButton({
  children,
  variant = "secondary",
  disabled = false,
  onClick
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`button ${variant}`} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon" aria-hidden="true">
        <Icon size={18} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function WorkspaceCard({
  workspace,
  assets,
  onOpen,
  onDelete
}: {
  workspace: Workspace;
  assets: Asset[];
  onOpen: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
}) {
  const relatedAssets = workspaceAssets(workspace, assets);

  return (
    <article className="workspace-card">
      <div className="card-row">
        <span className="eyebrow">{workspaceTypeLabel(workspace.type)}</span>
        <span className="status-dot">{workspace.status}</span>
      </div>
      <h3>{workspace.name}</h3>
      <p>{workspace.description}</p>
      <div className="workspace-meta">
        <span>{relatedAssets.length} assets</span>
        <span>Atualizado {formatDateTime(workspace.updatedAt)}</span>
      </div>
      <div className="workspace-card-actions">
        <ShellButton onClick={() => onOpen(workspace.id)} variant="primary">
          Open workspace
        </ShellButton>
        <button
          aria-label={`Excluir workspace ${workspace.name}`}
          className="workspace-delete-button"
          onClick={() => onDelete(workspace.id)}
          title={`Excluir workspace ${workspace.name}`}
          type="button"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </article>
  );
}

function AssetOptions({ asset, onAction }: { asset: Asset; onAction: (asset: Asset, action: AssetAction) => void }) {
  const openLabel: Partial<Record<AssetType, string>> = {
    notebook: "Abrir notebook",
    script: "Abrir script",
    "prompt-template": "Abrir no Prompt Lab",
    model: "Abrir no AutoAI",
    "tuned-model": "Abrir modelo",
    agent: "Abrir no Agent Lab",
    "vector-index": "Abrir no RAG Lab",
    "ai-service": "Abrir servico",
    connection: "Testar conexao",
    "data-refinery-flow": "Abrir fluxo",
    pipeline: "Abrir pipeline",
    function: "Abrir funcao",
    environment: "Configurar ambiente",
    job: "Ver execucao",
    evaluation: "Ver avaliacao"
  };

  return (
    <details className="asset-options" onClick={(event) => event.stopPropagation()}>
      <summary aria-label={`Opcoes de ${asset.name}`} title={`Opcoes de ${asset.name}`}>
        <MoreVertical size={17} />
      </summary>
      <div className="asset-options-menu">
        {asset.type === "data" ? <button onClick={() => onAction(asset, "refine")} type="button">Refine</button> : null}
        {asset.type === "data" ? <button onClick={() => onAction(asset, "visualize")} type="button">Visualize</button> : null}
        {asset.type !== "data" ? <button onClick={() => onAction(asset, "open")} type="button">{openLabel[asset.type] ?? "Abrir asset"}</button> : null}
        <button onClick={() => onAction(asset, "duplicate")} type="button">Duplicar</button>
        <button onClick={() => onAction(asset, "version")} type="button">Nova versao</button>
        <button onClick={() => onAction(asset, "archive")} type="button">{asset.status === "Archived" ? "Reativar" : "Arquivar"}</button>
        <button className="danger-action" onClick={() => onAction(asset, "remove")} type="button">Remover</button>
      </div>
    </details>
  );
}

function AssetTable({ assets, onAssetAction, title = "Inventario inicial" }: { assets: Asset[]; onAssetAction: (asset: Asset, action: AssetAction) => void; title?: string }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Assets</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Versao</th>
              <th>Tags</th>
              <th>Atualizado</th>
              <th aria-label="Opcoes" />
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <strong>{asset.name}</strong>
                  <span>{asset.description}</span>
                </td>
                <td>{assetTypeLabel(asset.type)}</td>
                <td>
                  <span className={`badge ${statusTone(asset.status)}`}>{asset.status}</span>
                </td>
                <td>v{asset.version}</td>
                <td>
                  <div className="tag-row">
                    {asset.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{formatDateTime(asset.updatedAt)}</td>
                <td><AssetOptions asset={asset} onAction={onAssetAction} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResourceCard({ resource, onUse }: { resource: ResourceTemplate; onUse: (name: string) => void }) {
  return (
    <article className="resource-card">
      <div className="card-row">
        <span className="eyebrow">{resource.kind}</span>
        <span className="time-pill">{resource.estimatedTime}</span>
      </div>
      <h3>{resource.name}</h3>
      <p>{resource.description}</p>
      <div className="tag-row">
        {resource.tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <ShellButton onClick={() => onUse(resource.name)}>
        <Plus size={16} />
        Usar exemplo
      </ShellButton>
    </article>
  );
}

function ServicesView({ services }: { services: PlatformService[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Servicos e integracoes</span>
          <h2>Status da plataforma local</h2>
        </div>
        <Gauge size={18} />
      </div>
      <div className="service-grid">
        {services.map((service) => (
          <article className="service-card" key={service.id}>
            <div>
              <span className="eyebrow">{service.category}</span>
              <h3>{service.name}</h3>
              <p>{service.detail}</p>
            </div>
            <div className="service-footer">
              <span className={`badge ${serviceTone(service.status)}`}>{service.status}</span>
              <span>{formatDateTime(service.updatedAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NotificationsView({
  notifications,
  onMarkAllRead
}: {
  notifications: StudioNotification[];
  onMarkAllRead: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Notificacoes</span>
          <h2>Jobs, deployments e avaliacoes</h2>
        </div>
        <ShellButton onClick={onMarkAllRead}>
          <CheckCircle2 size={16} />
          Marcar lidas
        </ShellButton>
      </div>
      <div className="notification-list">
        {notifications.map((notification) => (
          <article className={notification.read ? "notification-card read" : "notification-card"} key={notification.id}>
            <span className={`badge ${notificationTone(notification.tone)}`}>{notification.read ? "Lida" : "Nova"}</span>
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.detail}</p>
              <span>{formatDateTime(notification.createdAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProjectAssetsTable({
  assets,
  onSaveNote,
  onAssetAction,
  onCreateAsset,
  uploads,
  separator,
  onSeparatorChange
}: {
  assets: Asset[];
  onSaveNote: (assetId: string, notes: string) => void;
  onAssetAction: (asset: Asset, action: AssetAction) => void;
  onCreateAsset: () => void;
  uploads: WorkspaceUpload[];
  separator: string;
  onSeparatorChange: (separator: string) => void;
}) {
  return (
    <div className="project-assets-table-wrap">
      <div className="panel-header project-assets-header">
        <div>
          <span className="eyebrow">Assets do workspace</span>
          <h3>Assets</h3>
        </div>
        <div className="asset-import-actions">
          <label>
            Separador
            <select onChange={(event) => onSeparatorChange(event.target.value)} value={separator}>
              <option value="">Automático</option>
              <option value=",">Vírgula (,)</option>
              <option value=";">Ponto e vírgula (;)</option>
              <option value="\t">Tabulação</option>
              <option value="|">Barra vertical (|)</option>
            </select>
          </label>
          <ShellButton onClick={onCreateAsset} variant="primary">
            <NotebookTabs size={16} />
            Novo asset
          </ShellButton>
        </div>
      </div>
      {uploads.length > 0 ? (
        <div aria-live="polite" className="workspace-upload-list">
          {uploads.map((upload) => (
            <div className={`workspace-upload-item ${upload.status}`} key={upload.id}>
              <div>
                <strong>{upload.name}</strong>
                <span>{upload.error ?? upload.progress.message}</span>
              </div>
              <div className="workspace-upload-meter" aria-label={`Progresso de ${upload.name}`}>
                <i style={{ width: `${upload.progress.percent}%` }} />
              </div>
              <em>{upload.status === "error" ? "Falhou" : `${upload.progress.percent}%`}</em>
            </div>
          ))}
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Tags</th>
            <th>Notas pessoais</th>
            <th aria-label="Opcoes" />
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id}>
              <td>
                <strong>{asset.name}</strong>
                <span>{asset.description}</span>
              </td>
              <td>{assetTypeLabel(asset.type)}</td>
              <td>
                <span className={`badge ${statusTone(asset.status)}`}>{asset.status}</span>
              </td>
              <td>
                <div className="tag-row">
                  {asset.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <textarea
                  aria-label={`Notas para ${asset.name}`}
                  className="note-input"
                  defaultValue={asset.notes ?? ""}
                  onBlur={(event) => onSaveNote(asset.id, event.target.value)}
                  placeholder="Adicionar nota pessoal..."
                />
              </td>
              <td><AssetOptions asset={asset} onAction={onAssetAction} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectJobs({ jobs }: { jobs: StudioState["jobs"] }) {
  return (
    <div className="job-list">
      {jobs.length === 0 ? (
        <div className="empty-state">Nenhum job registrado neste projeto.</div>
      ) : (
        jobs.map((job) => (
          <div className="job-item" key={job.id}>
            <div>
              <strong>{job.name}</strong>
              <span>
                {formatDateTime(job.startedAt)} - {job.duration}
              </span>
            </div>
            <span className={`badge ${statusTone(job.status)}`}>{job.status}</span>
          </div>
        ))
      )}
    </div>
  );
}

function ProjectActivity({ events, project, assets }: { events: StudioState["events"]; project: Workspace; assets: Asset[] }) {
  const assetNames = new Set(assets.map((asset) => asset.name));
  const projectEvents = events.filter((event) => event.target === project.name || assetNames.has(event.target));

  return (
    <div className="event-list">
      {projectEvents.length === 0 ? (
        <div className="empty-state">Nenhuma atividade registrada para este projeto.</div>
      ) : (
        projectEvents.map((event) => (
          <div className="event-item" key={event.id}>
            <span>{formatDateTime(event.createdAt)}</span>
            <strong>{event.action}</strong>
            <em>{event.target}</em>
          </div>
        ))
      )}
    </div>
  );
}

function ProjectManage({
  project,
  services,
  exportText,
  importText,
  onProjectChange,
  onServiceToggle,
  onExport,
  onImportTextChange,
  onImport,
  onArchive,
  onDelete
}: {
  project: Workspace;
  services: PlatformService[];
  exportText: string;
  importText: string;
  onProjectChange: (patch: Partial<Workspace>) => void;
  onServiceToggle: (serviceId: string) => void;
  onExport: () => void;
  onImportTextChange: (value: string) => void;
  onImport: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="manage-grid">
      <section className="subpanel">
        <span className="eyebrow">Manage</span>
        <h3>Metadados do projeto</h3>
        <label>
          Nome
          <input value={project.name} onChange={(event) => onProjectChange({ name: event.target.value })} />
        </label>
        <label>
          Descricao
          <textarea value={project.description} onChange={(event) => onProjectChange({ description: event.target.value })} />
        </label>
        <label>
          Tags
          <input
            value={(project.tags ?? []).join(", ")}
            onChange={(event) =>
              onProjectChange({
                tags: event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              })
            }
          />
        </label>
        <label>
          Storage associado
          <input value={project.storage ?? ""} onChange={(event) => onProjectChange({ storage: event.target.value })} />
        </label>
      </section>

      <section className="subpanel">
        <span className="eyebrow">Servicos</span>
        <h3>Associar ao projeto</h3>
        <div className="check-list">
          {services.map((service) => (
            <label key={service.id}>
              <input
                checked={(project.serviceIds ?? []).includes(service.id)}
                onChange={() => onServiceToggle(service.id)}
                type="checkbox"
              />
              <span>{service.name}</span>
              <em>{service.category}</em>
            </label>
          ))}
        </div>
      </section>

      <section className="subpanel">
        <span className="eyebrow">Pacote</span>
        <h3>Exportar/importar projeto</h3>
        <div className="button-row">
          <ShellButton onClick={onExport}>
            <Download size={16} />
            Exportar
          </ShellButton>
          <ShellButton onClick={onImport}>
            <Upload size={16} />
            Importar
          </ShellButton>
        </div>
        <textarea
          aria-label="Pacote de projeto"
          className="package-textarea"
          onChange={(event) => onImportTextChange(event.target.value)}
          placeholder="O JSON exportado aparece aqui. Cole um pacote para importar."
          value={importText || exportText}
        />
      </section>

      <section className="subpanel danger-zone">
        <span className="eyebrow">Estado</span>
        <h3>Arquivar ou remover projeto</h3>
        <p>Arquivar preserva os assets. Remover apaga o projeto, assets e jobs associados.</p>
        <div className="button-row">
          <ShellButton onClick={onArchive}>
            <Archive size={16} />
            Arquivar
          </ShellButton>
          <ShellButton onClick={onDelete}>
            <Trash2 size={16} />
            Remover
          </ShellButton>
        </div>
      </section>
    </div>
  );
}

function ProjectsView({
  state,
  selectedProjectId,
  activeProjectTab,
  exportText,
  importText,
  onSelectProject,
  onSetTab,
  onCreateProject,
  onProjectChange,
  onServiceToggle,
  onSaveNote,
  onAssetAction,
  onExport,
  onImportTextChange,
  onImport,
  onArchive,
  onDelete,
  onCreateAsset,
  uploads,
  separator,
  onSeparatorChange
}: {
  state: StudioState;
  selectedProjectId: string;
  activeProjectTab: ProjectTab;
  exportText: string;
  importText: string;
  onSelectProject: (projectId: string) => void;
  onSetTab: (tab: ProjectTab) => void;
  onCreateProject: () => void;
  onProjectChange: (patch: Partial<Workspace>) => void;
  onServiceToggle: (serviceId: string) => void;
  onSaveNote: (assetId: string, notes: string) => void;
  onAssetAction: (asset: Asset, action: AssetAction) => void;
  onExport: () => void;
  onImportTextChange: (value: string) => void;
  onImport: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCreateAsset: () => void;
  uploads: WorkspaceUpload[];
  separator: string;
  onSeparatorChange: (separator: string) => void;
}) {
  const projects = state.workspaces.filter((workspace) => workspace.type === "project");
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const projectAssets = selectedProject ? state.assets.filter((asset) => asset.workspaceId === selectedProject.id) : [];
  const projectJobs = selectedProject ? state.jobs.filter((job) => job.workspaceId === selectedProject.id) : [];
  const tabs: Array<{ id: ProjectTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "assets", label: "Assets" },
    { id: "jobs", label: "Jobs" },
    { id: "manage", label: "Manage" },
    { id: "activity", label: "Activity" }
  ];

  if (!selectedProject) {
    return (
      <section className="panel">
        <div className="empty-state">Nenhum projeto encontrado.</div>
        <ShellButton onClick={onCreateProject}>
          <Plus size={16} />
          Criar projeto
        </ShellButton>
      </section>
    );
  }

  return (
    <section className="projects-layout workspace-project-page">
      <section className="panel project-detail">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Workspace aberto</span>
            <h2>{selectedProject.name}</h2>
          </div>
          <div className="project-header-actions">
            <label>
              Trocar workspace
              <select value={selectedProject.id} onChange={(event) => onSelectProject(event.target.value)}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <ShellButton onClick={onCreateProject}><Plus size={16} />Novo workspace</ShellButton>
            <span className={`badge ${selectedProject.status === "Active" ? "success" : "muted"}`}>{selectedProject.status}</span>
          </div>
        </div>

        <div className="tab-row" role="tablist" aria-label="Abas do projeto">
          {tabs.map((tab) => (
            <button
              aria-selected={activeProjectTab === tab.id}
              className={activeProjectTab === tab.id ? "tab active" : "tab"}
              key={tab.id}
              onClick={() => onSetTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeProjectTab === "overview" ? (
          <div className="overview-grid">
            <StatCard detail="assets neste projeto" icon={Archive} label="Assets" value={String(projectAssets.length)} />
            <StatCard detail="jobs registrados" icon={Workflow} label="Jobs" value={String(projectJobs.length)} />
            <StatCard detail={selectedProject.storage ?? "Storage local"} icon={Database} label="Storage" value="1" />
            <StatCard
              detail="servicos associados"
              icon={Settings}
              label="Servicos"
              value={String((selectedProject.serviceIds ?? []).length)}
            />
            <div className="subpanel full-span">
              <h3>Resumo</h3>
              <p>{selectedProject.description}</p>
              <div className="tag-row">
                {(selectedProject.tags ?? []).map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeProjectTab === "assets" ? <ProjectAssetsTable assets={projectAssets} onAssetAction={onAssetAction} onCreateAsset={onCreateAsset} onSaveNote={onSaveNote} uploads={uploads} separator={separator} onSeparatorChange={onSeparatorChange} /> : null}
        {activeProjectTab === "jobs" ? <ProjectJobs jobs={projectJobs} /> : null}
        {activeProjectTab === "activity" ? <ProjectActivity assets={projectAssets} events={state.events} project={selectedProject} /> : null}
        {activeProjectTab === "manage" ? (
          <ProjectManage
            exportText={exportText}
            importText={importText}
            onArchive={onArchive}
            onExport={onExport}
            onImport={onImport}
            onImportTextChange={onImportTextChange}
            onProjectChange={onProjectChange}
            onServiceToggle={onServiceToggle}
            onDelete={onDelete}
            project={selectedProject}
            services={state.services}
          />
        ) : null}
      </section>
    </section>
  );
}

function AssetCatalogView({
  assets,
  workspaces,
  selectedAssetId,
  typeFilter,
  statusFilter,
  workspaceFilter,
  tagFilter,
  onSelectAsset,
  onTypeFilterChange,
  onStatusFilterChange,
  onWorkspaceFilterChange,
  onTagFilterChange,
  onDuplicate,
  onArchive,
  onRemove,
  onVersion,
  onNoteChange,
  onAssetAction
}: {
  assets: Asset[];
  workspaces: Workspace[];
  selectedAssetId: string;
  typeFilter: "all" | AssetType;
  statusFilter: "all" | AssetStatus;
  workspaceFilter: "all" | string;
  tagFilter: string;
  onSelectAsset: (assetId: string) => void;
  onTypeFilterChange: (value: "all" | AssetType) => void;
  onStatusFilterChange: (value: "all" | AssetStatus) => void;
  onWorkspaceFilterChange: (value: "all" | string) => void;
  onTagFilterChange: (value: string) => void;
  onDuplicate: (assetId: string) => void;
  onArchive: (assetId: string) => void;
  onRemove: (assetId: string) => void;
  onVersion: (assetId: string) => void;
  onNoteChange: (assetId: string, notes: string) => void;
  onAssetAction: (asset: Asset, action: AssetAction) => void;
}) {
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const lineageAssets = selectedAsset?.lineage
    .map((lineageId) => assets.find((asset) => asset.id === lineageId))
    .filter((asset): asset is Asset => Boolean(asset));
  const dependentAssets = selectedAsset
    ? assets.filter((asset) => (asset.dependencies ?? asset.lineage).includes(selectedAsset.id))
    : [];

  return (
    <section className="asset-catalog-layout">
      <div className="panel asset-inventory">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Modelo de assets</span>
            <h2>Inventario global</h2>
          </div>
          <Filter size={18} />
        </div>

        <div className="filter-grid">
          <label>
            Tipo
            <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value as "all" | AssetType)}>
              <option value="all">Todos</option>
              {assetTypes.map((type) => (
                <option key={type} value={type}>
                  {assetTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as "all" | AssetStatus)}>
              <option value="all">Todos</option>
              {assetStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Workspace
            <select value={workspaceFilter} onChange={(event) => onWorkspaceFilterChange(event.target.value)}>
              <option value="all">Todos</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tag
            <input onChange={(event) => onTagFilterChange(event.target.value)} placeholder="prompt, demo, rag..." value={tagFilter} />
          </label>
        </div>

        <div className="table-wrap">
          <table className="selectable-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Workspace</th>
                <th>Versao</th>
                <th>Atualizado</th>
                <th aria-label="Opcoes" />
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nenhum asset encontrado para os filtros atuais.</td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr
                    className={selectedAsset?.id === asset.id ? "selected-row" : ""}
                    key={asset.id}
                    onClick={() => onSelectAsset(asset.id)}
                  >
                    <td>
                      <strong>{asset.name}</strong>
                      <span>{asset.description}</span>
                    </td>
                    <td>{assetTypeLabel(asset.type)}</td>
                    <td>
                      <span className={`badge ${statusTone(asset.status)}`}>{asset.status}</span>
                    </td>
                    <td>{workspaceById.get(asset.workspaceId)?.name ?? asset.workspaceId}</td>
                    <td>v{asset.version}</td>
                    <td>{formatDateTime(asset.updatedAt)}</td>
                    <td><AssetOptions asset={asset} onAction={onAssetAction} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="panel asset-detail-panel">
        {selectedAsset ? (
          <>
            <div className="panel-header">
              <div>
                <span className="eyebrow">{assetTypeLabel(selectedAsset.type)}</span>
                <h2>{selectedAsset.name}</h2>
              </div>
              <span className={`badge ${statusTone(selectedAsset.status)}`}>{selectedAsset.status}</span>
            </div>

            <p className="detail-copy">{selectedAsset.description}</p>

            <div className="action-grid">
              {selectedAsset.type === "data" ? <ShellButton onClick={() => onAssetAction(selectedAsset, "refine")}><Sparkles size={16} />Refine</ShellButton> : null}
              {selectedAsset.type === "data" ? <ShellButton onClick={() => onAssetAction(selectedAsset, "visualize")}><Gauge size={16} />Visualize</ShellButton> : null}
              <ShellButton onClick={() => onDuplicate(selectedAsset.id)}>
                <Copy size={16} />
                Duplicar
              </ShellButton>
              <ShellButton onClick={() => onVersion(selectedAsset.id)}>
                <Archive size={16} />
                Nova versao
              </ShellButton>
              <ShellButton onClick={() => onArchive(selectedAsset.id)}>
                <Archive size={16} />
                {selectedAsset.status === "Archived" ? "Reativar" : "Arquivar"}
              </ShellButton>
              <ShellButton onClick={() => onRemove(selectedAsset.id)}>
                <Trash2 size={16} />
                Remover
              </ShellButton>
            </div>

            <dl className="metadata-list">
              <div>
                <dt>Workspace</dt>
                <dd>{workspaceById.get(selectedAsset.workspaceId)?.name ?? selectedAsset.workspaceId}</dd>
              </div>
              <div>
                <dt>Versao</dt>
                <dd>v{selectedAsset.version}</dd>
              </div>
              <div>
                <dt>Atualizado</dt>
                <dd>{formatDateTime(selectedAsset.updatedAt)}</dd>
              </div>
              <div>
                <dt>Visibilidade</dt>
                <dd>{selectedAsset.visibility ?? "active"}</dd>
              </div>
            </dl>

            <section className="detail-section">
              <h3>Tags</h3>
              <div className="tag-row">
                {selectedAsset.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h3>Metadata</h3>
              <dl className="metadata-list compact">
                {Object.entries(selectedAsset.metadata ?? {}).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="detail-section">
              <h3>Lineage</h3>
              <div className="dependency-list">
                {lineageAssets.length === 0 ? (
                  <span className="muted-text">Sem origem registrada.</span>
                ) : (
                  lineageAssets.map((asset) => <span key={asset.id}>{asset.name}</span>)
                )}
              </div>
            </section>

            <section className="detail-section">
              <h3>Dependentes</h3>
              <div className="dependency-list">
                {dependentAssets.length === 0 ? (
                  <span className="muted-text">Nenhum asset depende deste item.</span>
                ) : (
                  dependentAssets.map((asset) => <span key={asset.id}>{asset.name}</span>)
                )}
              </div>
            </section>

            <section className="detail-section">
              <h3>Notas</h3>
              <textarea
                className="note-input"
                defaultValue={selectedAsset.notes ?? ""}
                onBlur={(event) => onNoteChange(selectedAsset.id, event.target.value)}
                placeholder="Adicionar nota pessoal..."
              />
            </section>
          </>
        ) : (
          <div className="empty-state">Selecione um asset para ver detalhes.</div>
        )}
      </aside>
    </section>
  );
}

export function App() {
  const [state, setState] = useState<StudioState>(() => loadStudioState());
  const [query, setQuery] = useState("");
  const restoredTabs = useMemo(() => loadStudioTabs(), []);
  const [tabs, setTabs] = useState<StudioTab<ViewId>[]>(restoredTabs.tabs);
  const [activeTabId, setActiveTabId] = useState(restoredTabs.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? homeTab;
  const activeView = activeTab.view;
  const firstProject = state.workspaces.find((workspace) => workspace.type === "project");
  const [selectedProjectId, setSelectedProjectId] = useState(activeTab.workspaceId ?? firstProject?.id ?? "");
  const [activeProjectTab, setActiveProjectTab] = useState<ProjectTab>("overview");
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState(state.assets[0]?.id ?? "");
  const [assetTypeFilter, setAssetTypeFilter] = useState<"all" | AssetType>("all");
  const [assetStatusFilter, setAssetStatusFilter] = useState<"all" | AssetStatus>("all");
  const [assetWorkspaceFilter, setAssetWorkspaceFilter] = useState<"all" | string>("all");
  const [assetTagFilter, setAssetTagFilter] = useState("");
  const [showAuditPanel, setShowAuditPanel] = useState(() => (window.localStorage.getItem("sherlock-show-audit") ?? window.localStorage.getItem("watson-clone-show-audit")) === "true");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (window.localStorage.getItem("sherlock-sidebar-collapsed") ?? window.localStorage.getItem("watson-clone-sidebar-collapsed")) === "true");
  const [dataIntent, setDataIntent] = useState<{ assetId: string; section: "prepare" | "analysis"; requestId: number } | null>(null);
  const [visualizationAssetId, setVisualizationAssetId] = useState("");
  const [visualizationFlowId, setVisualizationFlowId] = useState("");
  const [notebookPickerFlowId, setNotebookPickerFlowId] = useState("");
  const [notebookImportIndex, setNotebookImportIndex] = useState<number>();
  const [notebookImportTarget, setNotebookImportTarget] = useState<{ assetId?: string; name?: string; document: VisualNotebookDocument }>();
  const [nameRequest, setNameRequest] = useState<{ suggestedName: string; value: string; onConfirm: (name: string) => void }>();
  const [samplingRequest, setSamplingRequest] = useState<SamplingRequest>();
  const [workspaceUploads, setWorkspaceUploads] = useState<WorkspaceUpload[]>([]);
  const [assetImportSeparator, setAssetImportSeparator] = useState("");
  const workspaceAssetFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STUDIO_TABS_STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (activeTab.workspaceId && activeTab.workspaceId !== selectedProjectId) setSelectedProjectId(activeTab.workspaceId);
  }, [activeTab.workspaceId, selectedProjectId]);

  useEffect(() => {
    const isValidTab = (tab: StudioTab<ViewId>) => tab.view === "home" ||
      ((!tab.workspaceId || state.workspaces.some((workspace) => workspace.id === tab.workspaceId)) &&
        (!tab.assetId || state.assets.some((asset) => asset.id === tab.assetId)) &&
        (!tab.flowId || state.assets.some((asset) => asset.id === tab.flowId)) &&
        (!tab.notebookId || state.assets.some((asset) => asset.id === tab.notebookId)));

    setTabs((current) => {
      const next = current.filter(isValidTab);
      if (!next.some((tab) => tab.id === activeTabId)) setActiveTabId(next[0]?.id ?? homeTab.id);
      return next.length === current.length ? current : next;
    });
  }, [activeTabId, state.assets, state.workspaces]);

  const openTab = (view: ViewId, context: Partial<StudioTab> = {}) => {
    if (view === "home") {
      setActiveTabId(homeTab.id);
      return;
    }
    const workspaceId = context.workspaceId ?? selectedProjectId;
    const normalized: StudioTab<ViewId> = { ...context, workspaceId, view, id: "" };
    const identity = tabIdentity(view, normalized);
    const existing = tabs.find((tab) => tabIdentity(tab.view, tab) === identity);
    if (existing) {
      setActiveTabId(existing.id);
      if (existing.workspaceId) setSelectedProjectId(existing.workspaceId);
      return;
    }
    const tab = { ...normalized, id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    if (tab.workspaceId) setSelectedProjectId(tab.workspaceId);
  };

  const closeTab = (tabId: string) => {
    if (tabId === homeTab.id) return;
    setTabs((current) => {
      const result = closeStudioTab(current, tabId, homeTab.id);
      if (activeTabId === tabId) {
        const fallback = result.tabs.find((tab) => tab.id === result.nextActiveId) ?? homeTab;
        setActiveTabId(result.nextActiveId);
        if (fallback.workspaceId) setSelectedProjectId(fallback.workspaceId);
      }
      return result.tabs;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId]);

  const requestAssetName = (suggestedName: string, onConfirm: (name: string) => void) => {
    setNameRequest({ suggestedName, value: suggestedName, onConfirm });
  };

  const requestSamplingName = (payload: BackendDatasetRequiresSampling, file: File, jobId: string) =>
    new Promise<string | null>((resolve) => {
      const baseName = payload.name.replace(/\.[^.]+$/, "");
      const suggestedName = `${baseName}_sample_500k.parquet`;
      setSamplingRequest({ ...payload, file, jobId, suggestedName, value: suggestedName, onResolve: resolve });
    });

  const normalizedQuery = query.trim().toLowerCase();

  const filteredAssets = useMemo(() => {
    if (!normalizedQuery) {
      return state.assets;
    }

    return state.assets.filter((asset) =>
      [asset.name, asset.description, asset.type, asset.status, ...asset.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [normalizedQuery, state.assets]);

  const filteredResources = useMemo(() => {
    if (!normalizedQuery) {
      return state.resources;
    }

    return state.resources.filter((resource) =>
      [resource.name, resource.description, resource.kind, ...resource.tags].join(" ").toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery, state.resources]);

  const recentAssets = useMemo(
    () =>
      [...state.assets]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [state.assets]
  );

  const catalogAssets = useMemo(() => {
    const normalizedTag = assetTagFilter.trim().toLowerCase();

    return filteredAssets.filter((asset) => {
      const matchesType = assetTypeFilter === "all" || asset.type === assetTypeFilter;
      const matchesStatus = assetStatusFilter === "all" || asset.status === assetStatusFilter;
      const matchesWorkspace = assetWorkspaceFilter === "all" || asset.workspaceId === assetWorkspaceFilter;
      const matchesTag = !normalizedTag || asset.tags.some((tag) => tag.toLowerCase().includes(normalizedTag));

      return matchesType && matchesStatus && matchesWorkspace && matchesTag;
    });
  }, [assetStatusFilter, assetTagFilter, assetTypeFilter, assetWorkspaceFilter, filteredAssets]);

  const unreadCount = state.notifications.filter((notification) => !notification.read).length;
  const selectedWorkspace = state.workspaces.find((workspace) => workspace.id === selectedProjectId);
  const activeWorkspaceName = selectedWorkspace?.name ?? "Workspace padrao";
  const activeWorkspaceDataAssets = state.assets.filter(
    (asset) => asset.workspaceId === (selectedProjectId || state.profile.defaultProjectId) && asset.type === "data" && asset.visibility !== "archived"
  );

  const toggleAuditPanel = (checked: boolean) => {
    setShowAuditPanel(checked);
    window.localStorage.setItem("sherlock-show-audit", checked ? "true" : "false");
    window.localStorage.removeItem("watson-clone-show-audit");
  };

  const logAction = (action: string, target: string) => {
    const next = appendAuditEvent(state, {
      actor: "local-user",
      action,
      target
    });
    setState(next);
    saveStudioState(next);
  };

  const updateState = (next: StudioState) => {
    setState(next);
    saveStudioState(next);
  };

  const markNotificationsRead = () => {
    const next = {
      ...state,
      notifications: state.notifications.map((notification) => ({ ...notification, read: true }))
    };
    updateState(appendAuditEvent(next, { actor: "local-user", action: "Marcou notificacoes como lidas", target: "Inbox" }));
  };

  const openView = (view: ViewId) => {
    openTab(view);
    if (view !== activeView) {
      logAction("Navegou para", view);
    }
  };

  const updateSelectedProject = (patch: Partial<Workspace>) => {
    const updatedAt = new Date().toISOString();
    const currentProject = state.workspaces.find((workspace) => workspace.id === selectedProjectId);
    const nextState = {
      ...state,
      workspaces: state.workspaces.map((workspace) =>
        workspace.id === selectedProjectId ? { ...workspace, ...patch, updatedAt } : workspace
      )
    };
    const target = patch.name ?? currentProject?.name ?? "Projeto";
    updateState(appendAuditEvent(nextState, { actor: "local-user", action: "Atualizou projeto", target }));
  };

  const createProject = () => {
    const createdAt = new Date().toISOString();
    const projectNumber = state.workspaces.filter((workspace) => workspace.type === "project").length + 1;
    const newProject: Workspace = {
      id: `project-${Date.now()}`,
      type: "project",
      name: `Novo projeto ${projectNumber}`,
      description: "Projeto local para experimentos de dados e IA.",
      status: "Active",
      updatedAt: createdAt,
      tags: ["novo"],
      storage: "Storage local",
      serviceIds: ["service-runtime", "service-object-storage"]
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        workspaces: [newProject, ...state.workspaces]
      },
      { actor: "local-user", action: "Criou projeto", target: newProject.name }
    );

    setSelectedProjectId(newProject.id);
    setActiveProjectTab("manage");
    openTab("projects", { workspaceId: newProject.id });
    updateState(nextState);
  };

  const createWorkspaceAsset = () => {
    workspaceAssetFileInputRef.current?.click();
  };

  const importWorkspaceAssets = async (fileList: Iterable<File> | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const jobs: WorkspaceUpload[] = files.map((file, index) => ({
      id: `workspace-upload-${Date.now()}-${index}`,
      name: file.name,
      status: "queued",
      progress: { phase: "reading", percent: 0, loadedBytes: 0, totalBytes: file.size, rows: 0, message: "Na fila de upload." }
    }));
    setWorkspaceUploads((current) => [...current.filter((item) => item.status !== "success"), ...jobs]);

    const imported: Array<{ file: File; name: string; totalRows: number; schema: string[]; backendDatasetId: string; backendSchema?: Array<{ name: string; type: string }>; bytes: number; sampled?: boolean; sampledFromRowCount?: number }> = [];
    for (const [index, job] of jobs.entries()) {
      const file = files[index];
      setWorkspaceUploads((current) => current.map((item) => item.id === job.id ? { ...item, status: "uploading", progress: { ...item.progress, message: "Preparando upload..." } } : item));
      try {
        const uploaded = await uploadDatasetToBackend(file, assetImportSeparator, (progress) =>
          setWorkspaceUploads((current) => current.map((item) => item.id === job.id ? { ...item, status: "uploading", progress } : item))
        );
        let ready: BackendDatasetReady;
        if (isSamplingResponse(uploaded)) {
          setWorkspaceUploads((current) => current.map((item) => item.id === job.id ? {
            ...item,
            status: "uploading",
            progress: { phase: "finalizing", percent: 95, loadedBytes: file.size, totalBytes: file.size, rows: uploaded.rowCount, message: `Dataset com ${uploaded.rowCount.toLocaleString("pt-BR")} linhas excede o teto. Aguardando amostragem.` }
          } : item));
          const sampleName = await requestSamplingName(uploaded, file, job.id);
          if (!sampleName) {
            await cancelDatasetStaging(uploaded.stagingId);
            setWorkspaceUploads((current) => current.map((item) => item.id === job.id ? {
              ...item,
              status: "error",
              error: "Amostragem cancelada. Nenhum asset foi criado.",
              progress: { ...item.progress, message: "Amostragem cancelada." }
            } : item));
            continue;
          }
          setWorkspaceUploads((current) => current.map((item) => item.id === job.id ? {
            ...item,
            status: "uploading",
            progress: { phase: "finalizing", percent: 98, loadedBytes: file.size, totalBytes: file.size, rows: uploaded.limit, message: "Criando amostra aleatoria de 500.000 linhas no backend." }
          } : item));
          ready = await sampleDatasetInBackend(uploaded.stagingId, sampleName, uploaded.limit);
        } else {
          ready = uploaded;
        }
        const schema = ready.columns;
        imported.push({ file, name: ready.name, totalRows: ready.rowCount, schema, backendDatasetId: ready.datasetId, backendSchema: ready.schema, bytes: ready.bytes, sampled: ready.sampled, sampledFromRowCount: ready.sampledFromRowCount });
        setWorkspaceUploads((current) => current.map((item) => item.id === job.id ? {
          ...item,
          status: "success",
          progress: { phase: "finalizing", percent: 100, loadedBytes: file.size, totalBytes: file.size, rows: ready.rowCount, message: ready.sampled ? "Amostra criada e importada no backend." : "Asset importado no backend." }
        } : item));
      } catch (error) {
        setWorkspaceUploads((current) => current.map((item) => item.id === job.id ? {
          ...item,
          status: "error",
          error: error instanceof Error ? error.message : "Falha ao ler o arquivo.",
          progress: { ...item.progress, message: "Falha no upload." }
        } : item));
      }
    }

    if (imported.length === 0) return;
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const now = new Date().toISOString();
    let assets = [...state.assets];
    let notifications = [...state.notifications];
    let nextState: StudioState = { ...state, assets, notifications };

    imported.forEach((item, index) => {
      const existingIndex = assets.findIndex((asset) => asset.workspaceId === workspaceId && asset.type === "data" && asset.name === item.name);
      const existing = existingIndex >= 0 ? assets[existingIndex] : undefined;
      const extension = item.name.split(".").pop()?.toUpperCase() || "DATA";
      const asset: Asset = {
        id: existing?.id ?? `asset-upload-${Date.now()}-${index}`,
        workspaceId,
        type: "data",
        name: item.name,
        description: item.sampled
          ? `Amostra operacional de ${item.totalRows.toLocaleString("pt-BR")} linhas criada a partir de ${item.sampledFromRowCount?.toLocaleString("pt-BR") ?? "dataset grande"} linhas.`
          : "Dataset convertido para Parquet no backend para preparo, analise e treino.",
        status: "Ready",
        version: (existing?.version ?? 0) + 1,
        tags: ["upload", "data", "parquet", extension.toLowerCase(), ...(item.sampled ? ["sampled", "500k"] : [])],
        updatedAt: now,
        lineage: existing?.lineage ?? [],
        metadata: {
          format: extension,
          separator: assetImportSeparator || "auto",
          storage: "backend",
          backendDatasetId: item.backendDatasetId,
          rows: String(item.totalRows),
          columns: String(item.schema.length),
          schema: item.schema.join(", "),
          schemaTypes: JSON.stringify(item.backendSchema ?? []),
          bytes: String(item.bytes),
          parquet: "true",
          sampled: item.sampled ? "true" : "false",
          sampledFromRowCount: item.sampledFromRowCount ? String(item.sampledFromRowCount) : ""
        },
        dependencies: [],
        visibility: "active"
      };
      assets = existing ? assets.map((candidate, candidateIndex) => candidateIndex === existingIndex ? asset : candidate) : [asset, ...assets];
      notifications = [{
        id: `notification-upload-${Date.now()}-${index}`,
        tone: "success",
        title: existing ? "Data asset atualizado" : "Data asset criado",
        detail: `${asset.name} foi adicionado ao workspace ${state.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "ativo"}.`,
        createdAt: now,
        read: false
      }, ...notifications];
      nextState = appendAuditEvent({ ...nextState, assets, notifications }, { actor: "local-user", action: existing ? "Atualizou data asset" : "Criou data asset por upload", target: asset.name });
      setSelectedAssetId(asset.id);
    });
    updateState(nextState);
  };

  const toggleProjectService = (serviceId: string) => {
    const project = state.workspaces.find((workspace) => workspace.id === selectedProjectId);
    if (!project) return;

    const current = new Set(project.serviceIds ?? []);
    if (current.has(serviceId)) {
      current.delete(serviceId);
    } else {
      current.add(serviceId);
    }

    updateSelectedProject({ serviceIds: Array.from(current) });
  };

  const saveAssetNote = (assetId: string, notes: string) => {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset || (asset.notes ?? "") === notes) return;

    const nextState = appendAuditEvent(
      {
        ...state,
        assets: state.assets.map((item) => (item.id === assetId ? { ...item, notes, updatedAt: new Date().toISOString() } : item))
      },
      { actor: "local-user", action: "Atualizou nota de asset", target: asset.name }
    );
    updateState(nextState);
  };

  const exportProject = () => {
    const project = state.workspaces.find((workspace) => workspace.id === selectedProjectId);
    if (!project) return;

    const payload = {
      exportedAt: new Date().toISOString(),
      project,
      assets: state.assets.filter((asset) => asset.workspaceId === project.id),
      jobs: state.jobs.filter((job) => job.workspaceId === project.id)
    };
    setExportText(JSON.stringify(payload, null, 2));
    setImportText("");
    logAction("Exportou pacote de projeto", project.name);
  };

  const importProject = () => {
    try {
      const payload = JSON.parse(importText || exportText) as {
        project?: Workspace;
        assets?: Asset[];
        jobs?: StudioState["jobs"];
      };

      if (!payload.project) return;

      const now = Date.now();
      const importedId = `project-imported-${now}`;
      const importedProject: Workspace = {
        ...payload.project,
        id: importedId,
        type: "project",
        name: `${payload.project.name} importado`,
        status: "Active",
        updatedAt: new Date().toISOString()
      };
      const importedAssets = (payload.assets ?? []).map((asset, index) => ({
        ...asset,
        id: `${asset.id}-imported-${now}-${index}`,
        workspaceId: importedId,
        updatedAt: new Date().toISOString()
      }));
      const importedJobs = (payload.jobs ?? []).map((job, index) => ({
        ...job,
        id: `${job.id}-imported-${now}-${index}`,
        workspaceId: importedId
      }));
      const nextState = appendAuditEvent(
        {
          ...state,
          workspaces: [importedProject, ...state.workspaces],
          assets: [...importedAssets, ...state.assets],
          jobs: [...importedJobs, ...state.jobs]
        },
        { actor: "local-user", action: "Importou pacote de projeto", target: importedProject.name }
      );

      setSelectedProjectId(importedId);
      setActiveProjectTab("overview");
      openTab("projects", { workspaceId: importedId });
      setImportText("");
      setExportText("");
      updateState(nextState);
    } catch {
      updateState(
        appendAuditEvent(state, {
          actor: "local-user",
          action: "Falhou ao importar pacote",
          target: "JSON invalido"
        })
      );
    }
  };

  const archiveProject = () => {
    const project = state.workspaces.find((workspace) => workspace.id === selectedProjectId);
    if (!project) return;

    updateSelectedProject({ status: project.status === "Archived" ? "Active" : "Archived" });
  };

  const deleteWorkspace = (workspaceId: string) => {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    if (!window.confirm(`Excluir o workspace "${workspace.name}" por completo? Todos os assets e jobs associados serao apagados permanentemente.`)) return;

    const remainingWorkspaces = state.workspaces.filter((item) => item.id !== workspaceId);
    const nextSelectedProjectId = remainingWorkspaces.find((item) => item.type === "project")?.id ?? remainingWorkspaces[0]?.id ?? "";
    const activeAssetWasRemoved = state.assets.some((asset) => asset.id === selectedAssetId && asset.workspaceId === workspaceId);
    const nextState = appendAuditEvent(
      {
        ...state,
        profile: {
          ...state.profile,
          defaultProjectId: state.profile.defaultProjectId === workspaceId ? nextSelectedProjectId : state.profile.defaultProjectId
        },
        workspaces: remainingWorkspaces,
        assets: state.assets.filter((asset) => asset.workspaceId !== workspaceId),
        jobs: state.jobs.filter((job) => job.workspaceId !== workspaceId)
      },
      { actor: "local-user", action: "Removeu workspace", target: workspace.name }
    );

    setSelectedProjectId(nextSelectedProjectId);
    if (activeAssetWasRemoved) setSelectedAssetId("");
    if (visualizationAssetId && state.assets.some((asset) => asset.id === visualizationAssetId && asset.workspaceId === workspaceId)) {
      setVisualizationAssetId("");
      setVisualizationFlowId("");
    }
    setActiveProjectTab("overview");
    setTabs((current) => current.filter((tab) => tab.view === "home" || tab.workspaceId !== workspaceId));
    if (activeView === "projects" && workspaceId === selectedProjectId) setActiveTabId(homeTab.id);
    updateState(nextState);
  };

  const deleteProject = () => deleteWorkspace(selectedProjectId);

  const duplicateAsset = (assetId: string) => {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;

    const now = new Date().toISOString();
    const duplicatedAsset: Asset = {
      ...asset,
      id: `asset-${Date.now()}`,
      name: `${asset.name} copia`,
      status: "Draft",
      version: 1,
      updatedAt: now,
      lineage: [asset.id],
      dependencies: [asset.id],
      visibility: "active"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [duplicatedAsset, ...state.assets]
      },
      { actor: "local-user", action: "Duplicou asset", target: asset.name }
    );
    setSelectedAssetId(duplicatedAsset.id);
    updateState(nextState);
  };

  const toggleAssetArchive = (assetId: string) => {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;

    const archived = asset.status !== "Archived";
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: state.assets.map((item) =>
          item.id === assetId
            ? {
                ...item,
                status: archived ? "Archived" : "Draft",
                visibility: archived ? "archived" : "active",
                updatedAt: new Date().toISOString()
              }
            : item
        )
      },
      { actor: "local-user", action: archived ? "Arquivou asset" : "Reativou asset", target: asset.name }
    );
    updateState(nextState);
  };

  const removeAsset = (assetId: string) => {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    if (!window.confirm(`Remover o asset "${asset.name}"? Esta acao tambem limpa referencias de lineage/dependencias.`)) return;

    const remainingAssets = state.assets.filter((item) => item.id !== assetId);
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: remainingAssets.map((item) => ({
          ...item,
          lineage: item.lineage.filter((lineageId) => lineageId !== assetId),
          dependencies: (item.dependencies ?? []).filter((dependencyId) => dependencyId !== assetId)
        }))
      },
      { actor: "local-user", action: "Removeu asset", target: asset.name }
    );
    setSelectedAssetId(remainingAssets[0]?.id ?? "");
    updateState(nextState);
  };

  const createAssetVersion = (assetId: string) => {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;

    const nextState = appendAuditEvent(
      {
        ...state,
        assets: state.assets.map((item) =>
          item.id === assetId ? { ...item, version: item.version + 1, updatedAt: new Date().toISOString() } : item
        )
      },
      { actor: "local-user", action: "Criou versao de asset", target: asset.name }
    );
    updateState(nextState);
  };

  const openWorkspace = (workspaceId: string) => {
    setSelectedProjectId(workspaceId);
    setActiveProjectTab("overview");
    openTab("projects", { workspaceId });
    logAction("Abriu workspace", state.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId);
  };

  const handleAssetAction = (asset: Asset, action: AssetAction) => {
    if (action === "duplicate") return duplicateAsset(asset.id);
    if (action === "version") return createAssetVersion(asset.id);
    if (action === "archive") return toggleAssetArchive(asset.id);
    if (action === "remove") return removeAsset(asset.id);

    setSelectedAssetId(asset.id);
    setSelectedProjectId(asset.workspaceId);
    if (asset.type === "data-visualization-flow") {
      setVisualizationFlowId(asset.id);
      setVisualizationAssetId(asset.metadata?.sourceAssetId ?? "");
      openTab("visualization", { workspaceId: asset.workspaceId, assetId: asset.metadata?.sourceAssetId ?? "", flowId: asset.id });
      logAction("Abriu fluxo de visualizacao", asset.name);
      return;
    }
    if (asset.type === "data") {
      if (action === "visualize") {
        setVisualizationAssetId(asset.id);
        setVisualizationFlowId("");
        openTab("visualization", { workspaceId: asset.workspaceId, assetId: asset.id });
        logAction("Abriu canvas de visualizacao", asset.name);
        return;
      }
      openTab("data", {
        workspaceId: asset.workspaceId,
        assetId: asset.id,
        dataIntent: { assetId: asset.id, section: "prepare", requestId: Date.now() },
      });
      logAction("Abriu Data Refinery", asset.name);
      return;
    }

    const destination: Partial<Record<AssetType, ViewId>> = {
      notebook: "runtime",
      script: "runtime",
      "prompt-template": "prompt",
      model: "autoai",
      "tuned-model": "autoai",
      agent: "agent",
      "vector-index": "rag",
      "ai-service": "services",
      "data-refinery-flow": "data",
      evaluation: "autoai",
      connection: "services",
      environment: "runtime",
      job: "runtime",
      pipeline: "runtime",
      function: "runtime"
    };
    openTab(destination[asset.type] ?? "assets", { workspaceId: asset.workspaceId, assetId: asset.id, notebookId: asset.type === "notebook" ? asset.id : undefined });
    logAction("Abriu asset", asset.name);
  };

  const saveVisualizationFlow = (flow: VisualizationFlow, existingId?: string, requestedName?: string) => {
    const now = new Date().toISOString();
    const source = state.assets.find((asset) => asset.id === flow.sourceAssetId);
    if (!source) return;
    const existing = existingId ? state.assets.find((asset) => asset.id === existingId) : undefined;
    if (!requestedName) {
      requestAssetName(existing?.name ?? `${source.name.replace(/\.[^.]+$/, "")}_visualization`, (name) => saveVisualizationFlow(flow, existingId, name));
      return;
    }
    const asset: Asset = {
      id: existing?.id ?? `asset-visualization-${Date.now()}`,
      workspaceId: source.workspaceId,
      type: "data-visualization-flow",
      name: requestedName,
      description: "Fluxo visual versionado, executado no motor local.",
      status: "Ready",
      version: (existing?.version ?? 0) + 1,
      tags: ["visualization", "dag", "data"],
      updatedAt: now,
      lineage: [source.id],
      dependencies: [source.id],
      visibility: "active",
      metadata: { sourceAssetId: source.id, definition: JSON.stringify(flow), nodes: String(flow.nodes.length), connections: String(flow.connections.length) }
    };
    updateState(appendAuditEvent({ ...state, assets: existing ? state.assets.map((item) => item.id === existing.id ? asset : item) : [asset, ...state.assets] }, { actor: "local-user", action: existing ? "Atualizou fluxo de visualização" : "Criou fluxo de visualização", target: asset.name }));
  };

  const createRefinedDataAsset = (
    name: string,
    rows: DataRow[],
    steps: PrepStep[],
    execution?: {
      mode: "preview" | "full-file-stream" | "backend-parquet";
      totalRows?: number;
      outputRows?: number;
      outputBytes?: number;
      schema?: string[];
      backendDatasetId?: string;
      backendSchema?: Array<{ name: string; type: string }>;
      parquet?: boolean;
    },
    outputName?: string,
  ) => {
    const now = new Date().toISOString();
    const sourceName = name.replace(/\.[^.]+$/, "");
    const schema = execution?.schema ?? (rows[0] ? Object.keys(rows[0]) : []);
    const outputRows = execution?.outputRows ?? rows.length;
    const refinedAsset: Asset = {
      id: `asset-refined-${Date.now()}`,
      workspaceId: selectedProjectId || state.profile.defaultProjectId,
      type: "data",
      name: outputName ?? `${sourceName}_refined.csv`,
      description: `Dataset refinado com ${steps.length} etapas no Data Refinery visual.`,
      status: "Ready",
      version: 1,
      tags: ["refined", "data-refinery", "mvp4"],
      updatedAt: now,
      lineage: state.assets.find((asset) => asset.name === name)?.id ? [state.assets.find((asset) => asset.name === name)!.id] : [],
      metadata: {
        rows: String(outputRows),
        sourceRows: String(execution?.totalRows ?? rows.length),
        columns: String(schema.length),
        steps: String(steps.length),
        format: execution?.parquet ? "Parquet" : "CSV",
        schema: schema.join(", "),
        executionMode: execution?.mode ?? "preview",
        outputBytes: String(execution?.outputBytes ?? new Blob([JSON.stringify(rows.slice(0, 1000))]).size),
        rowsJson: JSON.stringify(rows.slice(0, 1000)),
        backendDatasetId: execution?.backendDatasetId ?? "",
        backendSchema: execution?.backendSchema ? JSON.stringify(execution.backendSchema) : "",
        parquet: execution?.parquet ? "true" : "false",
        storage: execution?.backendDatasetId ? "backend" : "localStorage"
      },
      dependencies: [],
      visibility: "active"
    };
    const job = {
      id: `job-data-refinery-${Date.now()}`,
      workspaceId: refinedAsset.workspaceId,
      name: `Data Refinery - ${refinedAsset.name}`,
      status: "Succeeded" as const,
      startedAt: now,
      duration: "3s"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [refinedAsset, ...state.assets],
        jobs: [job, ...state.jobs],
        notifications: [
          {
            id: `notification-data-${Date.now()}`,
            tone: "success",
            title: "Dataset refinado",
            detail: `${refinedAsset.name} foi criado com ${steps.length} etapas e ${outputRows.toLocaleString("pt-BR")} linhas de saida.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Executou Data Refinery", target: refinedAsset.name }
    );
    setSelectedAssetId(refinedAsset.id);
    updateState(nextState);
  };

  const createPromptTemplateAsset = (payload: {
    name: string;
    description: string;
    template: string;
    variables: string[];
    modelId: string;
    parameters: PromptParameters;
    mode: PromptMode;
    task: PromptTask;
  }) => {
    const now = new Date().toISOString();
    const promptAsset: Asset = {
      id: `asset-prompt-${Date.now()}`,
      workspaceId: selectedProjectId || state.profile.defaultProjectId,
      type: "prompt-template",
      name: payload.name,
      description: payload.description,
      status: "Ready",
      version: 1,
      tags: ["prompt", payload.task, "mvp5"],
      updatedAt: now,
      lineage: [],
      metadata: {
        model: payload.modelId,
        mode: payload.mode,
        variables: payload.variables.join(", "),
        temperature: String(payload.parameters.temperature),
        maxTokens: String(payload.parameters.maxTokens),
        topP: String(payload.parameters.topP),
        seed: String(payload.parameters.seed),
        templateLength: String(payload.template.length)
      },
      dependencies: [],
      visibility: "active"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [promptAsset, ...state.assets],
        notifications: [
          {
            id: `notification-prompt-${Date.now()}`,
            tone: "success",
            title: "Prompt salvo",
            detail: `${promptAsset.name} foi registrado como prompt template asset.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Salvou prompt template", target: promptAsset.name }
    );
    setSelectedAssetId(promptAsset.id);
    updateState(nextState);
  };

  const createPromptNotebookAsset = (payload: { name: string; notebook: string; modelId: string; usesRag: boolean }) => {
    const now = new Date().toISOString();
    const notebookAsset: Asset = {
      id: `asset-prompt-notebook-${Date.now()}`,
      workspaceId: selectedProjectId || state.profile.defaultProjectId,
      type: "notebook",
      name: payload.name,
      description: "Notebook de deployment gerado pelo Prompt Lab local.",
      status: "Ready",
      version: 1,
      tags: ["notebook", "prompt-lab", "deployment", "mvp5"],
      updatedAt: now,
      lineage: [],
      metadata: {
        model: payload.modelId,
        usesRag: payload.usesRag ? "true" : "false",
        format: "ipynb",
        bytes: String(new Blob([payload.notebook]).size)
      },
      dependencies: payload.usesRag ? state.assets.filter((asset) => asset.type === "vector-index").slice(0, 1).map((asset) => asset.id) : [],
      visibility: "active"
    };
    const job = {
      id: `job-prompt-notebook-${Date.now()}`,
      workspaceId: notebookAsset.workspaceId,
      name: `Export notebook - ${notebookAsset.name}`,
      status: "Succeeded" as const,
      startedAt: now,
      duration: "1s"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [notebookAsset, ...state.assets],
        jobs: [job, ...state.jobs],
        notifications: [
          {
            id: `notification-prompt-notebook-${Date.now()}`,
            tone: "success",
            title: "Notebook exportado",
            detail: `${notebookAsset.name} foi criado como asset local.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Exportou notebook de prompt", target: notebookAsset.name }
    );
    setSelectedAssetId(notebookAsset.id);
    updateState(nextState);
  };

  const createVectorIndexAsset = (payload: { name: string; documentCount: number; chunkCount: number; embeddingModel: string }) => {
    const now = new Date().toISOString();
    const indexAsset: Asset = {
      id: `asset-vector-index-${Date.now()}`,
      workspaceId: selectedProjectId || state.profile.defaultProjectId,
      type: "vector-index",
      name: payload.name,
      description: `Indice vetorial local com ${payload.documentCount} documento(s) e ${payload.chunkCount} chunks.`,
      status: "Ready",
      version: 1,
      tags: ["rag", "embeddings", "mvp6"],
      updatedAt: now,
      lineage: [],
      metadata: {
        documents: String(payload.documentCount),
        chunks: String(payload.chunkCount),
        embedding: payload.embeddingModel,
        storage: "localStorage"
      },
      dependencies: [],
      visibility: "active"
    };
    const job = {
      id: `job-vector-index-${Date.now()}`,
      workspaceId: indexAsset.workspaceId,
      name: `Build vector index - ${indexAsset.name}`,
      status: "Succeeded" as const,
      startedAt: now,
      duration: "2s"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [indexAsset, ...state.assets],
        jobs: [job, ...state.jobs],
        notifications: [
          {
            id: `notification-vector-index-${Date.now()}`,
            tone: "success",
            title: "Indice vetorial criado",
            detail: `${indexAsset.name} foi registrado como vector-index asset.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Criou indice vetorial", target: indexAsset.name }
    );
    setSelectedAssetId(indexAsset.id);
    updateState(nextState);
  };

  const promoteRagService = (payload: { name: string; indexName: string; topK: number; threshold: number }) => {
    const now = new Date().toISOString();
    const indexAsset = state.assets.find((asset) => asset.type === "vector-index" && asset.name === payload.indexName);
    const serviceAsset: Asset = {
      id: `asset-rag-service-${Date.now()}`,
      workspaceId: selectedProjectId || state.profile.defaultProjectId,
      type: "ai-service",
      name: payload.name,
      description: `AI service local para consulta RAG usando o indice ${payload.indexName}.`,
      status: "Deployed",
      version: 1,
      tags: ["rag", "ai-service", "grounding", "mvp6"],
      updatedAt: now,
      lineage: indexAsset ? [indexAsset.id] : [],
      metadata: {
        endpoint: `/mock/ai-services/${payload.name}`,
        index: payload.indexName,
        topK: String(payload.topK),
        threshold: String(payload.threshold),
        runtime: "local mock"
      },
      dependencies: indexAsset ? [indexAsset.id] : [],
      visibility: "active"
    };
    const job = {
      id: `job-rag-service-${Date.now()}`,
      workspaceId: serviceAsset.workspaceId,
      name: `Promote RAG service - ${serviceAsset.name}`,
      status: "Succeeded" as const,
      startedAt: now,
      duration: "2s"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [serviceAsset, ...state.assets],
        jobs: [job, ...state.jobs],
        notifications: [
          {
            id: `notification-rag-service-${Date.now()}`,
            tone: "success",
            title: "RAG promovido",
            detail: `${serviceAsset.name} foi criado como AI service local.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Promoveu RAG como AI service", target: serviceAsset.name }
    );
    setSelectedAssetId(serviceAsset.id);
    updateState(nextState);
  };

  const createAgentAsset = (payload: AgentConfig) => {
    const now = new Date().toISOString();
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const existing = state.assets.find(
      (asset) => asset.workspaceId === workspaceId && asset.type === "agent" && asset.name === payload.name && asset.visibility !== "archived"
    );
    const agentAsset: Asset = {
      ...(existing ?? {}),
      id: `asset-agent-${Date.now()}`,
      workspaceId,
      type: "agent",
      name: payload.name,
      description: payload.objective,
      status: "Ready",
      version: existing ? existing.version + 1 : 1,
      tags: ["agent", "agent-lab", "guardrails", "mvp7"],
      updatedAt: now,
      lineage: existing ? [existing.id, ...existing.lineage] : [],
      metadata: {
        objective: payload.objective,
        instructions: payload.instructions,
        model: payload.modelId,
        tools: payload.enabledTools.join(", "),
        maxToolCalls: String(payload.maxToolCalls),
        blockedWords: payload.blockedWords.join(", "),
        detectPii: payload.detectPii ? "true" : "false",
        outputFormat: payload.outputFormat,
        instructionLength: String(payload.instructions.length)
      },
      dependencies: [],
      visibility: "active"
    };
    const nextAssets = existing ? state.assets.map((asset) => (asset.id === existing.id ? { ...agentAsset, id: existing.id } : asset)) : [agentAsset, ...state.assets];
    const savedAssetId = existing ? existing.id : agentAsset.id;
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: nextAssets,
        notifications: [
          {
            id: `notification-agent-${Date.now()}`,
            tone: "success",
            title: "Agente salvo",
            detail: existing ? `${agentAsset.name} foi atualizado para v${agentAsset.version}.` : `${agentAsset.name} foi registrado como agent asset.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Salvou agente", target: agentAsset.name }
    );
    setSelectedAssetId(savedAssetId);
    updateState(nextState);
  };

  const deployAgentService = (payload: AgentConfig) => {
    const now = new Date().toISOString();
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const sourceAgent = state.assets.find((asset) => asset.workspaceId === workspaceId && asset.type === "agent" && asset.name === payload.name && asset.visibility !== "archived");
    const existing = state.assets.find(
      (asset) => asset.workspaceId === workspaceId && asset.type === "ai-service" && asset.name === `${payload.name}_service` && asset.visibility !== "archived"
    );
    const serviceAsset: Asset = {
      ...(existing ?? {}),
      id: `asset-agent-service-${Date.now()}`,
      workspaceId,
      type: "ai-service",
      name: `${payload.name}_service`,
      description: `AI service local para o agente ${payload.name}.`,
      status: "Deployed",
      version: existing ? existing.version + 1 : 1,
      tags: ["agent", "ai-service", "deployment", "mvp7"],
      updatedAt: now,
      lineage: sourceAgent ? [sourceAgent.id] : [],
      metadata: {
        endpoint: `/mock/agent-services/${payload.name}`,
        model: payload.modelId,
        tools: payload.enabledTools.join(", "),
        guardrails: `tool limit ${payload.maxToolCalls}, pii ${payload.detectPii ? "on" : "off"}`,
        runtime: "local mock"
      },
      dependencies: sourceAgent ? [sourceAgent.id] : [],
      visibility: "active"
    };
    const job = {
      id: `job-agent-service-${Date.now()}`,
      workspaceId: serviceAsset.workspaceId,
      name: `Deploy agent service - ${serviceAsset.name}`,
      status: "Succeeded" as const,
      startedAt: now,
      duration: "2s"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: existing ? state.assets.map((asset) => (asset.id === existing.id ? { ...serviceAsset, id: existing.id } : asset)) : [serviceAsset, ...state.assets],
        jobs: [job, ...state.jobs],
        notifications: [
          {
            id: `notification-agent-service-${Date.now()}`,
            tone: "success",
            title: "Agente deployado",
            detail: existing ? `${serviceAsset.name} foi atualizado para v${serviceAsset.version}.` : `${serviceAsset.name} foi criado como AI service local.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Deployou agente como AI service", target: serviceAsset.name }
    );
    setSelectedAssetId(existing ? existing.id : serviceAsset.id);
    updateState(nextState);
  };

  const registerAgentEvaluation = (payload: { config: AgentConfig; result: AgentEvaluationResult }) => {
    const now = new Date().toISOString();
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const agent = state.assets.find((asset) => asset.workspaceId === workspaceId && asset.type === "agent" && asset.name === payload.config.name && asset.visibility !== "archived");
    const existing = state.assets.find(
      (asset) => asset.workspaceId === workspaceId && asset.type === "evaluation" && asset.name === `${payload.config.name}_evaluation` && asset.visibility !== "archived"
    );
    const evaluationAsset: Asset = {
      ...(existing ?? {}),
      id: `asset-agent-evaluation-${Date.now()}`,
      workspaceId,
      type: "evaluation",
      name: `${payload.config.name}_evaluation`,
      description: `Avaliacao local do agente: ${payload.result.passed} passou, ${payload.result.failed} falhou.`,
      status: payload.result.failed === 0 ? "Ready" : "Failed",
      version: existing ? existing.version + 1 : 1,
      tags: ["agent", "evaluation", "mvp7"],
      updatedAt: now,
      lineage: agent ? [agent.id] : [],
      metadata: {
        passed: String(payload.result.passed),
        failed: String(payload.result.failed),
        cases: String(payload.result.cases.length),
        resultId: payload.result.id,
        lastRunAt: now
      },
      dependencies: agent ? [agent.id] : [],
      visibility: "active"
    };
    const job = {
      id: `job-agent-evaluation-${Date.now()}`,
      workspaceId: evaluationAsset.workspaceId,
      name: `Evaluate agent - ${payload.config.name}`,
      status: "Succeeded" as const,
      startedAt: now,
      duration: "1s"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: existing ? state.assets.map((asset) => (asset.id === existing.id ? { ...evaluationAsset, id: existing.id } : asset)) : [evaluationAsset, ...state.assets],
        jobs: [job, ...state.jobs],
        notifications: [
          {
            id: `notification-agent-evaluation-${Date.now()}`,
            tone: payload.result.failed === 0 ? "success" : "warning",
            title: "Avaliacao de agente concluida",
            detail: `${payload.result.passed}/${payload.result.passed + payload.result.failed} casos passaram.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Avaliou agente", target: payload.config.name }
    );
    setSelectedAssetId(existing ? existing.id : evaluationAsset.id);
    updateState(nextState);
  };

  const createRuntimeNotebookAsset = (payload: { name: string; content: string; environmentId: RuntimeKind }) => {
    const now = new Date().toISOString();
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const existing = state.assets.find(
      (item) => item.workspaceId === workspaceId && item.type === "notebook" && item.name === payload.name && item.visibility !== "archived"
    );
    const asset: Asset = {
      ...(existing ?? {}),
      id: `asset-runtime-notebook-${Date.now()}`,
      workspaceId,
      type: "notebook",
      name: payload.name,
      description: "Notebook criado no Runtime Lab local.",
      status: "Ready",
      version: existing ? existing.version + 1 : 1,
      tags: ["notebook", "runtime", "mvp8"],
      updatedAt: now,
      lineage: existing ? [existing.id, ...existing.lineage] : [],
      metadata: {
        environment: payload.environmentId,
        format: "ipynb-text",
        cells: String((payload.content.match(/^%%/gm) ?? []).length || 1),
        bytes: String(new Blob([payload.content]).size),
        content: payload.content
      },
      dependencies: [],
      visibility: "active"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: existing ? state.assets.map((item) => (item.id === existing.id ? { ...asset, id: existing.id } : item)) : [asset, ...state.assets],
        notifications: [
          {
            id: `notification-runtime-notebook-${Date.now()}`,
            tone: "success",
            title: "Notebook salvo",
            detail: existing ? `${asset.name} foi atualizado para v${asset.version}.` : `${asset.name} foi salvo como asset.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Salvou notebook", target: asset.name }
    );
    setSelectedAssetId(existing ? existing.id : asset.id);
    updateState(nextState);
  };

  const saveVisualNotebook = (
    payload: { assetId?: string; suggestedName: string; document: VisualNotebookDocument },
    onSaved: (asset: Pick<Asset, "id" | "name">) => void,
  ) => {
    const now = new Date().toISOString();
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const suggestedName = payload.suggestedName.replace(/\.ipynb$/i, "").trim().toLowerCase();
    const existing = payload.assetId
      ? state.assets.find((asset) => asset.id === payload.assetId)
      : state.assets.find((asset) =>
        asset.workspaceId === workspaceId &&
        asset.type === "notebook" &&
        asset.visibility !== "archived" &&
        asset.name.replace(/\.ipynb$/i, "").trim().toLowerCase() === suggestedName,
      );
    requestAssetName(existing?.name ?? payload.suggestedName, (name) => {
      const notebookAsset: Asset = {
        ...(existing ?? {}),
        id: existing?.id ?? `asset-visual-notebook-${Date.now()}`,
        workspaceId,
        type: "notebook",
        name: name.endsWith(".ipynb") ? name : `${name}.ipynb`,
        description: "Notebook visual com Markdown e snapshots de fluxos de visualização.",
        status: "Ready",
        version: (existing?.version ?? 0) + 1,
        tags: ["notebook", "visualization", "markdown"],
        updatedAt: now,
        lineage: existing ? [existing.id, ...existing.lineage] : [],
        metadata: {
          format: "visual-notebook-v1",
          cells: String(payload.document.cells.length),
          document: JSON.stringify(payload.document),
          bytes: String(new Blob([JSON.stringify(payload.document)]).size)
        },
        dependencies: Array.from(new Set(payload.document.cells.flatMap((cell) => cell.type === "markdown" ? [] : [cell.flowAssetId]))),
        visibility: "active"
      };
      const nextState = appendAuditEvent(
        { ...state, assets: existing ? state.assets.map((asset) => asset.id === existing.id ? notebookAsset : asset) : [notebookAsset, ...state.assets] },
        { actor: "local-user", action: existing ? "Atualizou notebook" : "Criou notebook", target: notebookAsset.name }
      );
      setSelectedAssetId(notebookAsset.id);
      updateState(nextState);
      onSaved(notebookAsset);
    });
  };

  const createRuntimeScriptAsset = (payload: { name: string; content: string; environmentId: RuntimeKind }) => {
    const now = new Date().toISOString();
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const existing = state.assets.find(
      (item) => item.workspaceId === workspaceId && item.type === "script" && item.name === payload.name && item.visibility !== "archived"
    );
    const asset: Asset = {
      ...(existing ?? {}),
      id: `asset-runtime-script-${Date.now()}`,
      workspaceId,
      type: "script",
      name: payload.name,
      description: "Script Python criado no Runtime Lab local.",
      status: "Ready",
      version: existing ? existing.version + 1 : 1,
      tags: ["script", "python", "runtime", "mvp8"],
      updatedAt: now,
      lineage: existing ? [existing.id, ...existing.lineage] : [],
      metadata: {
        environment: payload.environmentId,
        language: "Python",
        lines: String(payload.content.split(/\r?\n/).length),
        bytes: String(new Blob([payload.content]).size),
        content: payload.content
      },
      dependencies: [],
      visibility: "active"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: existing ? state.assets.map((item) => (item.id === existing.id ? { ...asset, id: existing.id } : item)) : [asset, ...state.assets],
        notifications: [
          {
            id: `notification-runtime-script-${Date.now()}`,
            tone: "success",
            title: "Script salvo",
            detail: existing ? `${asset.name} foi atualizado para v${asset.version}.` : `${asset.name} foi salvo como asset.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Salvou script", target: asset.name }
    );
    setSelectedAssetId(existing ? existing.id : asset.id);
    updateState(nextState);
  };

  const registerRuntimeJob = (execution: RuntimeExecution) => {
    const now = new Date().toISOString();
    const job = {
      id: `job-runtime-${Date.now()}`,
      workspaceId: selectedProjectId || state.profile.defaultProjectId,
      name: `Runtime - ${execution.assetName}`,
      status: execution.status,
      startedAt: execution.startedAt,
      duration: execution.duration
    };
    const artifactAsset: Asset = {
      id: `asset-runtime-artifact-${Date.now()}`,
      workspaceId: selectedProjectId || state.profile.defaultProjectId,
      type: "job",
      name: `${execution.assetName}_artifacts`,
      description: `Artefatos de saida do job ${execution.assetName}.`,
      status: execution.status === "Failed" ? "Failed" : "Ready",
      version: 1,
      tags: ["job-artifact", "runtime", "mvp8"],
      updatedAt: now,
      lineage: [],
      metadata: {
        executionId: execution.id,
        environment: execution.environmentId,
        artifacts: execution.artifacts.map((artifact) => artifact.name).join(", "),
        logLines: String(execution.logs.length)
      },
      dependencies: [],
      visibility: "active"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [artifactAsset, ...state.assets],
        jobs: [job, ...state.jobs],
        notifications: [
          {
            id: `notification-runtime-job-${Date.now()}`,
            tone: execution.status === "Failed" ? "danger" : "success",
            title: "Job de runtime concluido",
            detail: `${job.name}: ${execution.status}.`,
            createdAt: now,
            read: false
          },
          ...state.notifications
        ]
      },
      { actor: "local-user", action: "Executou notebook/script", target: execution.assetName }
    );
    setSelectedAssetId(artifactAsset.id);
    updateState(nextState);
  };

  const createAutoAiModelAsset = ({ config, trial, explanation }: { config: AutoAiConfig; trial: TrialResult; explanation: string }) => {
    const now = new Date().toISOString();
    const workspaceId = selectedProjectId || state.profile.defaultProjectId;
    const modelId = `asset-autoai-model-${Date.now()}`;
    const evaluationId = `asset-autoai-evaluation-${Date.now()}`;
    const modelAsset: Asset = {
      id: modelId,
      workspaceId,
      type: "model",
      name: `${config.name || "Experimento AutoAI"} - melhor modelo`,
      description: explanation,
      status: "Ready",
      version: 1,
      tags: ["autoai", "mvp9", config.task, trial.algorithm],
      updatedAt: now,
      lineage: [config.datasetId],
      dependencies: [config.datasetId],
      metadata: {
        task: config.task,
        target: config.target || "nao aplicavel",
        metric: trial.metric,
        score: String(trial.score),
        algorithm: trial.algorithm,
        validation: config.validation,
        searchStrategy: config.searchStrategy,
        parameters: JSON.stringify(trial.parameters),
        techniques: trial.techniques.join(", "),
        experimentConfig: JSON.stringify(config)
      },
      visibility: "active"
    };
    const evaluationAsset: Asset = {
      id: evaluationId,
      workspaceId,
      type: "evaluation",
      name: `${config.name || "Experimento AutoAI"} - avaliacao`,
      description: `Resultado do trial vencedor #${trial.rank}, com score ${trial.score}.`,
      status: "Ready",
      version: 1,
      tags: ["autoai", "evaluation", "mvp9"],
      updatedAt: now,
      lineage: [modelId],
      dependencies: [modelId, config.datasetId],
      metadata: {
        metric: trial.metric,
        score: String(trial.score),
        estimatedCost: String(trial.estimatedCost),
        durationSeconds: String(trial.durationSeconds),
        featureImportance: JSON.stringify(trial.featureImportance)
      },
      visibility: "active"
    };
    const nextState = appendAuditEvent(
      {
        ...state,
        assets: [modelAsset, evaluationAsset, ...state.assets],
        jobs: [{ id: `job-autoai-${Date.now()}`, workspaceId, name: `AutoAI - ${config.name}`, status: "Succeeded", startedAt: now, duration: `${trial.durationSeconds}s` }, ...state.jobs],
        notifications: [{ id: `notification-autoai-${Date.now()}`, tone: "success", title: "Modelo AutoAI salvo", detail: `${modelAsset.name} esta pronto para uso como asset.`, createdAt: now, read: false }, ...state.notifications]
      },
      { actor: "local-user", action: "Salvou modelo AutoAI", target: modelAsset.name }
    );
    setSelectedAssetId(modelAsset.id);
    updateState(nextState);
  };

  const sectionTitle: Record<ViewId, string> = {
    home: "Home",
    projects: "Projetos",
    assets: "Assets",
    data: "Dados",
    visualization: "Visualizacao",
    autoai: "AutoAI",
    prompt: "Prompt Lab",
    rag: "RAG Lab",
    agent: "Agent Lab",
    runtime: "Notebooks",
    recent: "Recentes",
    resources: "Resource Hub",
    services: "Servicos",
    notifications: "Notificacoes"
  };
  const sectionMvp: Partial<Record<ViewId, string>> = {
    data: "MVP 4",
    autoai: "MVP 9",
    prompt: "MVP 5",
    rag: "MVP 6",
    agent: "MVP 7",
    runtime: "MVP 8"
  };
  const sectionEyebrow = sectionMvp[activeView] ? `${sectionMvp[activeView]} - ${sectionTitle[activeView]}` : sectionTitle[activeView];

  const renderVisualizationView = (tab: StudioTab) => <VisualizationCanvasView
    dataAssets={state.assets.filter((asset) => asset.workspaceId === (tab.workspaceId ?? selectedProjectId) && asset.type === "data" && asset.visibility !== "archived")}
    flows={state.assets.filter((asset) => asset.workspaceId === (tab.workspaceId ?? selectedProjectId) && asset.type === "data-visualization-flow")}
    initialAssetId={tab.assetId ?? visualizationAssetId}
    initialFlowId={tab.flowId ?? visualizationFlowId}
    onBack={() => { setNotebookPickerFlowId(""); openTab(notebookImportTarget ? "runtime" : "data", { workspaceId: tab.workspaceId ?? selectedProjectId }); }}
    onSave={saveVisualizationFlow}
    onRequestAssetName={requestAssetName}
    onSaveRefinedAsset={(payload) => {
      const steps = payload.nodes
        .filter((node) => node.kind !== "source")
        .map((node): PrepStep => ({
          id: node.id,
          operation: "calculate" as PrepStep["operation"],
          column: String(node.params?.column ?? ""),
          target: node.label,
          parameters: { valueMap: { canvasKind: node.kind } },
        }));
      createRefinedDataAsset(payload.sourceName, payload.rows, steps, {
        mode: "backend-parquet",
        totalRows: payload.rowCount,
        outputRows: payload.rowCount,
        outputBytes: payload.bytes,
        schema: payload.schema.map((column) => column.name),
        backendDatasetId: payload.datasetId,
        backendSchema: payload.schema,
        parquet: true,
      }, payload.name);
    }}
    selectionMode={Boolean(notebookPickerFlowId && notebookImportTarget)}
    onSelectNodeForNotebook={(payload) => {
      if (!notebookImportTarget) return;
      const flowId = notebookPickerFlowId;
      const cell = isChartKind(payload.node.kind)
        ? { id: `chart-${Date.now()}`, type: "visualization-chart" as const, flowAssetId: flowId, nodeId: payload.node.id, nodeLabel: payload.node.label, result: { schema: payload.result.schema, rows: payload.result.rows, chartRows: payload.result.chartRows, metadata: payload.result.metadata }, layers: payload.layers ?? [], importedAt: new Date().toISOString() }
        : snapshotPreview({ flowAssetId: flowId, nodeId: payload.node.id, nodeLabel: payload.node.label, result: payload.result, range: payload.range });
      setNotebookImportTarget((current) => {
        if (!current) return current;
        const cells = [...current.document.cells];
        cells.splice(notebookImportIndex ?? cells.length, 0, cell);
        return { ...current, document: { ...current.document, cells } };
      });
      setNotebookPickerFlowId("");
      setNotebookImportIndex(undefined);
      openTab("runtime", { workspaceId: tab.workspaceId ?? selectedProjectId, notebookId: notebookImportTarget?.assetId });
    }}
  />;
          <p>Confirme o nome do asset antes de salvÃ¡-lo no workspace.</p>

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
            <div className="brand-mark">S</div>
            <div className="brand-copy">
            <strong>Sherlock</strong>
            <span>Local Studio</span>
          </div>
          <button
            aria-label={sidebarCollapsed ? "Mostrar barra lateral" : "Esconder barra lateral"}
            className="sidebar-toggle"
            onClick={() => {
              const next = !sidebarCollapsed;
              setSidebarCollapsed(next);
              window.localStorage.setItem("sherlock-sidebar-collapsed", String(next));
              window.localStorage.removeItem("watson-clone-sidebar-collapsed");
            }}
            title={sidebarCollapsed ? "Mostrar barra lateral" : "Esconder barra lateral"}
            type="button"
          >
            {sidebarCollapsed ? <SidebarOpen size={18} /> : <SidebarClose size={18} />}
          </button>
        </div>

        <nav aria-label="Navegacao principal">
          {navItems.map((item, index) => (
            <button
              className={`${activeView === item.id && !item.planned ? "nav-item active" : "nav-item"}${item.planned ? " planned" : ""}`}
              key={`${item.label}-${index}`}
              onClick={() => {
                if (item.planned) {
                  logAction("Tentou abrir modulo planejado", item.label);
                  return;
                }
                openView(item.id);
              }}
              type="button"
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.planned ? <em>Em breve</em> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-panel">
          <KeyRound size={18} />
          <strong>Privacidade local</strong>
          <p>Prompts so entram no historico quando voce salvar explicitamente.</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="search-box">
            <Search size={18} />
            <input
              aria-label="Buscar assets e recursos"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar assets, recursos, tags, status..."
              value={query}
            />
          </div>
          <button aria-label="Notificacoes" className="icon-button notification-button" onClick={() => openView("notifications")} type="button">
            <Bell size={18} />
            {unreadCount > 0 ? <span>{unreadCount}</span> : null}
          </button>
          <label className="audit-toggle" title="Mostra ou oculta o log tecnico de eventos locais. Desativado por padrao para manter a tela curta.">
            <input checked={showAuditPanel} onChange={(event) => toggleAuditPanel(event.target.checked)} type="checkbox" />
            Auditoria
          </label>
        </header>

        <nav className="studio-tabs" aria-label="Abas abertas">
          <div className="studio-tabs-scroll">
            {tabs.map((tab) => {
              const assetReferenceId = tab.flowId ?? tab.notebookId ?? tab.assetId;
              const asset = assetReferenceId ? state.assets.find((item) => item.id === assetReferenceId) : undefined;
              const workspace = tab.workspaceId ? state.workspaces.find((item) => item.id === tab.workspaceId) : undefined;
              const title = tab.view === "home" ? "Home" : asset?.name ?? workspace?.name ?? sectionTitle[tab.view];
              const label = sectionTitle[tab.view];
              return (
                <button
                  aria-current={tab.id === activeTabId ? "page" : undefined}
                  className={tab.id === activeTabId ? "studio-tab active" : "studio-tab"}
                  key={tab.id}
                  onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); closeTab(tab.id); } }}
                  onClick={() => { setActiveTabId(tab.id); if (tab.workspaceId) setSelectedProjectId(tab.workspaceId); }}
                  title={title}
                  type="button"
                >
                  <span>{label}</span>
                  <strong>{title}</strong>
                  {tab.id !== homeTab.id ? <i aria-label={`Fechar ${title}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}><X size={14} /></i> : null}
                </button>
              );
            })}
          </div>
        </nav>

        {tabs.filter((tab) => tab.view === "visualization").map((tab) => (
          <section aria-hidden={tab.id !== activeTabId} className="visualization-tab-page" hidden={tab.id !== activeTabId} key={tab.id}>
            {renderVisualizationView(tab)}
          </section>
        ))}

        {activeView === "home" ? <section className="hero-section">
          <div>
            <span className="eyebrow">{sectionEyebrow}</span>
            <h1>{state.profile.name}</h1>
            <p>
              Navegacao Sherlock com atalhos, busca global, recursos iniciais, recentes, servicos
              e notificacoes operacionais para o studio local.
            </p>
          </div>
          <div className="hero-actions">
            {quickActions.map((action) => (
              <ShellButton
                disabled={action.planned}
                key={action.label}
                onClick={() => {
                  if (action.planned) {
                    logAction("Tentou abrir atalho planejado", action.target);
                    return;
                  }
                  if (action.label === "Recursos") {
                    openView("resources");
                  } else if (action.label === "Projetos") {
                    openView("projects");
                  } else if (action.label === "Assets") {
                    openView("assets");
                  } else if (action.label === "Dados") {
                    openView("data");
                  } else if (action.label === "AutoAI") {
                    openView("autoai");
                  } else if (action.label === "Prompt Lab") {
                    openView("prompt");
                  } else if (action.label === "RAG Lab") {
                    openView("rag");
                  } else if (action.label === "Agent Lab") {
                    openView("agent");
                  } else if (action.label === "Notebooks") {
                    openView("runtime");
                  } else {
                    logAction("Acionou atalho", action.target);
                  }
                }}
                variant={["Prompt Lab", "Agent Lab"].includes(action.label) ? "primary" : "secondary"}
              >
                <action.icon size={16} />
                {action.label}
                {action.planned ? <span className="soon-label">Em breve</span> : null}
              </ShellButton>
            ))}
          </div>
        </section> : null}

        {activeView === "home" ? (
          <>
            <section className="stats-grid" aria-label="Resumo do studio">
              <StatCard
                detail="projetos, spaces e catalogo"
                icon={Layers3}
                label="Workspaces"
                value={String(state.workspaces.length)}
              />
              <StatCard detail="dados, prompts e servicos" icon={Archive} label="Assets" value={String(state.assets.length)} />
              <StatCard detail="assets prontos para uso" icon={Gauge} label="Ready" value={String(countByStatus(state.assets, "Ready"))} />
              <StatCard detail="alertas nao lidos" icon={Bell} label="Notificacoes" value={String(unreadCount)} />
            </section>

            <section className="content-grid">
              <div className="panel wide">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">Workspaces locais</span>
                    <h2>Ambientes de trabalho</h2>
                  </div>
                  <ShellButton onClick={createProject}>
                    <Plus size={16} />
                    Criar
                  </ShellButton>
                </div>
                <div className="workspace-grid">
                  {state.workspaces.map((workspace) => (
                    <WorkspaceCard assets={state.assets} key={workspace.id} onDelete={deleteWorkspace} onOpen={openWorkspace} workspace={workspace} />
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">Jobs</span>
                    <h2>Execucoes recentes</h2>
                  </div>
                  <FlaskConical size={18} />
                </div>
                <div className="job-list">
                  {state.jobs.map((job) => (
                    <div className="job-item" key={job.id}>
                      <div>
                        <strong>{job.name}</strong>
                        <span>
                          {formatDateTime(job.startedAt)} · {job.duration}
                        </span>
                      </div>
                      <span className={`badge ${statusTone(job.status)}`}>{job.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <AssetTable assets={filteredAssets} onAssetAction={handleAssetAction} />
          </>
        ) : null}

        {activeView === "recent" ? <AssetTable assets={recentAssets} onAssetAction={handleAssetAction} title="Assets abertos ou modificados recentemente" /> : null}

        {tabs.filter((tab) => tab.view === "assets").map((tab) => (
          <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <AssetCatalogView
              assets={catalogAssets.filter((asset) => !tab.workspaceId || asset.workspaceId === tab.workspaceId)}
              onArchive={toggleAssetArchive}
              onAssetAction={handleAssetAction}
              onDuplicate={duplicateAsset}
              onNoteChange={saveAssetNote}
              onRemove={removeAsset}
              onSelectAsset={setSelectedAssetId}
              onStatusFilterChange={setAssetStatusFilter}
              onTagFilterChange={setAssetTagFilter}
              onTypeFilterChange={setAssetTypeFilter}
              onVersion={createAssetVersion}
              onWorkspaceFilterChange={setAssetWorkspaceFilter}
              selectedAssetId={selectedAssetId}
              statusFilter={assetStatusFilter}
              tagFilter={assetTagFilter}
              typeFilter={assetTypeFilter}
              workspaceFilter={assetWorkspaceFilter}
              workspaces={state.workspaces}
            />
          </section>
        ))}

        {tabs.filter((tab) => tab.view === "data").map((tab) => {
          const workspaceId = tab.workspaceId ?? selectedProjectId;
          const workspace = state.workspaces.find((item) => item.id === workspaceId);
          const assets = state.assets.filter((asset) => asset.workspaceId === workspaceId && asset.type === "data" && asset.visibility !== "archived");
          return <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <DataPrepView
              activeWorkspaceName={workspace?.name ?? "Workspace padrao"}
              dataAssets={assets}
              requestedAssetId={tab.dataIntent?.assetId ?? tab.assetId ?? ""}
              requestedSection={tab.dataIntent?.section ?? "prepare"}
              requestId={tab.dataIntent?.requestId ?? 0}
              onCreateRefinedAsset={(sourceName, rows, steps, execution, outputName) => {
                if (outputName) {
                  createRefinedDataAsset(sourceName, rows, steps, execution, outputName);
                  return;
                }
                const extension = execution?.mode === "backend-parquet" ? "parquet" : "csv";
                requestAssetName(`${sourceName.replace(/\.[^.]+$/, "")}_refined.${extension}`, (name) => createRefinedDataAsset(sourceName, rows, steps, execution, name));
              }}
              onOpenVisualization={(assetId) => {
                if (!assetId) return;
                setVisualizationAssetId(assetId);
                setVisualizationFlowId("");
                openTab("visualization", { workspaceId, assetId });
              }}
            />
          </section>;
        })}

        {tabs.filter((tab) => tab.view === "autoai").map((tab) => {
          const workspaceId = tab.workspaceId ?? selectedProjectId;
          const workspace = state.workspaces.find((item) => item.id === workspaceId);
          const assets = state.assets.filter((asset) => asset.workspaceId === workspaceId && asset.type === "data" && asset.visibility !== "archived");
          return <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <AutoAiView
              activeWorkspaceName={workspace?.name ?? "Workspace padrao"}
              dataAssets={assets}
              onSaveModel={(payload) => requestAssetName(`${payload.config.name || "Experimento AutoAI"} - melhor modelo`, (name) => createAutoAiModelAsset({ ...payload, config: { ...payload.config, name } }))}
            />
          </section>;
        })}

        {tabs.filter((tab) => tab.view === "prompt").map((tab) => (
          <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <PromptLabView
              assets={state.assets.filter((asset) => asset.workspaceId === (tab.workspaceId ?? selectedProjectId))}
              onExportNotebookAsset={(payload) => requestAssetName(payload.name, (name) => createPromptNotebookAsset({ ...payload, name }))}
              onSavePromptAsset={(payload) => requestAssetName(payload.name, (name) => createPromptTemplateAsset({ ...payload, name }))}
            />
          </section>
        ))}

        {tabs.filter((tab) => tab.view === "rag").map((tab) => (
          <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <RagLabView onCreateVectorIndexAsset={(payload) => requestAssetName(payload.name, (name) => createVectorIndexAsset({ ...payload, name }))} onPromoteRagService={promoteRagService} />
          </section>
        ))}

        {tabs.filter((tab) => tab.view === "agent").map((tab) => {
          const workspace = state.workspaces.find((item) => item.id === (tab.workspaceId ?? selectedProjectId));
          return <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <AgentLabView
              activeWorkspaceName={workspace?.name ?? "Workspace padrao"}
              assets={state.assets.filter((asset) => asset.workspaceId === (tab.workspaceId ?? selectedProjectId))}
              onDeployAgentService={deployAgentService}
              onRegisterAgentEvaluation={registerAgentEvaluation}
              onSaveAgentAsset={(payload) => requestAssetName(payload.name, (name) => createAgentAsset({ ...payload, name }))}
            />
          </section>;
        })}

        {tabs.filter((tab) => tab.view === "runtime").map((tab) => {
          const workspaceId = tab.workspaceId ?? selectedProjectId;
          const workspace = state.workspaces.find((item) => item.id === workspaceId);
          const draft = notebookImportTarget?.assetId === tab.notebookId ? notebookImportTarget : undefined;
          return <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <RuntimeLabView
              activeWorkspaceName={workspace?.name ?? "Workspace padrao"}
              assets={state.assets.filter((asset) => asset.workspaceId === workspaceId)}
              initialDraft={draft}
              onDraftChange={(nextDraft) => setNotebookImportTarget(nextDraft)}
              onSaveNotebook={saveVisualNotebook}
              onOpenVisualizationPicker={(flow, insertAt, draft) => {
                if (draft) setNotebookImportTarget(draft);
                setNotebookPickerFlowId(flow.id);
                setNotebookImportIndex(insertAt);
                setVisualizationFlowId(flow.id);
                setVisualizationAssetId(flow.metadata?.sourceAssetId ?? "");
                openTab("visualization", { workspaceId, assetId: flow.metadata?.sourceAssetId ?? "", flowId: flow.id });
              }}
            />
          </section>;
        })}

        {tabs.filter((tab) => tab.view === "projects").map((tab) => (
          <section aria-hidden={tab.id !== activeTabId} hidden={tab.id !== activeTabId} key={tab.id}>
            <ProjectsView
              activeProjectTab={activeProjectTab}
              exportText={exportText}
              importText={importText}
              onArchive={archiveProject}
              onAssetAction={handleAssetAction}
              onCreateAsset={createWorkspaceAsset}
              onCreateProject={createProject}
              onDelete={deleteProject}
              onExport={exportProject}
              onImport={importProject}
              onImportTextChange={setImportText}
              onProjectChange={updateSelectedProject}
              onSaveNote={saveAssetNote}
              onSelectProject={(projectId) => {
                setSelectedProjectId(projectId);
                setActiveProjectTab("overview");
                openTab("projects", { workspaceId: projectId });
                logAction("Abriu projeto", state.workspaces.find((workspace) => workspace.id === projectId)?.name ?? projectId);
              }}
              onServiceToggle={toggleProjectService}
              onSetTab={setActiveProjectTab}
              selectedProjectId={tab.workspaceId ?? selectedProjectId}
              state={state}
              uploads={workspaceUploads}
              separator={assetImportSeparator}
              onSeparatorChange={setAssetImportSeparator}
            />
          </section>
        ))}

        {activeView === "resources" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Resource Hub</span>
                <h2>Exemplos para iniciar fluxos</h2>
              </div>
              <FileText size={18} />
            </div>
            <div className="resource-grid">
              {filteredResources.map((resource) => (
                <ResourceCard key={resource.id} onUse={(name) => logAction("Selecionou recurso", name)} resource={resource} />
              ))}
            </div>
          </section>
        ) : null}

        {activeView === "services" ? <ServicesView services={state.services} /> : null}

        {activeView === "notifications" ? (
          <NotificationsView notifications={state.notifications} onMarkAllRead={markNotificationsRead} />
        ) : null}

        {showAuditPanel ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Auditoria</span>
                <h2>Eventos locais</h2>
              </div>
              <Activity size={18} />
            </div>
            <div className="event-list compact-list">
              {state.events.map((event) => (
                <div className="event-item" key={event.id}>
                  <span>{formatDateTime(event.createdAt)}</span>
                  <strong>{event.action}</strong>
                  <em>{event.target}</em>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <input
          accept=".csv,.tsv,.txt"
          aria-hidden="true"
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void importWorkspaceAssets(files);
          }}
          ref={workspaceAssetFileInputRef}
          style={{ display: "none" }}
          tabIndex={-1}
          type="file"
        />
        {nameRequest ? (
          <div className="asset-name-backdrop" role="presentation">
            <section aria-modal="true" className="asset-name-dialog" role="dialog">
              <h2>Nomear asset</h2>
              <label>Nome<input autoFocus onChange={(event) => setNameRequest((current) => current ? { ...current, value: event.target.value } : current)} value={nameRequest.value} /></label>
              <div>
                <button className="button secondary" onClick={() => setNameRequest(undefined)} type="button">Cancelar</button>
                <button className="button primary" disabled={!nameRequest.value.trim()} onClick={() => { const request = nameRequest; setNameRequest(undefined); request.onConfirm(request.value.trim()); }} type="button">Salvar asset</button>
              </div>
            </section>
          </div>
        ) : null}
        {samplingRequest ? (
          <div className="asset-name-backdrop" role="presentation">
            <section aria-modal="true" className="asset-name-dialog" role="dialog">
              <h2>Dataset acima do teto</h2>
              <p>
                {samplingRequest.file.name} tem {samplingRequest.rowCount.toLocaleString("pt-BR")} linhas.
                Assets operacionais aceitam no maximo {samplingRequest.limit.toLocaleString("pt-BR")} linhas.
              </p>
              <label>
                Nome da amostra
                <input
                  autoFocus
                  onChange={(event) => setSamplingRequest((current) => current ? { ...current, value: event.target.value } : current)}
                  value={samplingRequest.value}
                />
              </label>
              <div>
                <button className="button secondary" onClick={() => { const request = samplingRequest; setSamplingRequest(undefined); request.onResolve(null); }} type="button">Cancelar</button>
                <button className="button primary" disabled={!samplingRequest.value.trim()} onClick={() => { const request = samplingRequest; setSamplingRequest(undefined); request.onResolve(request.value.trim()); }} type="button">Criar amostra</button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
