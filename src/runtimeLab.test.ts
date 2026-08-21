import { describe, expect, it } from "vitest";
import type { Asset } from "./domain";
import {
  defaultNotebookCells,
  notebookToText,
  parseNotebookText,
  runTerminalCommand,
  simulateGitSync,
  simulateRuntimeExecution
} from "./runtimeLab";

const assets: Asset[] = [
  {
    id: "asset-notebook",
    workspaceId: "project-sandbox",
    type: "notebook",
    name: "perfil.ipynb",
    description: "Notebook de perfil",
    status: "Ready",
    version: 1,
    tags: ["notebook"],
    updatedAt: "2026-07-29T10:00:00-03:00",
    lineage: [],
    dependencies: [],
    visibility: "active"
  }
];

describe("runtimeLab", () => {
  it("serializes and parses notebook cells", () => {
    const text = notebookToText(defaultNotebookCells);
    const parsed = parseNotebookText(text);

    expect(parsed).toHaveLength(defaultNotebookCells.length);
    expect(parsed[0].type).toBe("markdown");
  });

  it("simulates successful runtime execution with artifacts", () => {
    const execution = simulateRuntimeExecution({
      assetName: "script.py",
      kind: "script",
      source: "print('ok')",
      environmentId: "python-basic",
      now: "2026-07-29T10:00:00-03:00"
    });

    expect(execution.status).toBe("Succeeded");
    expect(execution.logs.some((line) => line.includes("Execucao finalizada"))).toBe(true);
    expect(execution.artifacts.length).toBeGreaterThan(0);
  });

  it("simulates failed execution and terminal commands", () => {
    const failed = simulateRuntimeExecution({
      assetName: "broken.py",
      kind: "script",
      source: "raise Exception('x')",
      environmentId: "python-basic"
    });

    expect(failed.status).toBe("Failed");
    expect(runTerminalCommand("ls assets", assets)).toContain("perfil.ipynb");
    expect(simulateGitSync("https://example.com/repo.git", assets.length)[0]).toContain("example.com");
  });
});
