import { describe, expect, it } from "vitest";
import type { Asset } from "./domain";
import { defaultVisualNotebook, parseVisualNotebook, snapshotPreview, updatePreviewRange } from "./notebookLab";

const legacyAsset: Asset = {
  id: "legacy", workspaceId: "workspace", type: "notebook", name: "legacy.ipynb", description: "legacy", status: "Ready", version: 1,
  tags: [], updatedAt: "2026-01-01T00:00:00Z", lineage: [], visibility: "active", metadata: { content: "%%markdown\n# Histórico" }
};

describe("visual notebooks", () => {
  it("creates a structured document and migrates legacy content", () => {
    expect(defaultVisualNotebook().cells[0].type).toBe("markdown");
    expect(parseVisualNotebook(legacyAsset).cells[0]).toMatchObject({ type: "markdown", source: "# Histórico" });
  });

  it("persists a preview snapshot and updates its visible range", () => {
    const result = {
      nodeId: "group", schema: [{ name: "value", type: "number" }], rows: [{ value: 1 }, { value: 2 }, { value: 3 }],
      metadata: { rowCount: 3, numericColumns: ["value"], granularity: "row", lineage: [] }, cacheHit: false
    };
    const snapshot = snapshotPreview({ flowAssetId: "flow", nodeId: "group", nodeLabel: "Agrupar", result, range: { start: 1, end: 2 } });
    expect(snapshot.rows).toEqual([{ value: 1 }, { value: 2 }]);
    expect(updatePreviewRange(snapshot, { start: 2, end: 3 }).rows).toEqual([{ value: 2 }, { value: 3 }]);
  });

  it("uses the complete execution result instead of the canvas preview slice", () => {
    const result = {
      nodeId: "source", schema: [{ name: "value", type: "number" }], rows: [{ value: 1 }, { value: 2 }],
      chartRows: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }],
      metadata: { rowCount: 4, numericColumns: ["value"], granularity: "row", lineage: [] }, cacheHit: false
    };
    const snapshot = snapshotPreview({ flowAssetId: "flow", nodeId: "source", nodeLabel: "Dataset", result, range: { start: 3, end: 4 } });
    expect(snapshot.rows).toEqual([{ value: 3 }, { value: 4 }]);
    expect(snapshot.sourceRows).toHaveLength(4);
  });
});
