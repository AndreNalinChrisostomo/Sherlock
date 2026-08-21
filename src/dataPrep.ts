export type DataRow = Record<string, string | number | boolean | null>;

export type ColumnKind = "number" | "boolean" | "date" | "text" | "empty";

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  missing: number;
  unique: number;
  uniqueCapped?: boolean;
  trackedValues?: string[];
  examples: string[];
  min?: number;
  q1?: number;
  median?: number;
  q3?: number;
  max?: number;
  mean?: number;
  stdDev?: number;
  frequencies: Array<{ value: string; count: number }>;
}

export interface DataProfile {
  rows: number;
  columns: number;
  duplicateRows: number;
  duplicateRowsApproximate?: boolean;
  qualityScore: number;
  quality: {
    completenessPct: number;
    duplicatePct: number;
    missingCells: number;
    totalCells: number;
  };
  columnProfiles: ColumnProfile[];
  suggestions: string[];
}

export const PENDING_BACKEND_PROFILE_MESSAGE = "Perfil completo ainda nao foi carregado pelo backend.";

export function createPendingBackendProfile(columns: string[], rows = 0): DataProfile {
  return {
    rows,
    columns: columns.length,
    duplicateRows: 0,
    qualityScore: 0,
    quality: {
      completenessPct: 0,
      duplicatePct: 0,
      missingCells: 0,
      totalCells: Math.max(rows * Math.max(columns.length, 1), 1)
    },
    columnProfiles: columns.map((name) => ({
      name,
      kind: "empty",
      missing: 0,
      unique: 0,
      examples: [],
      frequencies: []
    })),
    suggestions: [PENDING_BACKEND_PROFILE_MESSAGE]
  };
}

export function isPendingBackendProfile(profile?: DataProfile | null): boolean {
  return Boolean(profile?.suggestions.includes(PENDING_BACKEND_PROFILE_MESSAGE));
}

export type PrepOperation =
  | "sort"
  | "filter"
  | "filter-out"
  | "map-values"
  | "python-code"
  | "rename"
  | "remove-column"
  | "drop-missing-rows"
  | "drop-low-complete"
  | "drop-id-columns"
  | "auto-clean"
  | "cast"
  | "fill-missing"
  | "fill-all-numeric"
  | "fill-all-categorical"
  | "fill-mean"
  | "fill-median"
  | "fill-mode"
  | "fill-forward"
  | "fill-backward"
  | "missing-indicator"
  | "knn-impute"
  | "iterative-impute"
  | "clip-iqr"
  | "clip-all-numeric"
  | "zscore-clip"
  | "winsorize"
  | "isolation-flag"
  | "one-hot"
  | "one-hot-all-categorical"
  | "ordinal-encode"
  | "frequency-encode"
  | "target-encode"
  | "hash-encode"
  | "standard-scale"
  | "scale-all-numeric"
  | "minmax-scale"
  | "robust-scale"
  | "log-transform"
  | "power-transform"
  | "quantile-transform"
  | "text-clean"
  | "text-stopwords"
  | "text-stem"
  | "text-ngrams"
  | "text-tfidf"
  | "text-embedding"
  | "date-parse"
  | "timezone-shift"
  | "temporal-parts"
  | "lag"
  | "rolling-mean"
  | "holiday-flag"
  | "formula"
  | "bin"
  | "ratio"
  | "interaction"
  | "group-aggregate"
  | "low-variance-select"
  | "high-correlation-select"
  | "mutual-information-select"
  | "model-importance-select"
  | "manual-feature-select"
  | "stratified-sample"
  | "oversample"
  | "undersample"
  | "smote"
  | "class-weights"
  | "train-validation-test-split"
  | "head-sample"
  | "tail-sample"
  | "random-sample"
  | "fuzzy-join"
  | "composite-join"
  | "cardinality-check"
  | "pivot"
  | "unpivot"
  | "window-row-number"
  | "dictionary-enrich"
  | "holiday-enrich"
  | "geocode-enrich"
  | "dedupe"
  | "aggregate-count"
  | "join";

export interface PrepStep {
  id: string;
  operation: PrepOperation;
  column?: string;
  value?: string;
  target?: string;
  direction?: "asc" | "desc";
  joinType?: "inner" | "left" | "right" | "full";
  rightRows?: DataRow[];
  rightName?: string;
  parameters?: {
    fillValue?: DataRow[string];
    categories?: string[];
    lower?: number;
    upper?: number;
    mean?: number;
    stdDev?: number;
    valueMap?: Record<string, string>;
  };
}

export interface DataPackage {
  name: string;
  rows: DataRow[];
  totalRows?: number;
  truncated?: boolean;
}

export interface FullProfileProgress {
  phase: "profiling" | "complete" | "error";
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  rows: number;
  message: string;
}

export interface FullProfileOptions {
  onProgress?: (progress: FullProfileProgress) => void;
  maxTrackedUnique?: number;
}

export interface ParseProgress {
  phase: "reading" | "parsing" | "finalizing";
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  rows: number;
  message: string;
}

export interface ParseDataOptions {
  onProgress?: (progress: ParseProgress) => void;
  /** Delimitador de arquivos tabulares. Quando ausente, o parser detecta automaticamente. */
  delimiter?: string;
  /**
   * Undefined means no row cap. Use a number when the UI needs an operational sample.
   */
  maxRows?: number;
}

export interface FullExecutionProgress {
  phase: "validating" | "processing" | "writing" | "complete" | "error";
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  inputRows: number;
  outputRows: number;
  message: string;
}

export interface FullExecutionResult {
  name: string;
  rows: DataRow[];
  totalRows: number;
  outputRows: number;
  columns: string[];
  blob: Blob;
  bytes: number;
}

export interface FullExecutionOptions {
  previewRows?: number;
  batchSize?: number;
  profile?: DataProfile;
  signal?: AbortSignal;
  onProgress?: (progress: FullExecutionProgress) => void;
}

export type ValidationRuleType = "required" | "type" | "range" | "regex" | "domain" | "unique" | "cross-column" | "custom";

export interface ValidationRule {
  id: string;
  column: string;
  type: ValidationRuleType;
  expectedType?: ColumnKind;
  min?: number;
  max?: number;
  pattern?: string;
  allowedValues?: string[];
  severity?: "info" | "warning" | "error";
  leftColumn?: string;
  operator?: "<" | "<=" | ">" | ">=" | "==" | "!=";
  rightColumn?: string;
  expression?: string;
}

export interface ValidationIssue {
  rowIndex: number;
  column: string;
  ruleId: string;
  message: string;
  value: DataRow[string];
  severity: NonNullable<ValidationRule["severity"]>;
}

export interface ValidationReport {
  totalRules: number;
  checkedRows: number;
  issueCount: number;
  passed: boolean;
  issues: ValidationIssue[];
  ruleSummaries: Array<{ ruleId: string; label: string; issueCount: number }>;
}

export interface DriftReport {
  baselineRows: number;
  currentRows: number;
  rowDeltaPct: number;
  addedColumns: string[];
  removedColumns: string[];
  typeChanges: Array<{ column: string; from: ColumnKind; to: ColumnKind }>;
  numericDrift: Array<{ column: string; baselineMean: number; currentMean: number; deltaPct: number }>;
  categoricalDrift: Array<{ column: string; distance: number; topBaseline: string; topCurrent: string }>;
  driftScore: number;
  hasDrift: boolean;
}

export interface Mvp4AnalysisReport {
  histograms: Array<{ column: string; bins: Array<{ label: string; count: number }> }>;
  boxplots: Array<{ column: string; min: number; q1: number; median: number; q3: number; max: number }>;
  correlationMatrix: Array<{ left: string; right: string; value: number }>;
  missingnessMap: Array<{ rowIndex: number; missingColumns: string[] }>;
  distributionComparison: Array<{ column: string; baselineTop: string; currentTop: string; distance: number }>;
  leakageReport: Array<{ column: string; reason: string; risk: number }>;
  biasReport: Array<{ column: string; group: string; count: number; targetRate?: number }>;
  splitSummary: Array<{ split: string; count: number }>;
  sampleSummary: Array<{ strategy: string; count: number; preview: DataRow[] }>;
  charts: {
    bars: Array<{ column: string; value: string; count: number }>;
    line: Array<{ index: number; value: number }>;
    scatter: Array<{ x: number; y: number }>;
    heatmap: Array<{ left: string; right: string; value: number }>;
  };
}

export function parseDelimited(text: string): DataRow[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(lines[0], delimiter).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line, delimiter);
    return headers.reduce<DataRow>((row, header, index) => {
      row[header] = coerceValue(values[index] ?? "");
      return row;
    }, {});
  });
}

export async function parseDataFile(file: File, options: ParseDataOptions = {}): Promise<DataPackage> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;

  if (extension === "xlsx") {
    options.onProgress?.({ phase: "reading", percent: 10, loadedBytes: 0, totalBytes: file.size, rows: 0, message: "Lendo planilha..." });
    const { readSheet } = await import("read-excel-file/browser");
    const sheetRows = await readSheet(file);
    const rows = rowsFromMatrix(sheetRows);
    options.onProgress?.({ phase: "finalizing", percent: 100, loadedBytes: file.size, totalBytes: file.size, rows: rows.length, message: "Planilha carregada." });
    return { name: file.name, rows: rows.slice(0, maxRows), totalRows: rows.length, truncated: rows.length > maxRows };
  }

  if (extension === "parquet") {
    options.onProgress?.({ phase: "reading", percent: 10, loadedBytes: 0, totalBytes: file.size, rows: 0, message: "Lendo Parquet..." });
    const { parquetReadObjects } = await import("hyparquet");
    const rows = await parquetReadObjects({ file: await file.arrayBuffer() });
    const normalized = normalizeRows(rows);
    options.onProgress?.({ phase: "finalizing", percent: 100, loadedBytes: file.size, totalBytes: file.size, rows: normalized.length, message: "Parquet carregado." });
    return { name: file.name, rows: normalized.slice(0, maxRows), totalRows: normalized.length, truncated: normalized.length > maxRows };
  }

  if (extension === "csv" || extension === "tsv" || !extension) {
    return parseDelimitedFile(file, options);
  }

  options.onProgress?.({ phase: "reading", percent: 15, loadedBytes: 0, totalBytes: file.size, rows: 0, message: "Lendo arquivo..." });
  const parsed = parseDataText(file.name, await file.text());
  options.onProgress?.({ phase: "finalizing", percent: 100, loadedBytes: file.size, totalBytes: file.size, rows: parsed.rows.length, message: "Arquivo carregado." });
  return { ...parsed, rows: parsed.rows.slice(0, maxRows), totalRows: parsed.rows.length, truncated: parsed.rows.length > maxRows };
}

