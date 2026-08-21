import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  GitCompare,
  HelpCircle,
  Layers,
  MoreVertical,
  Maximize2,
  Play,
  Plug,
  Plus,
  X,
  ArrowLeft,
  WandSparkles
} from "lucide-react";
import type { DataRow, PrepOperation, PrepStep } from "./dataPrep";
import type { Asset } from "./domain";
import {
  analyzeMvp4,
  applyPrepSteps,
  createPendingBackendProfile,
  detectDrift,
  describeStep,
  describeValidationRule,
  executePrepStepsOnDelimitedFile,
  exportValidationReport,
  isPendingBackendProfile,
  profileRows,
  resolvePrepStepsForFullFile,
  unsupportedStreamingSteps,
  validateRows
} from "./dataPrep";
import type { ValidationRule, ValidationRuleType } from "./dataPrep";
import type { DataProfile, FullExecutionProgress, FullProfileProgress } from "./dataPrep";

interface DataPrepViewProps {
  activeWorkspaceName: string;
  dataAssets: Asset[];
  requestedAssetId?: string;
  requestedSection?: "prepare" | "analysis";
  requestId?: number;
  onCreateRefinedAsset: (
    name: string,
    rows: DataRow[],
    steps: PrepStep[],
    execution?: {
      mode: "preview" | "full-file-stream" | "backend-parquet";
      totalRows?: number;
      outputRows?: number;
      outputBytes?: number;
      schema?: string[];
      backendDatasetId?: string;
      backendSchema?: Array<{ name: string; type: string }>;
      parquet?: boolean;
    },
    outputName?: string
  ) => void;
  onOpenVisualization: (assetId: string) => void;
}

function HelpButton({ children, title }: { children: string; title: string }) {
  return (
    <span className="help-wrap">
      <button aria-label={`Ajuda: ${title}`} className="help-button" type="button">
        <HelpCircle size={15} />
      </button>
      <span className="help-popover" role="tooltip">
        <strong>{title}</strong>
        <span>{children}</span>
      </span>
    </span>
  );
}

const advancedTechniques = [
  { label: "Media / mediana / moda", status: "Executavel" },
  { label: "IQR clipping", status: "Executavel" },
  { label: "One-hot / ordinal", status: "Executavel" },
  { label: "Standard / min-max", status: "Executavel" },
  { label: "Schema/data drift", status: "Executavel" },
  { label: "Validacao declarativa", status: "Executavel" },
  { label: "KNN / iterative imputation", status: "Executavel" },
  { label: "Target/hash/frequency encoding", status: "Executavel" },
  { label: "Robust/log/power/quantile scaling", status: "Executavel" },
  { label: "Texto / TF-IDF / embeddings", status: "Executavel" },
  { label: "Temporal lags / rolling / feriados", status: "Executavel" },
  { label: "Feature engineering / selection", status: "Executavel" },
  { label: "Sampling / split / balancing", status: "Executavel" },
  { label: "Leakage / bias detection", status: "Executavel" },
  { label: "Fuzzy/composite joins", status: "Executavel" },
  { label: "Pivot / unpivot / window", status: "Executavel" },
  { label: "Enriquecimento local", status: "Executavel" }
];

const validationTypeOptions: Array<{ value: ValidationRuleType; label: string; detail: string }> = [
  { value: "required", label: "Campo obrigatorio", detail: "A coluna nao pode estar vazia." },
  { value: "range", label: "Faixa numerica", detail: "Valores precisam ficar entre minimo e maximo." },
  { value: "domain", label: "Valores permitidos", detail: "Aceita apenas uma lista fechada de valores." },
  { value: "regex", label: "Formato de texto", detail: "Textos precisam seguir um padrao regex." },
  { value: "type", label: "Tipo da coluna", detail: "Confere se os valores batem com o tipo esperado." },
  { value: "unique", label: "Valor unico", detail: "Nao permite valores repetidos nessa coluna." },
  { value: "cross-column", label: "Comparar colunas", detail: "Compara uma coluna numerica com outra." },
  { value: "custom", label: "Expressao segura", detail: "Executa uma expressao numerica simples que deve resultar em 1." }
];

const validationTypeHelp: Record<ValidationRuleType, string> = {
  required: "Use para campos essenciais, como ID, alvo ou categoria obrigatoria.",
  range: "Use para limites plausiveis, como idade entre 0 e 120 ou porcentagem entre 0 e 100.",
  domain: "Use quando a coluna so pode ter valores conhecidos, como high, medium, low.",
  regex: "Use para padroes de texto, como codigos, emails ou IDs padronizados.",
  type: "Use para detectar numero salvo como texto, data invalida ou boolean inconsistente.",
  unique: "Use para IDs ou chaves que nao podem repetir.",
  "cross-column": "Use quando uma coluna deve ser menor, maior ou igual a outra.",
  custom: "Use para checks calculados simples. A expressao deve retornar 1 para passar."
};

function validationTypesForColumn(kind: string): ValidationRuleType[] {
  if (kind === "number") return ["required", "range", "type", "unique", "cross-column", "custom"];
  if (kind === "text") return ["required", "domain", "regex", "type", "unique"];
  if (kind === "boolean") return ["required", "domain", "type", "unique"];
  if (kind === "date") return ["required", "type", "unique"];
  return ["required", "type"];
}

function invalidValidationReason(kind: string, type: ValidationRuleType) {
  if ((type === "range" || type === "cross-column" || type === "custom") && kind !== "number") {
    return "Disponivel apenas para colunas numericas.";
  }
  if ((type === "domain" || type === "regex") && kind === "number") {
    return "Use em colunas categoricas ou texto.";
  }
  if (type === "regex" && kind !== "text") {
    return "Disponivel apenas para texto.";
  }
  return "Nao recomendado para o tipo inferido desta coluna.";
}

function castTargetToProfileKind(target?: string): DataProfile["columnProfiles"][number]["kind"] | undefined {
  if (!target) return undefined;
  if (target === "number" || target === "integer" || target === "decimal") return "number";
  if (target === "text") return "text";
  if (target === "boolean") return "boolean";
  if (target === "date") return "date";
  return undefined;
}

function profileAfterDeclaredCasts(profile: DataProfile, steps: PrepStep[]): DataProfile {
  const forcedKinds = new Map<string, DataProfile["columnProfiles"][number]["kind"]>();
  steps.forEach((step) => {
    if (step.operation !== "cast" || !step.column) return;
    const kind = castTargetToProfileKind(step.target);
    if (kind) forcedKinds.set(step.column, kind);
  });
  if (!forcedKinds.size) return profile;

  return {
    ...profile,
    columnProfiles: profile.columnProfiles.map((column) => {
      const forcedKind = forcedKinds.get(column.name);
      if (!forcedKind) return column;
      return {
        ...column,
        kind: forcedKind,
        min: forcedKind === "number" ? column.min : undefined,
        q1: forcedKind === "number" ? column.q1 : undefined,
        median: forcedKind === "number" ? column.median : undefined,
        q3: forcedKind === "number" ? column.q3 : undefined,
        max: forcedKind === "number" ? column.max : undefined,
        mean: forcedKind === "number" ? column.mean : undefined,
        stdDev: forcedKind === "number" ? column.stdDev : undefined
      };
    })
  };
}

const connectorMocks = [
  { name: "Local files", status: "Online", detail: "CSV, TSV, JSON, JSONL, XLSX e Parquet no browser." },
  { name: "Object storage", status: "Mock", detail: "S3 compativel planejado para MVP futuro." },
  { name: "SQL database", status: "Mock", detail: "Teste de conexao simulado para bancos externos." }
];

const analysisRowLimit = 5000;
const mapValuesExample = [
  "com vitima => com vitima",
  "com => com vitima",
  "com V => com vitima",
  "sem vitima => sem vitima",
  "sem => sem vitima",
  "sem V => sem vitima"
].join("\n");
const pythonCodeExample = [
  "# df e um pl.DataFrame com o dataset completo",
  "# defina result como um pl.DataFrame",
  "result = df"
].join("\n");

const operationGroups: Array<{ label: string; options: Array<{ value: PrepOperation; label: string }> }> = [
  {
    label: "Globais",
    options: [
      { value: "auto-clean", label: "Auto limpeza" },
      { value: "fill-all-numeric", label: "Nulos numericos" },
      { value: "fill-all-categorical", label: "Nulos categoricos" },
      { value: "scale-all-numeric", label: "Escalar numericos" },
      { value: "clip-all-numeric", label: "Clipar numericos" },
      { value: "one-hot-all-categorical", label: "One-hot categoricas" },
      { value: "drop-id-columns", label: "Remover IDs" },
      { value: "drop-low-complete", label: "Baixa completude" }
    ]
  },
  {
    label: "Limpeza basica",
    options: [
      { value: "dedupe", label: "Deduplicar" },
      { value: "sort", label: "Ordenar" },
      { value: "filter", label: "Filtrar contem" },
      { value: "filter-out", label: "Filtrar remover" },
      { value: "map-values", label: "Mapear valores" },
      { value: "python-code", label: "Codigo Python" },
      { value: "rename", label: "Renomear coluna" },
      { value: "remove-column", label: "Remover coluna" },
      { value: "cast", label: "Converter tipo" }
    ]
  },
  {
    label: "Nulos e outliers",
    options: [
      { value: "fill-missing", label: "Preencher nulos" },
      { value: "drop-missing-rows", label: "Remover linhas sem valor" },
      { value: "fill-mean", label: "Preencher com media" },
      { value: "fill-median", label: "Preencher com mediana" },
      { value: "fill-mode", label: "Preencher com moda" },
      { value: "fill-forward", label: "Forward fill" },
      { value: "fill-backward", label: "Backward fill" },
      { value: "missing-indicator", label: "Indicador de nulo" },
      { value: "knn-impute", label: "KNN imputation local" },
      { value: "iterative-impute", label: "Iterative imputation local" },
      { value: "clip-iqr", label: "Clipping IQR" },
      { value: "zscore-clip", label: "Z-score clipping" },
      { value: "winsorize", label: "Winsorization" },
      { value: "isolation-flag", label: "Isolation outlier flag" }
    ]
  },
  {
    label: "Encoding e escala",
    options: [
      { value: "one-hot", label: "One-hot encoding" },
      { value: "ordinal-encode", label: "Ordinal encoding" },
      { value: "frequency-encode", label: "Frequency encoding" },
      { value: "target-encode", label: "Target encoding protegido" },
      { value: "hash-encode", label: "Hashing trick" },
      { value: "standard-scale", label: "Standard scaler" },
      { value: "minmax-scale", label: "Min-max scaler" },
      { value: "robust-scale", label: "Robust scaler" },
      { value: "log-transform", label: "Log transform" },
      { value: "power-transform", label: "Power transform" },
      { value: "quantile-transform", label: "Quantile transform" }
    ]
  },
  {
    label: "Texto e tempo",
    options: [
      { value: "text-clean", label: "Text cleanup" },
      { value: "text-stopwords", label: "Remover stopwords" },
      { value: "text-stem", label: "Stemming simples" },
      { value: "text-ngrams", label: "N-grams" },
      { value: "text-tfidf", label: "TF-IDF score" },
      { value: "text-embedding", label: "Hash embeddings" },
      { value: "date-parse", label: "Parse de datas" },
      { value: "timezone-shift", label: "Timezone offset" },
      { value: "temporal-parts", label: "Features temporais" },
      { value: "lag", label: "Lag" },
      { value: "rolling-mean", label: "Rolling mean" },
      { value: "holiday-flag", label: "Flag de feriado" }
    ]
  },
  {
    label: "Modelagem e amostragem",
    options: [
      { value: "formula", label: "Formula guiada" },
      { value: "bin", label: "Bins" },
      { value: "ratio", label: "Ratio" },
      { value: "interaction", label: "Interacao" },
      { value: "group-aggregate", label: "Agregacao por grupo" },
      { value: "low-variance-select", label: "Remover baixa variancia" },
      { value: "high-correlation-select", label: "Remover alta correlacao" },
      { value: "mutual-information-select", label: "Mutual information select" },
      { value: "model-importance-select", label: "Model importance select" },
      { value: "manual-feature-select", label: "Selecao manual" },
      { value: "stratified-sample", label: "Amostra estratificada" },
      { value: "oversample", label: "Oversampling" },
      { value: "undersample", label: "Undersampling" },
      { value: "smote", label: "SMOTE local" },
      { value: "class-weights", label: "Class weights" },
      { value: "train-validation-test-split", label: "Split train/validation/test" },
      { value: "head-sample", label: "Head sample" },
      { value: "tail-sample", label: "Tail sample" },
      { value: "random-sample", label: "Random sample" }
    ]
  },
  {
    label: "Joins e enriquecimento",
    options: [
      { value: "aggregate-count", label: "Agregacao count" },
      { value: "join", label: "Join com lookup" },
      { value: "fuzzy-join", label: "Fuzzy join" },
      { value: "composite-join", label: "Composite join" },
      { value: "cardinality-check", label: "Validar cardinalidade" },
      { value: "pivot", label: "Pivot" },
      { value: "unpivot", label: "Unpivot" },
      { value: "window-row-number", label: "Window row number" },
      { value: "dictionary-enrich", label: "Dictionary enrich" },
      { value: "holiday-enrich", label: "Holiday enrich" },
      { value: "geocode-enrich", label: "Geocode local" }
    ]
  }
];

const globalOperations = new Set<PrepOperation>([
  "auto-clean",
  "fill-all-numeric",
  "fill-all-categorical",
  "scale-all-numeric",
  "clip-all-numeric",
  "one-hot-all-categorical",
  "drop-id-columns",
  "drop-low-complete"
]);
const datasetOperations = new Set<PrepOperation>(["python-code"]);

const operationsWithValue = new Set<PrepOperation>([
  "filter", "filter-out", "fill-missing", "cast", "hash-encode", "timezone-shift", "lag", "rolling-mean", "formula", "bin",
  "group-aggregate", "head-sample", "tail-sample", "random-sample", "stratified-sample", "winsorize", "zscore-clip"
]);

const operationsWithTarget = new Set<PrepOperation>([
  "rename", "target-encode", "ratio", "interaction", "join", "fuzzy-join", "composite-join"
]);

function operationValueLabel(operation: PrepOperation) {
  if (operation === "filter") return "Texto para filtrar";
  if (operation === "filter-out") return "Texto para remover";
  if (operation === "fill-missing") return "Valor de preenchimento";
  if (operation === "cast") return "Tipo de destino";
  if (["head-sample", "tail-sample", "random-sample"].includes(operation)) return "Quantidade de linhas";
  if (["lag", "rolling-mean"].includes(operation)) return "Janela";
  if (operation === "timezone-shift") return "Offset em horas";
  if (operation === "bin") return "Numero de faixas";
  return "Parametro";
}

function operationGuidance(operation: PrepOperation) {
  if (operation === "auto-clean") {
    return "Aplica dedupe, remove colunas com baixa completude e preenche nulos numericos/categoricos. Valor define o minimo de completude, padrao 80.";
  }
  if (operation === "drop-low-complete") {
    return "Use Valor como percentual minimo de completude. Exemplo: 80 remove colunas com menos de 80% das celulas preenchidas.";
  }
  if (["fill-all-numeric", "fill-all-categorical", "scale-all-numeric", "clip-all-numeric", "drop-id-columns"].includes(operation)) {
    return "Transformacao global: aplica a regra automaticamente em todas as colunas compativeis.";
  }
  if (operation === "one-hot-all-categorical") {
    return "Transformacao global: aplica one-hot em colunas categoricas de baixa cardinalidade. Valor define o maximo de categorias, padrao 20.";
  }
  if (["fill-missing", "filter", "rename", "cast", "bin", "formula", "ratio", "interaction"].includes(operation)) {
    return "Use Valor para constante, filtro, formula ou novo nome. Use Alvo/tipo/direcao quando a operacao pedir tipo, direcao ou coluna de saida.";
  }
  if (operation === "filter-out") {
    return "Remove linhas em que a coluna selecionada contem o texto informado. Se o texto ficar vazio, remove linhas nulas/vazias. A comparacao ignora maiusculas e minusculas.";
  }
  if (operation === "map-values") {
    return "Padroniza categorias por dicionario. Use uma regra por linha no formato origem => destino. Valores nao mapeados permanecem iguais.";
  }
  if (operation === "python-code") {
    return "Executa Python no backend sobre o dataset completo como df: pl.DataFrame. Use Polars e atribua a saida a result.";
  }
  if (["join", "fuzzy-join", "composite-join"].includes(operation)) {
    return "Use Coluna como chave do dataset atual. Valor define tipo de join quando disponivel. Alvo seleciona a chave do lookup.";
  }
  if (["train-validation-test-split", "stratified-sample", "oversample", "undersample", "smote", "class-weights", "target-encode"].includes(operation)) {
    return "Use Coluna para a feature principal e Alvo/tipo/direcao para a coluna alvo quando necessario.";
  }
  return "Escolha a operacao e a coluna. Campos nao usados por esta operacao podem ficar vazios.";
}

