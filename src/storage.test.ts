import { describe, expect, it } from "vitest";
import { appendAuditEvent, migrateStudioState } from "./storage";
import { seedState } from "./seed";

describe("appendAuditEvent", () => {
  it("prepends a local audit event without mutating existing state", () => {
    const next = appendAuditEvent(seedState, {
      actor: "local-user",
      action: "Testou acao",
      target: "MVP 0"
    });

    expect(next.events[0].action).toBe("Testou acao");
    expect(next.events[0].target).toBe("MVP 0");
    expect(next.events).toHaveLength(seedState.events.length + 1);
    expect(seedState.events[0].action).toBe("Criou projeto sandbox");
  });
});

describe("migrateStudioState", () => {
  it("fills MVP 1 collections for persisted MVP 0 state", () => {
    const legacyState = {
      profile: seedState.profile,
      workspaces: seedState.workspaces,
      assets: seedState.assets,
      jobs: seedState.jobs,
      events: seedState.events
    };

    const next = migrateStudioState(legacyState);

    expect(next.resources.length).toBeGreaterThan(0);
    expect(next.services.length).toBeGreaterThan(0);
    expect(next.notifications.length).toBeGreaterThan(0);
    expect(next.workspaces[0].tags).toEqual(["sandbox", "demo"]);
    expect(next.workspaces[0].storage).toBe("Storage local");
    expect(next.workspaces[0].serviceIds).toContain("service-runtime");
    expect(next.assets.some((asset) => asset.type === "vector-index")).toBe(true);
    expect(next.assets[0].metadata).toBeDefined();
    expect(next.assets[0].dependencies).toBeDefined();
    expect(next.assets[0].visibility).toBe("active");
  });
});