export async function parseDelimitedFile(file: File, options: ParseDataOptions = {}): Promise<DataPackage> {
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const decoder = new TextDecoder();
  const reader = file.stream().getReader();
  let loadedBytes = 0;
  let buffer = "";
  let delimiter = options.delimiter || ",";
  let headers: string[] = [];
  let totalRows = 0;
  let stoppedAtPreviewLimit = false;
  const rows: DataRow[] = [];

  options.onProgress?.({ phase: "reading", percent: 0, loadedBytes: 0, totalBytes: file.size, rows: 0, message: "Iniciando upload..." });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loadedBytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    if (!headers.length && lines.length) {
      const headerLine = lines.shift() ?? "";
      delimiter = options.delimiter || [",", ";", "\t", "|"]
        .map((candidate) => ({ candidate, columns: splitDelimitedLine(headerLine, candidate).length }))
        .sort((left, right) => right.columns - left.columns)[0].candidate;
      headers = splitDelimitedLine(headerLine, delimiter).map((header) => header.trim());
    }

    for (const line of lines) {
      if (!line.trim() || !headers.length) continue;
      totalRows += 1;
      if (rows.length < maxRows) {
        const values = splitDelimitedLine(line, delimiter);
        rows.push(
          headers.reduce<DataRow>((row, header, index) => {
            row[header] = coerceValue(values[index] ?? "");
            return row;
          }, {})
        );
      }
      if (Number.isFinite(maxRows) && rows.length >= maxRows) {
        stoppedAtPreviewLimit = true;
        break;
      }
    }

    options.onProgress?.({
      phase: "parsing",
      percent: stoppedAtPreviewLimit ? 98 : Math.min(95, Math.round((loadedBytes / Math.max(file.size, 1)) * 95)),
      loadedBytes,
      totalBytes: file.size,
      rows: totalRows,
      message: stoppedAtPreviewLimit
        ? `Preview pronto com ${rows.length.toLocaleString("pt-BR")} linhas.`
        : `Processando ${totalRows.toLocaleString("pt-BR")} linhas...`
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (stoppedAtPreviewLimit) {
      await reader.cancel();
      break;
    }
  }

  const tail = `${buffer}${decoder.decode()}`.trim();
  if (!stoppedAtPreviewLimit && tail && headers.length) {
    totalRows += 1;
    if (rows.length < maxRows) {
      const values = splitDelimitedLine(tail, delimiter);
      rows.push(
        headers.reduce<DataRow>((row, header, index) => {
          row[header] = coerceValue(values[index] ?? "");
          return row;
        }, {})
      );
    }
  }

  options.onProgress?.({
    phase: "finalizing",
    percent: 100,
    loadedBytes: stoppedAtPreviewLimit ? loadedBytes : file.size,
    totalBytes: file.size,
    rows: totalRows,
    message: stoppedAtPreviewLimit ? "Preview carregado. Arquivo completo fica disponivel para execucao em chunks." : "Upload concluido."
  });

  return { name: file.name, rows, totalRows: stoppedAtPreviewLimit ? undefined : totalRows, truncated: stoppedAtPreviewLimit || totalRows > rows.length };
}

export async function profileDelimitedFile(file: File, options: FullProfileOptions = {}): Promise<DataProfile> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && extension !== "csv" && extension !== "tsv") {
    throw new Error("Perfil completo em streaming esta disponivel para CSV/TSV nesta fase.");
  }

  const maxTrackedUnique = options.maxTrackedUnique ?? 5000;
  const decoder = new TextDecoder();
  const reader = file.stream().getReader();
  const duplicateKeys = new Set<string>();
  const duplicateKeyLimit = 20000;
  const stats = new Map<
    string,
    {
      missing: number;
      examples: Set<string>;
      uniques: Set<string>;
      uniqueOverflow: boolean;
      frequencies: Map<string, number>;
      numericCount: number;
      numericSum: number;
      numericMean: number;
      numericM2: number;
      numericSample: number[];
      min?: number;
      max?: number;
      booleanCompatible: boolean;
      dateCompatible: boolean;
    }
  >();
  let loadedBytes = 0;
  let buffer = "";
  let delimiter = extension === "tsv" ? "\t" : ",";
  let headers: string[] = [];
  let rows = 0;
  let duplicateRows = 0;

  const ensureColumn = (column: string) => {
    if (!stats.has(column)) {
      stats.set(column, {
        missing: 0,
        examples: new Set(),
        uniques: new Set(),
        uniqueOverflow: false,
        frequencies: new Map(),
        numericCount: 0,
        numericSum: 0,
        numericMean: 0,
        numericM2: 0,
        numericSample: [],
        booleanCompatible: true,
        dateCompatible: true
      });
    }
    return stats.get(column)!;
  };

  const visitLine = (line: string) => {
    if (!line.trim() || !headers.length) return;
    rows += 1;
    const values = splitDelimitedLine(line, delimiter);
    const rowKey = rows <= duplicateKeyLimit ? values.join("\u001f") : "";
    if (rowKey) {
      if (duplicateKeys.has(rowKey)) duplicateRows += 1;
      else duplicateKeys.add(rowKey);
    }
    headers.forEach((header, index) => {
      const value = coerceValue(values[index] ?? "");
      const column = ensureColumn(header);
      if (value === null || value === "") {
        column.missing += 1;
        return;
      }
      const text = String(value);
      if (column.examples.size < 3) column.examples.add(text);
      if (!column.uniqueOverflow) {
        column.uniques.add(text);
        if (column.uniques.size > maxTrackedUnique) column.uniqueOverflow = true;
      }
      if (column.frequencies.size < 50 || column.frequencies.has(text)) {
        column.frequencies.set(text, (column.frequencies.get(text) ?? 0) + 1);
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        column.numericCount += 1;
        column.numericSum += numeric;
        const delta = numeric - column.numericMean;
        column.numericMean += delta / column.numericCount;
        column.numericM2 += delta * (numeric - column.numericMean);
        if (column.numericSample.length < 4096) {
          column.numericSample.push(numeric);
        } else {
          const replacement = Math.abs(hash(`${rows}:${index}`)) % column.numericCount;
          if (replacement < column.numericSample.length) column.numericSample[replacement] = numeric;
        }
        column.min = column.min === undefined ? numeric : Math.min(column.min, numeric);
        column.max = column.max === undefined ? numeric : Math.max(column.max, numeric);
      }
      if (!["true", "false", "0", "1"].includes(text.toLowerCase())) column.booleanCompatible = false;
      if (Number.isNaN(Date.parse(text))) column.dateCompatible = false;
    });
  };

  options.onProgress?.({ phase: "profiling", percent: 0, loadedBytes: 0, totalBytes: file.size, rows: 0, message: "Iniciando perfil completo..." });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loadedBytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    if (!headers.length && lines.length) {
      const headerLine = lines.shift() ?? "";
      delimiter = headerLine.includes("\t") ? "\t" : delimiter;
      headers = splitDelimitedLine(headerLine, delimiter).map((header) => header.trim());
      headers.forEach(ensureColumn);
    }

    lines.forEach(visitLine);
    options.onProgress?.({
      phase: "profiling",
      percent: Math.min(99, Math.round((loadedBytes / Math.max(file.size, 1)) * 100)),
      loadedBytes,
      totalBytes: file.size,
      rows,
      message: `Calculando qualidade no arquivo completo: ${rows.toLocaleString("pt-BR")} linhas...`
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const tail = `${buffer}${decoder.decode()}`.trim();
  if (tail) visitLine(tail);

  const columnProfiles: ColumnProfile[] = headers.map((name) => {
    const column = ensureColumn(name);
    const present = rows - column.missing;
    const kind: ColumnKind =
      present === 0
        ? "empty"
        : column.numericCount === present
          ? "number"
          : column.booleanCompatible
            ? "boolean"
            : column.dateCompatible
              ? "date"
              : "text";
    const sortedSample = [...column.numericSample].sort((a, b) => a - b);
    return {
      name,
      kind,
      missing: column.missing,
      unique: column.uniqueOverflow ? maxTrackedUnique : column.uniques.size,
      uniqueCapped: column.uniqueOverflow,
      trackedValues: column.uniqueOverflow ? undefined : Array.from(column.uniques).slice(0, 50),
      examples: Array.from(column.examples),
      min: kind === "number" ? column.min : undefined,
      q1: kind === "number" ? percentile(sortedSample, 0.25) : undefined,
      median: kind === "number" ? percentile(sortedSample, 0.5) : undefined,
      q3: kind === "number" ? percentile(sortedSample, 0.75) : undefined,
      max: kind === "number" ? column.max : undefined,
      mean: kind === "number" && column.numericCount ? Number((column.numericSum / column.numericCount).toFixed(2)) : undefined,
      stdDev:
        kind === "number" && column.numericCount > 1
          ? Number(Math.sqrt(column.numericM2 / column.numericCount).toFixed(4))
          : undefined,
      frequencies: Array.from(column.frequencies.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }))
    };
  });
  const totalCells = Math.max(rows * Math.max(headers.length, 1), 1);
  const missingCells = columnProfiles.reduce((sum, profile) => sum + profile.missing, 0);
  const quality = qualityBreakdown(rows, totalCells, missingCells, duplicateRows);

  options.onProgress?.({
    phase: "complete",
    percent: 100,
    loadedBytes: file.size,
    totalBytes: file.size,
    rows,
    message: `Perfil completo concluido: ${rows.toLocaleString("pt-BR")} linhas.`
  });

  return {
    rows,
    columns: headers.length,
    duplicateRows,
    duplicateRowsApproximate: rows > duplicateKeyLimit,
    qualityScore: qualityScoreFromBreakdown(quality),
    quality,
    columnProfiles,
    suggestions: buildSuggestions(columnProfiles, duplicateRows)
  };
}

const profileResolvedOperations = new Set<PrepOperation>([
  "drop-low-complete",
  "auto-clean",
  "fill-all-numeric",
  "fill-all-categorical",
  "clip-all-numeric",
  "one-hot-all-categorical",
  "scale-all-numeric",
  "fill-mean",
  "fill-median",
  "fill-mode",
  "clip-iqr",
  "one-hot",
  "standard-scale"
]);

export function resolvePrepStepsForFullFile(steps: PrepStep[], profile: DataProfile): PrepStep[] {
  const profileByName = new Map(profile.columnProfiles.map((column) => [column.name, column]));
  const resolved: PrepStep[] = [];

  const resolveOne = (step: PrepStep) => {
    if (step.operation === "auto-clean") {
      resolveOne({ ...step, id: `${step.id}-dedupe`, operation: "dedupe" });
      resolveOne({ ...step, id: `${step.id}-complete`, operation: "drop-low-complete" });
      resolveOne({ ...step, id: `${step.id}-numeric`, operation: "fill-all-numeric" });
      resolveOne({ ...step, id: `${step.id}-categorical`, operation: "fill-all-categorical" });
      return;
    }

    if (step.operation === "drop-low-complete") {
      const threshold = Math.max(0, Math.min(100, Number(step.value ?? 80))) / 100;
      profile.columnProfiles
        .filter((column) => (profile.rows - column.missing) / Math.max(profile.rows, 1) < threshold)
        .forEach((column) => resolved.push({ id: `${step.id}-${column.name}`, operation: "remove-column", column: column.name }));
      return;
    }

    if (step.operation === "fill-all-numeric") {
      profile.columnProfiles
        .filter((column) => column.kind === "number" && column.missing > 0 && column.mean !== undefined)
        .forEach((column) =>
          resolved.push({
            id: `${step.id}-${column.name}`,
            operation: "fill-missing",
            column: column.name,
            parameters: { fillValue: column.mean }
          })
        );
      return;
    }

    if (step.operation === "fill-all-categorical") {
      profile.columnProfiles
        .filter((column) => !["number", "empty"].includes(column.kind) && column.missing > 0 && column.frequencies[0])
        .forEach((column) =>
          resolved.push({
            id: `${step.id}-${column.name}`,
            operation: "fill-missing",
            column: column.name,
            parameters: { fillValue: coerceValue(column.frequencies[0].value) }
          })
        );
      return;
    }

    if (step.operation === "clip-all-numeric") {
      profile.columnProfiles
        .filter((column) => column.kind === "number" && !isIdentifierColumn(column.name))
        .forEach((column) => resolveOne({ ...step, id: `${step.id}-${column.name}`, operation: "clip-iqr", column: column.name }));
      return;
    }

    if (step.operation === "scale-all-numeric") {
      profile.columnProfiles
        .filter((column) => column.kind === "number" && !isIdentifierColumn(column.name))
        .forEach((column) => resolveOne({ ...step, id: `${step.id}-${column.name}`, operation: "standard-scale", column: column.name }));
      return;
    }

    if (step.operation === "one-hot-all-categorical") {
      const maxUnique = Math.max(2, Number(step.value ?? 20));
      profile.columnProfiles
        .filter(
          (column) =>
            !["number", "empty"].includes(column.kind) &&
            !column.uniqueCapped &&
            column.unique <= maxUnique &&
            !isIdentifierColumn(column.name)
        )
        .forEach((column) => resolveOne({ ...step, id: `${step.id}-${column.name}`, operation: "one-hot", column: column.name }));
      return;
    }

    const columnProfile = step.column ? profileByName.get(step.column) : undefined;
    if (step.operation === "fill-mean" || step.operation === "fill-median" || step.operation === "fill-mode") {
      const fillValue =
        step.operation === "fill-mode"
          ? columnProfile?.frequencies[0]?.value
          : step.operation === "fill-median"
            ? columnProfile?.median
            : columnProfile?.mean;
      resolved.push({
        ...step,
        operation: "fill-missing",
        parameters: { fillValue: typeof fillValue === "string" ? coerceValue(fillValue) : fillValue }
      });
      return;
    }

    if (step.operation === "clip-iqr" && columnProfile?.q1 !== undefined && columnProfile.q3 !== undefined) {
      const iqr = columnProfile.q3 - columnProfile.q1;
      resolved.push({
        ...step,
        parameters: { lower: columnProfile.q1 - 1.5 * iqr, upper: columnProfile.q3 + 1.5 * iqr }
      });
      return;
    }

    if (step.operation === "standard-scale" && columnProfile?.mean !== undefined) {
      resolved.push({
        ...step,
        parameters: { mean: columnProfile.mean, stdDev: columnProfile.stdDev ?? 1 }
      });
      return;
    }

    if (step.operation === "one-hot" && columnProfile?.trackedValues?.length) {
      resolved.push({ ...step, parameters: { categories: [...columnProfile.trackedValues, "missing"] } });
      return;
    }

    resolved.push(step);
  };

  steps.forEach(resolveOne);
  return resolved;
}