function uniqueColumns(rows: DataRow[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function matrixValue(items: Array<{ left: string; right: string; value: number }>, left: string, right: string) {
  return items.find((item) => item.left === left && item.right === right)?.value ?? 0;
}

function selectedMatrix(rows: DataRow[], selectedColumns: string[]) {
  return selectedColumns.flatMap((left) =>
    selectedColumns.map((right) => ({
      left,
      right,
      value: left === right ? 1 : association(rows, left, right)
    }))
  );
}

function association(rows: DataRow[], left: string, right: string) {
  const pairs = rows
    .map((row) => [row[left], row[right]] as const)
    .filter(([a, b]) => a !== null && a !== "" && b !== null && b !== "");
  if (pairs.length < 2) return 0;

  const leftNumbers = pairs.map(([value]) => Number(value));
  const rightNumbers = pairs.map(([, value]) => Number(value));
  const leftNumeric = leftNumbers.every(Number.isFinite);
  const rightNumeric = rightNumbers.every(Number.isFinite);

  if (leftNumeric && rightNumeric) return Math.abs(pearson(leftNumbers, rightNumbers));
  if (!leftNumeric && !rightNumeric) return cramersV(pairs.map(([value]) => String(value)), pairs.map(([, value]) => String(value)));
  return leftNumeric
    ? correlationRatio(pairs.map(([, value]) => String(value)), leftNumbers)
    : correlationRatio(pairs.map(([value]) => String(value)), rightNumbers);
}

function pearson(leftValues: number[], rightValues: number[]) {
  const leftMean = average(leftValues);
  const rightMean = average(rightValues);
  const numerator = leftValues.reduce((sum, value, index) => sum + (value - leftMean) * (rightValues[index] - rightMean), 0);
  const leftDenominator = Math.sqrt(leftValues.reduce((sum, value) => sum + (value - leftMean) ** 2, 0));
  const rightDenominator = Math.sqrt(rightValues.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return bounded(numerator / ((leftDenominator || 1) * (rightDenominator || 1)));
}

function cramersV(leftValues: string[], rightValues: string[]) {
  const leftLevels = Array.from(new Set(leftValues));
  const rightLevels = Array.from(new Set(rightValues));
  if (leftLevels.length < 2 || rightLevels.length < 2) return 0;
  const total = leftValues.length;
  const chiSquare = leftLevels.reduce((sum, leftLevel) => {
    const leftCount = leftValues.filter((value) => value === leftLevel).length;
    return sum + rightLevels.reduce((innerSum, rightLevel) => {
      const rightCount = rightValues.filter((value) => value === rightLevel).length;
      const observed = leftValues.filter((value, index) => value === leftLevel && rightValues[index] === rightLevel).length;
      const expected = (leftCount * rightCount) / total || 1;
      return innerSum + (observed - expected) ** 2 / expected;
    }, 0);
  }, 0);
  return bounded(Math.sqrt(chiSquare / (total * Math.max(1, Math.min(leftLevels.length - 1, rightLevels.length - 1)))));
}

function correlationRatio(groups: string[], values: number[]) {
  const overallMean = average(values);
  const groupedValues = new Map<string, number[]>();
  groups.forEach((group, index) => groupedValues.set(group, [...(groupedValues.get(group) ?? []), values[index]]));
  const between = Array.from(groupedValues.values()).reduce((sum, groupValues) => sum + groupValues.length * (average(groupValues) - overallMean) ** 2, 0);
  const total = values.reduce((sum, value) => sum + (value - overallMean) ** 2, 0);
  return bounded(Math.sqrt(between / (total || 1)));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function bounded(value: number) {
  return Number.isFinite(value) ? Number(Math.min(1, Math.max(0, value)).toFixed(4)) : 0;
}

function scaleToPercent(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || max === min) return 50;
  return Math.min(96, Math.max(4, ((value - min) / (max - min)) * 92 + 4));
}

type ScatterKind = "number" | "category";

function selectedScatter(rows: DataRow[], xColumn: string, yColumn: string): {
  points: ScatterPoint[];
  xKind: ScatterKind;
  yKind: ScatterKind;
  xCategories: string[];
  yCategories: string[];
} {
  const pairs = rows
    .map((row, index) => ({ index, xRaw: row[xColumn], yRaw: row[yColumn] }))
    .filter((point) => point.xRaw !== null && point.xRaw !== "" && point.yRaw !== null && point.yRaw !== "");
  const xNumeric = pairs.every((point) => Number.isFinite(Number(point.xRaw)));
  const yNumeric = pairs.every((point) => Number.isFinite(Number(point.yRaw)));
  const xCategories = xNumeric ? [] : Array.from(new Set(pairs.map((point) => String(point.xRaw))));
  const yCategories = yNumeric ? [] : Array.from(new Set(pairs.map((point) => String(point.yRaw))));

  return {
    points: pairs.slice(0, 40).map((point) => ({
      index: point.index,
      x: xNumeric ? Number(point.xRaw) : Math.max(0, xCategories.indexOf(String(point.xRaw))),
      y: yNumeric ? Number(point.yRaw) : Math.max(0, yCategories.indexOf(String(point.yRaw))),
      xLabel: String(point.xRaw),
      yLabel: String(point.yRaw)
    })),
    xKind: xNumeric ? "number" : "category",
    yKind: yNumeric ? "number" : "category",
    xCategories,
    yCategories
  };
}

interface ScatterPoint {
  index: number;
  x: number;
  y: number;
  xLabel: string;
  yLabel: string;
}

function niceTicks(min: number, max: number, count = 6) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return [min];
  const step = (max - min) / Math.max(count - 1, 1);
  return Array.from({ length: count }, (_, index) => Number((min + step * index).toFixed(3)));
}

function InteractiveScatterPlot({
  points,
  xColumn,
  yColumn,
  xCategories,
  yCategories,
  xKind,
  yKind
}: {
  points: ScatterPoint[];
  xColumn: string;
  yColumn: string;
  xCategories: string[];
  yCategories: string[];
  xKind: ScatterKind;
  yKind: ScatterKind;
}) {
  const baseXValues = points.map((point) => point.x);
  const baseYValues = points.map((point) => point.y);
  const initialXMin = Math.min(...baseXValues, 0);
  const initialXMax = Math.max(...baseXValues, 1);
  const initialYMin = Math.min(...baseYValues, 0);
  const initialYMax = Math.max(...baseYValues, 1);
  const [view, setView] = useState({ xMin: initialXMin, xMax: initialXMax, yMin: initialYMin, yMax: initialYMax });
  const dragRef = useRef<{ x: number; y: number; view: typeof view } | null>(null);
  const width = 920;
  const height = 460;
  const margin = { top: 24, right: 24, bottom: 62, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  useEffect(() => {
    setView({ xMin: initialXMin, xMax: initialXMax, yMin: initialYMin, yMax: initialYMax });
  }, [initialXMin, initialXMax, initialYMin, initialYMax, xColumn, yColumn]);

  const xRange = view.xMax - view.xMin || 1;
  const yRange = view.yMax - view.yMin || 1;
  const toX = (value: number) => margin.left + ((value - view.xMin) / xRange) * plotWidth;
  const toY = (value: number) => margin.top + plotHeight - ((value - view.yMin) / yRange) * plotHeight;
  const fromClient = (clientX: number, clientY: number, rect: DOMRect) => ({
    x: view.xMin + ((clientX - rect.left - margin.left) / plotWidth) * xRange,
    y: view.yMax - ((clientY - rect.top - margin.top) / plotHeight) * yRange
  });
  const visiblePoints = points.filter((point) => point.x >= view.xMin && point.x <= view.xMax && point.y >= view.yMin && point.y <= view.yMax);
  const xTicks = xKind === "category" ? xCategories.map((_, index) => index).filter((value) => value >= view.xMin && value <= view.xMax) : niceTicks(view.xMin, view.xMax);
  const yTicks = yKind === "category" ? yCategories.map((_, index) => index).filter((value) => value >= view.yMin && value <= view.yMax) : niceTicks(view.yMin, view.yMax);
  const labelFor = (value: number, categories: string[], kind: ScatterKind) =>
    kind === "category" ? compactLabel(categories[Math.round(value)] ?? String(value)) : Number(value.toFixed(2)).toLocaleString("pt-BR");

  const zoomAt = (factor: number, centerX = (view.xMin + view.xMax) / 2, centerY = (view.yMin + view.yMax) / 2) => {
    const nextXRange = Math.max(0.000001, xRange * factor);
    const nextYRange = Math.max(0.000001, yRange * factor);
    const xRatio = (centerX - view.xMin) / xRange;
    const yRatio = (centerY - view.yMin) / yRange;
    setView({
      xMin: centerX - nextXRange * xRatio,
      xMax: centerX + nextXRange * (1 - xRatio),
      yMin: centerY - nextYRange * yRatio,
      yMax: centerY + nextYRange * (1 - yRatio)
    });
  };

  const reset = () => setView({ xMin: initialXMin, xMax: initialXMax, yMin: initialYMin, yMax: initialYMax });

  return (
    <div className="interactive-scatter">
      <div className="scatter-toolbar">
        <span>{visiblePoints.length} / {points.length} pontos visiveis</span>
        <button onClick={() => zoomAt(0.8)} type="button">Zoom +</button>
        <button onClick={() => zoomAt(1.25)} type="button">Zoom -</button>
        <button onClick={reset} type="button">Reset</button>
      </div>
      <svg
        onPointerDown={(event) => {
          (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, view };
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const deltaX = ((event.clientX - dragRef.current.x) / plotWidth) * (dragRef.current.view.xMax - dragRef.current.view.xMin);
          const deltaY = ((event.clientY - dragRef.current.y) / plotHeight) * (dragRef.current.view.yMax - dragRef.current.view.yMin);
          setView({
            xMin: dragRef.current.view.xMin - deltaX,
            xMax: dragRef.current.view.xMax - deltaX,
            yMin: dragRef.current.view.yMin + deltaY,
            yMax: dragRef.current.view.yMax + deltaY
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const center = fromClient(event.clientX, event.clientY, rect);
          zoomAt(event.deltaY < 0 ? 0.82 : 1.22, center.x, center.y);
        }}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect className="scatter-plot-bg" height={plotHeight} width={plotWidth} x={margin.left} y={margin.top} />
        {xTicks.map((tick) => (
          <Fragment key={`x-tick-${tick}`}>
            <line className="scatter-grid-line" x1={toX(tick)} x2={toX(tick)} y1={margin.top} y2={margin.top + plotHeight} />
            <text className="scatter-tick" textAnchor="middle" x={toX(tick)} y={height - 34}>{labelFor(tick, xCategories, xKind)}</text>
          </Fragment>
        ))}
        {yTicks.map((tick) => (
          <Fragment key={`y-tick-${tick}`}>
            <line className="scatter-grid-line" x1={margin.left} x2={margin.left + plotWidth} y1={toY(tick)} y2={toY(tick)} />
            <text className="scatter-tick" textAnchor="end" x={margin.left - 10} y={toY(tick) + 4}>{labelFor(tick, yCategories, yKind)}</text>
          </Fragment>
        ))}
        <line className="scatter-axis" x1={margin.left} x2={margin.left + plotWidth} y1={margin.top + plotHeight} y2={margin.top + plotHeight} />
        <line className="scatter-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + plotHeight} />
        <text className="scatter-axis-title" textAnchor="middle" x={margin.left + plotWidth / 2} y={height - 10}>{xColumn}</text>
        <text className="scatter-axis-title" textAnchor="middle" transform={`rotate(-90 ${18} ${margin.top + plotHeight / 2})`} x={18} y={margin.top + plotHeight / 2}>{yColumn}</text>
        {visiblePoints.map((point) => (
          <circle className="scatter-point" cx={toX(point.x)} cy={toY(point.y)} key={`interactive-${point.index}`} r="4">
            <title>Linha {point.index + 1}: {xColumn}={point.xLabel}; {yColumn}={point.yLabel}</title>
          </circle>
        ))}
      </svg>
      <p className="chart-legend">Wheel: zoom no cursor. Arrastar: pan. Eixos mostram coordenadas normalizadas quando a coluna e categorica.</p>
    </div>
  );
}

function frequencyBars(rows: DataRow[], column: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = row[column];
    if (value !== null && value !== "") counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ column, value, count }));
}

function numericSeries(rows: DataRow[], column: string) {
  return rows
    .map((row, index) => ({ index, value: Number(row[column]) }))
    .filter((point) => Number.isFinite(point.value))
    .slice(0, 12);
}

function compactLabel(value: string) {
  return value.length > 13 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function isLikelyIdentifier(column: string) {
  const normalized = column.toLowerCase();
  return normalized === "id" || normalized.endsWith("_id") || normalized.includes("uuid") || normalized.includes("identifier");
}

function focusedGeneratedColumns(sourceColumn: string, transformedColumns: string[], steps: PrepStep[]) {
  const generated = new Set(
    transformedColumns.filter((item) => item !== sourceColumn && item.startsWith(`${sourceColumn}_`))
  );

  steps.filter((step) => step.column === sourceColumn).forEach((step) => {
    if (step.operation === "rename" && step.target) generated.add(step.target);
    if (step.operation === "formula" && step.target) generated.add(step.target);
    if (step.operation === "class-weights") generated.add("class_weight");
    if (["oversample", "undersample", "smote"].includes(step.operation)) generated.add("synthetic");
    if (step.operation === "window-row-number") generated.add("row_number");
    if (step.operation === "dictionary-enrich") generated.add("dictionary_value");
    if (step.operation === "holiday-enrich") generated.add("calendar_holiday");
    if (step.operation === "geocode-enrich") generated.add("geocode");
  });

  return transformedColumns.filter((item) => generated.has(item));
}

export function buildFocusedColumnPreview(
  sourceColumn: string,
  sourceRows: DataRow[],
  transformedRows: DataRow[],
  steps: PrepStep[]
) {
  if (!sourceColumn) return { columns: [] as string[], rows: [] as DataRow[] };
  const transformedColumns = uniqueColumns(transformedRows);
  const columns = [sourceColumn, ...focusedGeneratedColumns(sourceColumn, transformedColumns, steps)];
  const focusedRows = transformedRows.map((row, index) => {
    const focusedRow: DataRow = {};
    columns.forEach((item) => {
      focusedRow[item] = item === sourceColumn && !(item in row) ? sourceRows[index]?.[item] ?? null : row[item] ?? null;
    });
    return focusedRow;
  });
  return { columns, rows: focusedRows };
}

function pickTargetColumn(columns: string[]) {
  return (
    columns.find((item) => ["y", "target", "label", "class", "outcome", "resolved"].includes(item.toLowerCase())) ??
    columns.find((item) => !isLikelyIdentifier(item)) ??
    columns[columns.length - 1] ??
    ""
  );
}

function pickSensitiveColumn(rows: DataRow[], targetColumn: string) {
  const profile = profileRows(rows);
  return (
    profile.columnProfiles.find((item) => item.name !== targetColumn && !isLikelyIdentifier(item.name) && item.kind !== "number")?.name ??
    profile.columnProfiles.find((item) => item.name !== targetColumn && !isLikelyIdentifier(item.name))?.name ??
    profile.columnProfiles.find((item) => item.name !== targetColumn)?.name ??
    ""
  );
}

function isBinaryLikeTarget(rows: DataRow[], column: string) {
  const values = new Set(rows.map((row) => String(row[column])).filter((value) => value !== "" && value !== "null"));
  return values.size > 0 && values.size <= 2 && Array.from(values).every((value) => ["0", "1", "true", "false"].includes(value.toLowerCase()));
}

function rowsFromDataAsset(asset: Asset): { rows: DataRow[]; inferred: boolean } {
  const encodedRows = asset.metadata?.rowsJson ?? asset.metadata?.previewRows;
  if (encodedRows) {
    try {
      const parsed = JSON.parse(encodedRows) as DataRow[];
      if (Array.isArray(parsed) && parsed.length) return { rows: parsed, inferred: false };
    } catch {
      // Fall through to schema-based sample.
    }
  }

  return { rows: [], inferred: false };
}

function parseAssetRowCount(asset?: Asset): number {
  const raw = asset?.metadata?.rows ?? asset?.metadata?.rowCount ?? asset?.metadata?.sourceRows ?? "";
  const parsed = Number(String(raw).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function backendColumnsFromAsset(asset?: Asset): string[] {
  const encodedBackendSchema = asset?.metadata?.backendSchema;
  if (encodedBackendSchema) {
    try {
      const parsed = JSON.parse(encodedBackendSchema) as Array<{ name?: string }>;
      const columns = parsed.map((item) => String(item.name ?? "")).filter(Boolean);
      if (columns.length) return columns;
    } catch {
      // Fall back to comma-separated schema metadata below.
    }
  }
  return (asset?.metadata?.schema ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

async function previewRowsFromBackendAsset(asset: Asset, start = 1, end = 50): Promise<{ rows: DataRow[]; totalRows: number }> {
  const datasetId = asset.metadata?.backendDatasetId;
  if (!datasetId) return { rows: [], totalRows: 0 };
  const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/preview?start=${start}&end=${end}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail ?? "Falha ao carregar preview do backend.");
  }
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    totalRows: Number(payload.metadata?.rowCount ?? payload.rows?.length ?? 0),
  };
}

type BackendRefineryResponse = {
  rows: DataRow[];
  rowCount: number;
  columns: string[];
  schema: Array<{ name: string; type: string }>;
  sourceProfile: DataProfile;
  profile: DataProfile;
  datasetId?: string;
  name?: string;
  bytes?: number;
  parquet?: boolean;
};

async function refineryProfileFromBackendAsset(asset: Asset, steps: PrepStep[], start = 1, end = 50): Promise<BackendRefineryResponse> {
  const datasetId = asset.metadata?.backendDatasetId;
  if (!datasetId) throw new Error("Asset sem dataset backend.");
  const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/refinery/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps, previewStart: start, previewEnd: end })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Falha ao calcular perfil completo no backend.");
  }
  return payload as BackendRefineryResponse;
}

async function runRefineryInBackend(asset: Asset, steps: PrepStep[], outputName: string): Promise<BackendRefineryResponse> {
  const datasetId = asset.metadata?.backendDatasetId;
  if (!datasetId) throw new Error("Asset sem dataset backend.");
  const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/refinery/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps, previewStart: 1, previewEnd: 1000, name: outputName })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Falha ao executar receita completa no backend.");
  }
  return payload as BackendRefineryResponse;
}

