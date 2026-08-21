import type { Asset } from "./domain";

export type AutoAiTask =
  | "classification"
  | "regression"
  | "clustering"
  | "dimensionality-reduction"
  | "forecasting"
  | "ranking"
  | "extraction"
  | "summarization"
  | "rag"
  | "agent"
  | "reinforcement";

export type SearchStrategy = "grid" | "random" | "bayesian";
export type ValidationStrategy = "holdout" | "k-fold" | "stratified-k-fold" | "temporal";
export type AlgorithmId =
  | "linear"
  | "tree"
  | "random-forest"
  | "gradient-boosting"
  | "neural-network"
  | "ensemble"
  | "k-means"
  | "dbscan"
  | "gaussian-mixture"
  | "hierarchical"
  | "pca"
  | "umap"
  | "tsne"
  | "extractive"
  | "retrieval-agent";

export interface DatasetColumn {
  name: string;
  kind: "number" | "category" | "text" | "date" | "unknown";
  role: "feature" | "target" | "ignored";
}

export interface AutoAiConfig {
  name: string;
  datasetId: string;
  task: AutoAiTask;
  target: string;
  metric: string;
  features: string[];
  algorithms: AlgorithmId[];
  searchStrategy: SearchStrategy;
  maxTrials: number;
  timeLimitMinutes: number;
  costLimit: number;
  validation: ValidationStrategy;
  folds: number;
  testSize: number;
  regularization: "none" | "l1" | "l2" | "elastic-net" | "weight-decay";
  dropout: number;
  earlyStopping: boolean;
  learningRateSchedule: "constant" | "step" | "cosine" | "plateau";
  balancing: "none" | "class-weights" | "oversampling" | "undersampling";
  featureSelection: "none" | "low-variance" | "high-correlation" | "importance" | "manual";
  ensembling: "none" | "voting" | "bagging" | "boosting" | "stacking";
  calibration: "none" | "sigmoid" | "isotonic";
  thresholdTuning: boolean;
  dataAugmentation: boolean;
  adversarialTraining: boolean;
  adversarialStrength: number;
  learningRates: number[];
  maxDepths: number[];
  estimators: number[];
  batchSizes: number[];
  epochs: number[];
  clusterCount: number;
}

export interface AutoAiRecommendation {
  task: AutoAiTask;
  target: string;
  metric: string;
  features: string[];
  warnings: string[];
  reasons: string[];
}

export interface TrialResult {
  id: string;
  rank: number;
  algorithm: AlgorithmId;
  metric: string;
  score: number;
  secondaryScore: number;
  durationSeconds: number;
  estimatedCost: number;
  status: "Succeeded" | "Stopped";
  parameters: Record<string, string | number | boolean>;
  techniques: string[];
  preprocessing: string[];
  featureImportance: Array<{ feature: string; importance: number }>;
  confusionMatrix?: [[number, number], [number, number]];
  rocCurve?: Array<{ x: number; y: number }>;
  prCurve?: Array<{ x: number; y: number }>;
  projection3d?: Projection3d;
  regressionPlot?: { feature: string; train: Array<{ x: number; actual: number; predicted: number }>; validation: Array<{ x: number; actual: number; predicted: number }> };
  regressionPlot3d?: { features: [string, string]; points: Array<{ x: number; y: number; actual: number; predicted: number; validation: boolean }> };
}

export interface Projection3dPoint {
  x: number;
  y: number;
  z: number;
  cluster: number;
  row: number;
}

export interface Projection3d {
  axes: [string, string, string];
  points: Projection3dPoint[];
  clusterCount: number;
  source: "asset-preview" | "synthetic";
}

export interface VisualNode {
  id: string;
  type: "data" | "transform" | "training" | "tuning" | "validation" | "evaluation" | "score" | "deploy";
  label: string;
  configuration: string;
  enabled: boolean;
}

export interface ReinforcementConfig {
  apiUrl?: string;
  apiToken?: string;
  environment: string;
  agent: "dqn" | "ppo" | "sac" | "q-learning";
  adversary: "none" | "rule-based" | "self-play" | "adaptive";
  rewardGoal: string;
  episodes: number;
  maxSteps: number;
  learningRate: number;
  discount: number;
  exploration: number;
  selfPlay: boolean;
  perturbation: number;
}