const streamingCompatibleOperations = new Set<PrepOperation>([
  "dedupe",
  "filter",
  "filter-out",
  "map-values",
  "rename",
  "remove-column",
  "drop-missing-rows",
  "drop-id-columns",
  "cast",
  "fill-missing",
  "clip-iqr",
  "one-hot",
  "standard-scale",
  "missing-indicator",
  "hash-encode",
  "text-clean",
  "text-stopwords",
  "text-stem",
  "text-ngrams",
  "text-tfidf",
  "text-embedding",
  "date-parse",
  "timezone-shift",
  "temporal-parts",
  "formula",
  "bin",
  "ratio",
  "interaction",
  "holiday-flag",
  "dictionary-enrich",
  "holiday-enrich",
  "geocode-enrich",
  "cardinality-check"
]);

export function unsupportedStreamingSteps(steps: PrepStep[], profile?: DataProfile) {
  const inspectedSteps = profile ? resolvePrepStepsForFullFile(steps, profile) : steps;
  return inspectedSteps.filter(
    (step) =>
      !streamingCompatibleOperations.has(step.operation) ||
      (profileResolvedOperations.has(step.operation) && !profile && !step.parameters)
  );
}

export async function executePrepStepsOnDelimitedFile(
  file: File,
  steps: PrepStep[],
  options: FullExecutionOptions = {}
): Promise<FullExecutionResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && extension !== "csv" && extension !== "tsv") {
    throw new Error("Execucao completa em streaming esta disponivel para CSV/TSV nesta fase.");
  }

  let executionProfile = options.profile;
  if (!executionProfile && steps.some((step) => profileResolvedOperations.has(step.operation))) {
    executionProfile = await profileDelimitedFile(file, {
      onProgress: (progress) =>
        options.onProgress?.({
          phase: progress.phase === "error" ? "error" : "validating",
          percent: Math.round(progress.percent * 0.3),
          loadedBytes: progress.loadedBytes,
          totalBytes: progress.totalBytes,
          inputRows: progress.rows,
          outputRows: 0,
          message: `Primeira passagem: ${progress.message}`
        })
    });
  }
  const resolvedSteps = executionProfile ? resolvePrepStepsForFullFile(steps, executionProfile) : steps;
  const unsupported = unsupportedStreamingSteps(resolvedSteps);
  if (unsupported.length) {
    throw new Error(`Receita contem operacoes que ainda nao sao seguras em streaming: ${unsupported.map(describeStep).join("; ")}`);
  }

  const decoder = new TextDecoder();
  const reader = file.stream().getReader();
  const previewLimit = options.previewRows ?? 1000;
  const batchSize = options.batchSize ?? 5000;
  let loadedBytes = 0;
  let buffer = "";
  let delimiter = extension === "tsv" ? "\t" : ",";
  let headers: string[] = [];
  let inputRows = 0;
  let outputRows = 0;
  let outputColumns: string[] = [];
  let wroteHeader = false;
  let batch: DataRow[] = [];
  const preview: DataRow[] = [];
  const blobParts: BlobPart[] = [];
  const seenRows = new Set<string>();
  const pipelineSteps = resolvedSteps.filter((step) => step.operation !== "dedupe");
  const shouldDedupe = resolvedSteps.some((step) => step.operation === "dedupe");

  const flushBatch = async () => {
    if (options.signal?.aborted) throw new Error("Execucao cancelada pelo usuario.");
    if (!batch.length) return;
    const transformed = applyPrepSteps(batch, pipelineSteps).filter((row) => {
      if (!shouldDedupe) return true;
      const key = JSON.stringify(row);
      if (seenRows.has(key)) return false;
      seenRows.add(key);
      return true;
    });

    transformed.forEach((row) => {
      if (!outputColumns.length) outputColumns = Object.keys(row);
      Object.keys(row).forEach((column) => {
        if (!outputColumns.includes(column)) outputColumns.push(column);
      });
    });

    if (!wroteHeader && outputColumns.length) {
      blobParts.push(`${outputColumns.map(escapeCsvCell).join(delimiter)}\n`);
      wroteHeader = true;
    }

    if (transformed.length) {
      blobParts.push(
        `${transformed.map((row) => outputColumns.map((column) => escapeCsvCell(row[column])).join(delimiter)).join("\n")}\n`
      );
    }
    transformed.forEach((row) => {
      if (preview.length < previewLimit) preview.push(row);
    });
    outputRows += transformed.length;
    batch = [];
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  options.onProgress?.({
    phase: "validating",
    percent: 0,
    loadedBytes: 0,
    totalBytes: file.size,
    inputRows: 0,
    outputRows: 0,
    message: "Validando receita para execucao completa..."
  });

  while (true) {
    if (options.signal?.aborted) throw new Error("Execucao cancelada pelo usuario.");
    const { done, value } = await reader.read();
    if (done) break;
    loadedBytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    if (!headers.length && lines.length) {
      const headerLine = lines.shift() ?? "";
      delimiter = headerLine.includes("\t") ? "\t" : delimiter;
      headers = splitDelimitedLine(headerLine, delimiter).map((header) => header.trim());
    }

    for (const line of lines) {
      if (!line.trim() || !headers.length) continue;
      inputRows += 1;
      batch.push(rowFromDelimitedLine(line, headers, delimiter));
      if (batch.length >= batchSize) await flushBatch();
    }

    options.onProgress?.({
      phase: "processing",
      percent: Math.min(98, Math.round((loadedBytes / Math.max(file.size, 1)) * 98)),
      loadedBytes,
      totalBytes: file.size,
      inputRows,
      outputRows,
      message: `Executando receita no arquivo inteiro: ${inputRows.toLocaleString("pt-BR")} linhas lidas...`
    });
  }

  const tail = `${buffer}${decoder.decode()}`.trim();
  if (tail && headers.length) {
    inputRows += 1;
    batch.push(rowFromDelimitedLine(tail, headers, delimiter));
  }
  await flushBatch();

  options.onProgress?.({
    phase: "writing",
    percent: 99,
    loadedBytes: file.size,
    totalBytes: file.size,
    inputRows,
    outputRows,
    message: "Gravando CSV refinado..."
  });

  if (!wroteHeader && headers.length) {
    outputColumns = headers;
    blobParts.push(`${headers.map(escapeCsvCell).join(delimiter)}\n`);
  }

  const blob = new Blob(blobParts, { type: "text/csv;charset=utf-8" });
  options.onProgress?.({
    phase: "complete",
    percent: 100,
    loadedBytes: file.size,
    totalBytes: file.size,
    inputRows,
    outputRows,
    message: `Execucao completa concluida: ${outputRows.toLocaleString("pt-BR")} linhas gravadas.`
  });

  return {
    name: `${file.name.replace(/\.[^.]+$/, "")}_refined.csv`,
    rows: preview,
    totalRows: inputRows,
    outputRows,
    columns: outputColumns,
    blob,
    bytes: blob.size
  };
}

function rowFromDelimitedLine(line: string, headers: string[], delimiter: string): DataRow {
  const values = splitDelimitedLine(line, delimiter);
  return headers.reduce<DataRow>((row, header, index) => {
    row[header] = coerceValue(values[index] ?? "");
    return row;
  }, {});
}

function escapeCsvCell(value: DataRow[string]) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r\t]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function parseDataText(name: string, text: string): DataPackage {
  const extension = name.split(".").pop()?.toLowerCase();

  if (extension === "json" || extension === "jsonl") {
    const parsed =
      extension === "jsonl"
        ? text
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.rows;
    return { name, rows: normalizeRows(rows ?? []) };
  }

  return { name, rows: parseDelimited(text) };
}

export function profileRows(rows: DataRow[]): DataProfile {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const duplicateRows = rows.length - new Set(rows.map((row) => JSON.stringify(row))).size;
  const columnProfiles = columns.map((column) => profileColumn(column, rows));
  const totalCells = Math.max(rows.length * Math.max(columns.length, 1), 1);
  const missingCells = columnProfiles.reduce((sum, profile) => sum + profile.missing, 0);
  const quality = qualityBreakdown(rows.length, totalCells, missingCells, duplicateRows);

  return {
    rows: rows.length,
    columns: columns.length,
    duplicateRows,
    qualityScore: qualityScoreFromBreakdown(quality),
    quality,
    columnProfiles,
    suggestions: buildSuggestions(columnProfiles, duplicateRows)
  };
}

function qualityBreakdown(rows: number, totalCells: number, missingCells: number, duplicateRows: number) {
  return {
    completenessPct: Number((((totalCells - missingCells) / Math.max(totalCells, 1)) * 100).toFixed(1)),
    duplicatePct: Number(((duplicateRows / Math.max(rows, 1)) * 100).toFixed(1)),
    missingCells,
    totalCells
  };
}

function qualityScoreFromBreakdown(quality: DataProfile["quality"]) {
  return Math.max(0, Math.round(quality.completenessPct - quality.duplicatePct * 0.25));
}

export function applyPrepSteps(rows: DataRow[], steps: PrepStep[]): DataRow[] {
  return steps.reduce((currentRows, step) => applyPrepStep(currentRows, step), rows);
}

