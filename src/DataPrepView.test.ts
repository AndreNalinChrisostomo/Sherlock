import { describe, expect, it } from "vitest";
import { buildFocusedColumnPreview } from "./DataPrepView";

describe("focused Data Refinery column preview", () => {
  it("keeps the source column beside every generated one-hot column", () => {
    const sourceRows = [{ channel: "email", amount: 10 }, { channel: "chat", amount: 20 }];
    const transformedRows = [
      { channel_email: 1, channel_chat: 0, amount: 10 },
      { channel_email: 0, channel_chat: 1, amount: 20 }
    ];
    const preview = buildFocusedColumnPreview("channel", sourceRows, transformedRows, [
      { id: "one-hot", operation: "one-hot", column: "channel" }
    ]);

    expect(preview.columns).toEqual(["channel", "channel_email", "channel_chat"]);
    expect(preview.rows).toEqual([
      { channel: "email", channel_email: 1, channel_chat: 0 },
      { channel: "chat", channel_email: 0, channel_chat: 1 }
    ]);
  });

  it("includes named derived outputs but excludes unrelated dataset columns", () => {
    const preview = buildFocusedColumnPreview(
      "category",
      [{ category: "a", value: 2 }],
      [{ category: "a", category_frequency: 1, class_weight: 0.5, value: 2 }],
      [
        { id: "frequency", operation: "frequency-encode", column: "category" },
        { id: "weight", operation: "class-weights", column: "category" }
      ]
    );

    expect(preview.columns).toEqual(["category", "category_frequency", "class_weight"]);
    expect(preview.rows[0]).toEqual({ category: "a", category_frequency: 1, class_weight: 0.5 });
  });
});
