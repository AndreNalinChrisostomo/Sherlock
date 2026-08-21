export type StudioTab<View extends string = string> = {
  id: string;
  view: View;
  workspaceId?: string;
  assetId?: string;
  flowId?: string;
  canvasMode?: "visualization" | "refinery";
  notebookId?: string;
  dataIntent?: { assetId: string; section: "prepare" | "analysis"; requestId: number };
};

export function tabIdentity<View extends string>(view: View, context: Partial<StudioTab<View>>) {
  return [view, context.workspaceId ?? "", context.assetId ?? "", context.flowId ?? "", context.notebookId ?? ""].join("|");
}

export function restoreStudioTabs<View extends string>(serialized: string | null, home: StudioTab<View>, isKnownView: (view: string) => view is View) {
  try {
    const parsed = JSON.parse(serialized ?? "{}") as { tabs?: StudioTab[]; activeTabId?: string };
    const restored = (parsed.tabs ?? []).filter((tab): tab is StudioTab<View> => Boolean(tab?.id && isKnownView(tab.view)));
    const seen = new Set<string>();
    const uniqueRestored = restored.filter((tab) => {
      if (tab.view === home.view) return false;
      const key = tabIdentity(tab.view, tab);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const tabs = [home, ...uniqueRestored];
    return { tabs, activeTabId: tabs.some((tab) => tab.id === parsed.activeTabId) ? parsed.activeTabId! : home.id };
  } catch {
    return { tabs: [home], activeTabId: home.id };
  }
}

export function closeStudioTab<View extends string>(tabs: StudioTab<View>[], tabId: string, homeId: string) {
  if (tabId === homeId) return { tabs, nextActiveId: tabId };
  const index = tabs.findIndex((tab) => tab.id === tabId);
  const next = tabs.filter((tab) => tab.id !== tabId);
  return { tabs: next, nextActiveId: (next[Math.max(0, index - 1)] ?? next[0])?.id ?? homeId };
}