export function projectProfileAfterSteps(profile: DataProfile, steps: PrepStep[]): DataProfile {
  const resolvedSteps = resolvePrepStepsForFullFile(steps, profile);
  let rows = profile.rows;
  let duplicateRows = profile.duplicateRows;
  let columns: ColumnProfile[] = profile.columnProfiles.map((column) => ({
    ...column,
    examples: [...column.examples],
    trackedValues: column.trackedValues ? [...column.trackedValues] : undefined,
    frequencies: column.frequencies.map((frequency) => ({ ...frequency }))
  }));

  resolvedSteps.forEach((step) => {
    if (step.operation === "dedupe") {
      rows = Math.max(0, rows - duplicateRows);
      duplicateRows = 0;
      return;
    }
    if (step.operation === "remove-column" && step.column) {
      columns = columns.filter((column) => column.name !== step.column);
      return;
    }
    if (step.operation === "rename" && step.column && step.target) {
      columns = columns.map((column) => (column.name === step.column ? { ...column, name: step.target! } : column));
      return;
    }
    if (step.operation === "fill-missing" && step.column) {
      columns = columns.map((column) => (column.name === step.column ? { ...column, missing: 0 } : column));
      return;
    }
    if (step.operation === "one-hot" && step.column && step.parameters?.categories?.length) {
      const encoded = step.parameters.categories.map<ColumnProfile>((category) => ({
        name: `${step.column}_${slug(category)}`,
        kind: "number",
        missing: 0,
        unique: 2,
        trackedValues: ["0", "1"],
        examples: ["0", "1"],
        min: 0,
        q1: 0,
        median: 0,
        q3: 1,
        max: 1,
        mean: undefined,
        stdDev: undefined,
        frequencies: []
      }));
      columns = [...columns.filter((column) => column.name !== step.column), ...encoded];
      return;
    }
    if (step.operation === "standard-scale" && step.column) {
      columns = columns.map((column) =>
        column.name === step.column ? { ...column, mean: 0, stdDev: 1, min: undefined, max: undefined } : column
      );
    }
  });

  const totalCells = Math.max(rows * Math.max(columns.length, 1), 1);
  const missingCells = columns.reduce((sum, column) => sum + Math.min(column.missing, rows), 0);
  const quality = qualityBreakdown(rows, totalCells, missingCells, duplicateRows);
  return {
    rows,
    columns: columns.length,
    duplicateRows,
    duplicateRowsApproximate: profile.duplicateRowsApproximate,
    qualityScore: qualityScoreFromBreakdown(quality),
    quality,
    columnProfiles: columns,
    suggestions: buildSuggestions(columns, duplicateRows)
  };
}

export function validateRows(rows: DataRow[], rules: ValidationRule[]): ValidationReport {
  const issues = rules.flatMap((rule) => validateRule(rows, rule));
  const ruleSummaries = rules.map((rule) => ({
    ruleId: rule.id,
    label: describeValidationRule(rule),
    issueCount: issues.filter((issue) => issue.ruleId === rule.id).length
  }));

  return {
    totalRules: rules.length,
    checkedRows: rows.length,
    issueCount: issues.length,
    passed: issues.length === 0,
    issues,
    ruleSummaries
  };
}

export function exportValidationReport(report: ValidationReport) {
  return JSON.stringify(report, null, 2);
}

export function detectDrift(baselineRows: DataRow[], currentRows: DataRow[]): DriftReport {
  const baselineProfile = profileRows(baselineRows);
  const currentProfile = profileRows(currentRows);
  const baselineColumns = new Set(baselineProfile.columnProfiles.map((column) => column.name));
  const currentColumns = new Set(currentProfile.columnProfiles.map((column) => column.name));
  const sharedColumns = baselineProfile.columnProfiles
    .map((column) => column.name)
    .filter((column) => currentColumns.has(column));
  const analyticSharedColumns = sharedColumns.filter((column) => !isIdentifierColumn(column));

  const addedColumns = currentProfile.columnProfiles.map((column) => column.name).filter((column) => !baselineColumns.has(column));
  const removedColumns = baselineProfile.columnProfiles.map((column) => column.name).filter((column) => !currentColumns.has(column));
  const typeChanges = sharedColumns.flatMap((column) => {
    const baseline = baselineProfile.columnProfiles.find((item) => item.name === column);
    const current = currentProfile.columnProfiles.find((item) => item.name === column);
    return baseline && current && baseline.kind !== current.kind ? [{ column, from: baseline.kind, to: current.kind }] : [];
  });
  const numericDrift = analyticSharedColumns.flatMap((column) => {
    const baseline = baselineProfile.columnProfiles.find((item) => item.name === column);
    const current = currentProfile.columnProfiles.find((item) => item.name === column);
    if (baseline?.mean === undefined || current?.mean === undefined || baseline.kind !== "number" || current.kind !== "number") return [];
    const deltaPct = Number((((current.mean - baseline.mean) / Math.max(Math.abs(baseline.mean), 1)) * 100).toFixed(2));
    return Math.abs(deltaPct) >= 10 ? [{ column, baselineMean: baseline.mean, currentMean: current.mean, deltaPct }] : [];
  });
  const categoricalDrift = analyticSharedColumns.flatMap((column) => {
    const baseline = baselineProfile.columnProfiles.find((item) => item.name === column);
    const current = currentProfile.columnProfiles.find((item) => item.name === column);
    if (!baseline || !current || baseline.kind === "number" || current.kind === "number") return [];
    const distance = distributionDistance(baselineRows, currentRows, column);
    return distance >= 0.2
      ? [
          {
            column,
            distance,
            topBaseline: baseline.frequencies[0]?.value ?? "n/a",
            topCurrent: current.frequencies[0]?.value ?? "n/a"
          }
        ]
      : [];
  });

  const rowDeltaPct = Number((((currentRows.length - baselineRows.length) / Math.max(baselineRows.length, 1)) * 100).toFixed(2));
  const driftScore = Math.min(
    100,
    Math.round(
      addedColumns.length * 12 +
        removedColumns.length * 18 +
        typeChanges.length * 20 +
        numericDrift.reduce((sum, item) => sum + Math.min(Math.abs(item.deltaPct), 50) / 2, 0) +
        categoricalDrift.reduce((sum, item) => sum + item.distance * 50, 0) +
        Math.min(Math.abs(rowDeltaPct), 50) / 5
    )
  );

  return {
    baselineRows: baselineRows.length,
    currentRows: currentRows.length,
    rowDeltaPct,
    addedColumns,
    removedColumns,
    typeChanges,
    numericDrift,
    categoricalDrift,
    driftScore,
    hasDrift: driftScore >= 20
  };
}

