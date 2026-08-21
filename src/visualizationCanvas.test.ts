import { describe, expect, it } from "vitest";
import { defaultLayer, normalizeChartLayerForInput } from "./visualizationCanvas";

describe("defaultLayer temporal axes", () => {
  const columns = ["created_at", "amount", "category"];

  it("prefers a datetime column for compatible X axes", () => {
    for (const kind of ["line", "area", "scatter2d", "bar"] as const) {
      expect(defaultLayer(kind, columns, ["amount"], ["created_at"]).x).toBe("created_at");
    }
  });

  it("keeps datetime columns out of 3D numeric axes", () => {
    const layer = defaultLayer("scatter3d", columns, ["amount", "other", "third"], ["created_at"]);
    expect([layer.x, layer.y, layer.z]).not.toContain("created_at");
  });
});

describe("normalizeChartLayerForInput", () => {
  it("preserves a selected pie category when the column still exists", () => {
    const layer = normalizeChartLayerForInput(
      { id: "layer-1", type: "pie", x: "channel", aggregation: "count" },
      ["status", "channel", "amount"],
      ["amount"],
      [],
    );

    expect(layer.x).toBe("channel");
  });

  it("only resets pie category when the selected column is gone", () => {
    const layer = normalizeChartLayerForInput(
      { id: "layer-1", type: "pie", x: "missing", aggregation: "count" },
      ["status", "channel", "amount"],
      ["amount"],
      [],
    );

    expect(layer.x).toBe("status");
  });
});
