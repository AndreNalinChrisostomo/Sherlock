import { DecisionTreeClassifier } from "ml-cart";
import LogisticRegression from "ml-logistic-regression";
import { Matrix } from "ml-matrix";
import { RandomForestClassifier } from "ml-random-forest";
import { kmeans } from "ml-kmeans";
import { PCA } from "ml-pca";
import type { AutoAiConfig, TrialResult } from "./autoAi";

type Row = Record<string, unknown>;
type WorkerRequest = { type: "run"; config: AutoAiConfig; rows: Row[] };

function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function shuffled<T>(items: T[], seed: number) { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1664525 + 1013904223) >>> 0; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap], copy[index]]; } return copy; }

function split(rows: Row[], target: string, seed: number) {
  const groups = new Map<string, Row[]>();
  rows.filter((row) => String(row[target] ?? "").trim()).forEach((row) => { const label = String(row[target]); groups.set(label, [...(groups.get(label) ?? []), row]); });
  const train: Row[] = []; const test: Row[] = [];
  let groupIndex = 0;
  groups.forEach((group) => { const ordered = shuffled(group, seed + groupIndex); groupIndex += 1; const testCount = Math.max(1, Math.round(ordered.length * 0.2)); test.push(...ordered.slice(0, testCount)); train.push(...ordered.slice(testCount)); });
  return { train, test };
}

function encode(train: Row[], test: Row[], features: string[]) {
  const numeric = new Map<string, number>(); const categories = new Map<string, string[]>();
  for (const feature of features) {
    const values = train.map((row) => number(row[feature])).filter((value): value is number => value !== null);
    if (values.length >= Math.max(2, train.length * 0.8)) numeric.set(feature, values.reduce((sum, value) => sum + value, 0) / values.length);
    else categories.set(feature, [...new Set(train.map((row) => String(row[feature] ?? "__MISSING__")))].sort());
  }
  const build = (rows: Row[]) => rows.map((row) => features.flatMap((feature) => {
    if (numeric.has(feature)) return [number(row[feature]) ?? numeric.get(feature)!];
    const value = String(row[feature] ?? "__MISSING__"); return (categories.get(feature) ?? []).map((category) => Number(value === category));
  }));
  const names = features.flatMap((feature) => numeric.has(feature) ? [feature] : (categories.get(feature) ?? []).map((category) => `${feature}=${category}`));
  return { train: build(train), test: build(test), names };
}

function metrics(actual: number[], predicted: number[]) {
  const classes = [...new Set([...actual, ...predicted])].sort((a, b) => a - b); let correct = 0;
  const f1s = classes.map((label) => { let tp = 0; let fp = 0; let fn = 0; actual.forEach((truth, index) => { if (truth === label && predicted[index] === label) tp += 1; if (truth !== label && predicted[index] === label) fp += 1; if (truth === label && predicted[index] !== label) fn += 1; }); const precision = tp / Math.max(1, tp + fp); const recall = tp / Math.max(1, tp + fn); return { precision, recall, f1: 2 * precision * recall / Math.max(0.000001, precision + recall) }; });
  actual.forEach((truth, index) => { if (truth === predicted[index]) correct += 1; });
  const primary = f1s[f1s.length - 1] ?? { precision: 0, recall: 0, f1: 0 };
  return { accuracy: correct / Math.max(1, actual.length), f1: f1s.reduce((sum, item) => sum + item.f1, 0) / Math.max(1, f1s.length), precision: primary.precision, recall: primary.recall };
}

function runModel(algorithm: TrialResult["algorithm"], trainX: number[][], trainY: number[], testX: number[][], config: AutoAiConfig, index: number) {
  const depth = config.maxDepths[index % config.maxDepths.length] ?? 6; const estimators = config.estimators[index % config.estimators.length] ?? 100;
  if (algorithm === "linear") { const model = new LogisticRegression({ numSteps: Math.max(300, (config.epochs[index % config.epochs.length] ?? 50) * 20), learningRate: config.learningRates[index % config.learningRates.length] ?? 0.01 }); model.train(new Matrix(trainX.map((row) => [1, ...row])), Matrix.columnVector(trainY)); return model.predict(new Matrix(testX.map((row) => [1, ...row]))); }
  if (algorithm === "tree") { const model = new DecisionTreeClassifier({ gainFunction: "gini", maxDepth: depth, minNumSamples: 2 }); model.train(trainX, trainY); return model.predict(testX); }
  const forest = new RandomForestClassifier({ seed: 42 + index, maxFeatures: Math.max(1, Math.floor(Math.sqrt(trainX[0]?.length ?? 1))), replacement: true, nEstimators: estimators }); forest.train(trainX, trainY); return forest.predict(testX);
}