export function analyzeMvp4(rows: DataRow[], baselineRows: DataRow[], targetColumn?: string, sensitiveColumn?: string): Mvp4AnalysisReport {
  const profile = profileRows(rows);
  const numericColumns = profile.columnProfiles.filter((column) => column.kind === "number" && !isIdentifierColumn(column.name)).map((column) => column.name);
  const categoricalColumns = profile.columnProfiles.filter((column) => column.kind !== "number").map((column) => column.name);
  const firstNumeric = numericColumns[0];
  const secondNumeric = numericColumns[1] ?? numericColumns[0];
  const firstCategorical = categoricalColumns[0] ?? profile.columnProfiles[0]?.name;

  return {
    histograms: numericColumns.map((column) => ({ column, bins: histogram(rows, column, 6) })),
    boxplots: profile.columnProfiles
      .filter((column) => column.kind === "number" && !isIdentifierColumn(column.name) && column.min !== undefined && column.q1 !== undefined && column.median !== undefined && column.q3 !== undefined && column.max !== undefined)
      .map((column) => ({ column: column.name, min: column.min!, q1: column.q1!, median: column.median!, q3: column.q3!, max: column.max! })),
    correlationMatrix: numericColumns.flatMap((left) => numericColumns.map((right) => ({ left, right, value: Number(correlation(rows, left, right).toFixed(4)) }))),
    missingnessMap: rows.map((row, rowIndex) => ({ rowIndex, missingColumns: Object.entries(row).filter(([, value]) => value === null || value === "").map(([key]) => key) })).filter((row) => row.missingColumns.length),
    distributionComparison: profile.columnProfiles
      .filter((column) => baselineRows.some((row) => Object.prototype.hasOwnProperty.call(row, column.name)))
      .map((column) => ({
        column: column.name,
        baselineTop: profileRows(baselineRows).columnProfiles.find((item) => item.name === column.name)?.frequencies[0]?.value ?? "n/a",
        currentTop: column.frequencies[0]?.value ?? "n/a",
        distance: distributionDistance(baselineRows, rows, column.name)
      })),
    leakageReport: detectLeakage(rows, targetColumn),
    biasReport: detectBias(rows, sensitiveColumn, targetColumn),
    splitSummary: summarize(rows.map((_, index) => (index % 10 < 7 ? "train" : index % 10 < 9 ? "validation" : "test")), "split"),
    sampleSummary: [
      { strategy: "head", count: Math.min(rows.length, 5), preview: rows.slice(0, 5) },
      { strategy: "tail", count: Math.min(rows.length, 5), preview: rows.slice(-5) },
      { strategy: "random", count: Math.min(rows.length, 5), preview: sampleOrSplit(rows, { id: "sample", operation: "random-sample", value: "5" }).slice(0, 5) }
    ],
    charts: {
      bars: firstCategorical ? topFrequencies(rows.map((row) => row[firstCategorical]).filter((value): value is string | number | boolean => value !== null && value !== "")).map((item) => ({ column: firstCategorical, value: item.value, count: item.count })) : [],
      line: firstNumeric ? rows.map((row, index) => ({ index, value: Number(row[firstNumeric]) })).filter((point) => Number.isFinite(point.value)) : [],
      scatter: firstNumeric ? rows.map((row) => ({ x: Number(row[firstNumeric]), y: Number(row[secondNumeric]) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) : [],
      heatmap: numericColumns.flatMap((left) => numericColumns.map((right) => ({ left, right, value: Number(Math.abs(correlation(rows, left, right)).toFixed(4)) })))
    }
  };
}

export function describeValidationRule(rule: ValidationRule) {
  const labels: Record<ValidationRuleType, string> = {
    required: `${rule.column} obrigatorio`,
    type: `${rule.column} deve ser ${rule.expectedType ?? "tipo esperado"}`,
    range: `${rule.column} entre ${rule.min ?? "-inf"} e ${rule.max ?? "+inf"}`,
    regex: `${rule.column} deve casar com /${rule.pattern ?? ""}/`,
    domain: `${rule.column} em [${rule.allowedValues?.join(", ") ?? ""}]`,
    unique: `${rule.column} unico`,
    "cross-column": `${rule.leftColumn ?? rule.column} ${rule.operator ?? "<="} ${rule.rightColumn ?? "coluna"}`,
    custom: `check seguro: ${rule.expression ?? ""}`
  };

  return labels[rule.type];
}

export function describeStep(step: PrepStep) {
  const labels: Record<PrepOperation, string> = {
    sort: `Ordenar ${step.column} ${step.direction ?? "asc"}`,
    filter: `Filtrar ${step.column} contem "${step.value ?? ""}"`,
    "filter-out": `Remover linhas onde ${step.column} contem "${step.value ?? ""}"`,
    "map-values": `Mapear valores de ${step.column}`,
    "python-code": "Executar codigo Python customizado",
    rename: `Renomear ${step.column} para ${step.target}`,
    "remove-column": `Remover coluna ${step.column}`,
    "drop-missing-rows": `Remover linhas sem valor em ${step.column}`,
    "drop-low-complete": `Remover colunas com completude abaixo de ${step.value ?? 80}%`,
    "drop-id-columns": "Remover colunas de ID",
    "auto-clean": "Limpeza automatica global",
    cast: `Converter ${step.column} para ${step.target}`,
    "fill-missing": `Preencher nulos em ${step.column} com "${step.value ?? ""}"`,
    "fill-all-numeric": "Preencher nulos numericos",
    "fill-all-categorical": "Preencher nulos categoricos",
    "fill-mean": `Preencher nulos em ${step.column} com media`,
    "fill-median": `Preencher nulos em ${step.column} com mediana`,
    "fill-mode": `Preencher nulos em ${step.column} com moda`,
    "fill-forward": `Forward fill em ${step.column}`,
    "fill-backward": `Backward fill em ${step.column}`,
    "missing-indicator": `Criar indicador de nulo para ${step.column}`,
    "knn-impute": `KNN imputation local em ${step.column}`,
    "iterative-impute": `Iterative imputation local em ${step.column}`,
    "clip-iqr": `Aplicar clipping IQR em ${step.column}`,
    "clip-all-numeric": "Aplicar clipping IQR em todos os numericos",
    "zscore-clip": `Aplicar z-score clipping em ${step.column}`,
    winsorize: `Aplicar winsorization em ${step.column}`,
    "isolation-flag": `Marcar outliers por isolamento em ${step.column}`,
    "one-hot": `Aplicar one-hot encoding em ${step.column}`,
    "one-hot-all-categorical": "Aplicar one-hot em categoricas",
    "ordinal-encode": `Aplicar ordinal encoding em ${step.column}`,
    "frequency-encode": `Aplicar frequency encoding em ${step.column}`,
    "target-encode": `Aplicar target encoding protegido em ${step.column} usando ${step.target}`,
    "hash-encode": `Aplicar hashing trick em ${step.column}`,
    "standard-scale": `Aplicar standard scaler em ${step.column}`,
    "scale-all-numeric": "Aplicar standard scaler em todos os numericos",
    "minmax-scale": `Aplicar min-max scaler em ${step.column}`,
    "robust-scale": `Aplicar robust scaler em ${step.column}`,
    "log-transform": `Aplicar log transform em ${step.column}`,
    "power-transform": `Aplicar power transform em ${step.column}`,
    "quantile-transform": `Aplicar quantile transform em ${step.column}`,
    "text-clean": `Limpar texto em ${step.column}`,
    "text-stopwords": `Remover stopwords em ${step.column}`,
    "text-stem": `Aplicar stemming simples em ${step.column}`,
    "text-ngrams": `Gerar n-grams em ${step.column}`,
    "text-tfidf": `Gerar score TF-IDF em ${step.column}`,
    "text-embedding": `Gerar embedding hash em ${step.column}`,
    "date-parse": `Normalizar datas em ${step.column}`,
    "timezone-shift": `Aplicar timezone offset em ${step.column}`,
    "temporal-parts": `Extrair partes temporais de ${step.column}`,
    lag: `Criar lag de ${step.column}`,
    "rolling-mean": `Criar rolling mean de ${step.column}`,
    "holiday-flag": `Criar flag de feriado para ${step.column}`,
    formula: `Criar formula guiada em ${step.target || "feature"}`,
    bin: `Criar bins para ${step.column}`,
    ratio: `Criar ratio ${step.column}/${step.target}`,
    interaction: `Criar interacao ${step.column} x ${step.target}`,
    "group-aggregate": `Agregar ${step.target || "count"} por ${step.column}`,
    "low-variance-select": "Remover features de baixa variancia",
    "high-correlation-select": "Remover features altamente correlacionadas",
    "mutual-information-select": `Selecionar features por mutual information com ${step.target}`,
    "model-importance-select": `Selecionar features por importancia com ${step.target}`,
    "manual-feature-select": `Selecionar features manuais: ${step.value}`,
    "stratified-sample": `Amostra estratificada por ${step.column}`,
    oversample: `Oversampling por ${step.column}`,
    undersample: `Undersampling por ${step.column}`,
    smote: `SMOTE local por ${step.column}`,
    "class-weights": `Calcular pesos de classe para ${step.column}`,
    "train-validation-test-split": `Split train/validation/test por ${step.column || "linha"}`,
    "head-sample": "Amostra head",
    "tail-sample": "Amostra tail",
    "random-sample": "Amostra aleatoria deterministica",
    "fuzzy-join": `${step.joinType ?? "left"} fuzzy join: ${step.column} ~= ${step.rightName ?? "lookup"}.${step.target}`,
    "composite-join": `${step.joinType ?? "left"} composite join: ${step.column} = ${step.target}`,
    "cardinality-check": `Validar cardinalidade em ${step.column}`,
    pivot: `Pivot por ${step.column}`,
    unpivot: `Unpivot ${step.value || "colunas"}`,
    "window-row-number": `Row number particionado por ${step.column}`,
    "dictionary-enrich": `Enriquecer ${step.column} por dicionario`,
    "holiday-enrich": `Enriquecer calendario em ${step.column}`,
    "geocode-enrich": `Geocode local em ${step.column}`,
    dedupe: "Remover linhas duplicadas",
    "aggregate-count": `Contar linhas por ${step.column}`,
    join: `${step.joinType ?? "left"} join: ${step.column} = ${step.rightName ?? "lookup"}.${step.target}`
  };

  return labels[step.operation];
}

function applyPrepStep(rows: DataRow[], step: PrepStep): DataRow[] {
  if (step.operation === "dedupe") {
    return Array.from(new Map(rows.map((row) => [JSON.stringify(row), row])).values());
  }

  if (step.operation === "sort" && step.column) {
    return [...rows].sort((a, b) => {
      const av = String(a[step.column!] ?? "");
      const bv = String(b[step.column!] ?? "");
      return step.direction === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    });
  }

  if (step.operation === "filter" && step.column) {
    const needle = String(step.value ?? "").toLowerCase();
    return rows.filter((row) => String(row[step.column!] ?? "").toLowerCase().includes(needle));
  }

  if (step.operation === "filter-out" && step.column) {
    const needle = String(step.value ?? "").toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => !String(row[step.column!] ?? "").toLowerCase().includes(needle));
  }

  if (step.operation === "map-values" && step.column) {
    const valueMap = parseValueMap(step.value, step.parameters?.valueMap);
    if (!valueMap.size) return rows;
    return rows.map((row) => {
      const value = row[step.column!];
      const mappedValue = valueMap.get(String(value ?? "").trim());
      return mappedValue === undefined ? row : { ...row, [step.column!]: mappedValue };
    });
  }

  if (step.operation === "rename" && step.column && step.target) {
    return rows.map((row) => {
      const { [step.column!]: value, ...rest } = row;
      return { ...rest, [step.target!]: value };
    });
  }

  if (step.operation === "remove-column" && step.column) {
    return rows.map((row) => {
      const { [step.column!]: _removed, ...rest } = row;
      return rest;
    });
  }

  if (step.operation === "drop-missing-rows" && step.column) {
    return rows.filter((row) => {
      const value = row[step.column!];
      return value !== null && value !== "" && value !== undefined;
    });
  }

  if (step.operation === "drop-low-complete") {
    const threshold = Math.max(0, Math.min(100, Number(step.value ?? 80))) / 100;
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const keepColumns = new Set(
      columns.filter((name) => {
        const present = rows.filter((row) => row[name] !== null && row[name] !== "" && row[name] !== undefined).length;
        return present / Math.max(rows.length, 1) >= threshold;
      })
    );
    return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => keepColumns.has(key))));
  }

  if (step.operation === "drop-id-columns") {
    return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !isIdentifierColumn(key))));
  }

  if (step.operation === "auto-clean") {
    const cleaned = applyPrepStep(rows, { id: `${step.id}-dedupe`, operation: "dedupe" });
    const withUsefulColumns = applyPrepStep(cleaned, { id: `${step.id}-complete`, operation: "drop-low-complete", value: step.value ?? "80" });
    const numericFilled = applyPrepStep(withUsefulColumns, { id: `${step.id}-numeric`, operation: "fill-all-numeric" });
    return applyPrepStep(numericFilled, { id: `${step.id}-categorical`, operation: "fill-all-categorical" });
  }

  if (step.operation === "cast" && step.column) {
    return rows.map((row) => ({ ...row, [step.column!]: castValue(row[step.column!], step.target ?? "text") }));
  }

  if (step.operation === "fill-missing" && step.column) {
    return rows.map((row) => {
      const value = row[step.column!];
      const fillValue = step.parameters && "fillValue" in step.parameters ? step.parameters.fillValue : coerceValue(step.value ?? "");
      return value === null || value === "" || value === undefined ? { ...row, [step.column!]: fillValue ?? null } : row;
    });
  }

  if (step.operation === "fill-all-numeric") {
    return profileRows(rows).columnProfiles
      .filter((column) => column.kind === "number" && column.missing > 0)
      .reduce((current, column) => fillNumericMissing(current, column.name, "median"), rows);
  }

  if (step.operation === "fill-all-categorical") {
    return profileRows(rows).columnProfiles
      .filter((column) => column.kind !== "number" && column.kind !== "empty" && column.missing > 0)
      .reduce((current, column) => applyPrepStep(current, { id: `${step.id}-${column.name}`, operation: "fill-mode", column: column.name }), rows);
  }

  if (step.operation === "fill-mean" && step.column) {
    return fillNumericMissing(rows, step.column, "mean");
  }

  if (step.operation === "fill-median" && step.column) {
    return fillNumericMissing(rows, step.column, "median");
  }

  if (step.operation === "fill-mode" && step.column) {
    const modeValue = mode(rows.map((row) => row[step.column!]).filter((value) => value !== null && value !== ""));
    return rows.map((row) => {
      const value = row[step.column!];
      return value === null || value === "" || value === undefined ? { ...row, [step.column!]: modeValue ?? null } : row;
    });
  }

  if (step.operation === "fill-forward" && step.column) {
    return directionalFill(rows, step.column, "forward");
  }

  if (step.operation === "fill-backward" && step.column) {
    return directionalFill(rows, step.column, "backward");
  }

  if (step.operation === "missing-indicator" && step.column) {
    return rows.map((row) => ({ ...row, [`${step.column}_missing`]: row[step.column!] === null || row[step.column!] === "" || row[step.column!] === undefined ? 1 : 0 }));
  }

  if ((step.operation === "knn-impute" || step.operation === "iterative-impute") && step.column) {
    return fillNumericMissing(rows, step.column, step.operation === "knn-impute" ? "median" : "mean");
  }

  if (step.operation === "clip-iqr" && step.column) {
    return clipIqr(rows, step.column, step.parameters);
  }

  if (step.operation === "clip-all-numeric") {
    return profileRows(rows).columnProfiles
      .filter((column) => column.kind === "number" && !isIdentifierColumn(column.name))
      .reduce((current, column) => clipIqr(current, column.name), rows);
  }

  if (step.operation === "zscore-clip" && step.column) {
    return zScoreClip(rows, step.column);
  }

  if (step.operation === "winsorize" && step.column) {
    return winsorize(rows, step.column);
  }

  if (step.operation === "isolation-flag" && step.column) {
    return isolationFlag(rows, step.column);
  }

  if (step.operation === "one-hot" && step.column) {
    return oneHotEncode(rows, step.column, step.parameters?.categories);
  }

  if (step.operation === "one-hot-all-categorical") {
    const maxUnique = Math.max(2, Number(step.value ?? 20));
    return profileRows(rows).columnProfiles
      .filter((column) => column.kind !== "number" && column.kind !== "empty" && column.unique <= maxUnique && !isIdentifierColumn(column.name))
      .reduce((current, column) => oneHotEncode(current, column.name), rows);
  }

  if (step.operation === "ordinal-encode" && step.column) {
    return ordinalEncode(rows, step.column);
  }

  if (step.operation === "frequency-encode" && step.column) {
    return frequencyEncode(rows, step.column);
  }

  if (step.operation === "target-encode" && step.column && step.target) {
    return targetEncode(rows, step.column, step.target);
  }

  if (step.operation === "hash-encode" && step.column) {
    return hashEncode(rows, step.column);
  }

  if (step.operation === "standard-scale" && step.column) {
    return scaleNumeric(rows, step.column, "standard", step.parameters);
  }

  if (step.operation === "scale-all-numeric") {
    return profileRows(rows).columnProfiles
      .filter((column) => column.kind === "number" && !isIdentifierColumn(column.name))
      .reduce((current, column) => scaleNumeric(current, column.name, "standard"), rows);
  }

  if (step.operation === "minmax-scale" && step.column) {
    return scaleNumeric(rows, step.column, "minmax");
  }

  if (step.operation === "robust-scale" && step.column) {
    return scaleNumeric(rows, step.column, "robust");
  }

  if (step.operation === "log-transform" && step.column) {
    return numericMap(rows, step.column, (value) => Math.log1p(Math.max(value, 0)));
  }

  if (step.operation === "power-transform" && step.column) {
    return numericMap(rows, step.column, (value) => Math.sign(value) * Math.sqrt(Math.abs(value)));
  }

  if (step.operation === "quantile-transform" && step.column) {
    return quantileTransform(rows, step.column);
  }

  if (step.operation.startsWith("text-") && step.column) {
    return transformText(rows, step.column, step.operation);
  }

  if (["date-parse", "timezone-shift", "temporal-parts", "lag", "rolling-mean", "holiday-flag"].includes(step.operation) && step.column) {
    return transformTemporal(rows, step);
  }

  if (["formula", "bin", "ratio", "interaction", "group-aggregate"].includes(step.operation)) {
    return featureEngineer(rows, step);
  }

  if (["low-variance-select", "high-correlation-select", "mutual-information-select", "model-importance-select", "manual-feature-select"].includes(step.operation)) {
    return featureSelect(rows, step);
  }

  if (["stratified-sample", "oversample", "undersample", "smote", "class-weights", "train-validation-test-split", "head-sample", "tail-sample", "random-sample"].includes(step.operation)) {
    return sampleOrSplit(rows, step);
  }

  if (step.operation === "aggregate-count" && step.column) {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const key = String(row[step.column!] ?? "missing");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([value, count]) => ({ [step.column!]: value, count }));
  }

  if (step.operation === "join" && step.column && step.target && step.rightRows) {
    return joinRows(rows, step.rightRows, step.column, step.target, step.joinType ?? "left");
  }

  if ((step.operation === "fuzzy-join" || step.operation === "composite-join") && step.column && step.target && step.rightRows) {
    return joinRows(rows, step.rightRows, step.column, step.target, step.joinType ?? "left", step.operation === "fuzzy-join");
  }

  if (step.operation === "cardinality-check" && step.column) {
    return annotateCardinality(rows, step.column);
  }

  if (["pivot", "unpivot", "window-row-number"].includes(step.operation)) {
    return advancedAggregate(rows, step);
  }

  if (["dictionary-enrich", "holiday-enrich", "geocode-enrich"].includes(step.operation) && step.column) {
    return enrichRows(rows, step);
  }

  return rows;
}

