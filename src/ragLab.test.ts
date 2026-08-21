import { describe, expect, it } from "vitest";
import {
  answerWithRag,
  buildVectorIndex,
  chunkDocument,
  defaultIndexConfig,
  evaluateRagAnswer,
  searchVectorIndex,
  type RagDocument
} from "./ragLab";

const document: RagDocument = {
  id: "doc-1",
  title: "tickets.md",
  text: Array.from({ length: 140 }, (_, index) =>
    index % 10 === 0 ? "checkout prioridade alta pagamento falha" : "cliente suporte prazo entrega"
  ).join(" "),
  metadata: { source: "upload" }
};

describe("ragLab", () => {
  it("chunks documents with overlap and embeddings", () => {
    const chunks = chunkDocument(document, { ...defaultIndexConfig, chunkSize: 40, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].embedding).toHaveLength(defaultIndexConfig.dimensions);
    expect(chunks[1].startWord).toBe(30);
  });

  it("builds and searches a local vector index", () => {
    const index = buildVectorIndex([document], { ...defaultIndexConfig, chunkSize: 45, overlap: 5 }, { now: "2026-07-28T12:00:00-03:00" });
    const results = searchVectorIndex(index, "checkout pagamento falha", { topK: 3, threshold: 0.1, filter: "" });

    expect(index.chunks.length).toBeGreaterThan(1);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].citation).toContain("tickets.md");
  });

  it("answers with citations and evaluation metrics", () => {
    const index = buildVectorIndex([document], defaultIndexConfig);
    const answer = answerWithRag(index, "qual problema de checkout tem prioridade alta?", { topK: 2, threshold: 0.05, filter: "" });
    const evaluation = evaluateRagAnswer(answer);

    expect(answer.answer).toContain("[1]");
    expect(evaluation.citationCount).toBeGreaterThan(0);
    expect(evaluation.groundedness).toBeGreaterThan(0);
  });
});
