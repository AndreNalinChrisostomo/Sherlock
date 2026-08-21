import { describe, expect, it } from "vitest";
import { closeStudioTab, restoreStudioTabs, tabIdentity, type StudioTab } from "./studioTabs";

type View = "home" | "data" | "visualization";
const home: StudioTab<View> = { id: "home", view: "home" };
const knownView = (view: string): view is View => ["home", "data", "visualization"].includes(view);

describe("studio tabs", () => {
  it("restores valid tabs while pinning a single Home tab", () => {
    const restored = restoreStudioTabs(JSON.stringify({
      activeTabId: "data-a",
      tabs: [home, { id: "data-a", view: "data", workspaceId: "ws", assetId: "a" }, { id: "bad", view: "unknown" }]
    }), home, knownView);

    expect(restored.tabs).toHaveLength(2);
    expect(restored.tabs[0]).toEqual(home);
    expect(restored.activeTabId).toBe("data-a");
  });

  it("keeps data tabs distinct by asset context and focuses the previous tab after close", () => {
    expect(tabIdentity("data", { workspaceId: "ws", assetId: "a" })).not.toBe(tabIdentity("data", { workspaceId: "ws", assetId: "b" }));
    const result = closeStudioTab([home, { id: "a", view: "data" }, { id: "b", view: "visualization" }], "b", home.id);
    expect(result.nextActiveId).toBe("a");
    expect(result.tabs.map((tab) => tab.id)).toEqual(["home", "a"]);
  });
});