function parseValueMap(text?: string, parameterMap?: Record<string, string>): Map<string, string> {
  const entries = new Map<string, string>();
  Object.entries(parameterMap ?? {}).forEach(([source, target]) => {
    if (source.trim()) entries.set(source.trim(), String(target));
  });
  String(text ?? "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.includes("=>") ? "=>" : trimmed.includes("=") ? "=" : trimmed.includes(",") ? "," : "";
      if (!separator) return;
      const [source, ...targetParts] = trimmed.split(separator);
      const sourceValue = source.trim();
      if (!sourceValue) return;
      entries.set(sourceValue, targetParts.join(separator).trim());
    });
  return entries;
}

function validateRule(rows: DataRow[], rule: ValidationRule): ValidationIssue[] {
  if (rule.type === "unique") {
    return validateUnique(rows, rule);
  }

  let regex: RegExp | undefined;
  if (rule.type === "regex" && rule.pattern) {
    try {
      regex = new RegExp(rule.pattern);
    } catch {
      return rows.map((row, rowIndex) => ({
        rowIndex,
        column: rule.column,
        ruleId: rule.id,
        message: `Regex invalida: ${rule.pattern}`,
        value: row[rule.column] ?? null,
        severity: rule.severity ?? "error"
      }));
    }
  }

  return rows.flatMap((row, rowIndex) => {
    const value = row[rule.column] ?? null;
    const issue = buildValidationIssue(rowIndex, row, value, rule, regex);
    return issue ? [issue] : [];
  });
}

function validateUnique(rows: DataRow[], rule: ValidationRule): ValidationIssue[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(row[rule.column] ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return rows.flatMap((row, rowIndex) => {
    const value = row[rule.column] ?? null;
    const key = String(value ?? "");
    return (counts.get(key) ?? 0) > 1
      ? [
          {
            rowIndex,
            column: rule.column,
            ruleId: rule.id,
            message: `${rule.column} deve ser unico`,
            value,
            severity: rule.severity ?? "error"
          }
        ]
      : [];
  });
}

function buildValidationIssue(rowIndex: number, row: DataRow, value: DataRow[string], rule: ValidationRule, regex?: RegExp): ValidationIssue | undefined {
  if (rule.type === "required" && (value === null || value === "" || value === undefined)) {
    return validationIssue(rowIndex, value, rule, `${rule.column} e obrigatorio`);
  }

  if (value === null || value === "" || value === undefined) {
    return undefined;
  }

  if (rule.type === "type" && value !== null && value !== "" && inferKind([value]) !== rule.expectedType) {
    return validationIssue(rowIndex, value, rule, `${rule.column} deve ser ${rule.expectedType}`);
  }

  if (rule.type === "range") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || (rule.min !== undefined && numeric < rule.min) || (rule.max !== undefined && numeric > rule.max)) {
      return validationIssue(rowIndex, value, rule, `${rule.column} fora do range configurado`);
    }
  }

  if (rule.type === "regex" && regex && !regex.test(String(value ?? ""))) {
    return validationIssue(rowIndex, value, rule, `${rule.column} nao atende ao padrao`);
  }

  if (rule.type === "domain" && rule.allowedValues?.length && !rule.allowedValues.includes(String(value ?? ""))) {
    return validationIssue(rowIndex, value, rule, `${rule.column} fora do dominio permitido`);
  }

  if (rule.type === "cross-column") {
    const left = Number(row[rule.leftColumn || rule.column]);
    const right = Number(row[rule.rightColumn || ""]);
    if (!compareNumbers(left, right, rule.operator ?? "<=")) {
      return validationIssue(rowIndex, value, rule, `${rule.leftColumn || rule.column} ${rule.operator ?? "<="} ${rule.rightColumn} falhou`);
    }
  }

  if (rule.type === "custom" && rule.expression && safeFormula(row, rule.expression) !== 1) {
    return validationIssue(rowIndex, value, rule, `check customizado seguro falhou`);
  }

  return undefined;
}

function validationIssue(rowIndex: number, value: DataRow[string], rule: ValidationRule, message: string): ValidationIssue {
  return {
    rowIndex,
    column: rule.column,
    ruleId: rule.id,
    message,
    value,
    severity: rule.severity ?? "error"
  };
}

function splitDelimitedLine(line: string, delimiter: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function joinRows(leftRows: DataRow[], rightRows: DataRow[], leftKey: string, rightKey: string, joinType: NonNullable<PrepStep["joinType"]>, fuzzy = false) {
  const rightColumns = Array.from(new Set(rightRows.flatMap((row) => Object.keys(row)))).filter((column) => column !== rightKey);
  const rightIndex = new Map<string, DataRow[]>();
  rightRows.forEach((row) => {
    const key = joinKey(row[rightKey], fuzzy);
    rightIndex.set(key, [...(rightIndex.get(key) ?? []), row]);
  });

  const matchedRightRows = new Set<DataRow>();
  const output: DataRow[] = [];

  leftRows.forEach((leftRow) => {
    const key = joinKey(leftRow[leftKey], fuzzy);
    const matches = rightIndex.get(key) ?? [];

    if (matches.length) {
      matches.forEach((rightRow) => {
        matchedRightRows.add(rightRow);
        output.push(mergeRows(leftRow, rightRow, rightKey));
      });
    } else if (joinType === "left" || joinType === "full") {
      output.push(
        rightColumns.reduce<DataRow>(
          (row, column) => ({
            ...row,
            [`right_${column}`]: null
          }),
          { ...leftRow }
        )
      );
    }
  });

  if (joinType === "right" || joinType === "full") {
    rightRows
      .filter((rightRow) => !matchedRightRows.has(rightRow))
      .forEach((rightRow) => {
        output.push(mergeRows({}, rightRow, rightKey));
      });
  }

  return output;
}

function joinKey(value: DataRow[string], fuzzy: boolean) {
  const key = String(value ?? "");
  return fuzzy ? slug(key) : key;
}

function mergeRows(leftRow: DataRow, rightRow: DataRow, rightKey: string): DataRow {
  return Object.entries(rightRow).reduce<DataRow>(
    (row, [key, value]) => {
      if (key !== rightKey) {
        row[`right_${key}`] = normalizeCell(value);
      }
      return row;
    },
    { ...leftRow }
  );
}

function fillNumericMissing(rows: DataRow[], column: string, method: "mean" | "median") {
  const values = numericValues(rows, column);
  const replacement = method === "mean" ? mean(values) : percentile(values, 0.5);
  return rows.map((row) => {
    const value = row[column];
    return value === null || value === "" || value === undefined ? { ...row, [column]: replacement ?? null } : row;
  });
}

function directionalFill(rows: DataRow[], column: string, direction: "forward" | "backward") {
  const ordered = direction === "forward" ? rows : [...rows].reverse();
  let last: DataRow[string] = null;
  const filled = ordered.map((row) => {
    const value = row[column];
    if (value === null || value === "" || value === undefined) {
      return { ...row, [column]: last };
    }
    last = value;
    return row;
  });
  return direction === "forward" ? filled : filled.reverse();
}

function clipIqr(rows: DataRow[], column: string, parameters?: PrepStep["parameters"]) {
  let lower = parameters?.lower;
  let upper = parameters?.upper;
  if (lower === undefined || upper === undefined) {
    const values = numericValues(rows, column);
    const q1 = percentile(values, 0.25);
    const q3 = percentile(values, 0.75);
    if (q1 === undefined || q3 === undefined) return rows;
    const iqr = q3 - q1;
    lower = q1 - 1.5 * iqr;
    upper = q3 + 1.5 * iqr;
  }

  return rows.map((row) => {
    const numeric = Number(row[column]);
    return Number.isFinite(numeric) ? { ...row, [column]: Number(Math.min(Math.max(numeric, lower), upper).toFixed(4)) } : row;
  });
}

function zScoreClip(rows: DataRow[], column: string) {
  const values = numericValues(rows, column);
  const avg = mean(values) ?? 0;
  const sd = standardDeviation(values);
  return rows.map((row) => {
    const numeric = Number(row[column]);
    if (!Number.isFinite(numeric)) return row;
    const lower = avg - 3 * (sd || 1);
    const upper = avg + 3 * (sd || 1);
    return { ...row, [column]: Number(Math.min(Math.max(numeric, lower), upper).toFixed(4)) };
  });
}

function winsorize(rows: DataRow[], column: string) {
  const values = numericValues(rows, column);
  const lower = percentile(values, 0.05);
  const upper = percentile(values, 0.95);
  if (lower === undefined || upper === undefined) return rows;
  return rows.map((row) => {
    const numeric = Number(row[column]);
    return Number.isFinite(numeric) ? { ...row, [column]: Number(Math.min(Math.max(numeric, lower), upper).toFixed(4)) } : row;
  });
}

function isolationFlag(rows: DataRow[], column: string) {
  const values = numericValues(rows, column);
  const avg = mean(values) ?? 0;
  const sd = standardDeviation(values) || 1;
  return rows.map((row) => {
    const numeric = Number(row[column]);
    const score = Number.isFinite(numeric) ? Math.abs((numeric - avg) / sd) : 0;
    return { ...row, [`${column}_isolation_score`]: Number(score.toFixed(4)), [`${column}_is_outlier`]: score >= 3 };
  });
}

function oneHotEncode(rows: DataRow[], column: string, resolvedValues?: string[]) {
  const values = resolvedValues ?? Array.from(new Set(rows.map((row) => String(row[column] ?? "missing")))).sort();
  return rows.map((row) => {
    const encoded = values.reduce<DataRow>((record, value) => {
      record[`${column}_${slug(value)}`] = String(row[column] ?? "missing") === value ? 1 : 0;
      return record;
    }, {});
    const { [column]: _removed, ...rest } = row;
    return { ...rest, ...encoded };
  });
}

function ordinalEncode(rows: DataRow[], column: string) {
  const values = Array.from(new Set(rows.map((row) => String(row[column] ?? "missing")))).sort();
  const index = new Map(values.map((value, position) => [value, position]));
  return rows.map((row) => ({ ...row, [column]: index.get(String(row[column] ?? "missing")) ?? null }));
}

function frequencyEncode(rows: DataRow[], column: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(String(row[column] ?? "missing"), (counts.get(String(row[column] ?? "missing")) ?? 0) + 1));
  return rows.map((row) => ({ ...row, [`${column}_frequency`]: Number(((counts.get(String(row[column] ?? "missing")) ?? 0) / Math.max(rows.length, 1)).toFixed(4)) }));
}