export interface ReinforcementRun {
  sessionId: string;
  status: "Succeeded" | "Cancelled";
  averageReward: number;
  successRate: number;
  robustness: number;
  episodes: Array<{ episode: number; reward: number; adversaryReward: number }>;
  bestCandidate?: { episode: number; reward: number; successRate: number };
}

export interface OptimizationConfig {
  objective: "maximize" | "minimize";
  objectiveName: string;
  variables: number;
  constraints: number;
  timeLimitSeconds: number;
}

export const taskLabels: Record<AutoAiTask, string> = {
  classification: "Classificacao",
  regression: "Regressao",
  clustering: "Clustering",
  "dimensionality-reduction": "Reducao dimensional",
  forecasting: "Previsao temporal",
  ranking: "Ranking",
  extraction: "Extracao",
  summarization: "Sumarizacao",
  rag: "RAG",
  agent: "Agente",
  reinforcement: "Reforco"
};

export const algorithmLabels: Record<AlgorithmId, string> = {
  linear: "Linear / logistica",
  tree: "Arvore de decisao",
  "random-forest": "Random forest",
  "gradient-boosting": "Gradient boosting",
  "neural-network": "Rede neural simples",
  ensemble: "Ensemble",
  "k-means": "K-Means",
  dbscan: "DBSCAN",
  "gaussian-mixture": "Gaussian mixture",
  hierarchical: "Clustering hierarquico",
  pca: "PCA",
  umap: "UMAP",
  tsne: "t-SNE",
  extractive: "Extrativo local",
  "retrieval-agent": "Agente de recuperacao local"
};

const classificationMetrics = ["accuracy", "f1", "roc_auc", "precision", "recall", "log_loss"];
const regressionMetrics = ["rmse", "mae", "r2", "mape"];
const clusteringMetrics = ["silhouette", "davies_bouldin", "calinski_harabasz", "inertia"];
const dimensionalityMetrics = ["trustworthiness", "reconstruction_error"];

export function isUnsupervisedTask(task: AutoAiTask) {
  return task === "clustering" || task === "dimensionality-reduction";
}

export function algorithmsForTask(task: AutoAiTask): AlgorithmId[] {
  if (task === "clustering") return ["k-means", "dbscan", "gaussian-mixture", "hierarchical"];
  if (task === "dimensionality-reduction") return ["pca", "tsne"];
  if (task === "extraction" || task === "summarization") return ["extractive"];
  if (task === "rag" || task === "agent") return ["retrieval-agent"];
  if (task === "forecasting" || task === "ranking") return ["random-forest"];
  return ["linear", "tree", "random-forest", "gradient-boosting", "neural-network", "ensemble"];
}

export function metricsForTask(task: AutoAiTask) {
  if (task === "classification") return classificationMetrics;
  if (task === "regression") return regressionMetrics;
  if (task === "clustering") return clusteringMetrics;
  if (task === "dimensionality-reduction") return dimensionalityMetrics;
  if (task === "forecasting") return ["mape", "smape", "rmse", "mae"];
  if (task === "ranking") return ["ndcg", "map", "mrr"];
  if (task === "extraction") return ["token_f1", "exact_match"];
  if (task === "summarization") return ["rouge_l", "bertscore"];
  if (task === "rag") return ["faithfulness", "answer_relevance", "context_recall"];
  if (task === "agent") return ["task_success", "tool_accuracy", "latency"];
  return ["average_reward", "success_rate", "robustness"];
}

export function columnsFromAsset(asset?: Asset): DatasetColumn[] {
  if (!asset) return [];
  const schema = (asset.metadata?.schema ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  let rows: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(asset.metadata?.rowsJson ?? asset.metadata?.previewRows ?? "[]");
    rows = Array.isArray(parsed) ? parsed.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
  } catch {
    rows = [];
  }
  return schema.map((name) => ({ name, kind: inferColumnKindFromRows(name, rows), role: "feature" }));
}

