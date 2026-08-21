import { describe, expect, it } from "vitest";
import {
  analyzeMvp4,
  applyPrepSteps,
  createPendingBackendProfile,
  detectDrift,
  executePrepStepsOnDelimitedFile,
  isPendingBackendProfile,
  parseDataFile,
  parseDelimited,
  parseDataText,
  profileDelimitedFile,
  profileRows,
  projectProfileAfterSteps,
  resolvePrepStepsForFullFile,
  unsupportedStreamingSteps,
  validateRows
} from "./dataPrep";

describe("data preparation helpers", () => {
  it("marks backend profiles as pending without fabricating null counts", () => {
    const profile = createPendingBackendProfile(["data", "km"], 12581);

    expect(isPendingBackendProfile(profile)).toBe(true);
    expect(profile.rows).toBe(12581);
    expect(profile.columnProfiles.map((column) => column.missing)).toEqual([0, 0]);
  });

  it("parses csv, profiles quality, and applies visual steps", () => {
    const rows = parseDelimited("id,name,score\n1,Ada,10\n2,Bob,\n2,Bob,");
    const profile = profileRows(rows);
    const transformed = applyPrepSteps(rows, [
      { id: "fill", operation: "fill-missing", column: "score", value: "0" },
      { id: "dedupe", operation: "dedupe" },
      { id: "rename", operation: "rename", column: "name", target: "customer" }
    ]);

    expect(profile.rows).toBe(3);
    expect(profile.duplicateRows).toBe(1);
    expect(profile.suggestions.some((suggestion) => suggestion.includes("nulos"))).toBe(true);
    expect(transformed).toHaveLength(2);
    expect(transformed[0].customer).toBe("Ada");
    expect(transformed[1].score).toBe(0);
  });

  it("fills missing values and converts column types from quick column actions", () => {
    const rows = [
      { amount: "10.8", score: 10, active: "true", created_at: "2026-07-31" },
      { amount: "20.2", score: null, active: "false", created_at: "invalid" }
    ];
    const transformed = applyPrepSteps(rows, [
      { id: "fill", operation: "fill-mean", column: "score" },
      { id: "integer", operation: "cast", column: "amount", target: "integer" },
      { id: "boolean", operation: "cast", column: "active", target: "boolean" },
      { id: "date", operation: "cast", column: "created_at", target: "date" }
    ]);

    expect(transformed[1].score).toBe(10);
    expect(transformed.map((row) => row.amount)).toEqual([10, 20]);
    expect(transformed.map((row) => row.active)).toEqual([true, false]);
    expect(transformed[0].created_at).toBe("2026-07-31T00:00:00.000Z");
    expect(transformed[1].created_at).toBeNull();
  });

  it("maps categorical variants to canonical values", () => {
    const rows = parseDataText("events.csv", "tipo\ncom vitima\ncom\ncom V\nsem vitima\nsem\nsem V\noutro").rows;
    const transformed = applyPrepSteps(rows, [
      {
        id: "map",
        operation: "map-values",
        column: "tipo",
        value: [
          "com vitima => com vitima",
          "com => com vitima",
          "com V => com vitima",
          "sem vitima => sem vitima",
          "sem => sem vitima",
          "sem V => sem vitima"
        ].join("\n")
      }
    ]);

    expect(transformed.map((row) => row.tipo)).toEqual([
      "com vitima",
      "com vitima",
      "com vitima",
      "sem vitima",
      "sem vitima",
      "sem vitima",
      "outro"
    ]);
  });

  it("filters out rows containing a value in the selected column", () => {
    const rows = parseDataText("events.csv", "tipo\ncom vitima\nsem vitima\ncom\nsem\ncom V\nsem V\noutro").rows;
    const transformed = applyPrepSteps(rows, [{ id: "remove-sem", operation: "filter-out", column: "tipo", value: "sem" }]);

    expect(transformed.map((row) => row.tipo)).toEqual(["com vitima", "com", "com V", "outro"]);
  });

  it("removes only rows with a missing value in the selected column", () => {
    const rows = parseDelimited("a,target\n1,aprovado\n2,\n3,reprovado");
    const transformed = applyPrepSteps(rows, [{ id: "target-required", operation: "drop-missing-rows", column: "target" }]);

    expect(transformed).toHaveLength(2);
    expect(transformed.map((row) => row.target)).toEqual(["aprovado", "reprovado"]);
  });

  it("joins rows with a lookup dataset", () => {
    const left = parseDataText("tickets.csv", "id,priority\n1,high\n2,low").rows;
    const right = parseDataText("priority.csv", "priority,sla\nhigh,4h\nmedium,24h").rows;
    const joined = applyPrepSteps(left, [
      { id: "join", operation: "join", column: "priority", target: "priority", joinType: "left", rightRows: right, rightName: "priority.csv" }
    ]);

    expect(joined).toEqual([
      { id: 1, priority: "high", right_sla: "4h" },
      { id: 2, priority: "low", right_sla: null }
    ]);
  });

  it("applies advanced no-code data preparation steps", () => {
    const rows = parseDataText("training.csv", "id,segment,score\n1,enterprise,10\n2,smb,\n3,smb,100\n4,public,20").rows;
    const prepared = applyPrepSteps(rows, [
      { id: "fill", operation: "fill-median", column: "score" },
      { id: "clip", operation: "clip-iqr", column: "score" },
      { id: "scale", operation: "minmax-scale", column: "score" },
      { id: "encode", operation: "one-hot", column: "segment" }
    ]);

    expect(prepared[0].score).toBe(0);
    expect(Number(prepared[1].score)).toBeGreaterThan(0);
    expect(Number(prepared[1].score)).toBeLessThan(1);
    expect(prepared[2].score).toBe(1);
    expect(prepared.every((row) => Number(row.score) >= 0 && Number(row.score) <= 1)).toBe(true);
    expect(prepared[0]).toMatchObject({ segment_enterprise: 1, segment_public: 0, segment_smb: 0 });
    expect(prepared[1]).toMatchObject({ segment_enterprise: 0, segment_public: 0, segment_smb: 1 });
  });

  it("validates rows with declarative no-code rules", () => {
    const rows = parseDataText("tickets.csv", "id,priority,wait\n1,high,10\n2,urgent,160\n2,,5").rows;
    const report = validateRows(rows, [
      { id: "required-priority", column: "priority", type: "required" },
      { id: "domain-priority", column: "priority", type: "domain", allowedValues: ["high", "medium", "low"] },
      { id: "wait-range", column: "wait", type: "range", min: 0, max: 120 },
      { id: "unique-id", column: "id", type: "unique" }
    ]);

    expect(report.passed).toBe(false);
    expect(report.issueCount).toBe(5);
    expect(report.ruleSummaries.find((rule) => rule.ruleId === "unique-id")?.issueCount).toBe(2);
    expect(report.issues.some((issue) => issue.message.includes("fora do range"))).toBe(true);
  });

  it("removes columns below a completeness threshold", () => {
    const rows = parseDataText("quality.csv", "id,mostly_full,half_empty,y\n1,a,,1\n2,b,x,0\n3,c,,1\n4,,z,0").rows;
    const prepared = applyPrepSteps(rows, [{ id: "complete", operation: "drop-low-complete", value: "75" }]);

    expect(Object.keys(prepared[0])).toEqual(["id", "mostly_full", "y"]);
    expect(prepared[0]).not.toHaveProperty("half_empty");
    expect(prepared).toHaveLength(4);
  });

  it("applies broad no-code transformations across compatible columns", () => {
    const rows = parseDataText("broad.csv", "id,score,cost,segment,label\n1,10,,a,1\n2,,20,b,0\n3,30,40,,1").rows;
    const prepared = applyPrepSteps(rows, [
      { id: "drop-id", operation: "drop-id-columns" },
      { id: "fill-num", operation: "fill-all-numeric" },
      { id: "fill-cat", operation: "fill-all-categorical" },
      { id: "scale", operation: "scale-all-numeric" }
    ]);

    expect(prepared[0]).not.toHaveProperty("id");
    expect(prepared.every((row) => row.score !== null && row.cost !== null && row.segment !== null)).toBe(true);
    expect(Number(prepared[0].score)).toBeLessThan(0);
    expect(Number(prepared[2].score)).toBeGreaterThan(0);
  });

  it("detects schema and data drift between dataset versions", () => {
    const baseline = parseDataText("baseline.csv", "id,segment,score\n1,a,10\n2,a,12\n3,b,11").rows;
    const current = parseDataText("current.csv", "id,segment,score,new_flag\n1,b,30,true\n2,b,34,false\n3,b,33,true\n4,c,38,false").rows;
    const report = detectDrift(baseline, current);

    expect(report.hasDrift).toBe(true);
    expect(report.addedColumns).toEqual(["new_flag"]);
    expect(report.numericDrift.some((item) => item.column === "score" && item.deltaPct > 100)).toBe(true);
    expect(report.numericDrift.some((item) => item.column === "id")).toBe(false);
    expect(report.categoricalDrift.some((item) => item.column === "segment")).toBe(true);
  });

  it("runs final MVP 4 transformations and reports", () => {
    const rows = parseDataText("advanced.csv", "id,segment,score,cost,text,date,resolved\n1,a,10,2,Hello running,2026-01-01,1\n2,a,,4,Hello world,2026-01-02,0\n3,b,80,8,Bad delays,2026-01-03,0\n4,b,90,9,Great service,2026-01-04,1").rows;
    const prepared = applyPrepSteps(rows, [
      { id: "indicator", operation: "missing-indicator", column: "score" },
      { id: "iterative", operation: "iterative-impute", column: "score" },
      { id: "zscore", operation: "zscore-clip", column: "score" },
      { id: "freq", operation: "frequency-encode", column: "segment" },
      { id: "target", operation: "target-encode", column: "segment", target: "resolved" },
      { id: "hash", operation: "hash-encode", column: "segment" },
      { id: "robust", operation: "robust-scale", column: "cost" },
      { id: "tfidf", operation: "text-tfidf", column: "text" },
      { id: "temporal", operation: "temporal-parts", column: "date" },
      { id: "ratio", operation: "ratio", column: "score", target: "cost" },
      { id: "split", operation: "train-validation-test-split" },
      { id: "weights", operation: "class-weights", column: "resolved" },
      { id: "cardinality", operation: "cardinality-check", column: "segment" },
      { id: "window", operation: "window-row-number", column: "segment" },
      { id: "enrich", operation: "dictionary-enrich", column: "segment" }
    ]);
    const report = analyzeMvp4(prepared, rows, "resolved", "segment");

    expect(prepared[1].score).not.toBeNull();
    expect(prepared[0]).toHaveProperty("score_missing");
    expect(prepared[0]).toHaveProperty("segment_frequency");
    expect(prepared[0]).toHaveProperty("text_tfidf_score");
    expect(prepared[0]).toHaveProperty("date_year");
    expect(prepared[0]).toHaveProperty("split");
    expect(report.histograms.length).toBeGreaterThan(0);
    expect(report.correlationMatrix.length).toBeGreaterThan(0);
    expect(report.biasReport.length).toBeGreaterThan(0);
    expect(report.leakageReport.some((item) => item.column === "id")).toBe(false);
  });

  it("groups numeric sensitive columns into readable bins", () => {
    const rows = parseDataText("xy.csv", "x,y\n1,10\n2,20\n3,30\n4,40\n5,50\n6,60").rows;
    const report = analyzeMvp4(rows, rows, "y", "x");

    expect(report.biasReport.map((item) => item.group)).toEqual(["baixo", "medio", "alto"]);
    expect(report.biasReport.every((item) => item.count > 0)).toBe(true);
  });

  it("uses compatible uploaded baselines in MVP 4 distribution comparison", () => {
    const rows = parseDataText("xy.csv", "x,y\n1,10\n2,20\n3,30\n4,40").rows;
    const report = analyzeMvp4(rows, rows, "y", "x");

    expect(report.distributionComparison).toHaveLength(2);
    expect(report.distributionComparison.every((item) => item.baselineTop !== "n/a")).toBe(true);
  });

  it("loads a bounded preview quickly instead of scanning the entire delimited upload", async () => {
    const csv = ["id,value", ...Array.from({ length: 25 }, (_, index) => `${index + 1},${index * 2}`)].join("\n");
    const progress: number[] = [];
    const loadedRows: number[] = [];
    const parsed = await parseDataFile(new File([csv], "large.csv", { type: "text/csv" }), {
      maxRows: 10,
      onProgress: (event) => {
        progress.push(event.percent);
        loadedRows.push(event.rows);
      }
    });

    expect(parsed.rows).toHaveLength(10);
    expect(parsed.totalRows).toBeUndefined();
    expect(parsed.truncated).toBe(true);
    expect(Math.max(...loadedRows)).toBe(10);
    expect(progress.at(-1)).toBe(100);
  });

  it("honors an explicitly selected semicolon separator", async () => {
    const parsed = await parseDataFile(new File(["data;hora;valor\n01/01;10:30;42"], "semicolon.csv", { type: "text/csv" }), {
      delimiter: ";"
    });

    expect(Object.keys(parsed.rows[0])).toEqual(["data", "hora", "valor"]);
    expect(parsed.rows[0]).toMatchObject({ data: "01/01", hora: "10:30", valor: 42 });
  });

  it("can load delimited uploads above 50000 rows when no row cap is provided", async () => {
    const csv = ["id,value", ...Array.from({ length: 50025 }, (_, index) => `${index + 1},${index * 2}`)].join("\n");
    const parsed = await parseDataFile(new File([csv], "above-limit.csv", { type: "text/csv" }));

    expect(parsed.rows).toHaveLength(50025);
    expect(parsed.totalRows).toBe(50025);
    expect(parsed.truncated).toBe(false);
  });

  it("profiles the complete delimited file independently from the bounded preview", async () => {
    const csv = ["id,group,score", ...Array.from({ length: 250 }, (_, index) => `${index + 1},${index % 3 === 0 ? "" : `g${index % 4}`},${index}`)].join("\n");
    const preview = await parseDataFile(new File([csv], "profile.csv", { type: "text/csv" }), { maxRows: 10 });
    const profile = await profileDelimitedFile(new File([csv], "profile.csv", { type: "text/csv" }));

    expect(preview.rows).toHaveLength(10);
    expect(preview.totalRows).toBeUndefined();
    expect(profile.rows).toBe(250);
    expect(profile.columns).toBe(3);
    expect(profile.columnProfiles.find((column) => column.name === "group")?.missing).toBe(84);
    expect(profile.suggestions.some((suggestion) => suggestion.includes("nulos"))).toBe(true);
  });

  it("executes compatible prep steps on the entire uploaded csv while keeping only preview rows", async () => {
    const csv = ["id,status,score", ...Array.from({ length: 1200 }, (_, index) => `${index + 1},${index % 2 === 0 ? "open" : ""},${index}`)].join("\n");
    const progress: number[] = [];
    const steps = [
      { id: "fill", operation: "fill-missing", column: "status", value: "unknown" },
      { id: "remove", operation: "remove-column", column: "score" }
    ] as const;
    const result = await executePrepStepsOnDelimitedFile(new File([csv], "tickets.csv", { type: "text/csv" }), [...steps], {
      previewRows: 5,
      batchSize: 100,
      onProgress: (event) => progress.push(event.percent)
    });
    const output = await result.blob.text();

    expect(result.totalRows).toBe(1200);
    expect(result.outputRows).toBe(1200);
    expect(result.rows).toHaveLength(5);
    expect(result.columns).toEqual(["id", "status"]);
    expect(output).toContain("unknown");
    expect(output).not.toContain("score");
    expect(progress.at(-1)).toBe(100);
  });

  it("reports unsupported full-file streaming steps", () => {
    const unsupported = unsupportedStreamingSteps([{ id: "sort", operation: "sort", column: "score" }]);

    expect(unsupported).toHaveLength(1);
    expect(unsupported[0].operation).toBe("sort");
  });

  it("resolves completeness decisions from the complete file instead of the preview", async () => {
    const csv = [
      "id,mostly_complete,mostly_empty",
      ...Array.from({ length: 100 }, (_, index) => `${index + 1},${index < 10 ? "" : index},${index < 90 ? "" : index}`)
    ].join("\n");
    const file = new File([csv], "completeness.csv", { type: "text/csv" });
    const preview = await parseDataFile(file, { maxRows: 10 });
    const profile = await profileDelimitedFile(file);
    const resolved = resolvePrepStepsForFullFile([{ id: "complete", operation: "drop-low-complete", value: "80" }], profile);
    const preparedPreview = applyPrepSteps(preview.rows, resolved);

    expect(resolved.some((step) => step.column === "mostly_empty" && step.operation === "remove-column")).toBe(true);
    expect(resolved.some((step) => step.column === "mostly_complete")).toBe(false);
    expect(preparedPreview[0]).toHaveProperty("mostly_complete");
    expect(preparedPreview[0]).not.toHaveProperty("mostly_empty");
  });

  it("executes global missing-value preparation on the complete file", async () => {
    const csv = ["id,score,group", "1,10,a", "2,,", "3,30,b", "4,,a"].join("\n");
    const file = new File([csv], "global.csv", { type: "text/csv" });
    const profile = await profileDelimitedFile(file);
    const steps = [
      { id: "numeric", operation: "fill-all-numeric" },
      { id: "categorical", operation: "fill-all-categorical" }
    ] as const;

    expect(unsupportedStreamingSteps([...steps], profile)).toHaveLength(0);
    const result = await executePrepStepsOnDelimitedFile(file, [...steps], { profile, batchSize: 2 });
    const output = await result.blob.text();

    expect(result.outputRows).toBe(4);
    expect(output).toContain("2,20,a");
    expect(output).toContain("4,20,a");
  });

  it("scores quality from actual completeness and marks capped cardinality", async () => {
    const rows = parseDataText("quality.csv", "a,b\n1,\n2,\n3,x\n4,y").rows;
    const quality = profileRows(rows);
    const manyValues = ["id", ...Array.from({ length: 5100 }, (_, index) => String(index))].join("\n");
    const largeProfile = await profileDelimitedFile(new File([manyValues], "unique.csv", { type: "text/csv" }));

    expect(quality.quality.completenessPct).toBe(75);
    expect(quality.qualityScore).toBe(75);
    expect(largeProfile.columnProfiles[0].unique).toBe(5000);
    expect(largeProfile.columnProfiles[0].uniqueCapped).toBe(true);
  });

  it("projects full-file recipe impact without using preview statistics", async () => {
    const csv = ["id,a,b", "1,10,", "2,20,", "3,,x", "4,40,"].join("\n");
    const profile = await profileDelimitedFile(new File([csv], "projection.csv", { type: "text/csv" }));
    const projected = projectProfileAfterSteps(profile, [
      { id: "drop", operation: "drop-low-complete", value: "50" },
      { id: "fill", operation: "fill-all-numeric" }
    ]);

    expect(projected.columnProfiles.map((column) => column.name)).toEqual(["id", "a"]);
    expect(projected.columnProfiles.find((column) => column.name === "a")?.missing).toBe(0);
    expect(projected.quality.completenessPct).toBe(100);
  });
});