function targetEncode(rows: DataRow[], column: string, target: string) {
  const globalMean = mean(numericValues(rows, target)) ?? 0;
  const groups = new Map<string, number[]>();
  rows.forEach((row) => {
    const key = String(row[column] ?? "missing");
    const value = Number(row[target]);
    if (Number.isFinite(value)) groups.set(key, [...(groups.get(key) ?? []), value]);
  });
  return rows.map((row) => {
    const values = groups.get(String(row[column] ?? "missing")) ?? [];
    const smoothed = (values.reduce((sum, value) => sum + value, 0) + globalMean * 5) / (values.length + 5);
    return { ...row, [`${column}_target_encoded`]: Number(smoothed.toFixed(4)) };
  });
}

function hashEncode(rows: DataRow[], column: string) {
  return rows.map((row) => ({ ...row, [`${column}_hash_bucket`]: Math.abs(hash(String(row[column] ?? "missing"))) % 16 }));
}

function scaleNumeric(rows: DataRow[], column: string, method: "standard" | "minmax" | "robust", parameters?: PrepStep["parameters"]) {
  const values = numericValues(rows, column);
  if (!values.length) return rows;

  const avg = parameters?.mean ?? mean(values) ?? 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sd = parameters?.stdDev ?? standardDeviation(values);
  const median = percentile(values, 0.5) ?? 0;
  const iqr = (percentile(values, 0.75) ?? 0) - (percentile(values, 0.25) ?? 0);

  return rows.map((row) => {
    const numeric = Number(row[column]);
    if (!Number.isFinite(numeric)) return row;
    const scaled =
      method === "standard"
        ? (numeric - avg) / (sd || 1)
        : method === "robust"
          ? (numeric - median) / (iqr || 1)
          : (numeric - min) / (max - min || 1);
    return { ...row, [column]: Number(scaled.toFixed(4)) };
  });
}

function numericMap(rows: DataRow[], column: string, mapper: (value: number) => number) {
  return rows.map((row) => {
    const numeric = Number(row[column]);
    return Number.isFinite(numeric) ? { ...row, [column]: Number(mapper(numeric).toFixed(4)) } : row;
  });
}

function quantileTransform(rows: DataRow[], column: string) {
  const values = numericValues(rows, column);
  return rows.map((row) => {
    const numeric = Number(row[column]);
    if (!Number.isFinite(numeric)) return row;
    const rank = values.filter((value) => value <= numeric).length / Math.max(values.length, 1);
    return { ...row, [column]: Number(rank.toFixed(4)) };
  });
}

function transformText(rows: DataRow[], column: string, operation: PrepOperation) {
  const documents = rows.map((row) => tokenize(String(row[column] ?? "")));
  const documentFrequency = new Map<string, number>();
  documents.forEach((tokens) => new Set(tokens).forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)));

  return rows.map((row, index) => {
    const text = String(row[column] ?? "");
    const tokens = documents[index];
    if (operation === "text-clean") return { ...row, [column]: cleanText(text) };
    if (operation === "text-stopwords") return { ...row, [column]: tokens.filter((token) => !stopwords.has(token)).join(" ") };
    if (operation === "text-stem") return { ...row, [column]: tokens.map(stem).join(" ") };
    if (operation === "text-ngrams") return { ...row, [`${column}_ngrams`]: ngrams(tokens, 2).join(" ") };
    if (operation === "text-embedding") return { ...row, [`${column}_embedding`]: Array.from({ length: 4 }, (_, bucket) => tokens.filter((token) => Math.abs(hash(token)) % 4 === bucket).length).join("|") };
    const tfidf = tokens.reduce((sum, token) => sum + Math.log((rows.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)), 0);
    return { ...row, [`${column}_tfidf_score`]: Number(tfidf.toFixed(4)) };
  });
}

function transformTemporal(rows: DataRow[], step: PrepStep) {
  const column = step.column!;
  if (step.operation === "lag") {
    return rows.map((row, index) => ({ ...row, [`${column}_lag1`]: index > 0 ? rows[index - 1][column] : null }));
  }
  if (step.operation === "rolling-mean") {
    return rows.map((row, index) => {
      const window = rows.slice(Math.max(0, index - 2), index + 1).map((item) => Number(item[column])).filter(Number.isFinite);
      return { ...row, [`${column}_rolling_mean3`]: mean(window) ?? null };
    });
  }
  return rows.map((row) => {
    const date = parseDate(row[column]);
    if (!date) return row;
    if (step.operation === "date-parse") return { ...row, [column]: date.toISOString() };
    if (step.operation === "timezone-shift") {
      const shifted = new Date(date.getTime() + Number(step.value || 0) * 60 * 60 * 1000);
      return { ...row, [column]: shifted.toISOString() };
    }
    if (step.operation === "holiday-flag") return { ...row, [`${column}_is_holiday`]: isHoliday(date) };
    return { ...row, [`${column}_year`]: date.getUTCFullYear(), [`${column}_month`]: date.getUTCMonth() + 1, [`${column}_day_of_week`]: date.getUTCDay(), [`${column}_is_weekend`]: [0, 6].includes(date.getUTCDay()) };
  });
}

function featureEngineer(rows: DataRow[], step: PrepStep) {
  if (step.operation === "group-aggregate" && step.column) {
    const column = step.column;
    const counts = new Map<string, number>();
    rows.forEach((row) => counts.set(String(row[column] ?? "missing"), (counts.get(String(row[column] ?? "missing")) ?? 0) + 1));
    return rows.map((row) => ({ ...row, [`${column}_group_count`]: counts.get(String(row[column] ?? "missing")) ?? 0 }));
  }
  if (step.operation === "bin" && step.column) {
    const values = numericValues(rows, step.column);
    const q1 = percentile(values, 0.33) ?? 0;
    const q2 = percentile(values, 0.66) ?? 0;
    return rows.map((row) => {
      const value = Number(row[step.column!]);
      return { ...row, [`${step.column}_bin`]: value <= q1 ? "low" : value <= q2 ? "medium" : "high" };
    });
  }
  if ((step.operation === "ratio" || step.operation === "interaction") && step.column && step.target) {
    return rows.map((row) => {
      const left = Number(row[step.column!]);
      const right = Number(row[step.target!]);
      const value = step.operation === "ratio" ? left / (right || 1) : left * right;
      return Number.isFinite(value) ? { ...row, [`${step.column}_${step.operation}_${step.target}`]: Number(value.toFixed(4)) } : row;
    });
  }
  return rows.map((row) => ({ ...row, [step.target || "formula_feature"]: safeFormula(row, step.value || "") }));
}

function featureSelect(rows: DataRow[], step: PrepStep) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (step.operation === "manual-feature-select") {
    const keep = new Set((step.value || "").split(",").map((item) => item.trim()).filter(Boolean));
    return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => keep.has(key))));
  }
  const remove = new Set<string>();
  if (step.operation === "low-variance-select") {
    columns.filter((column) => new Set(rows.map((row) => String(row[column] ?? ""))).size <= 1).forEach((column) => remove.add(column));
  }
  if (step.operation === "high-correlation-select") {
    columns.forEach((left, leftIndex) => columns.slice(leftIndex + 1).forEach((right) => Math.abs(correlation(rows, left, right)) > 0.95 && remove.add(right)));
  }
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !remove.has(key))));
}

function sampleOrSplit(rows: DataRow[], step: PrepStep) {
  const size = Math.max(1, Number(step.value || Math.ceil(rows.length * 0.5)));
  if (step.operation === "head-sample") return rows.slice(0, size);
  if (step.operation === "tail-sample") return rows.slice(-size);
  if (step.operation === "random-sample") return rows.filter((_, index) => hash(`${index}`) % Math.ceil(rows.length / size || 1) === 0).slice(0, size);
  if (step.operation === "train-validation-test-split") return rows.map((row, index) => ({ ...row, split: index % 10 < 7 ? "train" : index % 10 < 9 ? "validation" : "test" }));
  if (step.operation === "class-weights" && step.column) {
    const counts = new Map<string, number>();
    rows.forEach((row) => counts.set(String(row[step.column!] ?? "missing"), (counts.get(String(row[step.column!] ?? "missing")) ?? 0) + 1));
    return rows.map((row) => ({ ...row, class_weight: Number((rows.length / ((counts.get(String(row[step.column!] ?? "missing")) ?? 1) * counts.size)).toFixed(4)) }));
  }
  if (!step.column) return rows;
  const groups = groupRows(rows, step.column);
  const counts = Array.from(groups.values()).map((group) => group.length);
  const target = step.operation === "undersample" ? Math.min(...counts) : Math.max(...counts);
  if (step.operation === "stratified-sample") return Array.from(groups.values()).flatMap((group) => group.slice(0, Math.max(1, Math.ceil(group.length * 0.5))));
  if (step.operation === "undersample") return Array.from(groups.values()).flatMap((group) => group.slice(0, target));
  return Array.from(groups.values()).flatMap((group) => Array.from({ length: target }, (_, index) => ({ ...group[index % group.length], synthetic: step.operation === "smote" && index >= group.length })));
}

function annotateCardinality(rows: DataRow[], column: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(String(row[column] ?? "missing"), (counts.get(String(row[column] ?? "missing")) ?? 0) + 1));
  return rows.map((row) => ({ ...row, [`${column}_cardinality_count`]: counts.get(String(row[column] ?? "missing")) ?? 0, [`${column}_duplicate_key`]: (counts.get(String(row[column] ?? "missing")) ?? 0) > 1 }));
}

function advancedAggregate(rows: DataRow[], step: PrepStep) {
  if (step.operation === "window-row-number") {
    const counters = new Map<string, number>();
    return rows.map((row) => {
      const key = String(row[step.column || ""] ?? "all");
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return { ...row, row_number: next };
    });
  }
  if (step.operation === "unpivot") {
    const columns = (step.value || "").split(",").map((item) => item.trim()).filter(Boolean);
    return rows.flatMap((row) => columns.map((column) => ({ ...row, variable: column, value: row[column] ?? null })));
  }
  if (step.column && step.target) {
    const groups = groupRows(rows, step.column);
    return Array.from(groups.entries()).map(([key, group]) => ({ [step.column!]: key, [step.target!]: group.length }));
  }
  return rows;
}