function score(metric: string, values: ReturnType<typeof metrics>) { return metric === "accuracy" ? values.accuracy : metric === "precision" ? values.precision : metric === "recall" ? values.recall : values.f1; }
function distance(left: number[], right: number[]) { return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0)); }
function scaled(matrix: number[][]) { return matrix.map((row) => row.map((value, column) => { const values = matrix.map((item) => item[column]); const mean = values.reduce((sum, item) => sum + item, 0) / values.length; const deviation = Math.sqrt(values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / Math.max(1, values.length - 1)) || 1; return (value - mean) / deviation; })); }
function silhouette(matrix: number[][], clusters: number[]) { return matrix.reduce((sum, row, index) => { const own = clusters[index]; const same = matrix.filter((_, other) => other !== index && clusters[other] === own).map((other) => distance(row, other)); const a = same.reduce((total, item) => total + item, 0) / Math.max(1, same.length); const others = [...new Set(clusters)].filter((cluster) => cluster !== own).map((cluster) => { const values = matrix.filter((_, other) => clusters[other] === cluster).map((other) => distance(row, other)); return values.reduce((total, item) => total + item, 0) / Math.max(1, values.length); }); const b = Math.min(...others); return sum + (b - a) / Math.max(a, b, 0.000001); }, 0) / Math.max(1, matrix.length); }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "run") return;
  const { config, rows } = event.data;
  try {
    if (config.task === "clustering") {
      if (rows.length < 10 || !config.features.length) throw new Error("Selecione ao menos uma feature e um dataset com dez ou mais linhas.");
      const prepared = scaled(encode(rows, [], config.features).train);
      const components = new PCA(prepared, { center: true, scale: false }).predict(prepared).to2DArray();
      const results: TrialResult[] = [];
      for (let index = 0; index < config.maxTrials; index += 1) {
        const started = performance.now(); const clusterCount = Math.max(2, Math.min(12, Math.round(config.clusterCount || 3)));
        const result = kmeans(prepared, clusterCount, { initialization: "kmeans++", maxIterations: 100, seed: 739 + index });
        const value = silhouette(prepared, result.clusters); const durationSeconds = Number(((performance.now() - started) / 1000).toFixed(3));
        results.push({ id: `trial-${index + 1}`, rank: 0, algorithm: "k-means", metric: config.metric, score: Number(value.toFixed(4)), secondaryScore: 0, durationSeconds, estimatedCost: 0, status: "Succeeded", parameters: { clusters: clusterCount, iterations: result.iterations }, techniques: ["imputacao por media", "one-hot categorico", "standardizacao", "k-means++"], preprocessing: ["imputacao por media", "one-hot categorico", "standardizacao"], featureImportance: [], projection3d: { axes: ["PC1", "PC2", "PC3"], clusterCount, source: "asset-preview", points: components.map((point, row) => ({ x: point[0] ?? 0, y: point[1] ?? 0, z: point[2] ?? 0, cluster: result.clusters[row], row })) } });
        self.postMessage({ type: "progress", current: index + 1, total: config.maxTrials });
      }
      results.sort((left, right) => right.score - left.score); results.forEach((trial, index) => { trial.rank = index + 1; }); self.postMessage({ type: "complete", trials: results }); return;
    }
    if (config.task !== "classification") throw new Error("O motor local real desta etapa suporta classificacao supervisionada e clustering K-Means.");
    const { train, test } = split(rows, config.target, 739);
    if (train.length < 10 || test.length < 2) throw new Error("Dados insuficientes apos remover linhas sem alvo.");
    const labels = [...new Set(train.map((row) => String(row[config.target])))].sort();
    if (labels.length < 2) throw new Error("A coluna alvo precisa ter pelo menos duas classes.");
    const labelIndex = new Map(labels.map((label, index) => [label, index])); const prepared = encode(train, test, config.features);
    const candidates = config.algorithms.filter((algorithm) => ["linear", "tree", "random-forest"].includes(algorithm));
    if (!candidates.length) throw new Error("Selecione Linear/logistica, Arvore de decisao ou Random forest.");
    const results: TrialResult[] = [];
    for (let index = 0; index < config.maxTrials; index += 1) {
      const algorithm = candidates[index % candidates.length] as TrialResult["algorithm"]; const started = performance.now();
      const predicted = runModel(algorithm, prepared.train, train.map((row) => labelIndex.get(String(row[config.target]))!), prepared.test, config, index);
      const actual = test.map((row) => labelIndex.get(String(row[config.target]))!); const measured = metrics(actual, predicted);
      const durationSeconds = Number(((performance.now() - started) / 1000).toFixed(3));
      results.push({ id: `trial-${index + 1}`, rank: 0, algorithm, metric: config.metric, score: Number(score(config.metric, measured).toFixed(4)), secondaryScore: Number(measured.accuracy.toFixed(4)), durationSeconds, estimatedCost: 0, status: "Succeeded", parameters: { maxDepth: config.maxDepths[index % config.maxDepths.length] ?? 6, estimators: config.estimators[index % config.estimators.length] ?? 100, validationRows: test.length }, techniques: ["imputacao por media", "one-hot categorico", "holdout estratificado"], preprocessing: ["linhas sem alvo removidas", "imputacao por media", "one-hot categorico"], featureImportance: [], confusionMatrix: labels.length === 2 ? [[actual.filter((value, i) => value === 0 && predicted[i] === 0).length, actual.filter((value, i) => value === 0 && predicted[i] === 1).length], [actual.filter((value, i) => value === 1 && predicted[i] === 0).length, actual.filter((value, i) => value === 1 && predicted[i] === 1).length]] : undefined });
      self.postMessage({ type: "progress", current: index + 1, total: config.maxTrials });
    }
    results.sort((left, right) => right.score - left.score); results.forEach((trial, index) => { trial.rank = index + 1; });
    self.postMessage({ type: "complete", trials: results });
  } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Falha no treino local." }); }
};