export function DataPrepView({ activeWorkspaceName, dataAssets, requestedAssetId = "", requestedSection = "prepare", requestId = 0, onCreateRefinedAsset, onOpenVisualization }: DataPrepViewProps) {
  const [datasetName, setDatasetName] = useState("Nenhum dataset selecionado");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [selectedDataAssetId, setSelectedDataAssetId] = useState("");
  const [assetLoadMessage, setAssetLoadMessage] = useState("Nenhum data asset selecionado. Importe arquivos na aba Assets para começar.");
  const [sourceTotalRows, setSourceTotalRows] = useState<number | null>(null);
  const [fullProfile, setFullProfile] = useState<DataProfile | null>(null);
  const [backendTransformedRows, setBackendTransformedRows] = useState<DataRow[]>([]);
  const [backendTransformedProfile, setBackendTransformedProfile] = useState<DataProfile | null>(null);
  const [backendRefineryLoading, setBackendRefineryLoading] = useState(false);
  const [backendRefineryError, setBackendRefineryError] = useState("");
  const [fullProfileProgress, setFullProfileProgress] = useState<FullProfileProgress | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fullExecutionProgress, setFullExecutionProgress] = useState<FullExecutionProgress | null>(null);
  const [fullExecutionRunning, setFullExecutionRunning] = useState(false);
  const fullExecutionControllerRef = useRef<AbortController | null>(null);
  const [fullExecutionMessage, setFullExecutionMessage] = useState("Execução disponível sobre a amostra persistida no data asset.");
  const [refinedDownloadUrl, setRefinedDownloadUrl] = useState("");
  const [refinedDownloadName, setRefinedDownloadName] = useState("");
  const [operation, setOperation] = useState<PrepOperation>("dedupe");
  const [column, setColumn] = useState("priority");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState("");
  const [steps, setSteps] = useState<PrepStep[]>([]);
  const [columnsToRemove, setColumnsToRemove] = useState<string[]>([]);
  const [connectorMessage, setConnectorMessage] = useState("Conectores externos ainda estao mockados.");
  const [connectorHost, setConnectorHost] = useState("s3://local-demo-bucket");
  const [connectorUser, setConnectorUser] = useState("local-user");
  const [connectorSecret, setConnectorSecret] = useState("");
  const [lookupName, setLookupName] = useState("priority_lookup.csv");
  const [lookupRows, setLookupRows] = useState<DataRow[]>([
    { priority: "high", sla_hours: 4, escalation: true },
    { priority: "medium", sla_hours: 24, escalation: false },
    { priority: "low", sla_hours: 72, escalation: false }
  ]);
  const [lookupAssetId, setLookupAssetId] = useState("");
  const [baselineName, setBaselineName] = useState("");
  const [baselineRows, setBaselineRows] = useState<DataRow[]>([]);
  const [baselineAssetId, setBaselineAssetId] = useState("");
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [validationColumn, setValidationColumn] = useState("priority");
  const [validationType, setValidationType] = useState<ValidationRuleType>("required");
  const [validationExpectedType, setValidationExpectedType] = useState("number");
  const [validationMin, setValidationMin] = useState("0");
  const [validationMax, setValidationMax] = useState("100");
  const [validationPattern, setValidationPattern] = useState("");
  const [validationDomain, setValidationDomain] = useState("high,medium,low");
  const [validationSeverity, setValidationSeverity] = useState("error");
  const [validationRightColumn, setValidationRightColumn] = useState("wait_minutes");
  const [validationOperator, setValidationOperator] = useState("<=");
  const [validationExpression, setValidationExpression] = useState("score + cost");
  const [targetColumn, setTargetColumn] = useState("resolved");
  const [sensitiveColumn, setSensitiveColumn] = useState("channel");
  const [expandedAnalysisOpen, setExpandedAnalysisOpen] = useState(false);
  const [activeDataSection, setActiveDataSection] = useState<"prepare" | "quality" | "analysis" | "result">("prepare");
  const [profileQuery, setProfileQuery] = useState("");
  const [showAllProfileColumns, setShowAllProfileColumns] = useState(false);
  const [operationPanelOpen, setOperationPanelOpen] = useState(false);
  const [operationScope, setOperationScope] = useState<"dataset" | "column">("dataset");
  const [healthColumn, setHealthColumn] = useState("");
  const [operationQuery, setOperationQuery] = useState("");
  const [openColumnMenu, setOpenColumnMenu] = useState("");
  const [columnSubmenu, setColumnSubmenu] = useState<"" | "fill" | "convert">("");
  const [focusedColumn, setFocusedColumn] = useState("");

  const stepsSignature = useMemo(() => JSON.stringify(steps), [steps]);
  const selectedDataAsset = useMemo(
    () => dataAssets.find((item) => item.id === selectedDataAssetId),
    [dataAssets, selectedDataAssetId]
  );
  const isBackendAsset = Boolean(selectedDataAsset?.metadata?.backendDatasetId);
  const backendAssetColumns = useMemo(() => backendColumnsFromAsset(selectedDataAsset), [selectedDataAsset]);
  const columns = useMemo(
    () => fullProfile?.columnProfiles.map((item) => item.name) ?? (isBackendAsset ? backendAssetColumns : uniqueColumns(rows)),
    [backendAssetColumns, fullProfile, isBackendAsset, rows]
  );
  const lookupColumns = useMemo(() => uniqueColumns(lookupRows), [lookupRows]);
  const previewSteps = useMemo(() => (fullProfile ? resolvePrepStepsForFullFile(steps, fullProfile) : steps), [fullProfile, steps]);
  const localTransformedRows = useMemo(() => applyPrepSteps(rows, previewSteps), [previewSteps, rows]);
  const visualBackendRows = useMemo(() => {
    if (!isBackendAsset) return [];
    if (backendTransformedRows.length) return backendTransformedRows;
    return steps.length ? [] : rows;
  }, [backendTransformedRows, isBackendAsset, rows, steps.length]);
  const transformedRows = isBackendAsset ? visualBackendRows : localTransformedRows;
  const profileRowsInput = useMemo(() => rows.slice(0, analysisRowLimit), [rows]);
  const transformedRowsForAnalysis = useMemo(() => transformedRows.slice(0, analysisRowLimit), [transformedRows]);
  const baselineRowsForAnalysis = useMemo(() => baselineRows.slice(0, analysisRowLimit), [baselineRows]);
  const transformedColumns = useMemo(
    () => backendTransformedProfile?.columnProfiles.map((item) => item.name) ?? (isBackendAsset ? columns : uniqueColumns(transformedRowsForAnalysis)),
    [backendTransformedProfile, columns, isBackendAsset, transformedRowsForAnalysis]
  );
  const activeColumns = transformedColumns.length ? transformedColumns : columns;
  const operationColumnOptions = focusedColumn
    ? [focusedColumn, ...activeColumns.filter((item) => item !== focusedColumn)]
    : activeColumns;
  const localProfile = useMemo(() => profileRows(profileRowsInput), [profileRowsInput]);
  const backendPlaceholderProfile = useMemo(
    () => createPendingBackendProfile(columns, sourceTotalRows ?? parseAssetRowCount(selectedDataAsset)),
    [columns, selectedDataAsset, sourceTotalRows]
  );
  const profile = isBackendAsset ? (fullProfile ?? backendPlaceholderProfile) : (fullProfile ?? localProfile);
  const localTransformedProfile = useMemo(() => profileRows(transformedRowsForAnalysis), [transformedRowsForAnalysis]);
  const transformedProfile = isBackendAsset ? (backendTransformedProfile ?? createPendingBackendProfile(transformedColumns, sourceTotalRows ?? profile.rows)) : localTransformedProfile;
  const transformedProfileWithDeclaredTypes = useMemo(
    () => isBackendAsset ? transformedProfile : profileAfterDeclaredCasts(transformedProfile, previewSteps),
    [isBackendAsset, previewSteps, transformedProfile]
  );
  const completeProfile = profile;
  const visibleProfile = steps.length ? transformedProfileWithDeclaredTypes : completeProfile;
  const profilePending = isBackendAsset && !backendRefineryError && isPendingBackendProfile(visibleProfile);
  const detailedAnalysisRows = useMemo(
    () => (activeDataSection === "analysis" || expandedAnalysisOpen ? transformedRowsForAnalysis : transformedRowsForAnalysis.slice(0, 100)),
    [activeDataSection, expandedAnalysisOpen, transformedRowsForAnalysis]
  );
  const detailedBaselineRows = useMemo(
    () => (activeDataSection === "analysis" || expandedAnalysisOpen ? baselineRowsForAnalysis : baselineRowsForAnalysis.slice(0, 100)),
    [activeDataSection, baselineRowsForAnalysis, expandedAnalysisOpen]
  );
  const validationRows = useMemo(
    () => (activeDataSection === "quality" ? transformedRowsForAnalysis : transformedRowsForAnalysis.slice(0, 100)),
    [activeDataSection, transformedRowsForAnalysis]
  );
  const validationReport = useMemo(() => validateRows(validationRows, validationRules), [validationRows, validationRules]);
  const selectedValidationColumnProfile = visibleProfile.columnProfiles.find((item) => item.name === validationColumn)
    ?? transformedProfileWithDeclaredTypes.columnProfiles.find((item) => item.name === validationColumn)
    ?? profile.columnProfiles.find((item) => item.name === validationColumn);
  const selectedValidationColumnKind = selectedValidationColumnProfile?.kind ?? "empty";
  const validValidationTypes = useMemo(
    () => validationTypesForColumn(selectedValidationColumnKind),
    [selectedValidationColumnKind]
  );
  const selectedValidationType = validationTypeOptions.find((item) => item.value === validationType) ?? validationTypeOptions[0];
  const normalizedValidationDomain = validationDomain
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const validationCanAdd =
    Boolean(validationColumn || activeColumns[0]) &&
    validValidationTypes.includes(validationType) &&
    (validationType !== "range" || validationMin !== "" || validationMax !== "") &&
    (validationType !== "regex" || validationPattern.trim().length > 0) &&
    (validationType !== "domain" || normalizedValidationDomain.length > 0) &&
    (validationType !== "cross-column" || Boolean(validationRightColumn)) &&
    (validationType !== "custom" || validationExpression.trim().length > 0);
  const driftReport = useMemo(() => detectDrift(detailedBaselineRows, detailedAnalysisRows), [detailedAnalysisRows, detailedBaselineRows]);
  const analysisReport = useMemo(
    () => analyzeMvp4(detailedAnalysisRows, detailedBaselineRows, targetColumn, sensitiveColumn),
    [detailedAnalysisRows, detailedBaselineRows, sensitiveColumn, targetColumn]
  );
  const validationExport = useMemo(() => exportValidationReport(validationReport), [validationReport]);
  const globalHeatmapColumns = useMemo(
    () => Array.from(new Set(analysisReport.correlationMatrix.flatMap((item) => [item.left, item.right]))),
    [analysisReport.correlationMatrix]
  );
  const targetOptions = useMemo(() => activeColumns.filter((item) => !isLikelyIdentifier(item)), [activeColumns]);
  const sensitiveOptions = useMemo(() => activeColumns.filter((item) => item !== targetColumn && !isLikelyIdentifier(item)), [activeColumns, targetColumn]);
  const targetProfile = transformedProfile.columnProfiles.find((item) => item.name === targetColumn);
  const sensitiveProfile = transformedProfile.columnProfiles.find((item) => item.name === sensitiveColumn);
  const targetMetricLabel = targetProfile?.kind === "number" && !isBinaryLikeTarget(transformedRowsForAnalysis, targetColumn) ? "media alvo" : "taxa";
  const barChartColumn = sensitiveProfile?.kind !== "number" ? sensitiveColumn : targetProfile?.kind !== "number" ? targetColumn : "";
  const lineChartColumn = targetProfile?.kind === "number" ? targetColumn : sensitiveProfile?.kind === "number" ? sensitiveColumn : "";
  const scatterXColumn = sensitiveColumn || targetColumn || "x";
  const scatterYColumn = targetColumn || sensitiveColumn || "y";
  const sideBars = barChartColumn ? frequencyBars(detailedAnalysisRows, barChartColumn) : [];
  const barMaxCount = Math.max(...sideBars.map((bar) => bar.count), 1);
  const linePoints = lineChartColumn ? numericSeries(detailedAnalysisRows, lineChartColumn) : [];
  const lineValues = linePoints.map((point) => point.value);
  const lineMin = Math.min(...lineValues, 0);
  const lineMax = Math.max(...lineValues, 0);
  const selectedScatterData = useMemo(
    () => selectedScatter(detailedAnalysisRows, scatterXColumn, scatterYColumn),
    [detailedAnalysisRows, scatterXColumn, scatterYColumn]
  );
  const scatterPoints = selectedScatterData.points;
  const scatterXValues = scatterPoints.map((point) => point.x);
  const scatterYValues = scatterPoints.map((point) => point.y);
  const scatterXMin = Math.min(...scatterXValues, 0);
  const scatterXMax = Math.max(...scatterXValues, 0);
  const scatterYMin = Math.min(...scatterYValues, 0);
  const scatterYMax = Math.max(...scatterYValues, 0);
  const expandedHeatmapColumns = globalHeatmapColumns;
  const previewRows = transformedRows.slice(0, 8);
  const unsupportedFullExecutionSteps = useMemo(() => unsupportedStreamingSteps(steps, fullProfile ?? undefined), [fullProfile, steps]);
  const fullExecutionBlocked = Boolean(sourceFile && (!fullProfile || unsupportedFullExecutionSteps.length));
  const recipeImpact = useMemo(() => {
    if (!fullProfile || !steps.length) return "";
    const resolved = resolvePrepStepsForFullFile(steps, fullProfile);
    const removedColumns = resolved.filter((step) => step.operation === "remove-column").length;
    const filledColumns = resolved.filter((step) => step.operation === "fill-missing").length;
    const encodedColumns = resolved.filter((step) => step.operation === "one-hot").length;
    return [
      removedColumns ? `${removedColumns} coluna(s) removida(s)` : "",
      filledColumns ? `${filledColumns} coluna(s) imputada(s)` : "",
      encodedColumns ? `${encodedColumns} coluna(s) codificada(s)` : ""
    ].filter(Boolean).join(" / ");
  }, [fullProfile, steps]);
  const filteredProfileColumns = useMemo(() => {
    const query = profileQuery.trim().toLowerCase();
    const matches = query
      ? visibleProfile.columnProfiles.filter((item) => item.name.toLowerCase().includes(query))
      : visibleProfile.columnProfiles;
    return showAllProfileColumns ? matches : matches.slice(0, 20);
  }, [profileQuery, showAllProfileColumns, visibleProfile.columnProfiles]);
  const healthColumnProfile = visibleProfile.columnProfiles.find((item) => item.name === healthColumn)
    ?? profile.columnProfiles.find((item) => item.name === healthColumn);
  const refineryPreviewRows = transformedRows.slice(0, 50);
  const refineryPreviewColumns = transformedColumns.length ? transformedColumns : uniqueColumns(refineryPreviewRows);
  const focusedPreview = useMemo(
    () => buildFocusedColumnPreview(focusedColumn, rows, refineryPreviewRows, previewSteps),
    [focusedColumn, previewSteps, refineryPreviewRows, rows]
  );
  const focusedPreviewColumns = focusedPreview.columns;
  const focusedPreviewRows = focusedPreview.rows;
  const focusedDerivedColumns = focusedPreviewColumns.slice(1);
  const visibleRefineryColumns = focusedColumn ? focusedPreviewColumns : refineryPreviewColumns;
  const visibleRefineryRows = focusedColumn ? focusedPreviewRows : refineryPreviewRows;
  const filteredOperationGroups = useMemo(() => {
    const query = operationQuery.trim().toLowerCase();
    if (!query) return operationGroups;
    return operationGroups
      .map((group) => ({ ...group, options: group.options.filter((option) => option.label.toLowerCase().includes(query)) }))
      .filter((group) => group.options.length);
  }, [operationQuery]);

  useEffect(() => {
    return () => {
      if (refinedDownloadUrl) URL.revokeObjectURL(refinedDownloadUrl);
    };
  }, [refinedDownloadUrl]);

  useEffect(() => {
    if (!selectedDataAsset?.metadata?.backendDatasetId) {
      setBackendTransformedRows([]);
      setBackendTransformedProfile(null);
      setBackendRefineryError("");
      setBackendRefineryLoading(false);
      return;
    }

    let cancelled = false;
    setBackendRefineryLoading(true);
    setBackendRefineryError("");
    void refineryProfileFromBackendAsset(selectedDataAsset, steps, 1, 50)
      .then((payload) => {
        if (cancelled) return;
        setFullProfile(payload.sourceProfile);
        setSourceTotalRows(payload.sourceProfile.rows);
        setBackendTransformedProfile(payload.profile);
        setBackendTransformedRows(payload.rows);
      })
      .catch((error) => {
        if (cancelled) return;
        setBackendTransformedRows([]);
        setBackendTransformedProfile(null);
        setBackendRefineryError(error instanceof Error ? error.message : "Falha ao recalcular Data Refinery no backend.");
      })
      .finally(() => {
        if (!cancelled) setBackendRefineryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDataAsset, stepsSignature]);

  useEffect(() => {
    if (!activeColumns.length) return;
    if (!activeColumns.includes(column) && column !== focusedColumn) setColumn(activeColumns[0] ?? "");
    setColumnsToRemove((current) => current.filter((item) => activeColumns.includes(item)));
    if (!activeColumns.includes(validationColumn)) setValidationColumn(activeColumns[0] ?? "");
    if (!activeColumns.includes(validationRightColumn)) setValidationRightColumn(activeColumns[0] ?? "");
    setValidationRules((current) =>
      current.filter((rule) => activeColumns.includes(rule.column) && (!rule.rightColumn || activeColumns.includes(rule.rightColumn)))
    );
    if (!activeColumns.includes(targetColumn)) {
      const nextTarget = pickTargetColumn(activeColumns);
      setTargetColumn(nextTarget);
      setSensitiveColumn(pickSensitiveColumn(transformedRows, nextTarget));
      return;
    }
    if (!activeColumns.includes(sensitiveColumn) || sensitiveColumn === targetColumn) setSensitiveColumn(pickSensitiveColumn(transformedRows, targetColumn));
  }, [activeColumns, column, focusedColumn, sensitiveColumn, targetColumn, transformedRows, validationColumn, validationRightColumn]);

  useEffect(() => {
    if (!validValidationTypes.includes(validationType)) setValidationType(validValidationTypes[0] ?? "required");
  }, [validValidationTypes, validationType]);

  const addStep = () => {
    if (operation === "remove-column") {
      const selected = operationScope === "column" && column ? [column] : columnsToRemove.length ? columnsToRemove : column ? [column] : [];
      const nextSteps = selected
        .filter((item) => activeColumns.includes(item))
        .map((item, index) => ({ id: `step-remove-${Date.now()}-${index}`, operation: "remove-column" as PrepOperation, column: item }));
      if (nextSteps.length) {
        setSteps((current) => [...current, ...nextSteps]);
        setColumnsToRemove([]);
      }
      return;
    }

    const resolvedTarget = target || (operationsWithTarget.has(operation) && operation !== "rename" ? activeColumns.find((item) => item !== column) ?? "" : "");
    const joinOperation = operation === "join" || operation === "fuzzy-join" || operation === "composite-join";
    const nextStep: PrepStep = {
      id: `step-${Date.now()}`,
      operation,
      column: column || activeColumns[0],
      value,
      target: joinOperation ? target || lookupColumns[0] : resolvedTarget,
      direction: target === "desc" ? "desc" : "asc",
      joinType: value === "inner" || value === "right" || value === "full" ? value : "left",
      rightRows: joinOperation ? lookupRows : undefined,
      rightName: joinOperation ? lookupName : undefined
    };
    setSteps((current) => [...current, nextStep]);
  };

  const addQuickColumnStep = (nextOperation: PrepOperation, nextColumn: string, nextTarget = "") => {
    setSteps((current) => [...current, {
      id: `quick-${nextOperation}-${Date.now()}`,
      operation: nextOperation,
      column: nextColumn,
      target: nextTarget,
      direction: nextTarget === "desc" ? "desc" : "asc"
    }]);
    setOpenColumnMenu("");
    setColumnSubmenu("");
  };

  const openAllOperations = (selectedColumn = "") => {
    setOperationScope(selectedColumn ? "column" : "dataset");
    setHealthColumn(selectedColumn);
    if (selectedColumn) setColumn(selectedColumn);
    setOperationPanelOpen(true);
    setOpenColumnMenu("");
    setColumnSubmenu("");
  };

  const openFocusedColumn = (selectedColumn: string) => {
    setFocusedColumn(selectedColumn);
    setOperationScope("column");
    setColumn(selectedColumn);
    setHealthColumn(selectedColumn);
    setOperationPanelOpen(true);
    setOpenColumnMenu("");
    setColumnSubmenu("");
  };

  const closeFocusedColumn = () => {
    setFocusedColumn("");
    setOperationPanelOpen(false);
    setHealthColumn("");
  };

  const openColumnOperation = (nextOperation: PrepOperation, selectedColumn: string) => {
    setOperation(nextOperation);
    setColumn(selectedColumn);
    setHealthColumn(selectedColumn);
    setOperationScope("column");
    setOperationPanelOpen(true);
    setOpenColumnMenu("");
    setColumnSubmenu("");
  };

  const suggestionStep = (suggestion: string): PrepStep | null => {
    const id = `suggestion-${Date.now()}`;
    if (suggestion.startsWith("Remover") && suggestion.includes("duplicadas")) return { id, operation: "dedupe" };
    if (suggestion.startsWith("Tratar nulos numericos")) return { id, operation: "fill-all-numeric" };
    if (suggestion.startsWith("Tratar nulos categoricos")) return { id, operation: "fill-all-categorical" };
    if (suggestion.startsWith("Revisar completude")) return { id, operation: "drop-low-complete", value: "80" };
    if (suggestion.startsWith("Codificar") && suggestion.includes("colunas categoricas")) {
      return { id, operation: "one-hot-all-categorical", value: "20" };
    }
    if (suggestion.startsWith("Avaliar outliers em") && suggestion.includes("colunas numericas")) {
      return { id, operation: "clip-all-numeric" };
    }

    const missingColumn = suggestion.match(/nulos em (.+?) com/)?.[1];
    if (missingColumn) {
      const profileColumn = visibleProfile.columnProfiles.find((item) => item.name === missingColumn);
      return {
        id,
        operation: profileColumn?.kind === "number" ? "fill-median" : "fill-mode",
        column: missingColumn
      };
    }

    const categoricalColumn = suggestion.match(/categorica (.+?) com/)?.[1];
    if (categoricalColumn) return { id, operation: "one-hot", column: categoricalColumn };

    const outlierColumn = suggestion.match(/outliers em (.+?) com/)?.[1];
    if (outlierColumn) return { id, operation: "clip-iqr", column: outlierColumn };

    return null;
  };

  const applySuggestion = (suggestion: string) => {
    const nextStep = suggestionStep(suggestion);
    if (nextStep) setSteps((current) => [...current, nextStep]);
  };

  const selectHeatmapColumns = (row: string, column: string) => {
    setTargetColumn(row);
    setSensitiveColumn(column === row ? pickSensitiveColumn(transformedRows, row) : column);
  };

  const swapSelectedAnalysisColumns = () => {
    if (!targetColumn || !sensitiveColumn) return;
    setTargetColumn(sensitiveColumn);
    setSensitiveColumn(targetColumn);
  };

  const applyPreset = (preset: "basic-clean" | "classification" | "drift-ready") => {
    const numericColumn = transformedProfile.columnProfiles.find((item) => item.kind === "number" && !isLikelyIdentifier(item.name))?.name;
    const categoricalColumn = transformedProfile.columnProfiles.find((item) => item.kind !== "number" && item.name !== targetColumn)?.name;
    const nextSteps: PrepStep[] = [];

    if (preset === "basic-clean") {
      nextSteps.push({ id: `preset-dedupe-${Date.now()}`, operation: "dedupe" });
      if (numericColumn) nextSteps.push({ id: `preset-fill-median-${Date.now()}`, operation: "fill-median", column: numericColumn });
      if (categoricalColumn) nextSteps.push({ id: `preset-fill-mode-${Date.now()}`, operation: "fill-mode", column: categoricalColumn });
    }

    if (preset === "classification") {
      nextSteps.push({ id: `preset-dedupe-${Date.now()}`, operation: "dedupe" });
      if (numericColumn) nextSteps.push({ id: `preset-scale-${Date.now()}`, operation: "standard-scale", column: numericColumn });
      if (categoricalColumn) nextSteps.push({ id: `preset-one-hot-${Date.now()}`, operation: "one-hot", column: categoricalColumn });
      if (targetColumn) nextSteps.push({ id: `preset-split-${Date.now()}`, operation: "train-validation-test-split", column: targetColumn });
    }

    if (preset === "drift-ready") {
      nextSteps.push({ id: `preset-cardinality-${Date.now()}`, operation: "cardinality-check", column: activeColumns[0] });
      if (numericColumn) nextSteps.push({ id: `preset-outlier-${Date.now()}`, operation: "clip-iqr", column: numericColumn });
      if (targetColumn) nextSteps.push({ id: `preset-leakage-${Date.now()}`, operation: "manual-feature-select", column: targetColumn });
    }

    setSteps((current) => [...current, ...nextSteps]);
  };

  const loadDataAsset = async (assetId: string) => {
    setSelectedDataAssetId(assetId);
    const asset = dataAssets.find((item) => item.id === assetId);
    if (!asset) return;
    let loaded = rowsFromDataAsset(asset);
    let totalRows = loaded.rows.length;
    if (asset.metadata?.backendDatasetId) {
      try {
        const backendPreview = await previewRowsFromBackendAsset(asset, 1, 50);
        loaded = { rows: backendPreview.rows, inferred: false };
        totalRows = backendPreview.totalRows || parseAssetRowCount(asset);
      } catch (error) {
        setAssetLoadMessage(error instanceof Error ? error.message : "Falha ao carregar preview do backend.");
        return;
      }
    }
    const metadataColumns = backendColumnsFromAsset(asset);
    const nextColumns = asset.metadata?.backendDatasetId && metadataColumns.length ? metadataColumns : uniqueColumns(loaded.rows);
    const nextTarget = pickTargetColumn(nextColumns);
    setDatasetName(asset.name);
    setSourceTotalRows(totalRows);
    setFullProfile(null);
    setBackendTransformedRows([]);
    setBackendTransformedProfile(null);
    setBackendRefineryError("");
    setFullProfileProgress(null);
    setSourceFile(null);
    if (refinedDownloadUrl) URL.revokeObjectURL(refinedDownloadUrl);
    setRefinedDownloadUrl("");
    setRefinedDownloadName("");
    setFullExecutionProgress(null);
    setFullExecutionMessage(asset.metadata?.backendDatasetId ? "Execucao completa disponivel no backend sobre o Parquet operacional." : "Este asset nao possui backend operacional; a execucao usa somente a amostra persistida.");
    setRows(loaded.rows);
    setFocusedColumn("");
    setOperationPanelOpen(false);
    setOpenColumnMenu("");
    setSteps([]);
    setValidationRules([]);
    setBaselineName(`${asset.name} baseline inicial`);
    setBaselineRows(loaded.rows);
    setColumn(nextColumns[0] ?? "");
    setValidationColumn(nextColumns[0] ?? "");
    setValidationRightColumn(nextColumns[0] ?? "");
    setTargetColumn(nextTarget);
    setSensitiveColumn(pickSensitiveColumn(loaded.rows, nextTarget));
    setAssetLoadMessage(
      loaded.rows.length
        ? asset.metadata?.backendDatasetId
          ? `${asset.name} selecionado em ${activeWorkspaceName}. Backend carregou ${totalRows.toLocaleString("pt-BR")} linhas; exibindo ${loaded.rows.length.toLocaleString("pt-BR")} no preview.`
          : `${asset.name} selecionado em ${activeWorkspaceName}. Linhas carregadas para preparo visual.`
        : `${asset.name} não possui linhas persistidas. Importe novamente o arquivo pela aba Assets.`
    );
  };

  useEffect(() => {
    if (!requestId || !requestedAssetId || !dataAssets.some((asset) => asset.id === requestedAssetId)) return;
    void loadDataAsset(requestedAssetId);
    setActiveDataSection(requestedSection);
    setHealthColumn("");
    setOperationPanelOpen(false);
  }, [requestId]);

  const loadLookupAsset = (assetId: string) => {
    setLookupAssetId(assetId);
    const asset = dataAssets.find((item) => item.id === assetId);
    if (!asset) return;
    const loaded = rowsFromDataAsset(asset);
    setLookupName(asset.name);
    setLookupRows(loaded.rows);
  };

  const loadBaselineAsset = (assetId: string) => {
    setBaselineAssetId(assetId);
    const asset = dataAssets.find((item) => item.id === assetId);
    if (!asset) return;
    const loaded = rowsFromDataAsset(asset);
    setBaselineName(asset.name);
    setBaselineRows(loaded.rows);
  };

  const executeRefineryJob = async () => {
    if (selectedDataAsset?.metadata?.backendDatasetId) {
      setFullExecutionRunning(true);
      setFullExecutionProgress(null);
      setFullExecutionMessage("Executando receita completa no backend sobre o Parquet operacional.");
      try {
        const outputName = `${datasetName.replace(/\.[^.]+$/, "")}_refined.parquet`;
        const result = await runRefineryInBackend(selectedDataAsset, steps, outputName);
        if (!result.datasetId || !result.parquet || result.rowCount < 0) {
          throw new Error("Backend nao retornou um asset Parquet operacional valido. O refined nao foi criado.");
        }
        setFullProfile(result.sourceProfile);
        setSourceTotalRows(result.sourceProfile.rows);
        setBackendTransformedRows(result.rows);
        setBackendTransformedProfile(result.profile);
        setBackendRefineryError("");
        onCreateRefinedAsset(datasetName, result.rows, steps, {
          mode: "backend-parquet",
          totalRows: result.sourceProfile.rows,
          outputRows: result.rowCount,
          outputBytes: result.bytes ?? 0,
          schema: result.columns,
          backendDatasetId: result.datasetId,
          backendSchema: result.schema,
          parquet: result.parquet
        }, result.name ?? outputName);
        setFullExecutionMessage(
          `Receita completa finalizada no backend: ${result.sourceProfile.rows.toLocaleString("pt-BR")} linhas lidas, ${result.rowCount.toLocaleString("pt-BR")} linhas gravadas.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida na execucao backend.";
        setBackendRefineryError(message);
        setFullExecutionMessage(message);
      } finally {
        setFullExecutionRunning(false);
      }
      return;
    }

    if (!sourceFile) {
      onCreateRefinedAsset(datasetName, transformedRows, steps, {
        mode: "preview",
        totalRows: transformedRows.length,
        outputRows: transformedRows.length,
        outputBytes: new Blob([JSON.stringify(transformedRows.slice(0, 1000))]).size,
        schema: uniqueColumns(transformedRows)
      });
      setFullExecutionMessage("Job executado sobre a amostra persistida no data asset.");
      return;
    }

    if (unsupportedFullExecutionSteps.length) {
      setFullExecutionProgress({
        phase: "error",
        percent: 0,
        loadedBytes: 0,
        totalBytes: sourceFile.size,
        inputRows: 0,
        outputRows: 0,
        message: `Receita contem operacoes que ainda nao sao seguras para streaming: ${unsupportedFullExecutionSteps.map(describeStep).join("; ")}`
      });
      setFullExecutionMessage("A execucao completa foi bloqueada para evitar resultado incorreto. Remova ou substitua os passos listados.");
      return;
    }

    setFullExecutionRunning(true);
    const executionController = new AbortController();
    fullExecutionControllerRef.current = executionController;
    setFullExecutionMessage("Executando em duas passagens: estatisticas globais e aplicacao da receita em chunks.");
    try {
      const result = await executePrepStepsOnDelimitedFile(sourceFile, steps, {
        previewRows: 1000,
        batchSize: 5000,
        profile: fullProfile ?? undefined,
        signal: executionController.signal,
        onProgress: setFullExecutionProgress
      });
      if (refinedDownloadUrl) URL.revokeObjectURL(refinedDownloadUrl);
      const url = URL.createObjectURL(result.blob);
      setRefinedDownloadUrl(url);
      setRefinedDownloadName(result.name);
      onCreateRefinedAsset(datasetName, result.rows, steps, {
        mode: "full-file-stream",
        totalRows: result.totalRows,
        outputRows: result.outputRows,
        outputBytes: result.bytes,
        schema: result.columns
      });
      setFullExecutionMessage(
        `Execucao completa finalizada: ${result.totalRows.toLocaleString("pt-BR")} linhas lidas, ${result.outputRows.toLocaleString("pt-BR")} linhas gravadas.`
      );
    } catch (error) {
      setFullExecutionProgress({
        phase: "error",
        percent: 0,
        loadedBytes: 0,
        totalBytes: sourceFile.size,
        inputRows: 0,
        outputRows: 0,
        message: error instanceof Error ? error.message : "Falha desconhecida na execucao completa."
      });
      setFullExecutionMessage(error instanceof Error ? error.message : "Falha desconhecida na execucao completa.");
    } finally {
      fullExecutionControllerRef.current = null;
      setFullExecutionRunning(false);
    }
  };

  const addValidationRule = () => {
    const baseRule: ValidationRule = {
      id: `rule-${Date.now()}`,
      column: validationColumn || activeColumns[0],
      type: validationType,
      severity: validationSeverity as ValidationRule["severity"]
    };

    if (!baseRule.column || !validationCanAdd) return;

    const nextRule: ValidationRule =
      validationType === "type"
        ? { ...baseRule, expectedType: validationExpectedType as ValidationRule["expectedType"] }
        : validationType === "range"
          ? { ...baseRule, min: validationMin === "" ? undefined : Number(validationMin), max: validationMax === "" ? undefined : Number(validationMax) }
          : validationType === "regex"
            ? { ...baseRule, pattern: validationPattern.trim() }
            : validationType === "domain"
              ? { ...baseRule, allowedValues: normalizedValidationDomain }
              : validationType === "cross-column"
                ? {
                    ...baseRule,
                    leftColumn: validationColumn || activeColumns[0],
                    operator: validationOperator as ValidationRule["operator"],
                    rightColumn: validationRightColumn
                  }
                : validationType === "custom"
                  ? { ...baseRule, expression: validationExpression.trim() }
                  : baseRule;

    setValidationRules((current) => [...current, nextRule]);
  };

  if (expandedAnalysisOpen) {
    return (
      <section className="analysis-expanded-page">
        <div className="panel analysis-expanded-hero">
          <div>
            <span className="eyebrow">Analise avancada expandida</span>
            <h2>Visualizacoes completas de {datasetName}</h2>
            <p>
              {transformedRows.length} linhas refinadas, {activeColumns.length} colunas, alvo {targetColumn || "n/a"} e coluna sensivel {sensitiveColumn || "n/a"}.
            </p>
          </div>
          <button className="button secondary" onClick={() => setExpandedAnalysisOpen(false)} type="button">
            <ArrowLeft size={16} />
            Voltar para preparo
          </button>
        </div>

        <div className="analysis-expanded-controls panel">
          <label>
            Alvo
            <select value={targetColumn} onChange={(event) => setTargetColumn(event.target.value)}>
              {(targetOptions.length ? targetOptions : activeColumns).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Coluna sensivel
            <select value={sensitiveColumn} onChange={(event) => setSensitiveColumn(event.target.value)}>
              {(sensitiveOptions.length ? sensitiveOptions : activeColumns).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="button secondary swap-analysis-button" disabled={!targetColumn || !sensitiveColumn} onClick={swapSelectedAnalysisColumns} type="button">
            Trocar ordem
          </button>
          <article>
            <strong>{transformedProfile.qualityScore}</strong>
            <span>score de qualidade</span>
          </article>
          <article>
            <strong>{driftReport.driftScore}</strong>
            <span>{driftReport.hasDrift ? "drift detectado" : "sem drift relevante"}</span>
          </article>
        </div>

        <div className="analysis-expanded-grid">
          <section className="panel expanded-wide">
            <div className="panel-header">
              <div className="title-row">
                <h2>Histogramas detalhados</h2>
                <HelpButton title="Histogramas detalhados">
                  Distribuicoes de todas as colunas numericas disponiveis. Cada barra representa uma faixa de valores e sua frequencia.
                </HelpButton>
              </div>
            </div>
            <div className="expanded-histogram-grid">
              {analysisReport.histograms.map((histogram) => {
                const maxCount = Math.max(...histogram.bins.map((bin) => bin.count), 1);
                return (
                  <article key={histogram.column}>
                    <strong>{histogram.column}</strong>
                    <div className="expanded-histogram">
                      {histogram.bins.map((bin) => (
                        <span key={bin.label}>
                          <i style={{ height: `${Math.max(8, (bin.count / maxCount) * 150)}px` }} />
                          <em>{bin.count}</em>
                          <small title={bin.label}>{compactLabel(bin.label)}</small>
                        </span>
                      ))}
                    </div>
                    <p>Eixo X: faixas de valor. Eixo Y: contagem de linhas.</p>
                  </article>
                );
              })}
              {!analysisReport.histograms.length ? <p className="empty-state">Nenhuma coluna numerica no dataset refinado. Carregue colunas numericas para ver distribuicoes.</p> : null}
              {analysisReport.histograms.length === 1 ? <p className="empty-state subtle">Apenas uma coluna numerica foi encontrada; comparacoes entre variaveis ficarao limitadas.</p> : null}
            </div>
          </section>

          <section className="panel expanded-wide">
            <div className="panel-header">
              <div className="title-row">
                <h2>Matriz de correlacao completa</h2>
                <HelpButton title="Matriz de correlacao completa">
                  Mostra a correlacao entre todas as colunas numericas do dataset refinado. Valores proximos de 1 indicam relacao linear mais forte.
                </HelpButton>
              </div>
            </div>
            {expandedHeatmapColumns.length ? (
              <div className="heatmap-matrix expanded" style={{ gridTemplateColumns: `150px repeat(${expandedHeatmapColumns.length}, minmax(92px, 1fr))` }}>
                <span className="axis-label" />
                {expandedHeatmapColumns.map((column) => <span className="axis-label" key={`x-expanded-${column}`} title={column}>{column}</span>)}
                {expandedHeatmapColumns.map((row) => (
                  <Fragment key={`expanded-row-${row}`}>
                    <span className="axis-label row-label" title={row}>{row}</span>
                    {expandedHeatmapColumns.map((column) => {
                      const value = Math.abs(matrixValue(analysisReport.correlationMatrix, row, column));
                      return (
                        <button
                          className="heat-cell"
                          key={`expanded-${row}-${column}`}
                          onClick={() => selectHeatmapColumns(row, column)}
                          style={{ opacity: Math.max(0.22, value) }}
                          title={`${row} x ${column}: ${value}. Clique para selecionar alvo=${row} e sensivel=${column}.`}
                          type="button"
                        >
                          {value.toFixed(3)}
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            ) : <p className="empty-state">Sem colunas numericas suficientes para matriz de correlacao.</p>}
            {expandedHeatmapColumns.length === 1 ? <p className="empty-state subtle">A matriz tem apenas uma coluna numerica, por isso mostra somente auto-correlacao 1.000.</p> : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Boxplots completos</h2>
                <HelpButton title="Boxplots completos">
                  Resume minimo, quartis, mediana e maximo para comparar escala e dispersao entre colunas numericas.
                </HelpButton>
              </div>
            </div>
            <div className="expanded-list">
              {analysisReport.boxplots.map((boxplot) => (
                <article key={boxplot.column}>
                  <strong>{boxplot.column}</strong>
                  <div className="boxplot-row expanded">
                    <span>
                      <i style={{ left: "18%", width: "58%" }} />
                      <b style={{ left: "50%" }} />
                    </span>
                  </div>
                  <p>min {boxplot.min} / q1 {boxplot.q1} / mediana {boxplot.median} / q3 {boxplot.q3} / max {boxplot.max}</p>
                </article>
              ))}
              {!analysisReport.boxplots.length ? <p className="empty-state">Nenhuma coluna numerica no dataset refinado. Boxplots precisam de valores numericos.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Dispersao alvo x sensivel</h2>
                <HelpButton title="Dispersao alvo x sensivel">
                  Visualiza a relacao entre as duas colunas selecionadas. Categorias sao posicionadas como indices para permitir comparacao visual.
                </HelpButton>
              </div>
            </div>
            <InteractiveScatterPlot
              points={scatterPoints}
              xCategories={selectedScatterData.xCategories}
              xColumn={scatterXColumn}
              xKind={selectedScatterData.xKind}
              yCategories={selectedScatterData.yCategories}
              yColumn={scatterYColumn}
              yKind={selectedScatterData.yKind}
            />
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Missingness map completo</h2>
                <HelpButton title="Missingness map completo">
                  Lista linhas com nulos para identificar padroes de falha de coleta ou colunas que precisam de imputacao.
                </HelpButton>
              </div>
            </div>
            <div className="expanded-list compact">
              {analysisReport.missingnessMap.slice(0, 30).map((item) => (
                <article key={`expanded-missing-${item.rowIndex}`}>
                  <strong>Linha {item.rowIndex + 1}</strong>
                  <p>{item.missingColumns.join(", ")}</p>
                </article>
              ))}
              {!analysisReport.missingnessMap.length ? <p className="empty-state">Sem nulos no dataset refinado.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Drift e distribuicoes</h2>
                <HelpButton title="Drift e distribuicoes">
                  Compara baseline e dataset atual para indicar mudancas de schema e distribuicao.
                </HelpButton>
              </div>
            </div>
            <div className="expanded-list compact">
              {analysisReport.distributionComparison.map((item) => (
                <article key={`expanded-dist-${item.column}`}>
                  <strong>{item.column}</strong>
                  <p>{item.baselineTop} para {item.currentTop} / distancia {item.distance}</p>
                </article>
              ))}
              {!analysisReport.distributionComparison.length ? <p className="empty-state">Carregue um baseline com colunas compativeis.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Leakage e sensibilidade</h2>
                <HelpButton title="Leakage e sensibilidade">
                  Combina riscos de vazamento do alvo com comparacao por grupos sensiveis para avaliar prontidao antes de treinar modelos.
                </HelpButton>
              </div>
            </div>
            <div className="expanded-risk-grid">
              <div>
                <strong>Target leakage</strong>
                {analysisReport.leakageReport.map((item) => (
                  <span key={`expanded-leakage-${item.column}`}>{item.column}: risco {item.risk} / {item.reason}</span>
                ))}
                {!analysisReport.leakageReport.length ? <span>Nenhum risco forte detectado.</span> : null}
              </div>
              <div>
                <strong>Bias/sensibilidade</strong>
                {analysisReport.biasReport.map((item) => (
                  <span key={`expanded-bias-${item.column}-${item.group}`}>{item.group}: {item.count} linhas{item.targetRate !== undefined ? ` / ${targetMetricLabel} ${item.targetRate}` : ""}</span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className={`data-prep-layout section-${activeDataSection}`}>
      <div className="panel data-workbench">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Dados, conexoes e preparo</span>
            <div className="title-row">
              <h2>Data Refinery visual</h2>
              <HelpButton title="Data Refinery visual">
                Area para carregar datasets, montar uma receita no-code de preparo, validar qualidade e gerar um asset refinado para treino ou analise.
              </HelpButton>
            </div>
          </div>
        </div>

        <section className="asset-source-panel">
          <div>
            <span className="eyebrow">Workspace ativo</span>
            <strong>{activeWorkspaceName}</strong>
            <p>{assetLoadMessage}</p>
          </div>
          <label>
            Data asset
            <select value={selectedDataAssetId} onChange={(event) => void loadDataAsset(event.target.value)}>
              <option value="">Selecione um data asset</option>
              {dataAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} / v{asset.version}
                </option>
              ))}
            </select>
          </label>
          <span>{dataAssets.length} data asset(s) neste workspace</span>
        </section>

        {fullProfileProgress && !fullProfile ? (
          <section className="upload-progress-panel compact-progress" aria-live="polite">
            <div>
              <strong>{fullProfileProgress.message}</strong>
              <span>
                {fullProfileProgress.rows.toLocaleString("pt-BR")} linhas perfiladas / {(fullProfileProgress.loadedBytes / 1024 / 1024).toFixed(1)} MB de {(fullProfileProgress.totalBytes / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <div className="upload-progress-bar">
              <i style={{ width: `${fullProfileProgress.percent}%` }} />
            </div>
            <em>{fullProfileProgress.phase === "error" ? "erro" : `${fullProfileProgress.percent}%`}</em>
          </section>
        ) : null}

        {backendRefineryLoading ? (
          <section className="upload-progress-panel compact-progress" aria-live="polite">
            <div>
              <strong>Recalculando no backend completo</strong>
              <span>Preview continua limitado para exibicao; saude, perfil e sugestoes usam o Parquet inteiro.</span>
            </div>
          </section>
        ) : null}

        {backendRefineryError ? (
          <section className="upload-progress-panel compact-progress error" aria-live="polite">
            <div>
              <strong>Falha no calculo completo</strong>
              <span>{backendRefineryError}</span>
            </div>
          </section>
        ) : null}

        <div className="data-summary-grid" hidden={activeDataSection === "prepare"}>
          <article>
            <strong>{datasetName}</strong>
            <span>
              {rows.length.toLocaleString("pt-BR")} no preview / {sourceTotalRows === null ? "perfil completo em andamento" : `${sourceTotalRows.toLocaleString("pt-BR")} no arquivo`} / {visibleProfile.columns} colunas
            </span>
          </article>
          <article>
            <strong>{profilePending ? "..." : visibleProfile.qualityScore}</strong>
            <span>{profilePending ? "qualidade carregando no backend" : `qualidade: ${visibleProfile.quality.completenessPct}% completo${steps.length ? " apos receita" : ""}`}</span>
          </article>
          <article>
            <strong>{visibleProfile.duplicateRows}</strong>
            <span>duplicadas{visibleProfile.duplicateRowsApproximate ? " estimadas em amostra" : ""}</span>
          </article>
          <article>
            <strong>{visibleProfile.rows.toLocaleString("pt-BR")}</strong>
            <span>linhas consideradas no {steps.length ? "dataset transformado" : fullProfile ? "arquivo completo" : "preview"}</span>
          </article>
        </div>

        <nav aria-label="Etapas do Data Refinery" className="refinery-tabs">
          {[
            ["prepare", "Transformar"],
            ["quality", "Qualidade"],
            ["analysis", "Visualizacoes"],
            ["result", "Resultado"]
          ].map(([section, label]) => (
            <button
              aria-current={activeDataSection === section ? "page" : undefined}
              className={activeDataSection === section ? "active" : ""}
              key={section}
              onClick={() => setActiveDataSection(section as typeof activeDataSection)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <section className="refinery-workspace" hidden={activeDataSection !== "prepare"}>
          <div className={focusedColumn ? "refinery-commandbar column-focus-commandbar" : "refinery-commandbar"}>
            {focusedColumn ? <button className="button secondary" onClick={closeFocusedColumn} type="button"><ArrowLeft size={16} />Todas as colunas</button> : <button className="button primary" onClick={() => openAllOperations()} type="button"><Plus size={16} />Transformacao</button>}
            <div>
              <strong>{focusedColumn ? `Coluna ${focusedColumn}` : datasetName}</strong>
              <span>{focusedColumn ? `${focusedDerivedColumns.length} coluna(s) derivada(s) visiveis com a origem` : `${refineryPreviewRows.length.toLocaleString("pt-BR")} linhas no preview de ${sourceTotalRows?.toLocaleString("pt-BR") ?? "..."}`}</span>
            </div>
            <div className="refinery-command-actions">
              {focusedColumn && !operationPanelOpen ? <button className="button primary" onClick={() => openAllOperations(focusedColumn)} type="button"><Plus size={16} />Transformacao</button> : null}
              <button aria-label="Desfazer ultima transformacao" className="icon-button" disabled={!steps.length} onClick={() => setSteps((current) => current.slice(0, -1))} title="Desfazer ultima transformacao" type="button">↶</button>
              <button className="button secondary" onClick={() => setActiveDataSection("result")} type="button">Executar receita</button>
            </div>
          </div>

          <div className={`${operationPanelOpen ? "refinery-stage operation-open" : "refinery-stage"}${focusedColumn ? " column-focus-stage" : ""}`}>
            {operationPanelOpen ? (
              <aside className="operation-drawer">
                <div className="drawer-header">
                  <div><span className="eyebrow">Transformacoes</span><h3>{operationScope === "column" ? column : "Dataset inteiro"}</h3></div>
                  <button aria-label="Fechar transformacoes" className="icon-button" onClick={() => setOperationPanelOpen(false)} type="button"><X size={17} /></button>
                </div>
                <input aria-label="Buscar transformacao" className="operation-search" onChange={(event) => setOperationQuery(event.target.value)} placeholder="Buscar transformacao..." value={operationQuery} />
                <div className="operation-catalog">
                  {filteredOperationGroups.map((group) => <section key={group.label}><strong>{group.label}</strong>{group.options.map((option) => <button className={operation === option.value ? "active" : ""} key={option.value} onClick={() => setOperation(option.value)} type="button">{option.label}</button>)}</section>)}
                </div>
                <div className="operation-config">
                  <strong>{operationGroups.flatMap((group) => group.options).find((option) => option.value === operation)?.label}</strong>
                  <p>{operationGuidance(operation)}</p>
                  {operation === "remove-column" ? (
                    operationScope === "column" ? <div className="operation-summary"><strong>{column}</strong><span>sera removida</span></div> :
                    <fieldset className="column-checklist"><legend>Colunas</legend>{activeColumns.map((item) => <label key={item}><input checked={columnsToRemove.includes(item)} onChange={(event) => setColumnsToRemove((current) => event.target.checked ? [...current, item] : current.filter((name) => name !== item))} type="checkbox" />{item}</label>)}</fieldset>
                  ) : datasetOperations.has(operation) ? <div className="operation-summary"><strong>Dataset inteiro</strong><span>df completo no backend</span></div> : globalOperations.has(operation) ? <div className="operation-summary"><strong>Global</strong><span>todas as colunas compativeis</span></div> : (
                    <label>Coluna<select value={column} onChange={(event) => { setColumn(event.target.value); setHealthColumn(event.target.value); }}>{operationColumnOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  )}
                  {operation === "rename" ? <label>Novo nome<input onChange={(event) => setTarget(event.target.value)} placeholder="novo_nome" value={target} /></label> : null}
                  {operation === "sort" ? <label>Direcao<select onChange={(event) => setTarget(event.target.value)} value={target === "desc" ? "desc" : "asc"}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label> : null}
                  {operation === "drop-low-complete" || operation === "auto-clean" ? <label>Minimo completo (%)<input max="100" min="0" onChange={(event) => setValue(event.target.value)} placeholder="80" type="number" value={value} /></label> : null}
                  {operation === "one-hot-all-categorical" ? <label>Maximo de categorias<input min="2" onChange={(event) => setValue(event.target.value)} placeholder="20" type="number" value={value} /></label> : null}
                  {operation === "map-values" ? <label className="wide-field">Mapeamento<textarea onChange={(event) => setValue(event.target.value)} placeholder={mapValuesExample} rows={7} value={value} /></label> : null}
                  {operation === "python-code" ? <label className="wide-field">Codigo Python<textarea onChange={(event) => setValue(event.target.value)} placeholder={pythonCodeExample} rows={10} spellCheck={false} value={value} /></label> : null}
                  {operationsWithValue.has(operation) ? <label>{operationValueLabel(operation)}<input onChange={(event) => setValue(event.target.value)} value={value} /></label> : null}
                  {operation === "filter-out" && !value.trim() ? <p className="operation-warning">Sem texto: esta transformação removerá linhas nulas/vazias e afetará todas as outras colunas dessas linhas.</p> : null}
                  {operation === "join" || operation === "fuzzy-join" || operation === "composite-join" ? <><label>Tipo do join<select onChange={(event) => setValue(event.target.value)} value={value || "left"}><option value="left">Left</option><option value="inner">Inner</option><option value="right">Right</option><option value="full">Full</option></select></label><label>Chave no lookup<select onChange={(event) => setTarget(event.target.value)} value={target || lookupColumns[0] || ""}>{lookupColumns.map((item) => <option key={item} value={item}>{lookupName}.{item}</option>)}</select></label></> : null}
                  {operationsWithTarget.has(operation) && !["rename", "join", "fuzzy-join", "composite-join"].includes(operation) ? <label>Coluna alvo<select onChange={(event) => setTarget(event.target.value)} value={target}>{activeColumns.filter((item) => item !== column).map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                  <button className="button primary" onClick={addStep} type="button"><Plus size={16} />Adicionar a receita</button>
                </div>
              </aside>
            ) : null}

            <div className="refinery-table-wrap">
              <table className="refinery-preview-table">
                <thead><tr><th className="row-number">#</th>{visibleRefineryColumns.map((item) => {
                  const profileItem = visibleProfile.columnProfiles.find((profileColumn) => profileColumn.name === item)
                    ?? profile.columnProfiles.find((profileColumn) => profileColumn.name === item);
                  const menuOpen = openColumnMenu === item;
                  const isDerivedColumn = Boolean(focusedColumn && item !== focusedColumn);
                  const kindLabel = profilePending ? "Carregando" : profileItem?.kind ?? "unknown";
                  return <th className={healthColumn === item ? "selected-column" : ""} key={item}><div><button className="column-title" onClick={() => setHealthColumn(item)} type="button"><strong title={item}>{item}</strong><span>{isDerivedColumn ? `derivada · ${kindLabel}` : kindLabel}</span></button><div className={menuOpen ? "column-options open" : "column-options"}><button aria-expanded={menuOpen} aria-label={`Opcoes da coluna ${item}`} onClick={() => { setOpenColumnMenu((current) => current === item ? "" : item); setColumnSubmenu(""); }} type="button"><MoreVertical size={17} /></button>{menuOpen ? <div className="column-options-menu">
                    {columnSubmenu ? <button className="column-menu-back" onClick={() => setColumnSubmenu("")} type="button"><ChevronLeft size={14} />{columnSubmenu === "fill" ? "Preencher nulos" : "Convert column"}</button> : null}
                    {!columnSubmenu ? <><button onClick={() => addQuickColumnStep("remove-column", item)} type="button">Remover</button><button onClick={() => addQuickColumnStep("sort", item, "asc")} type="button">Ordenar crescente</button><button onClick={() => addQuickColumnStep("sort", item, "desc")} type="button">Ordenar decrescente</button><button className="column-menu-next" onClick={() => setColumnSubmenu("fill")} type="button">Preencher nulos<ChevronRight size={14} /></button><button className="column-menu-next" onClick={() => setColumnSubmenu("convert")} type="button">Convert column<ChevronRight size={14} /></button>{focusedColumn ? null : <button onClick={() => openFocusedColumn(item)} type="button">View all</button>}</> : null}
                    {columnSubmenu === "fill" ? <><button onClick={() => addQuickColumnStep("drop-missing-rows", item)} type="button">Remover linhas sem valor</button>{profileItem?.kind === "number" ? <><button onClick={() => addQuickColumnStep("fill-mean", item)} type="button">Media</button><button onClick={() => addQuickColumnStep("fill-median", item)} type="button">Mediana</button></> : null}<button onClick={() => addQuickColumnStep("fill-mode", item)} type="button">Moda</button><button onClick={() => addQuickColumnStep("fill-forward", item)} type="button">Valor anterior</button><button onClick={() => addQuickColumnStep("fill-backward", item)} type="button">Proximo valor</button><button onClick={() => openColumnOperation("fill-missing", item)} type="button">Valor constante...</button></> : null}
                    {columnSubmenu === "convert" ? <><button onClick={() => addQuickColumnStep("cast", item, "number")} type="button">Numero</button><button onClick={() => addQuickColumnStep("cast", item, "integer")} type="button">Inteiro</button><button onClick={() => addQuickColumnStep("cast", item, "decimal")} type="button">Decimal</button><button onClick={() => addQuickColumnStep("cast", item, "text")} type="button">Texto</button><button onClick={() => addQuickColumnStep("cast", item, "boolean")} type="button">Booleano</button><button onClick={() => addQuickColumnStep("cast", item, "date")} type="button">Data</button></> : null}
                  </div> : null}</div></div></th>;
                })}</tr></thead>
                <tbody>{visibleRefineryRows.map((row, rowIndex) => <tr key={rowIndex}><th className="row-number">{rowIndex + 1}</th>{visibleRefineryColumns.map((item) => <td className={healthColumn === item ? "selected-column" : row[item] === null || row[item] === "" ? "missing-cell" : ""} key={item}>{row[item] === null || row[item] === "" ? <em>nulo</em> : String(row[item])}</td>)}</tr>)}</tbody>
              </table>
            </div>

            <aside className="health-panel">
              <div className="drawer-header"><div><span className="eyebrow">Saude</span><h3>{healthColumnProfile?.name ?? "Dataset"}</h3></div>{healthColumn ? <button aria-label="Voltar para saude do dataset" className="icon-button" onClick={() => setHealthColumn("")} title="Saude do dataset" type="button"><X size={16} /></button> : null}</div>
              {profilePending ? <div className="empty-state">Calculando saude, tipos e frequencias no backend sobre o dataset completo.</div> : healthColumnProfile ? <div className="health-metrics"><article><strong>{healthColumnProfile.kind}</strong><span>tipo inferido</span></article><article><strong>{visibleProfile.rows ? Math.round(((visibleProfile.rows - healthColumnProfile.missing) / visibleProfile.rows) * 100) : 0}%</strong><span>completo</span></article><article><strong>{healthColumnProfile.missing.toLocaleString("pt-BR")}</strong><span>nulos</span></article><article><strong>{healthColumnProfile.uniqueCapped ? ">= " : ""}{healthColumnProfile.unique.toLocaleString("pt-BR")}</strong><span>unicos</span></article>{healthColumnProfile.mean !== undefined ? <article className="full"><strong>{healthColumnProfile.mean}</strong><span>media / mediana {healthColumnProfile.median}</span></article> : null}<div className={healthColumnProfile.unique > 10 ? "health-frequency scrollable" : "health-frequency"}><strong>Valores frequentes</strong>{healthColumnProfile.frequencies.map((frequency) => <span key={frequency.value}>{frequency.value}<em>{frequency.count}</em></span>)}</div></div> : <div className="health-metrics"><article><strong>{visibleProfile.qualityScore}</strong><span>score de qualidade</span></article><article><strong>{visibleProfile.quality.completenessPct}%</strong><span>completo</span></article><article><strong>{visibleProfile.rows.toLocaleString("pt-BR")}</strong><span>linhas analisadas</span></article><article><strong>{visibleProfile.columns}</strong><span>colunas</span></article><article><strong>{visibleProfile.duplicateRows}</strong><span>duplicadas</span></article><div className="health-suggestions"><strong>Atencao</strong>{visibleProfile.suggestions.slice(0, 4).map((suggestion) => <span key={suggestion}>{suggestion}</span>)}</div></div>}
              <div className="compact-steps"><div><strong>{steps.length} etapas</strong><button disabled={!steps.length} onClick={() => setSteps([])} type="button">Limpar</button></div>{steps.slice(-6).map((step, index) => <span key={step.id}><em>{Math.max(1, steps.length - 5 + index)}</em>{describeStep(step)}<button aria-label={`Remover ${describeStep(step)}`} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} type="button"><X size={12} /></button></span>)}</div>
            </aside>
          </div>
        </section>

        <div className="data-tabs-grid legacy-prepare" hidden>
          <section className="subpanel">
            <span className="eyebrow">Modo assistido</span>
            <div className="title-row">
              <h3>Sugestoes automaticas</h3>
              <HelpButton title="Sugestoes automaticas">
                Lista problemas detectados no dataset atual, como nulos, duplicatas, categorias ou outliers, e sugere proximas etapas de preparo.
              </HelpButton>
            </div>
            <div className="suggestion-list">
              {visibleProfile.suggestions.map((suggestion) => {
                const actionable = suggestionStep(suggestion) !== null;
                return (
                <button disabled={!actionable} key={suggestion} onClick={() => applySuggestion(suggestion)} type="button">
                  <WandSparkles size={15} />
                  <span>{suggestion}</span>
                  <em>{actionable ? "Adicionar etapa" : "Informativo"}</em>
                </button>
                );
              })}
            </div>
          </section>

          <section className="subpanel">
            <span className="eyebrow">Modo avancado</span>
            <div className="title-row">
              <h3>Tecnicas no-code</h3>
              <HelpButton title="Tecnicas no-code">
                Catalogo das transformacoes avancadas disponiveis na receita visual, para preparar dados sem escrever codigo.
              </HelpButton>
            </div>
            <div className="technique-grid">
              {advancedTechniques.map((technique) => (
                <span key={technique.label} data-status={technique.status}>
                  {technique.label}
                  <em>{technique.status}</em>
                </span>
              ))}
            </div>
          </section>
        </div>

        <section className="subpanel legacy-prepare" hidden>
          <div className="panel-header compact-header">
            <div>
              <span className="eyebrow">Transformacoes</span>
              <div className="title-row">
                <h3>Receita ordenada</h3>
                <HelpButton title="Receita ordenada">
                  Pipeline visual aplicado em ordem. Cada etapa transforma o dataset e atualiza preview, validacao, drift e graficos.
                </HelpButton>
              </div>
            </div>
            <button className="button primary" onClick={addStep} type="button">
              <Plus size={16} />
              Adicionar etapa
            </button>
          </div>

          <div className="guided-flow">
            <article className="active"><strong>1. Upload</strong><span>{datasetName}</span></article>
            <article className={steps.length ? "active" : ""}><strong>2. Corrigir</strong><span>{steps.length} etapa(s)</span></article>
            <article className={validationReport.issues.length === 0 ? "active" : ""}><strong>3. Validar</strong><span>{validationReport.issues.length} problema(s)</span></article>
            <article className="active"><strong>4. Analisar</strong><span>score {visibleProfile.qualityScore}</span></article>
            <article><strong>5. Exportar</strong><span>gerar asset refinado</span></article>
          </div>

          <div className="preset-row" aria-label="Presets de preparo">
            <button onClick={() => applyPreset("basic-clean")} type="button">Limpeza basica</button>
            <button onClick={() => applyPreset("classification")} type="button">Preparar classificacao</button>
            <button onClick={() => applyPreset("drift-ready")} type="button">Auditoria e drift</button>
          </div>

          <p className="operation-hint">{operationGuidance(operation)}</p>

          <div className="prep-controls">
            <label>
              Operacao
              <select value={operation} onChange={(event) => setOperation(event.target.value as PrepOperation)}>
                {operationGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {operation === "remove-column" ? (
              <fieldset className="column-checklist">
                <legend>Colunas para remover</legend>
                {activeColumns.map((item) => (
                  <label key={item}>
                    <input
                      checked={columnsToRemove.includes(item)}
                      onChange={(event) =>
                        setColumnsToRemove((current) =>
                          event.target.checked ? [...current, item] : current.filter((columnName) => columnName !== item)
                        )
                      }
                      type="checkbox"
                    />
                    {item}
                  </label>
                ))}
              </fieldset>
            ) : datasetOperations.has(operation) ? (
              <div className="operation-summary">
                <strong>Dataset inteiro</strong>
                <span>df completo no backend</span>
              </div>
            ) : globalOperations.has(operation) ? (
              <div className="operation-summary">
                <strong>Global</strong>
                <span>aplica em todas as colunas compativeis</span>
              </div>
            ) : (
              <label>
                Coluna
                <select value={column} onChange={(event) => setColumn(event.target.value)}>
                  {activeColumns.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {operation === "rename" ? (
              <label>
                Novo nome
                <input onChange={(event) => setTarget(event.target.value)} placeholder="novo_nome" value={target} />
              </label>
            ) : operation === "remove-column" ? (
              <div className="operation-summary">
                <strong>{columnsToRemove.length || (column ? 1 : 0)}</strong>
                <span>coluna(s) selecionada(s)</span>
              </div>
            ) : operation === "drop-low-complete" || operation === "auto-clean" ? (
              <label>
                Minimo completo (%)
                <input max="100" min="0" onChange={(event) => setValue(event.target.value)} placeholder="80" type="number" value={value} />
              </label>
            ) : operation === "one-hot-all-categorical" ? (
              <label>
                Max categorias
                <input min="2" onChange={(event) => setValue(event.target.value)} placeholder="20" type="number" value={value} />
              </label>
            ) : operation === "map-values" ? (
              <label className="wide-field">
                Mapeamento
                <textarea onChange={(event) => setValue(event.target.value)} placeholder={mapValuesExample} rows={7} value={value} />
              </label>
            ) : operation === "python-code" ? (
              <label className="wide-field">
                Codigo Python
                <textarea onChange={(event) => setValue(event.target.value)} placeholder={pythonCodeExample} rows={10} spellCheck={false} value={value} />
              </label>
            ) : globalOperations.has(operation) ? (
              <div className="operation-summary">
                <strong>Sem parametro</strong>
                <span>adicione a etapa para aplicar</span>
              </div>
            ) : (
              <>
                <label>
                  Valor
                  {operation === "join" ? (
                    <select value={value || "left"} onChange={(event) => setValue(event.target.value)}>
                      <option value="left">left</option>
                      <option value="inner">inner</option>
                      <option value="right">right</option>
                      <option value="full">full</option>
                    </select>
                  ) : (
                    <input onChange={(event) => setValue(event.target.value)} placeholder="texto, nulo, filtro..." value={value} />
                  )}
                </label>
                <label>
                  Alvo/tipo/direcao
                  {operation === "join" ? (
                    <select value={target || lookupColumns[0] || ""} onChange={(event) => setTarget(event.target.value)}>
                      {lookupColumns.map((item) => (
                        <option key={item} value={item}>
                          {lookupName}.{item}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input onChange={(event) => setTarget(event.target.value)} placeholder="novo_nome, number, desc..." value={target} />
                  )}
                </label>
              </>
            )}
          </div>

          <div className="lookup-panel">
            <div>
              <div className="title-row">
                <strong>Dataset de lookup</strong>
                <HelpButton title="Dataset de lookup">
                  Dataset auxiliar usado em joins para enriquecer o dataset principal, por exemplo adicionando SLA a partir da prioridade.
                </HelpButton>
              </div>
              <span>{lookupName} / {lookupRows.length} linhas / {lookupColumns.length} colunas</span>
            </div>
            <label>
              Usar data asset
              <select onChange={(event) => loadLookupAsset(event.target.value)} value={lookupAssetId}>
                <option value="">Selecione um asset</option>
                {dataAssets.filter((asset) => asset.id !== selectedDataAssetId).map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="step-list">
            {steps.length === 0 ? (
              <div className="empty-state">Nenhuma etapa adicionada. Use a receita para transformar o dataset.</div>
            ) : (
              steps.map((step, index) => (
                <div key={step.id}>
                  <span>{index + 1}</span>
                  <strong>{describeStep(step)}</strong>
                  <button onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} type="button">
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>
          {recipeImpact ? <p className="recipe-impact">Impacto calculado no arquivo completo: {recipeImpact}.</p> : null}
        </section>

        <section className="subpanel" hidden={activeDataSection !== "analysis"}>
          <div className="panel-header compact-header">
            <div>
              <span className="eyebrow">Analise avancada</span>
              <div className="title-row">
                <h3>Perfil, visualizacoes e riscos</h3>
                <HelpButton title="Analise avancada">
                  Consolida graficos, qualidade, risco de leakage, sensibilidade e amostras para decidir se o dataset esta pronto para modelagem.
                </HelpButton>
              </div>
            </div>
            <button className="button secondary" onClick={() => onOpenVisualization(selectedDataAssetId || requestedAssetId || dataAssets[0]?.id || "")} type="button">
              <Maximize2 size={16} />
              Abrir visualizacao completa
            </button>
          </div>
          <div className="analysis-controls">
            <label>
              Alvo
              <select value={targetColumn} onChange={(event) => setTargetColumn(event.target.value)}>
                {(targetOptions.length ? targetOptions : activeColumns).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Coluna sensivel
              <select value={sensitiveColumn} onChange={(event) => setSensitiveColumn(event.target.value)}>
                {(sensitiveOptions.length ? sensitiveOptions : activeColumns).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <button className="button secondary swap-analysis-button" disabled={!targetColumn || !sensitiveColumn} onClick={swapSelectedAnalysisColumns} type="button">
              Trocar ordem
            </button>
          </div>
          <div className="analysis-grid">
            <div className="analysis-card">
              <div className="card-title">
                <strong>Histogramas</strong>
                <HelpButton title="Histogramas">
                  Mostram a distribuicao das colunas numericas do dataset refinado. Use para encontrar concentracao, assimetria, lacunas e possiveis outliers.
                </HelpButton>
              </div>
              {analysisReport.histograms.slice(0, 2).map((histogram) => (
                <div className="mini-chart" key={histogram.column}>
                  <em>{histogram.column}</em>
                  <div className="histogram-bars">
                    {histogram.bins.map((bin) => (
                      <span key={bin.label} title={`${bin.label}: ${bin.count}`}>
                        <i style={{ height: `${Math.max(8, bin.count * 18)}px` }} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!analysisReport.histograms.length ? <span>Nenhuma coluna numerica no dataset refinado. Carregue colunas numericas para ver distribuicoes.</span> : null}
              <span className="chart-legend">Panorama global. Eixo X: faixas de valor. Eixo Y: quantidade de linhas por faixa.</span>
            </div>
            <div className="analysis-card">
              <div className="card-title">
                <strong>Boxplots</strong>
                <HelpButton title="Boxplots">
                  Resumem minimo, mediana e maximo das colunas numericas do dataset refinado. Use para comparar escala e detectar extremos rapidamente.
                </HelpButton>
              </div>
              {analysisReport.boxplots.slice(0, 3).map((boxplot) => (
                <div className="boxplot-row" key={boxplot.column}>
                  <em>{boxplot.column}</em>
                  <span>
                    <i style={{ left: "10%", width: "68%" }} />
                    <b style={{ left: "45%" }} />
                  </span>
                  <small>{boxplot.min} / {boxplot.median} / {boxplot.max}</small>
                </div>
              ))}
              {!analysisReport.boxplots.length ? <span>Nenhuma coluna numerica no dataset refinado.</span> : null}
              <span className="chart-legend">Panorama global. Linha clara: faixa de valores. Barra azul: intervalo central. Marcador preto: mediana.</span>
            </div>
            <div className="analysis-card heatmap-card">
              <div className="card-title">
                <strong>Correlation heatmap</strong>
                <HelpButton title="Correlation heatmap">
                  Mostra correlacao entre todas as colunas numericas do dataset refinado.
                </HelpButton>
              </div>
              {activeDataSection === "analysis" && globalHeatmapColumns.length ? (
                <div className="heatmap-matrix" style={{ gridTemplateColumns: `112px repeat(${globalHeatmapColumns.length}, minmax(72px, 1fr))` }}>
                  <span className="axis-label" />
                  {globalHeatmapColumns.map((column) => <span className="axis-label" key={`x-${column}`} title={column}>{compactLabel(column)}</span>)}
                  {globalHeatmapColumns.map((row) => (
                    <Fragment key={`row-${row}`}>
                      <span className="axis-label row-label" key={`y-${row}`} title={row}>{compactLabel(row)}</span>
                      {globalHeatmapColumns.map((column) => {
                        const value = Math.abs(matrixValue(analysisReport.correlationMatrix, row, column));
                        return (
                          <button
                            className="heat-cell"
                            key={`${row}-${column}`}
                            onClick={() => selectHeatmapColumns(row, column)}
                            style={{ opacity: Math.max(0.25, value) }}
                            title={`${row} x ${column}: ${value}. Clique para selecionar alvo=${row} e sensivel=${column}.`}
                            type="button"
                          >
                            {value.toFixed(2)}
                          </button>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              ) : <span>Sem colunas numericas suficientes para matriz global.</span>}
              {globalHeatmapColumns.length === 1 ? <span className="chart-legend">Apenas uma coluna numerica foi encontrada; o heatmap mostra somente auto-correlacao.</span> : null}
              <span className="chart-legend">Panorama global das colunas numericas. Diagonal: auto-correlacao. Cores mais fortes indicam relacao maior.</span>
            </div>
            <div className="analysis-card">
              <div className="card-title">
                <strong>Missingness map</strong>
                <HelpButton title="Missingness map">
                  Lista linhas com valores ausentes em qualquer coluna do dataset refinado. Use para decidir imputacao, remocao ou investigacao de origem.
                </HelpButton>
              </div>
              {analysisReport.missingnessMap.slice(0, 4).map((item) => (
                <span key={item.rowIndex}>Linha {item.rowIndex + 1}: {item.missingColumns.join(", ")}</span>
              ))}
              {!analysisReport.missingnessMap.length ? <span>Sem nulos no dataset refinado.</span> : null}
            </div>
            <div className="analysis-card">
              <div className="card-title">
                <strong>Distribution comparison</strong>
                <HelpButton title="Comparacao de distribuicao">
                  Compara as colunas compativeis do dataset atual contra o baseline. Distancia perto de 0 indica pouca mudanca; valores maiores indicam drift.
                </HelpButton>
              </div>
              {analysisReport.distributionComparison.slice(0, 4).map((item) => (
                <span key={item.column}>{item.column}: {item.baselineTop} para {item.currentTop} / {item.distance}</span>
              ))}
              {!analysisReport.distributionComparison.length ? <span>Carregue um baseline com colunas compativeis.</span> : null}
            </div>
            <div className="analysis-card">
              <div className="card-title">
                <strong>Target leakage report</strong>
                <HelpButton title="Target leakage">
                  Procura colunas que podem entregar a resposta ao modelo, como proxies do alvo, identificadores ou informacoes posteriores ao evento.
                </HelpButton>
              </div>
              <span className="chart-legend">Alvo: {targetColumn}. Varredura: todas as colunas refinadas, exceto o alvo.</span>
              {analysisReport.leakageReport.slice(0, 4).map((item) => (
                <span key={item.column}>{item.column}: risco {item.risk} / {item.reason}</span>
              ))}
              {!analysisReport.leakageReport.length ? <span>Nenhum risco forte detectado.</span> : null}
            </div>
            <div className="analysis-card">
              <div className="card-title">
                <strong>Bias/sensibilidade</strong>
                <HelpButton title="Bias e sensibilidade">
                  Divide o dataset pela coluna sensivel e compara a taxa ou media do alvo. Use para achar grupos com comportamento desigual.
                </HelpButton>
              </div>
              {analysisReport.biasReport.slice(0, 4).map((item) => (
                <span key={`${item.column}-${item.group}`}>{item.group}: {item.count} linhas{item.targetRate !== undefined ? ` / ${targetMetricLabel} ${item.targetRate}` : ""}</span>
              ))}
            </div>
            <div className="analysis-card">
              <div className="card-title">
                <strong>Splits e amostras</strong>
                <HelpButton title="Splits e amostras">
                  Mostra a divisao simulada entre treino, validacao e teste, alem de amostras de cabeca, cauda e sorteio para inspecao rapida.
                </HelpButton>
              </div>
              <div className="split-bars">
                {analysisReport.splitSummary.map((item) => (
                  <span key={item.split}><i style={{ width: `${Math.max(8, item.count * 16)}px` }} />{item.split}: {item.count}</span>
                ))}
              </div>
              <span className="chart-legend">Barra verde: quantidade de linhas em cada particao.</span>
              <span>{analysisReport.sampleSummary.map((item) => `${item.strategy}: ${item.count}`).join(" / ")}</span>
            </div>
          </div>
        </section>

        <section className="subpanel" hidden={activeDataSection !== "analysis"}>
          <div className="panel-header compact-header">
            <div>
              <span className="eyebrow">Drift</span>
              <div className="title-row">
                <h3>Comparacao entre versoes</h3>
                <HelpButton title="Comparacao entre versoes">
                  Compara o dataset refinado com um baseline para detectar mudancas de schema, distribuicao numerica e distribuicao categorica.
                </HelpButton>
              </div>
            </div>
            <label>
              Baseline do workspace
              <select onChange={(event) => loadBaselineAsset(event.target.value)} value={baselineAssetId}>
                <option value="">Selecione um asset</option>
                {dataAssets.filter((asset) => asset.id !== selectedDataAssetId).map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="drift-summary">
            <article>
              <strong>{driftReport.driftScore}</strong>
              <span>{driftReport.hasDrift ? "drift detectado" : "sem drift relevante"}</span>
            </article>
            <article>
              <strong>{baselineName}</strong>
              <span>{driftReport.baselineRows} baseline / {driftReport.currentRows} atual / {driftReport.rowDeltaPct}% linhas</span>
            </article>
          </div>

          <div className="drift-grid">
            <div>
              <div className="card-title">
                <strong>Schema drift</strong>
                <HelpButton title="Schema drift">
                  Mostra colunas adicionadas, removidas ou com tipo alterado entre baseline e dataset atual.
                </HelpButton>
              </div>
              <span>Adicionadas: {driftReport.addedColumns.join(", ") || "nenhuma"}</span>
              <span>Removidas: {driftReport.removedColumns.join(", ") || "nenhuma"}</span>
              <span>Tipos: {driftReport.typeChanges.map((item) => `${item.column} ${item.from}->${item.to}`).join(", ") || "sem mudancas"}</span>
            </div>
            <div>
              <div className="card-title">
                <strong>Numeric drift</strong>
                <HelpButton title="Numeric drift">
                  Compara medias de colunas numericas compartilhadas. Grandes percentuais indicam mudanca relevante nos dados.
                </HelpButton>
              </div>
              {driftReport.numericDrift.length ? (
                driftReport.numericDrift.slice(0, 4).map((item) => (
                  <span key={item.column}>{item.column}: {item.baselineMean} para {item.currentMean} ({item.deltaPct}%)</span>
                ))
              ) : (
                <span>Sem variacao numerica relevante.</span>
              )}
            </div>
            <div>
              <div className="card-title">
                <strong>Categorical drift</strong>
                <HelpButton title="Categorical drift">
                  Compara a frequencia das categorias. Distancia maior indica que a composicao dos grupos mudou.
                </HelpButton>
              </div>
              {driftReport.categoricalDrift.length ? (
                driftReport.categoricalDrift.slice(0, 4).map((item) => (
                  <span key={item.column}>{item.column}: {item.topBaseline} para {item.topCurrent} / distancia {item.distance}</span>
                ))
              ) : (
                <span>Sem mudanca categorica relevante.</span>
              )}
            </div>
          </div>
        </section>

        <section className="subpanel" hidden={activeDataSection !== "quality"}>
          <div className="panel-header compact-header">
            <div>
              <span className="eyebrow">Validacao declarativa</span>
              <div className="title-row">
                <h3>Regras de qualidade</h3>
                <HelpButton title="Regras de qualidade">
                  Define checks sem codigo para bloquear valores invalidos, tipos errados, duplicatas, ranges fora do esperado e regras entre colunas.
                </HelpButton>
              </div>
            </div>
            <button className="button primary" disabled={!validationCanAdd} onClick={addValidationRule} type="button">
              <Plus size={16} />
              Adicionar regra
            </button>
          </div>

          <div className="validation-builder">
            <div className="validation-builder-main">
              <label>
                Coluna
                <select value={validationColumn} onChange={(event) => setValidationColumn(event.target.value)}>
                  {activeColumns.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Severidade
                <select value={validationSeverity} onChange={(event) => setValidationSeverity(event.target.value)}>
                  <option value="error">Erro: bloquear</option>
                  <option value="warning">Aviso: revisar</option>
                  <option value="info">Info: monitorar</option>
                </select>
              </label>
            </div>

            <div className="validation-type-picker" aria-label="Tipo de regra">
              {validationTypeOptions.map((item) => {
                const isValidForColumn = validValidationTypes.includes(item.value);
                return (
                  <button
                    aria-pressed={validationType === item.value}
                    className={[validationType === item.value ? "active" : "", !isValidForColumn ? "disabled" : ""].filter(Boolean).join(" ")}
                    disabled={!isValidForColumn}
                    key={item.value}
                    onClick={() => setValidationType(item.value)}
                    title={isValidForColumn ? item.detail : invalidValidationReason(selectedValidationColumnKind, item.value)}
                    type="button"
                  >
                    <strong>{item.label}</strong>
                    <span>{isValidForColumn ? item.detail : invalidValidationReason(selectedValidationColumnKind, item.value)}</span>
                  </button>
                );
              })}
            </div>

            <div className="validation-specific-panel">
              <div>
                <span className="eyebrow">Configuracao</span>
                <strong>{selectedValidationType.label}</strong>
                <p>{validationTypeHelp[validationType]}</p>
                <small>Tipo inferido da coluna: {selectedValidationColumnKind}</small>
              </div>

              {validationType === "required" || validationType === "unique" ? (
                <div className="validation-no-options">
                  Esta regra nao precisa de campos extras. Basta escolher coluna e severidade.
                </div>
              ) : null}

              {validationType === "type" ? (
                <label>
                  Tipo esperado
                  <select value={validationExpectedType} onChange={(event) => setValidationExpectedType(event.target.value)}>
                    <option value="number">Numero</option>
                    <option value="text">Texto</option>
                    <option value="boolean">Booleano</option>
                    <option value="date">Data</option>
                  </select>
                </label>
              ) : null}

              {validationType === "range" ? (
                <div className="validation-inline-fields">
                  <label>
                    Minimo
                    <input onChange={(event) => setValidationMin(event.target.value)} type="number" value={validationMin} />
                  </label>
                  <label>
                    Maximo
                    <input onChange={(event) => setValidationMax(event.target.value)} type="number" value={validationMax} />
                  </label>
                </div>
              ) : null}

              {validationType === "domain" ? (
                <label>
                  Valores permitidos
                  <input onChange={(event) => setValidationDomain(event.target.value)} placeholder="high, medium, low" value={validationDomain} />
                </label>
              ) : null}

              {validationType === "regex" ? (
                <label>
                  Padrao regex
                  <input onChange={(event) => setValidationPattern(event.target.value)} placeholder="^[A-Z0-9]+$" value={validationPattern} />
                </label>
              ) : null}

              {validationType === "cross-column" ? (
                <div className="validation-inline-fields three">
                  <label>
                    Coluna esquerda
                    <select value={validationColumn} onChange={(event) => setValidationColumn(event.target.value)}>
                      {activeColumns.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Operador
                    <select value={validationOperator} onChange={(event) => setValidationOperator(event.target.value)}>
                      <option value="<=">&lt;=</option>
                      <option value="<">&lt;</option>
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="==">==</option>
                      <option value="!=">!=</option>
                    </select>
                  </label>
                  <label>
                    Coluna direita
                    <select value={validationRightColumn} onChange={(event) => setValidationRightColumn(event.target.value)}>
                      {activeColumns.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {validationType === "custom" ? (
                <label>
                  Expressao segura
                  <input onChange={(event) => setValidationExpression(event.target.value)} placeholder="score_valid" value={validationExpression} />
                </label>
              ) : null}
            </div>
          </div>

          <div className="validation-draft">
            <span>Regra pronta</span>
            <strong>
              {validationType === "required"
                ? `${validationColumn || activeColumns[0]} obrigatorio`
                : validationType === "unique"
                  ? `${validationColumn || activeColumns[0]} sem duplicatas`
                  : validationType === "range"
                    ? `${validationColumn || activeColumns[0]} entre ${validationMin || "-inf"} e ${validationMax || "+inf"}`
                    : validationType === "domain"
                      ? `${validationColumn || activeColumns[0]} em ${normalizedValidationDomain.join(", ") || "valores permitidos"}`
                      : validationType === "regex"
                        ? `${validationColumn || activeColumns[0]} segue /${validationPattern || "padrao"}/`
                        : validationType === "type"
                          ? `${validationColumn || activeColumns[0]} deve ser ${validationExpectedType}`
                          : validationType === "cross-column"
                            ? `${validationColumn || activeColumns[0]} ${validationOperator} ${validationRightColumn || "coluna direita"}`
                            : `expressao: ${validationExpression || "retorna 1"}`}
            </strong>
            <em>{validationCanAdd ? "Pode adicionar esta regra." : "Complete os campos obrigatorios para adicionar."}</em>
          </div>

          <div className="validation-summary">
            <article>
              <strong>{validationReport.passed ? "Passou" : "Falhou"}</strong>
              <span>{validationReport.issueCount} violacoes / {validationReport.totalRules} regras</span>
            </article>
            <article>
              <strong>{validationReport.checkedRows}</strong>
              <span>linhas verificadas</span>
            </article>
          </div>

          <div className="validation-rule-list">
            {validationRules.map((rule) => {
              const summary = validationReport.ruleSummaries.find((item) => item.ruleId === rule.id);
              return (
                <div key={rule.id}>
                  <strong>{describeValidationRule(rule)}</strong>
                  <span>{summary?.issueCount ?? 0} violacoes / {rule.severity ?? "error"}</span>
                  <button onClick={() => setValidationRules((current) => current.filter((item) => item.id !== rule.id))} type="button">
                    Remover
                  </button>
                </div>
              );
            })}
          </div>

          <div className="validation-issues">
            {validationReport.issues.slice(0, 6).map((issue) => (
              <div key={`${issue.ruleId}-${issue.rowIndex}-${issue.column}`}>
                <strong>Linha {issue.rowIndex + 1}</strong>
                <span>{issue.severity}: {issue.message}: {String(issue.value ?? "nulo")}</span>
              </div>
            ))}
            {validationReport.issues.length === 0 ? <div className="empty-state">Nenhuma violacao encontrada no dataset refinado.</div> : null}
          </div>
          <details className="technical-export">
            <summary>Export tecnico</summary>
            <textarea className="report-export" readOnly value={validationExport} />
          </details>
        </section>

        <section className="subpanel" hidden={activeDataSection !== "result"}>
          <div className="panel-header compact-header">
            <div>
              <span className="eyebrow">Preview</span>
              <div className="title-row">
                <h3>Resultado refinado</h3>
                <HelpButton title="Resultado refinado">
                  Mostra as primeiras linhas depois da receita aplicada. Use para conferir se as transformacoes produziram o dataset esperado.
                </HelpButton>
              </div>
            </div>
            <div className="result-actions">
              {fullExecutionRunning ? (
                <button className="button secondary" onClick={() => fullExecutionControllerRef.current?.abort()} type="button">
                  Cancelar
                </button>
              ) : null}
              <button
                className="button primary"
                disabled={fullExecutionRunning || fullExecutionBlocked}
                onClick={executeRefineryJob}
                title={
                  !sourceFile
                    ? "Executar na amostra carregada"
                    : !fullProfile
                      ? "Aguarde o perfil completo"
                      : unsupportedFullExecutionSteps.length
                        ? "A receita possui operacoes ainda incompatíveis com arquivo inteiro"
                        : "Executar a receita no arquivo completo"
                }
                type="button"
              >
                <Play size={16} />
                {sourceFile ? "Executar no arquivo inteiro" : "Executar na amostra"}
              </button>
            </div>
          </div>
          <div className="full-execution-panel" aria-live="polite">
            <div>
              <strong>{sourceFile ? "Job completo em chunks" : "Job em amostra"}</strong>
              <span>{fullExecutionMessage}</span>
              {unsupportedFullExecutionSteps.length && sourceFile ? (
                <em>Operacoes bloqueando execucao completa: {unsupportedFullExecutionSteps.map(describeStep).join("; ")}</em>
              ) : null}
            </div>
            {fullExecutionProgress ? (
              <div className="full-execution-progress">
                <div className="upload-progress-bar">
                  <i style={{ width: `${fullExecutionProgress.percent}%` }} />
                </div>
                <span>
                  {fullExecutionProgress.percent}% / {fullExecutionProgress.inputRows.toLocaleString("pt-BR")} lidas / {fullExecutionProgress.outputRows.toLocaleString("pt-BR")} gravadas
                </span>
              </div>
            ) : null}
            {refinedDownloadUrl ? (
              <a className="button secondary" download={refinedDownloadName} href={refinedDownloadUrl}>
                Baixar CSV refinado
              </a>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {uniqueColumns(previewRows).map((item) => (
                    <th key={item}>{item}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={index}>
                    {uniqueColumns(previewRows).map((item) => (
                      <td key={item}>{String(row[item] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="data-side">
        <section className="panel" hidden={activeDataSection !== "quality"}>
          <div className="panel-header">
            <div>
              <span className="eyebrow">Perfil</span>
              <div className="title-row">
                <h2>Schema inferido</h2>
                <HelpButton title="Schema inferido">
                  Resume cada coluna depois das transformacoes: tipo detectado, nulos, valores unicos, estatisticas e categorias mais frequentes.
                </HelpButton>
              </div>
            </div>
            <Database size={18} />
          </div>
          <div className="column-browser-toolbar">
            <input
              aria-label="Buscar coluna no perfil"
              onChange={(event) => setProfileQuery(event.target.value)}
              placeholder="Buscar coluna..."
              value={profileQuery}
            />
            <button className="button secondary" onClick={() => setShowAllProfileColumns((current) => !current)} type="button">
              {showAllProfileColumns ? "Mostrar 20" : `Mostrar todas (${visibleProfile.columns})`}
            </button>
          </div>
          {profilePending ? <div className="empty-state">Perfil completo carregando no backend. O preview da tabela continua apenas visual.</div> : <div className="schema-list">
            {filteredProfileColumns.map((item) => (
              <div key={item.name}>
                <strong>{item.name}</strong>
                <span>{item.kind} / {item.missing.toLocaleString("pt-BR")} nulos / {item.uniqueCapped ? ">= " : ""}{item.unique.toLocaleString("pt-BR")} unicos</span>
                {item.mean !== undefined ? <em>media {item.mean} / mediana {item.median} / q1 {item.q1} / q3 {item.q3}</em> : null}
                {item.frequencies.length ? (
                  <em>top: {item.frequencies.map((frequency) => `${frequency.value} (${frequency.count})`).join(", ")}</em>
                ) : null}
              </div>
            ))}
          </div>}
        </section>

        <section className="panel" hidden={activeDataSection !== "quality"}>
          <div className="panel-header">
            <div>
              <span className="eyebrow">Visualizacoes</span>
              <div className="title-row">
                <h2>Qualidade e distribuicao</h2>
                <HelpButton title="Qualidade e distribuicao">
                  Painel rapido para entender completude, frequencias, tendencia, dispersao e associacao das colunas selecionadas.
                </HelpButton>
              </div>
            </div>
            <BarChart3 size={18} />
          </div>
          {profilePending ? <div className="empty-state">Calculando completude por coluna no backend sobre todas as linhas do dataset.</div> : <div className="quality-bars">
            <span className="chart-legend">
              Completude por coluna no {steps.length ? "dataset refinado" : fullProfile ? "arquivo completo" : "preview"}: azul indica percentual de celulas preenchidas.
            </span>
            {filteredProfileColumns.map((item) => {
              const completeness = visibleProfile.rows ? Math.round(((visibleProfile.rows - item.missing) / visibleProfile.rows) * 100) : 0;
              return (
                <div key={item.name}>
                  <span>{item.name}</span>
                  <div>
                    <i style={{ width: `${completeness}%` }} />
                  </div>
                  <em>{completeness}% completo</em>
                </div>
              );
            })}
          </div>}
          {false ? <div className="chart-stack">
            <div>
              <div className="card-title">
                <strong>Barras</strong>
                <HelpButton title="Grafico de barras">
                  Conta os valores mais frequentes da coluna selecionada quando ela e categorica. Use para enxergar concentracao de grupos.
                </HelpButton>
              </div>
              <span className="chart-legend">
                {barChartColumn ? `Coluna: ${barChartColumn}. Comprimento da barra: contagem relativa ao maior grupo.` : "Nenhuma coluna selecionada e categorica."}
              </span>
              {sideBars.map((bar) => (
                <span key={bar.value}><i style={{ width: `${Math.max(8, (bar.count / barMaxCount) * 100)}%` }} />{bar.value}: {bar.count}</span>
              ))}
              {!sideBars.length ? <span>sem coluna categorica</span> : null}
            </div>
            <div>
              <div className="card-title">
                <strong>Linha</strong>
                <HelpButton title="Grafico de linha">
                  Mostra a coluna selecionada quando ela e numerica, seguindo a ordem das linhas. Use para perceber tendencia, salto ou valores fora do padrao.
                </HelpButton>
              </div>
              <span className="chart-legend">
                {lineChartColumn ? `X: ordem das linhas. Y: ${lineChartColumn}. Escala: ${lineMin} a ${lineMax}.` : "Nenhuma coluna selecionada e numerica."}
              </span>
              <div className="sparkline">
                {linePoints.map((point) => (
                  <i key={point.index} style={{ height: `${Math.max(6, scaleToPercent(point.value, lineMin, lineMax) * 0.54)}px` }} title={`linha ${point.index + 1}: ${point.value}`} />
                ))}
              </div>
              {!linePoints.length ? <span>sem serie numerica</span> : null}
            </div>
            <div>
              <div className="card-title">
                <strong>Scatter</strong>
                <HelpButton title="Scatter plot">
                  Posiciona pontos usando Alvo e Coluna sensivel. Colunas categoricas viram faixas discretas para mostrar grupos sem perder a selecao atual.
                </HelpButton>
              </div>
              <span className="chart-legend">
                X: {scatterXColumn} ({selectedScatterData.xKind === "number" ? `${scatterXMin} a ${scatterXMax}` : "categorias"}). Y: {scatterYColumn} ({selectedScatterData.yKind === "number" ? `${scatterYMin} a ${scatterYMax}` : "categorias"}).
              </span>
              <div className="scatter-mini">
                <span className="axis-hint x-axis">{scatterXColumn}</span>
                <span className="axis-hint y-axis">{scatterYColumn}</span>
                {scatterPoints.map((point, index) => (
                  <i
                    key={`${point.x}-${point.y}-${index}`}
                    style={{
                      left: `${scaleToPercent(point.x, scatterXMin, scatterXMax)}%`,
                      top: `${100 - scaleToPercent(point.y, scatterYMin, scatterYMax)}%`
                    }}
                    title={`${scatterXColumn}: ${point.xLabel} / ${scatterYColumn}: ${point.yLabel}`}
                  />
                ))}
              </div>
              {selectedScatterData.xCategories.length ? <span className="chart-legend">X categorias: {selectedScatterData.xCategories.slice(0, 5).join(", ")}</span> : null}
              {selectedScatterData.yCategories.length ? <span className="chart-legend">Y categorias: {selectedScatterData.yCategories.slice(0, 5).join(", ")}</span> : null}
              {!scatterPoints.length ? <span>sem pares validos entre as colunas selecionadas</span> : null}
            </div>
            <div>
              <div className="card-title">
                <strong>Heatmap</strong>
                <HelpButton title="Heatmap lateral">
                  Mostra a matriz global de correlacao entre colunas numericas, em formato compacto e com scroll.
                </HelpButton>
              </div>
              <span className="chart-legend">Escala 0-1 de correlacao. Todas as colunas numericas do dataset refinado.</span>
              {globalHeatmapColumns.length ? (
                <div className="heatmap-matrix compact" style={{ gridTemplateColumns: `88px repeat(${globalHeatmapColumns.length}, minmax(58px, 1fr))` }}>
                  <span className="axis-label" />
                  {globalHeatmapColumns.map((column) => <span className="axis-label" key={`sx-${column}`} title={column}>{compactLabel(column)}</span>)}
                  {globalHeatmapColumns.map((row) => (
                    <Fragment key={`side-row-${row}`}>
                      <span className="axis-label row-label" title={row}>{compactLabel(row)}</span>
                      {globalHeatmapColumns.map((column) => {
                        const value = Math.abs(matrixValue(analysisReport.correlationMatrix, row, column));
                        return (
                          <button
                            className="heat-cell"
                            key={`side-${row}-${column}`}
                            onClick={() => selectHeatmapColumns(row, column)}
                            style={{ opacity: Math.max(0.25, value) }}
                            title={`${row}/${column}: ${value}. Clique para selecionar alvo=${row} e sensivel=${column}.`}
                            type="button"
                          >
                            {value.toFixed(1)}
                          </button>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              ) : <span>sem correlacao</span>}
            </div>
          </div> : null}
          <div className="advanced-report-grid">
            <span><GitCompare size={14} /> Drift report executavel</span>
            <span><Layers size={14} /> Missingness map executavel</span>
            <span><CheckCircle2 size={14} /> Leakage report executavel</span>
          </div>
        </section>

        <section className="panel" hidden={activeDataSection !== "prepare"}>
          <div className="panel-header">
            <div>
              <span className="eyebrow">Conectores</span>
              <div className="title-row">
                <h2>Fontes de dados</h2>
                <HelpButton title="Fontes de dados">
                  Area para simular conexoes externas e preparar credenciais locais. No MVP atual, arquivos locais sao reais e conectores externos sao mockados.
                </HelpButton>
              </div>
            </div>
            <Plug size={18} />
          </div>
          <div className="connector-list">
            {connectorMocks.map((connector) => (
              <button
                key={connector.name}
                onClick={() =>
                  setConnectorMessage(
                    `${connector.name}: teste simulado com ${connectorHost || "host vazio"} usando credencial ${connectorUser || "sem usuario"}.`
                  )
                }
                type="button"
              >
                <strong>{connector.name}</strong>
                <span>{connector.status}</span>
                <em>{connector.detail}</em>
              </button>
            ))}
          </div>
          <div className="credential-grid">
            <label>
              Host/URI
              <input onChange={(event) => setConnectorHost(event.target.value)} value={connectorHost} />
            </label>
            <label>
              Usuario/ID
              <input onChange={(event) => setConnectorUser(event.target.value)} value={connectorUser} />
            </label>
            <label>
              Segredo
              <input
                onChange={(event) => setConnectorSecret(event.target.value)}
                placeholder="mascarado localmente"
                type="password"
                value={connectorSecret}
              />
            </label>
          </div>
          <p className="connector-message">{connectorMessage}</p>
        </section>
      </aside>
    </section>
  );
}
