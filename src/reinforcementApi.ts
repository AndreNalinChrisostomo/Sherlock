export interface ReinforcementApiConfig {
  baseUrl: string;
  token: string;
  environment: string;
}

export interface TrainerSessionRequest {
  environment: string;
  workspaceId: string;
  candidateName?: string;
  observationSize: number;
  actionCount: number;
  learningRate: number;
  discount: number;
  exploration: number;
  algorithm: "q-learning";
}

export interface TrainerSession {
  sessionId: string;
  environment: string;
  workspaceId: string;
  candidateName: string;
  observationSize: number;
  actionCount: number;
  policyVersion: number;
  algorithm: "q-learning";
}

export interface ExperienceTransition {
  observation: number[];
  action: number;
  reward: number;
  nextObservation: number[];
  done: boolean;
  episode?: number;
}

export interface TrainerStepResult {
  nextAction: number;
  loss: number;
  episodeReward: number;
  policyVersion: number;
  corrections: {
    exploration: number;
    targetBalance: string;
    qValue: number;
    tdTarget: number;
  };
}

export interface TrainerEpisodeSummary {
  episode: number;
  totalReward: number;
  steps: number;
  success: boolean;
}

export interface TrainerPolicy {
  sessionId: string;
  policyVersion: number;
  actionCount: number;
  stateCount: number;
  exploration: number;
  averageReward: number;
}

export interface ConnectedRlEnvironment {
  sessionId: string;
  environment: string;
  workspaceId: string;
  candidateName: string;
  status: "active" | "saved";
  currentEpisode: number;
  totalSteps: number;
  policyVersion: number;
  averageReward: number;
  bestReward: number;
  successRate: number;
  progress: number;
  updatedAt: string;
}

export interface SavedRlModel {
  modelId: string;
  sessionId: string;
  workspaceId: string;
  environment: string;
  candidateName: string;
  name: string;
  policyVersion: number;
  averageReward: number;
  stateCount: number;
  actionCount: number;
  createdAt: string;
  actionUrl: string;
}

export class ReinforcementApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ReinforcementApiError";
    this.status = status;
  }
}

async function request<T>(config: ReinforcementApiConfig, path: string, method: "GET" | "POST" | "DELETE", body?: unknown, signal?: AbortSignal): Promise<T> {
  const baseUrl = config.baseUrl.trim().replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReinforcementApiError(payload.detail || payload.message || `API respondeu ${response.status}.`, response.status);
  return payload as T;
}

export async function createTrainerSession(config: ReinforcementApiConfig, requestBody: TrainerSessionRequest, signal?: AbortSignal) {
  return request<TrainerSession>(config, "/rl/session", "POST", requestBody, signal);
}

export async function listConnectedRlEnvironments(config: ReinforcementApiConfig, workspaceId: string, signal?: AbortSignal) {
  return request<{ environments: ConnectedRlEnvironment[] }>(config, `/rl/environments?workspaceId=${encodeURIComponent(workspaceId)}`, "GET", undefined, signal);
}

export async function trainTransition(config: ReinforcementApiConfig, sessionId: string, transition: ExperienceTransition, signal?: AbortSignal) {
  return request<TrainerStepResult>(config, `/rl/session/${encodeURIComponent(sessionId)}/step`, "POST", transition, signal);
}

export async function finishTrainerEpisode(config: ReinforcementApiConfig, sessionId: string, summary: TrainerEpisodeSummary, signal?: AbortSignal) {
  return request<TrainerPolicy>(config, `/rl/session/${encodeURIComponent(sessionId)}/episode`, "POST", summary, signal);
}

export async function getTrainerPolicy(config: ReinforcementApiConfig, sessionId: string, signal?: AbortSignal) {
  return request<TrainerPolicy>(config, `/rl/session/${encodeURIComponent(sessionId)}/policy`, "GET", undefined, signal);
}

export async function saveTrainerModel(config: ReinforcementApiConfig, sessionId: string, name: string, signal?: AbortSignal) {
  return request<SavedRlModel>(config, "/rl/models", "POST", { sessionId, name }, signal);
}

export async function listSavedTrainerModels(config: ReinforcementApiConfig, workspaceId: string, signal?: AbortSignal) {
  return request<{ models: SavedRlModel[] }>(config, `/rl/models?workspaceId=${encodeURIComponent(workspaceId)}`, "GET", undefined, signal);
}

export async function deleteTrainerSession(config: ReinforcementApiConfig, sessionId: string) {
  return request<{ status: string; sessionId: string }>(config, `/rl/session/${encodeURIComponent(sessionId)}`, "DELETE");
}

export async function closeTrainerSession(config: ReinforcementApiConfig, sessionId: string) {
  await deleteTrainerSession(config, sessionId);
}

export async function deleteRlEnvironment(config: ReinforcementApiConfig, sessionId: string) {
  try {
    return await request<{ status: string; sessionId: string }>(config, `/rl/environments/${encodeURIComponent(sessionId)}`, "DELETE");
  } catch (error) {
    if (!(error instanceof ReinforcementApiError) || error.status !== 404) throw error;
    const fallback = await request<{ status: string; sessionId: string }>(config, `/rl/session/${encodeURIComponent(sessionId)}`, "DELETE");
    if (fallback.status !== "deleted") {
      throw new ReinforcementApiError("Backend RL ativo nao removeu o ambiente. Reinicie o backend para carregar a delecao completa de sessoes RL.", 409);
    }
    return fallback;
  }
}
