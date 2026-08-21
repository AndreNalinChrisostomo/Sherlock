export type WorkspaceType = "project" | "deployment-space" | "catalog";

export type AssetType =
  | "data"
  | "connection"
  | "notebook"
  | "script"
  | "prompt-template"
  | "model"
  | "tuned-model"
  | "data-refinery-flow"
  | "data-visualization-flow"
  | "pipeline"
  | "function"
  | "environment"
  | "job"
  | "ai-service"
  | "agent"
  | "vector-index"
  | "evaluation";

export type AssetStatus = "Draft" | "Ready" | "Running" | "Failed" | "Deployed" | "Archived";

export type JobStatus = "Queued" | "Running" | "Succeeded" | "Failed";

export type ServiceStatus = "Online" | "Needs setup" | "Offline";

export type ResourceKind = "prompt" | "notebook" | "dataset" | "project" | "model";

export type NotificationTone = "info" | "success" | "warning" | "danger";

export interface LocalProfile {
  id: string;
  name: string;
  defaultProjectId: string;
  promptRetention: "explicit-save-only" | "session-history";
  preferredProvider: string;
}

export interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  description: string;
  status: "Active" | "Archived";
  updatedAt: string;
  tags?: string[];
  storage?: string;
  serviceIds?: string[];
}

export interface Asset {
  id: string;
  workspaceId: string;
  type: AssetType;
  name: string;
  description: string;
  status: AssetStatus;
  version: number;
  tags: string[];
  updatedAt: string;
  lineage: string[];
  notes?: string;
  metadata?: Record<string, string>;
  dependencies?: string[];
  visibility?: "active" | "archived";
}

export interface Job {
  id: string;
  workspaceId: string;
  name: string;
  status: JobStatus;
  startedAt: string;
  duration: string;
}

export interface AuditEvent {
  id: string;
  actor: "local-user" | "system";
  action: string;
  target: string;
  createdAt: string;
}

export interface ResourceTemplate {
  id: string;
  kind: ResourceKind;
  name: string;
  description: string;
  tags: string[];
  estimatedTime: string;
}

export interface PlatformService {
  id: string;
  name: string;
  category: "Runtime" | "Connector" | "Storage" | "Governance";
  status: ServiceStatus;
  detail: string;
  updatedAt: string;
}

export interface StudioNotification {
  id: string;
  tone: NotificationTone;
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
}

export interface StudioState {
  profile: LocalProfile;
  workspaces: Workspace[];
  assets: Asset[];
  jobs: Job[];
  events: AuditEvent[];
  resources: ResourceTemplate[];
  services: PlatformService[];
  notifications: StudioNotification[];
}