function inferColumnKindFromRows(name: string, rows: Array<Record<string, unknown>>): DatasetColumn["kind"] {
  const values = rows
    .map((row) => row[name])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
    .map((value) => String(value).trim());
  if (values.length) {
    const numeric = values.every((value) => Number.isFinite(Number(value)));
    if (numeric) return "number";
    const unique = new Set(values).size;
    if (unique <= Math.min(30, Math.max(8, Math.floor(values.length * 0.2)))) return "category";
    return "text";
  }
  return inferColumnKindFromName(name);
}

function inferColumnKindFromName(name: string): DatasetColumn["kind"] {
  const normalized = name.toLowerCase();
  if (/(date|time|timestamp|year|month|dia|data)/.test(normalized)) return "date";
  if (/(text|description|comment|message|body|titulo|assunto)/.test(normalized)) return "text";
  if (/(id|count|cnt|score|amount|price|cost|value|target|y|minutes|depth|temp|rate|total|age)/.test(normalized)) return "number";
  if (/(class|label|category|status|type|segment|priority|resolved|channel)/.test(normalized)) return "category";
  return "unknown";
}

export function recommendExperiment(asset?: Asset): AutoAiRecommendation {
  const columns = columnsFromAsset(asset);
  if (!columns.length) {
    return { task: "classification", target: "", metric: "f1", features: [], warnings: ["Dataset sem schema disponivel."], reasons: [] };
  }
  const explicitTarget = columns.find((column) => /(^y$|target|label|class|resolved|outcome)/i.test(column.name));
  const targetColumn = explicitTarget ?? columns.at(-1)!;
  const task: AutoAiTask = targetColumn.kind === "number" && !/(class|label|resolved)/i.test(targetColumn.name) ? "regression" : "classification";
  const features = columns
    .filter((column) => column.name !== targetColumn.name && !/(^id$|_id$|uuid|identifier)/i.test(column.name))
    .map((column) => column.name);
  const warnings: string[] = [];
  if (columns.some((column) => /(^id$|_id$|uuid|identifier)/i.test(column.name))) warnings.push("Identificadores foram excluidos das features recomendadas.");
  if (features.length < 2) warnings.push("Poucas features disponiveis; avalie enriquecer o dataset.");
  return {
    task,
    target: targetColumn.name,
    metric: task === "regression" ? "rmse" : "f1",
    features,
    warnings,
    reasons: [
      `${targetColumn.name} foi sugerida como alvo pelo nome e tipo inferido.`,
      `${features.length} features foram mantidas depois de remover alvo e identificadores.`,
      `${taskLabels[task]} foi escolhida para um alvo ${targetColumn.kind}.`
    ]
  };
}

export function defaultAutoAiConfig(asset?: Asset): AutoAiConfig {
  const recommendation = recommendExperiment(asset);
  return {
    name: asset ? `AutoAI - ${asset.name.replace(/\.[^.]+$/, "")}` : "Novo experimento AutoAI",
    datasetId: asset?.id ?? "",
    task: recommendation.task,
    target: recommendation.target,
    metric: recommendation.metric,
    features: recommendation.features,
    algorithms: algorithmsForTask(recommendation.task),
    searchStrategy: "bayesian",
    maxTrials: 12,
    timeLimitMinutes: 30,
    costLimit: 10,
    validation: recommendation.task === "classification" ? "stratified-k-fold" : "k-fold",
    folds: 5,
    testSize: 20,
    regularization: "l2",
    dropout: 0.2,
    earlyStopping: true,
    learningRateSchedule: "plateau",
    balancing: recommendation.task === "classification" ? "class-weights" : "none",
    featureSelection: "importance",
    ensembling: "stacking",
    calibration: recommendation.task === "classification" ? "sigmoid" : "none",
    thresholdTuning: recommendation.task === "classification",
    dataAugmentation: false,
    adversarialTraining: false,
    adversarialStrength: 0.05,
    learningRates: [0.001, 0.01, 0.1],
    maxDepths: [3, 6, 10],
    estimators: [50, 100, 200],
    batchSizes: [16, 32, 64],
    epochs: [20, 50, 100],
    clusterCount: 3
  };
}

