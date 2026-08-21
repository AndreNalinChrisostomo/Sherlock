import { describe, expect, it } from "vitest";
import type { Asset } from "./domain";
import {
  algorithmsForTask,
  defaultAutoAiConfig,
  defaultVisualNodes,
  explainWinner,
  generateTrials,
  recommendExperiment,
  runReinforcement,
  solveOptimization,
  validateExperiment
} from "./autoAi";

function dataset(schema: string, rowsJson: string): Asset {
  return {
    id: "dataset-1",
    workspaceId: "workspace-1",
    type: "data",
    name: "training.csv",
    description: "Dataset de teste",
    status: "Ready",
    version: 1,
    tags: ["training"],
    updatedAt: "2026-07-31T12:00:00.000Z",
    lineage: [],
    dependencies: [],
    visibility: "active",
    metadata: { schema, rowsJson }
  };
}

describe("AutoAI no-code engine", () => {
  it("recommends classification and excludes identifier columns", () => {
    const asset = dataset("customer_id, age, segment, resolved", JSON.stringify([{ customer_id: 1, age: 32, segment: "smb", resolved: true }]));
    const recommendation = recommendExperiment(asset);

    expect(recommendation.task).toBe("classification");
    expect(recommendation.target).toBe("resolved");
    expect(recommendation.features).toEqual(["age", "segment"]);
    expect(recommendation.warnings[0]).toContain("Identificadores");
  });

  it("builds and validates a regression experiment from a numeric target", () => {
    const asset = dataset("id, area, rooms, y", JSON.stringify([{ id: 1, area: 80, rooms: 2, y: 450000 }]));
    const config = defaultAutoAiConfig(asset);

    expect(config.task).toBe("regression");
    expect(config.target).toBe("y");
    expect(config.metric).toBe("rmse");
    expect(validateExperiment(config)).toEqual([]);
  });

  it("generates deterministic ranked trials and enforces execution limits", () => {
    const asset = dataset("age, income, y", JSON.stringify([{ age: 35, income: 7000, y: 1 }]));
    const config = { ...defaultAutoAiConfig(asset), maxTrials: 7, costLimit: 0.01, dataAugmentation: true, adversarialTraining: true };
    const first = generateTrials(config);
    const second = generateTrials(config);

    expect(first).toEqual(second);
    expect(first).toHaveLength(7);
    expect(first.map((trial) => trial.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(first.every((trial) => trial.status === "Stopped")).toBe(true);
    expect(first[0].techniques).toContain("data augmentation");
    expect(first[0].parameters.adversarialStrength).toBe(0.05);
  });

  it("runs unsupervised clustering without a target and returns a data-backed 3D projection", () => {
    const asset = dataset("a,b,c,d,e,target", JSON.stringify([
      { a: 1, b: "north", c: 2, d: 4, e: 8, target: "alpha" },
      { a: 2, b: "north", c: 3, d: 5, e: 9, target: "alpha" },
      { a: 30, b: "south", c: 40, d: 25, e: 12, target: "beta" },
      { a: 31, b: "south", c: 42, d: 26, e: 11, target: "beta" }
    ]));
    const config = { ...defaultAutoAiConfig(asset), task: "clustering" as const, target: "", metric: "silhouette", algorithms: algorithmsForTask("clustering"), features: ["a", "b", "c", "d", "e"] };
    const trials = generateTrials(config, JSON.parse(asset.metadata?.rowsJson ?? "[]"));

    expect(validateExperiment(config)).toEqual([]);
    expect(trials[0].projection3d?.source).toBe("asset-preview");
    expect(trials[0].projection3d?.points).toHaveLength(4);
    expect(trials[0].projection3d?.clusterCount).toBeGreaterThan(2);
  });

  it("explains the winning pipeline with feature, quality, cost and time", () => {
    const asset = dataset("age, income, y", JSON.stringify([{ age: 35, income: 7000, y: 1 }]));
    const config = defaultAutoAiConfig(asset);
    const winner = generateTrials(config)[0];
    const explanation = explainWinner(winner, config);

    expect(explanation).toContain("venceu");
    expect(explanation).toContain("custo estimado");
    expect(explanation).toContain("feature mais influente");
  });

  it("simulates reinforcement learning and solves declarative optimization", () => {
    const reinforcement = runReinforcement({
      environment: "pricing-sim",
      agent: "ppo",
      adversary: "self-play",
      rewardGoal: "maximizar margem",
      episodes: 500,
      maxSteps: 200,
      learningRate: 0.001,
      discount: 0.99,
      exploration: 0.1,
      selfPlay: true,
      perturbation: 0.08
    });
    const solution = solveOptimization({ objective: "maximize", objectiveName: "lucro", variables: 20, constraints: 12, timeLimitSeconds: 30 });

    expect(reinforcement.episodes.length).toBeGreaterThan(8);
    expect(reinforcement.successRate).toBeGreaterThan(0.5);
    expect(reinforcement.robustness).toBeGreaterThan(0.6);
    expect(solution.status).toBe("Optimal");
    expect(solution.objectiveValue).toBeGreaterThan(1000);
    expect(solution.durationSeconds).toBeLessThanOrEqual(30);
  });

  it("creates an ordered visual pipeline with explicit configuration", () => {
    const nodes = defaultVisualNodes();

    expect(nodes.map((node) => node.type)).toEqual(["data", "transform", "tuning", "training", "validation", "evaluation", "score", "deploy"]);
    expect(nodes.every((node) => node.configuration.trim().length > 0)).toBe(true);
    expect(nodes.at(-1)?.enabled).toBe(false);
  });
});
