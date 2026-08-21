import { seedState } from "./seed";
import type { AuditEvent, StudioState } from "./domain";

const STORAGE_KEY = "sherlock:studio-state";
const LEGACY_STORAGE_KEY = "watson-clone:studio-state";

function cloneSeed(): StudioState {
  return JSON.parse(JSON.stringify(seedState)) as StudioState;
}

export function loadStudioState(): StudioState {
  if (typeof window === "undefined") {
    return cloneSeed();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!raw) {
    const initial = cloneSeed();
    saveStudioState(initial);
    return initial;
  }

  try {
    return migrateStudioState(JSON.parse(raw) as Partial<StudioState>);
  } catch {
    const initial = cloneSeed();
    saveStudioState(initial);
    return initial;
  }
}

export function migrateStudioState(state: Partial<StudioState>): StudioState {
  const fallback = cloneSeed();
  const fallbackWorkspacesById = new Map(fallback.workspaces.map((workspace) => [workspace.id, workspace]));
  const fallbackAssetsById = new Map(fallback.assets.map((asset) => [asset.id, asset]));
  const stateWorkspaces = state.workspaces ?? fallback.workspaces;
  const stateAssets = (state.assets ?? fallback.assets).filter(
    (asset) => asset.id !== "asset-customer-data" && asset.name !== "customer_complaints_sample.csv"
  );
  const mergedWorkspaces = [...stateWorkspaces];
  const mergedAssets = [...stateAssets];

  for (const workspace of fallback.workspaces) {
    if (workspace.id === "project-estrada-study" && !mergedWorkspaces.some((item) => item.id === workspace.id)) {
      mergedWorkspaces.push(workspace);
    }
  }

  for (const asset of fallback.assets) {
    if (asset.id.startsWith("asset-car-crash-") && !mergedAssets.some((item) => item.id === asset.id)) {
      mergedAssets.unshift(asset);
    }
  }

  return {
    profile: state.profile ?? fallback.profile,
    workspaces: mergedWorkspaces.map((workspace) => {
      const fallbackWorkspace = fallbackWorkspacesById.get(workspace.id);

      return {
        ...workspace,
        tags: workspace.tags ?? fallbackWorkspace?.tags ?? [],
        storage: workspace.storage ?? fallbackWorkspace?.storage ?? "Storage local",
        serviceIds: workspace.serviceIds ?? fallbackWorkspace?.serviceIds ?? ["service-runtime", "service-object-storage"]
      };
    }),
    assets: mergedAssets.map((asset) => {
      const fallbackAsset = fallbackAssetsById.get(asset.id);

      return {
        ...asset,
        metadata: asset.metadata ?? fallbackAsset?.metadata ?? {},
        dependencies: asset.dependencies ?? fallbackAsset?.dependencies ?? asset.lineage ?? [],
        visibility: asset.visibility ?? (asset.status === "Archived" ? "archived" : "active")
      };
    }),
    jobs: state.jobs ?? fallback.jobs,
    events: state.events ?? fallback.events,
    resources: state.resources ?? fallback.resources,
    services: state.services ?? fallback.services,
    notifications: state.notifications ?? fallback.notifications
  };
}

export function saveStudioState(state: StudioState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function appendAuditEvent(state: StudioState, event: Omit<AuditEvent, "id" | "createdAt">) {
  const createdAt = new Date().toISOString();
  const nextEvent: AuditEvent = {
    ...event,
    id: `event-${createdAt}-${Math.random().toString(16).slice(2)}`,
    createdAt
  };

  return {
    ...state,
    events: [nextEvent, ...state.events].slice(0, 100)
  };
}
