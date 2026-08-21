import type { DataRow } from "./dataPrep";
import type { Asset } from "./domain";

const categories = ["alfa", "beta", "gama", "delta", "epsilon", "zeta"];

function createRandom(seedValue: number) {
  let seed = seedValue;
  return () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed - 1) / 2_147_483_646;
  };
}

function normal(random: () => number) {
  const left = Math.max(random(), 0.000001);
  return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * random());
}

function maybeMissing(value: string, rate: number, random: () => number) {
  return random() < rate ? "" : value;
}

function createUnsupervisedRows(): DataRow[] {
  const random = createRandom(731_947);
  return Array.from({ length: 300 }, (_, index) => {
    const group = index % 3;
    const category = categories[(Math.floor(index / 3) + group * 2) % categories.length];
    const categoryEffect = categories.indexOf(category) - 2.5;
    const a = group * 22 + normal(random) * 4 + categoryEffect;
    const c = group * -15 + a * 0.7 + normal(random) * 5;
    const d = 55 + group * 18 + c * 0.35 + normal(random) * 6;
    const e = 120 - group * 20 + a * 1.1 + normal(random) * 8;
    const target = group === 0 ? "grupo_azul" : group === 1 ? "grupo_verde" : "grupo_laranja";
    return {
      a: maybeMissing(a.toFixed(3), 0.05, random),
      b: maybeMissing(category, 0.04, random),
      c: maybeMissing(c.toFixed(3), 0.07, random),
      d: maybeMissing(d.toFixed(3), 0.06, random),
      e: maybeMissing(e.toFixed(3), 0.05, random),
      target: maybeMissing(target, 0.03, random)
    };
  });
}

function createSupervisedRows(): DataRow[] {
  const random = createRandom(428_771);
  const categoryWeights = [-1.1, -0.6, -0.15, 0.35, 0.8, 1.2];
  return Array.from({ length: 300 }, (_, index) => {
    const categoryIndex = index % categories.length;
    const a = 48 + normal(random) * 15;
    const c = 0.72 * a + normal(random) * 12;
    const d = 88 - 0.3 * a + normal(random) * 11;
    const e = 35 + 0.45 * c - 0.22 * d + normal(random) * 9;
    const score = -5.1 + 0.065 * a + 0.035 * c - 0.025 * d + 0.05 * e + categoryWeights[categoryIndex] + normal(random) * 0.55;
    const target = random() < 1 / (1 + Math.exp(-score)) ? "aprovado" : "reprovado";
    return {
      a: maybeMissing(a.toFixed(3), 0.05, random),
      b: maybeMissing(categories[categoryIndex], 0.04, random),
      c: maybeMissing(c.toFixed(3), 0.06, random),
      d: maybeMissing(d.toFixed(3), 0.05, random),
      e: maybeMissing(e.toFixed(3), 0.07, random),
      target: maybeMissing(target, 0.02, random)
    };
  });
}

function dataAsset(id: string, name: string, description: string, tags: string[], rows: DataRow[]): Asset {
  return {
    id,
    workspaceId: "project-treinos",
    type: "data",
    name,
    description,
    status: "Ready",
    version: 1,
    tags,
    updatedAt: "2026-07-31T17:30:00-03:00",
    lineage: [],
    metadata: {
      format: "CSV",
      rows: "300",
      columns: "6",
      schema: "a, b, c, d, e, target",
      rowsJson: JSON.stringify(rows)
    },
    dependencies: [],
    visibility: "active"
  };
}

export const trainingDatasetAssets = [
  dataAsset("asset-training-unsupervised", "dataset_nao_supervisionado_300.csv", "Dataset com tres grupos latentes para clustering e reducao dimensional.", ["csv", "treino", "nao-supervisionado", "nulos"], createUnsupervisedRows()),
  dataAsset("asset-training-supervised", "dataset_supervisionado_300.csv", "Dataset de classificacao binaria para AutoAI supervisionado e preparo de dados.", ["csv", "treino", "supervisionado", "classificacao", "nulos"], createSupervisedRows())
];
