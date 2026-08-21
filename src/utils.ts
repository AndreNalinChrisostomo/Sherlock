import type { AssetStatus, AssetType, JobStatus, WorkspaceType } from "./domain";

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function workspaceTypeLabel(type: WorkspaceType) {
  const labels: Record<WorkspaceType, string> = {
    project: "Projeto",
    "deployment-space": "Deployment space",
    catalog: "Catalogo"
  };

  return labels[type];
}

export function assetTypeLabel(type: AssetType) {
  const labels: Record<AssetType, string> = {
    data: "Data asset",
    connection: "Connection",
    notebook: "Notebook",
    script: "Script",
    "prompt-template": "Prompt",
    model: "Model",
    "tuned-model": "Tuned model",
    "data-refinery-flow": "Data Refinery flow",
    "data-visualization-flow": "Fluxo de visualização",
    pipeline: "Pipeline",
    function: "Function",
    environment: "Environment",
    job: "Job",
    "ai-service": "AI service",
    agent: "Agent",
    "vector-index": "Vector index",
    evaluation: "Evaluation"
  };

  return labels[type];
}

export function statusTone(status: AssetStatus | JobStatus) {
  if (status === "Failed") return "danger";
  if (status === "Running" || status === "Queued") return "attention";
  if (status === "Deployed" || status === "Succeeded" || status === "Ready") return "success";
  if (status === "Archived") return "muted";
  return "neutral";
}