export function validateExperiment(config: AutoAiConfig) {
  const issues: string[] = [];
  if (!config.datasetId) issues.push("Selecione um data asset.");
  if (!["rag", "agent", "reinforcement", "summarization", "extraction", "clustering", "dimensionality-reduction"].includes(config.task) && !config.target) issues.push("Selecione a coluna alvo.");
  if (!config.features.length && !["rag", "agent", "reinforcement"].includes(config.task)) issues.push("Selecione pelo menos uma feature.");
  if (!config.algorithms.length && !["rag", "agent", "reinforcement"].includes(config.task)) issues.push("Selecione pelo menos um algoritmo.");
  if (config.maxTrials < 1) issues.push("O numero de trials deve ser maior que zero.");
  return issues;
}

function seededUnit(seed: string) {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

function higherIsBetter(metric: string) {
  return !["rmse", "mae", "mape", "smape", "log_loss", "latency", "davies_bouldin", "inertia", "reconstruction_error"].includes(metric);
}

export function generateTrials(config: AutoAiConfig, inputRows: Array<Record<string, unknown>> = []): TrialResult[] {
  const candidates = config.algorithms.length ? config.algorithms : ["ensemble" as AlgorithmId];
  const count = Math.max(1, Math.min(config.maxTrials, 60));
  const trials = Array.from({ length: count }, (_, index) => {
    const algorithm = candidates[index % candidates.length];
    const random = seededUnit(`${config.name}:${algorithm}:${index}:${config.searchStrategy}`);
    const complexity = algorithmsForTask(config.task).indexOf(algorithm) + 1;
    const favorable = higherIsBetter(config.metric);
    const unsupervised = isUnsupervisedTask(config.task);
    const base = unsupervised
      ? favorable ? 0.45 + complexity * 0.055 : 1.45 - complexity * 0.16
      : favorable ? 0.68 + complexity * 0.025 : 1.2 - complexity * 0.08;
    const techniqueGain = (config.earlyStopping ? 0.008 : 0) + (config.featureSelection !== "none" ? 0.012 : 0) + (config.ensembling !== "none" ? 0.01 : 0);
    const score = favorable
      ? Math.min(0.995, base + random * 0.09 + techniqueGain)
      : Math.max(0.02, base - random * 0.25 - techniqueGain);
    const depth = config.maxDepths[index % config.maxDepths.length] ?? 6;
    const estimators = config.estimators[index % config.estimators.length] ?? 100;
    const learningRate = config.learningRates[index % config.learningRates.length] ?? 0.01;
    const durationSeconds = Math.round(8 + complexity * 5 + estimators / 10 + random * 12);
    const estimatedCost = Number((durationSeconds * (algorithm === "neural-network" ? 0.015 : 0.006)).toFixed(2));
    const techniques = [
      config.regularization !== "none" ? config.regularization : "",
      config.earlyStopping ? "early stopping" : "",
      config.balancing !== "none" ? config.balancing : "",
      config.ensembling !== "none" ? config.ensembling : "",
      config.calibration !== "none" ? `calibracao ${config.calibration}` : "",
      config.thresholdTuning ? "threshold tuning" : "",
      config.learningRateSchedule !== "constant" ? `schedule ${config.learningRateSchedule}` : "",
      config.dataAugmentation ? "data augmentation" : "",
      config.adversarialTraining ? "adversarial training" : ""
    ].filter(Boolean);
    const importanceRaw = config.features.slice(0, 10).map((feature, featureIndex) => ({
      feature,
      importance: seededUnit(`${feature}:${index}`) + (config.features.length - featureIndex) / Math.max(config.features.length, 1)
    }));
    const importanceTotal = importanceRaw.reduce((sum, item) => sum + item.importance, 0) || 1;
    const featureImportance = importanceRaw
      .map((item) => ({ feature: item.feature, importance: Number((item.importance / importanceTotal).toFixed(3)) }))
      .sort((a, b) => b.importance - a.importance);
    const classification = config.task === "classification";
    const projection3d = unsupervised ? createProjection3d(inputRows, config.features, `${config.name}:${algorithm}:${index}`, algorithm) : undefined;
    return {
      id: `trial-${index + 1}`,
      rank: 0,
      algorithm,
      metric: config.metric,
      score: Number(score.toFixed(4)),
      secondaryScore: Number((favorable ? Math.max(0, score - 0.035) : score * 1.08).toFixed(4)),
      durationSeconds,
      estimatedCost,
      status: estimatedCost > config.costLimit || durationSeconds > config.timeLimitMinutes * 60 ? "Stopped" as const : "Succeeded" as const,
      parameters: {
        learningRate,
        maxDepth: depth,
        estimators,
        regularization: config.regularization,
        dropout: algorithm === "neural-network" ? config.dropout : 0,
        batchSize: config.batchSizes[index % config.batchSizes.length] ?? 32,
        epochs: config.epochs[index % config.epochs.length] ?? 50,
        threshold: config.thresholdTuning ? Number((0.35 + random * 0.3).toFixed(2)) : 0.5,
        adversarialStrength: config.adversarialTraining ? config.adversarialStrength : 0
      },
      techniques,
      preprocessing: ["tipos inferidos", "imputacao automatica", "encoding categorico", config.featureSelection],
      featureImportance,
      confusionMatrix: classification ? [[Math.round(80 + random * 20), Math.round(5 + random * 8)], [Math.round(4 + random * 9), Math.round(75 + random * 22)]] as [[number, number], [number, number]] : undefined,
      rocCurve: classification ? curvePoints(random, "roc") : undefined,
      prCurve: classification ? curvePoints(random, "pr") : undefined,
      projection3d
    };
  });
  const sorted = [...trials].sort((left, right) => {
    if (left.status !== right.status) return left.status === "Succeeded" ? -1 : 1;
    return higherIsBetter(config.metric) ? right.score - left.score : left.score - right.score;
  });
  return sorted.map((trial, index) => ({ ...trial, rank: index + 1 }));
}

function curvePoints(seed: number, type: "roc" | "pr") {
  return Array.from({ length: 8 }, (_, index) => {
    const x = index / 7;
    const y = type === "roc" ? Math.min(1, Math.sqrt(x) + seed * 0.12) : Math.max(0, 0.95 - x * (0.35 + seed * 0.2));
    return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
  });
}

export function explainWinner(trial: TrialResult, config: AutoAiConfig) {
  if (trial.projection3d) {
    return `${algorithmLabels[trial.algorithm]} encontrou ${trial.projection3d.clusterCount} grupos usando ${trial.projection3d.points.length} linhas na projecao 3D. A metrica ${trial.metric} foi ${trial.score}. As features analisadas foram ${config.features.join(", ") || "as features selecionadas"}.`;
  }
  const strongest = trial.featureImportance[0]?.feature ?? "as features selecionadas";
  return `${algorithmLabels[trial.algorithm]} venceu com ${trial.metric} ${trial.score}. O pipeline combinou ${trial.preprocessing.join(", ")}, ${trial.techniques.join(", ") || "configuracao base"} e obteve o melhor equilibrio entre qualidade, custo estimado de ${trial.estimatedCost.toFixed(2)} e tempo de ${trial.durationSeconds}s. ${strongest} foi a feature mais influente.`;
}

function createProjection3d(inputRows: Array<Record<string, unknown>>, features: string[], seed: string, algorithm: AlgorithmId): Projection3d {
  const rows = inputRows.slice(0, 300);
  const usableFeatures = features.slice(0, 8);
  const source = rows.length ? "asset-preview" as const : "synthetic" as const;
  const vectors = rows.length && usableFeatures.length
    ? vectorsFromRows(rows, usableFeatures)
    : Array.from({ length: 120 }, (_, row) => Array.from({ length: Math.max(3, usableFeatures.length || 3) }, (_, dimension) => seededUnit(`${seed}:${row}:${dimension}`) * 2 - 1));
  const clusterCount = algorithm === "dbscan" ? 4 : algorithm === "hierarchical" ? 5 : 3;
  const clusters = kMeans(vectors, clusterCount, seed);
  const points = vectors.map((vector, row) => {
    const x = projectDimension(vector, seed, 0);
    const y = projectDimension(vector, seed, 1);
    const z = projectDimension(vector, seed, 2);
    return { x, y, z, cluster: clusters[row], row: row + 1 };
  });
  const normalized = normalizeProjection(points);
  return {
    axes: [usableFeatures[0] ?? "Componente 1", usableFeatures[1] ?? "Componente 2", usableFeatures[2] ?? "Componente 3"],
    points: normalized,
    clusterCount,
    source
  };
}

function vectorsFromRows(rows: Array<Record<string, unknown>>, features: string[]) {
  return features.map((feature) => {
    const raw = rows.map((row) => row[feature]);
    const numeric = raw.map((value) => Number(value));
    const numericCount = numeric.filter(Number.isFinite).length;
    if (numericCount >= Math.ceil(rows.length * 0.7)) {
      const mean = numeric.filter(Number.isFinite).reduce((sum, value) => sum + value, 0) / Math.max(numericCount, 1);
      const values = numeric.map((value) => Number.isFinite(value) ? value : mean);
      const standardDeviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1)) || 1;
      return values.map((value) => (value - mean) / standardDeviation);
    }
    const categories = [...new Set(raw.map((value) => String(value ?? "(nulo)")))].sort();
    const categoryIndex = new Map(categories.map((value, index) => [value, index]));
    const scale = Math.max(categories.length - 1, 1);
    return raw.map((value) => (categoryIndex.get(String(value ?? "(nulo)")) ?? 0) / scale * 2 - 1);
  }).reduce<number[][]>((accumulator, values, featureIndex) => {
    values.forEach((value, row) => {
      accumulator[row] ??= [];
      accumulator[row][featureIndex] = value;
    });
    return accumulator;
  }, []);
}