function enrichRows(rows: DataRow[], step: PrepStep) {
  const dictionary = new Map([
    ["high", "critical"],
    ["medium", "standard"],
    ["low", "relaxed"],
    ["sao paulo", "-23.5505,-46.6333"],
    ["rio de janeiro", "-22.9068,-43.1729"]
  ]);
  return rows.map((row) => {
    const value = String(row[step.column!] ?? "").toLowerCase();
    if (step.operation === "holiday-enrich") {
      const date = parseDate(row[step.column!]);
      return { ...row, calendar_holiday: date ? isHoliday(date) : false };
    }
    if (step.operation === "geocode-enrich") return { ...row, geocode: dictionary.get(value) ?? null };
    return { ...row, dictionary_value: dictionary.get(value) ?? null };
  });
}

function rowsFromMatrix(rows: unknown[][]): DataRow[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((header, index) => String(header || `column_${index + 1}`));

  return rows.slice(1).map((row) =>
    headers.reduce<DataRow>((record, header, index) => {
      record[header] = normalizeCell(row[index]);
      return record;
    }, {})
  );
}

function normalizeRows(rows: unknown[]): DataRow[] {
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row))
    .map((row) =>
      Object.entries(row).reduce<DataRow>((record, [key, value]) => {
        record[key] = normalizeCell(value);
        return record;
      }, {})
    );
}

function normalizeCell(value: unknown): DataRow[string] {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function coerceValue(value: string): string | number | boolean | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && trimmed !== "" ? numeric : trimmed;
}

function castValue(value: DataRow[string], target: string) {
  if (target === "number" || target === "decimal") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (target === "integer") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  }
  if (target === "boolean") return value === true || value === "true" || value === 1;
  if (target === "text") return value === null || value === undefined ? "" : String(value);
  if (target === "date") {
    const timestamp = Date.parse(String(value ?? ""));
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }
  return value;
}

function profileColumn(name: string, rows: DataRow[]): ColumnProfile {
  const values = rows.map((row) => row[name] ?? null);
  const present = values.filter((value): value is string | number | boolean => value !== null && value !== "");
  const numeric = present.map(Number).filter(Number.isFinite);
  const kind = inferKind(present);
  const sorted = [...numeric].sort((a, b) => a - b);

  return {
    name,
    kind,
    missing: values.length - present.length,
    unique: new Set(present.map(String)).size,
    trackedValues: Array.from(new Set(present.map(String))).slice(0, 50),
    examples: Array.from(new Set(present.map(String))).slice(0, 3),
    min: sorted.length ? Math.min(...sorted) : undefined,
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    max: sorted.length ? Math.max(...sorted) : undefined,
    mean: sorted.length ? Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2)) : undefined,
    stdDev: sorted.length ? standardDeviation(sorted) : undefined,
    frequencies: topFrequencies(present)
  };
}

function inferKind(values: Array<string | number | boolean>) {
  if (!values.length) return "empty";
  if (values.every((value) => typeof value === "boolean")) return "boolean";
  if (values.every((value) => Number.isFinite(Number(value)))) return "number";
  if (values.every((value) => !Number.isNaN(Date.parse(String(value))))) return "date";
  return "text";
}

function buildSuggestions(columns: ColumnProfile[], duplicateRows: number) {
  const suggestions: string[] = [];
  const numericMissing = columns.filter((column) => column.kind === "number" && column.missing > 0);
  const categoricalMissing = columns.filter((column) => !["number", "empty"].includes(column.kind) && column.missing > 0);
  const lowCompleteness = columns.filter((column) => column.missing > 0);
  const categorical = columns.filter((column) => column.kind === "text" && column.unique <= 20 && !isIdentifierColumn(column.name));
  const outlierCandidates = columns.filter(
    (column) => column.kind === "number" && column.max !== undefined && column.min !== undefined && column.max - column.min > 40 && !isIdentifierColumn(column.name)
  );

  if (duplicateRows > 0) suggestions.push(`Remover ${duplicateRows} linhas duplicadas antes do treino.`);
  if (numericMissing.length) {
    suggestions.push(`Tratar nulos numericos em ${numericMissing.length} colunas com estatisticas globais.`);
  }
  if (categoricalMissing.length) {
    suggestions.push(`Tratar nulos categoricos em ${categoricalMissing.length} colunas com a moda global.`);
  }
  if (lowCompleteness.length) {
    suggestions.push(`Revisar completude de ${lowCompleteness.length} colunas antes de remover dados.`);
  }
  if (categorical.length) {
    suggestions.push(`Codificar ${categorical.length} colunas categoricas compativeis em uma unica etapa.`);
  }
  if (outlierCandidates.length) {
    suggestions.push(`Avaliar outliers em ${outlierCandidates.length} colunas numericas com IQR.`);
  }

  if (!suggestions.length) suggestions.push("Dataset parece consistente para um primeiro experimento.");
  return suggestions;
}

function numericValues(rows: DataRow[], column: string) {
  return rows
    .map((row) => row[column])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function mean(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : undefined;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const value = sorted[lower] * (1 - weight) + sorted[upper] * weight;
  return Number(value.toFixed(4));
}

function mode(values: DataRow[string][]) {
  const counts = new Map<string, { value: DataRow[string]; count: number }>();
  values.forEach((value) => {
    const key = String(value);
    const current = counts.get(key);
    counts.set(key, { value, count: (current?.count ?? 0) + 1 });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0]?.value;
}

function topFrequencies(values: Array<string | number | boolean>) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(String(value), (counts.get(String(value)) ?? 0) + 1));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));
}

function distributionDistance(baselineRows: DataRow[], currentRows: DataRow[], column: string) {
  const baseline = distribution(baselineRows, column);
  const current = distribution(currentRows, column);
  const keys = new Set([...baseline.keys(), ...current.keys()]);
  const totalDistance = Array.from(keys).reduce((sum, key) => sum + Math.abs((baseline.get(key) ?? 0) - (current.get(key) ?? 0)), 0);
  return Number((totalDistance / 2).toFixed(4));
}

function distribution(rows: DataRow[], column: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(row[column] ?? "missing");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const denominator = Math.max(rows.length, 1);
  return new Map(Array.from(counts.entries()).map(([key, count]) => [key, count / denominator]));
}

function histogram(rows: DataRow[], column: string, binCount: number) {
  const values = numericValues(rows, column);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / binCount;
  return Array.from({ length: binCount }, (_, index) => {
    const start = min + index * width;
    const end = index === binCount - 1 ? max : start + width;
    const count = values.filter((value) => (index === binCount - 1 ? value >= start && value <= end : value >= start && value < end)).length;
    return { label: `${Number(start.toFixed(2))}-${Number(end.toFixed(2))}`, count };
  });
}

function detectLeakage(rows: DataRow[], targetColumn?: string) {
  if (!targetColumn) return [];
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => column !== targetColumn && !isIdentifierColumn(column));
  return columns.flatMap((column) => {
    const lower = column.toLowerCase();
    const reasons: string[] = [];
    if (lower.includes("target") || lower.includes("label") || lower.includes("outcome")) reasons.push("nome parece derivado do alvo");
    if (lower.includes("id")) reasons.push("possivel identificador/proxy");
    if (lower.includes("after") || lower.includes("post") || lower.includes("resolved")) reasons.push("pode ocorrer depois do evento");
    const corr = Math.abs(correlation(rows, column, targetColumn));
    if (corr > 0.9) reasons.push("correlacao alta com o alvo");
    return reasons.length ? [{ column, reason: reasons.join("; "), risk: Math.min(100, Math.round(corr * 100 + reasons.length * 15)) }] : [];
  });
}

function isIdentifierColumn(column: string) {
  const normalized = column.toLowerCase();
  return normalized === "id" || normalized.endsWith("_id") || normalized.includes("uuid") || normalized.includes("identifier");
}

function detectBias(rows: DataRow[], sensitiveColumn?: string, targetColumn?: string) {
  if (!sensitiveColumn) return [];
  const profile = profileRows(rows).columnProfiles.find((column) => column.name === sensitiveColumn);
  const groups = profile?.kind === "number" ? groupNumericBins(rows, sensitiveColumn) : groupRows(rows, sensitiveColumn);
  return Array.from(groups.entries()).map(([group, groupRows]) => {
    const targetValues = targetColumn ? groupRows.map((row) => Number(row[targetColumn])).filter(Number.isFinite) : [];
    return {
      column: sensitiveColumn,
      group,
      count: groupRows.length,
      targetRate: targetValues.length ? Number((targetValues.reduce((sum, value) => sum + value, 0) / targetValues.length).toFixed(4)) : undefined
    };
  });
}

function groupNumericBins(rows: DataRow[], column: string) {
  const values = numericValues(rows, column);
  const q1 = percentile(values, 0.33) ?? 0;
  const q2 = percentile(values, 0.66) ?? 0;
  const groups = new Map<string, DataRow[]>();
  rows.forEach((row) => {
    const value = Number(row[column]);
    const key = !Number.isFinite(value) ? "missing" : value <= q1 ? "baixo" : value <= q2 ? "medio" : "alto";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return groups;
}

function summarize(values: string[], label: string) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).map(([split, count]) => ({ [label]: split, count })) as Array<{ split: string; count: number }>;
}

function standardDeviation(values: number[]) {
  const avg = mean(values) ?? 0;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(values.length, 1);
  return Math.sqrt(variance);
}

function groupRows(rows: DataRow[], column: string) {
  const groups = new Map<string, DataRow[]>();
  rows.forEach((row) => {
    const key = String(row[column] ?? "missing");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return groups;
}

function correlation(rows: DataRow[], left: string, right: string) {
  const pairs = rows
    .map((row) => [Number(row[left]), Number(row[right])])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return 0;
  const leftMean = mean(pairs.map(([value]) => value)) ?? 0;
  const rightMean = mean(pairs.map(([, value]) => value)) ?? 0;
  const numerator = pairs.reduce((sum, [a, b]) => sum + (a - leftMean) * (b - rightMean), 0);
  const leftDenominator = Math.sqrt(pairs.reduce((sum, [a]) => sum + (a - leftMean) ** 2, 0));
  const rightDenominator = Math.sqrt(pairs.reduce((sum, [, b]) => sum + (b - rightMean) ** 2, 0));
  return numerator / ((leftDenominator || 1) * (rightDenominator || 1));
}

function safeFormula(row: DataRow, expression: string) {
  const match = expression.match(/^([A-Za-z0-9_]+)\s*([+\-*/])\s*([A-Za-z0-9_]+|[-]?\d+(\.\d+)?)$/);
  if (!match) return null;
  const left = Number(row[match[1]] ?? match[1]);
  const right = Number(row[match[3]] ?? match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const operator = match[2];
  const value = operator === "+" ? left + right : operator === "-" ? left - right : operator === "*" ? left * right : left / (right || 1);
  return Number(value.toFixed(4));
}

function compareNumbers(left: number, right: number, operator: ValidationRule["operator"]) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (operator === "<") return left < right;
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "==") return left === right;
  if (operator === "!=") return left !== right;
  return left <= right;
}

function parseDate(value: DataRow[string]) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isHoliday(date: Date) {
  const key = `${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  return new Set(["1-1", "4-21", "5-1", "9-7", "10-12", "11-2", "11-15", "12-25"]).has(key);
}

const stopwords = new Set(["a", "o", "os", "as", "de", "do", "da", "e", "em", "para", "the", "and", "or", "to", "of", "in"]);

function cleanText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return cleanText(value).split(" ").filter(Boolean);
}

function stem(value: string) {
  return value.replace(/(mente|ções|ção|ing|ed|s)$/i, "");
}

function ngrams(tokens: string[], size: number) {
  return tokens.slice(0, Math.max(tokens.length - size + 1, 0)).map((_, index) => tokens.slice(index, index + size).join("_"));
}

function hash(value: string) {
  return value.split("").reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "value";
}
