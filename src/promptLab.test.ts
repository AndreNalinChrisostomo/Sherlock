import { describe, expect, it } from "vitest";
import type { Asset } from "./domain";
import {
  defaultPromptParameters,
  exportDeploymentNotebook,
  extractPromptVariables,
  renderPromptTemplate,
  retrieveLocalDocuments,
  runPrompt
} from "./promptLab";

const assets: Asset[] = [
  {
    id: "asset-vector",
    workspaceId: "project-sandbox",
    type: "vector-index",
    name: "complaints_vector_index",
    description: "Indice vetorial com reclamacoes de checkout e prioridade alta.",
    status: "Ready",
    version: 1,
    tags: ["rag", "checkout"],
    updatedAt: "2026-07-28T12:00:00-03:00",
    lineage: [],
    metadata: { chunks: "20" },
    dependencies: [],
    visibility: "active"
  }
];

describe("promptLab", () => {
  it("extracts and renders prompt variables", () => {
    const template = "Classifique {{ ticket }} com tom {{tom}} e {{ticket}} novamente.";

    expect(extractPromptVariables(template)).toEqual(["ticket", "tom"]);
    expect(renderPromptTemplate(template, { ticket: "checkout falhou", tom: "direto" })).toContain("checkout falhou");
  });

  it("runs prompts with local metrics and retrieved documents", () => {
    const run = runPrompt({
      mode: "structured",
      task: "classification",
      prompt: "O checkout tem prioridade alta?",
      modelId: "granite-13b-chat",
      parameters: defaultPromptParameters,
      assets,
      useRag: true,
      selectedVectorAssetId: "asset-vector",
      now: "2026-07-28T12:00:00-03:00"
    });

    expect(run.response).toContain("Mock Granite 13B Chat");
    expect(run.retrievedDocuments).toHaveLength(1);
    expect(run.inputTokens).toBeGreaterThan(0);
    expect(run.estimatedCost).toBeGreaterThan(0);
  });

  it("exports a valid deployment notebook", () => {
    const notebook = JSON.parse(
      exportDeploymentNotebook({
        name: "teste",
        prompt: "Responda {pergunta}",
        modelId: "granite-13b-chat",
        parameters: defaultPromptParameters,
        useRag: true
      })
    );

    expect(notebook.nbformat).toBe(4);
    expect(notebook.cells[1].source.join("")).toContain("MODEL_ID");
  });

  it("ranks local documents by query terms", () => {
    const documents = retrieveLocalDocuments("checkout prioridade alta", assets);

    expect(documents[0].title).toBe("complaints_vector_index");
    expect(documents[0].score).toBeGreaterThan(0.5);
  });
});