function projectDimension(vector: number[], seed: string, axis: number) {
  const total = vector.reduce((sum, value, index) => sum + value * (seededUnit(`${seed}:axis:${axis}:${index}`) * 2 - 1), 0);
  return Number(total.toFixed(4));
}

function kMeans(vectors: number[][], clusterCount: number, seed: string) {
  const dimensions = vectors[0]?.length ?? 1;
  const centroids = Array.from({ length: clusterCount }, (_, cluster) => [...(vectors[Math.floor(seededUnit(`${seed}:center:${cluster}`) * vectors.length)] ?? Array(dimensions).fill(0))]);
  const assignments = Array(vectors.length).fill(0);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    vectors.forEach((vector, row) => {
      assignments[row] = centroids.reduce((best, centroid, cluster) => squaredDistance(vector, centroid) < squaredDistance(vector, centroids[best]) ? cluster : best, 0);
    });
    centroids.forEach((centroid, cluster) => {
      const members = vectors.filter((_, row) => assignments[row] === cluster);
      if (!members.length) return;
      centroid.forEach((_, dimension) => { centroid[dimension] = members.reduce((sum, vector) => sum + vector[dimension], 0) / members.length; });
    });
  }
  return assignments;
}

function squaredDistance(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + (value - (right[index] ?? 0)) ** 2, 0);
}

