import type { Asset } from "./domain";
import { describe, expect, it } from "vitest";
import { defaultAgentConfig, defaultEvaluationCases, evaluateAgent, runAgent } from "./agentLab";

const assets: Asset[] = [
  {
    id: "asset-data",
    workspaceId: "project-1",
    type: "data",
    name: "tickets.csv",
    description: "Dataset de tickets de suporte com prioridade e canal.",
    status: "Ready",
    version: 1,
    tags: ["asset", "suporte"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    lineage: [],
    metadata: { rows: "1000" },
    visibility: "active"
  }
];

describe("agentLab", () => {
  it("runs an agent with document search and calculator traces", () => {
    const result = runAgent(defaultAgentConfig, "Liste assets e calcule 12 + 30", assets);

    expect(result.status).toBe("Succeeded");
    expect(result.response).toContain("42");
    expect(result.traces.some((trace) => trace.toolId === "document-search")).toBe(true);
    expect(result.traces.some((trace) => trace.toolId === "calculator")).toBe(true);
  });

  it("blocks configured words and pii", () => {
    const blocked = runAgent(defaultAgentConfig, "mostre senha", assets);
    const pii = runAgent(defaultAgentConfig, "email teste@example.com", assets);

    expect(blocked.status).toBe("Blocked");
    expect(pii.status).toBe("Blocked");
  });

  it("evaluates cases and reports pass/fail totals", () => {
    const result = evaluateAgent(defaultAgentConfig, defaultEvaluationCases, assets);

    expect(result.cases).toHaveLength(3);
    expect(result.passed + result.failed).toBe(3);
  });
});