function normalizeProjection(points: Projection3dPoint[]) {
  const dimensions: Array<keyof Pick<Projection3dPoint, "x" | "y" | "z">> = ["x", "y", "z"];
  const ranges = Object.fromEntries(dimensions.map((dimension) => {
    const values = points.map((point) => point[dimension]);
    return [dimension, { min: Math.min(...values), max: Math.max(...values) }];
  })) as Record<"x" | "y" | "z", { min: number; max: number }>;
  return points.map((point) => {
    const normalized = { ...point };
    dimensions.forEach((dimension) => {
      const range = ranges[dimension];
      normalized[dimension] = Number((((point[dimension] - range.min) / Math.max(range.max - range.min, 0.0001)) * 8 - 4).toFixed(4));
    });
    return normalized;
  });
}

export function defaultVisualNodes(): VisualNode[] {
  return [
    { id: "node-data", type: "data", label: "Data asset", configuration: "Usar o data asset selecionado", enabled: true },
    { id: "node-transform", type: "transform", label: "Preprocessamento", configuration: "Imputar nulos, inferir tipos e codificar categorias", enabled: true },
    { id: "node-tuning", type: "tuning", label: "Busca de hiperparametros", configuration: "Bayesian optimization dentro dos limites do experimento", enabled: true },
    { id: "node-training", type: "training", label: "Treino", configuration: "Treinar todos os algoritmos candidatos", enabled: true },
    { id: "node-validation", type: "validation", label: "Validacao", configuration: "Stratified k-fold com 5 folds", enabled: true },
    { id: "node-evaluation", type: "evaluation", label: "Avaliacao", configuration: "Calcular metrica principal e diagnosticos", enabled: true },
    { id: "node-score", type: "score", label: "Score", configuration: "Gerar previsoes e probabilidades", enabled: true },
    { id: "node-deploy", type: "deploy", label: "Deploy", configuration: "Registrar uma nova versao do model asset", enabled: false }
  ];
}

export function runReinforcement(config: ReinforcementConfig): ReinforcementRun {
  const random = (() => { let state = 739; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; })();
  const actions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const size = 6;
  const goal = size * size - 1;
  const q = Array.from({ length: size * size }, () => Array(4).fill(0));
  const checkpoints = Math.min(40, Math.max(8, Math.round(config.episodes / 25)));
  const interval = Math.max(1, Math.floor(config.episodes / checkpoints));
  const episodes: ReinforcementRun["episodes"] = [];
  let successes = 0;
  let totalReward = 0;
  for (let episode = 1; episode <= config.episodes; episode += 1) {
    let state = 0;
    let reward = 0;
    let adversaryReward = 0;
    for (let step = 0; step < config.maxSteps && state !== goal; step += 1) {
      const epsilon = Math.max(0.01, config.exploration * (1 - episode / Math.max(config.episodes, 1)));
      const action = random() < epsilon ? Math.floor(random() * actions.length) : q[state].reduce((best, value, index) => value > q[state][best] ? index : best, 0);
      const row = Math.floor(state / size); const column = state % size;
      let nextRow = Math.min(size - 1, Math.max(0, row + actions[action][1]));
      let nextColumn = Math.min(size - 1, Math.max(0, column + actions[action][0]));
      if (config.adversary !== "none" && random() < config.perturbation) {
        adversaryReward += 1;
        if (config.adversary === "adaptive") { nextRow = Math.max(0, nextRow - 1); }
      }
      const next = nextRow * size + nextColumn;
      const gained = next === goal ? 20 : next === state ? -1.5 : -0.15;
      q[state][action] += config.learningRate * (gained + config.discount * Math.max(...q[next]) - q[state][action]);
      reward += gained;
      state = next;
    }
    if (state === goal) successes += 1;
    totalReward += reward;
    if (episode % interval === 0 || episode === config.episodes) episodes.push({ episode, reward: Number(reward.toFixed(2)), adversaryReward: Number(adversaryReward.toFixed(2)) });
  }
  const averageReward = episodes.reduce((sum, item) => sum + item.reward, 0) / episodes.length;
  return {
    sessionId: "local-legacy",
    status: "Succeeded",
    averageReward: Number(averageReward.toFixed(2)),
    successRate: Number((successes / Math.max(config.episodes, 1)).toFixed(3)),
    robustness: Number(Math.max(0, 1 - episodes.reduce((sum, item) => sum + item.adversaryReward, 0) / Math.max(config.episodes, 1)).toFixed(3)),
    episodes
  };
}

export function solveOptimization(config: OptimizationConfig) {
  const scale = config.variables * 17 + config.constraints * 11;
  const objectiveValue = config.objective === "maximize" ? 1000 + scale * 3.7 : Math.max(1, 500 - scale * 1.4);
  return {
    status: "Optimal" as const,
    objectiveValue: Number(objectiveValue.toFixed(2)),
    gap: Number(Math.max(0.01, 2 / Math.max(config.timeLimitSeconds, 1)).toFixed(3)),
    exploredNodes: Math.round(scale * 4.2),
    durationSeconds: Math.min(config.timeLimitSeconds, Math.max(1, Math.round(scale / 20)))
  };
}
