export interface RagDocument {
  id: string;
  title: string;
  text: string;
  metadata: Record<string, string>;
}

export interface RagChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  text: string;
  startWord: number;
  endWord: number;
  embedding: number[];
  metadata: Record<string, string>;
}

export interface VectorIndexConfig {
  chunkSize: number;
  overlap: number;
  embeddingModel: string;
  dimensions: number;
}

export interface LocalVectorIndex {
  id: string;
  name: string;
  documents: RagDocument[];
  chunks: RagChunk[];
  config: VectorIndexConfig;
  createdAt: string;
}

export interface RetrieverConfig {
  topK: number;
  threshold: number;
  filter: string;
}

export interface SearchResult {
  chunk: RagChunk;
  score: number;
  citation: string;
}

export interface RagAnswer {
  answer: string;
  query: string;
  results: SearchResult[];
  latencyMs: number;
  groundedness: number;
  relevance: number;
  emptyResponse: boolean;
}

export const defaultIndexConfig: VectorIndexConfig = {
  chunkSize: 90,
  overlap: 18,
  embeddingModel: "mock-hash-embedding",
  dimensions: 32
};

export const defaultRetrieverConfig: RetrieverConfig = {
  topK: 4,
  threshold: 0.12,
  filter: ""
};

function words(text: string) {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 2);
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function embedText(text: string, dimensions = defaultIndexConfig.dimensions) {
  const vector = Array.from({ length: dimensions }, () => 0);
  tokens(text).forEach((token) => {
    const hash = hashToken(token);
    const bucket = hash % dimensions;
    vector[bucket] += hash % 2 === 0 ? 1 : -1;
  });
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (!leftNorm || !rightNorm) return 0;
  return Number((dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))).toFixed(4));
}

export function chunkDocument(document: RagDocument, config: VectorIndexConfig = defaultIndexConfig) {
  const sourceWords = words(document.text);
  if (!sourceWords.length) return [];
  const chunkSize = Math.max(20, config.chunkSize);
  const overlap = Math.min(Math.max(0, config.overlap), chunkSize - 1);
  const step = chunkSize - overlap;
  const chunks: RagChunk[] = [];
  for (let start = 0; start < sourceWords.length; start += step) {
    const end = Math.min(sourceWords.length, start + chunkSize);
    const text = sourceWords.slice(start, end).join(" ");
    chunks.push({
      id: `${document.id}-chunk-${chunks.length + 1}`,
      documentId: document.id,
      documentTitle: document.title,
      text,
      startWord: start,
      endWord: end,
      embedding: embedText(text, config.dimensions),
      metadata: { ...document.metadata }
    });
    if (end === sourceWords.length) break;
  }
  return chunks;
}

export function buildVectorIndex(
  documents: RagDocument[],
  config: VectorIndexConfig = defaultIndexConfig,
  options: { id?: string; name?: string; now?: string } = {}
): LocalVectorIndex {
  const normalizedConfig = {
    ...config,
    chunkSize: Math.max(20, config.chunkSize),
    overlap: Math.min(Math.max(0, config.overlap), Math.max(20, config.chunkSize) - 1),
    dimensions: Math.max(8, config.dimensions)
  };
  return {
    id: options.id ?? `local-index-${Date.now()}`,
    name: options.name ?? "local_rag_index",
    documents,
    chunks: documents.flatMap((document) => chunkDocument(document, normalizedConfig)),
    config: normalizedConfig,
    createdAt: options.now ?? new Date().toISOString()
  };
}

export function searchVectorIndex(index: LocalVectorIndex, query: string, config: RetrieverConfig = defaultRetrieverConfig) {
  const queryVector = embedText(query, index.config.dimensions);
  const filter = config.filter.trim().toLowerCase();
  return index.chunks
    .filter((chunk) => {
      if (!filter) return true;
      return `${chunk.documentTitle} ${chunk.text} ${Object.values(chunk.metadata).join(" ")}`.toLowerCase().includes(filter);
    })
    .map<SearchResult>((chunk, position) => ({
      chunk,
      score: cosineSimilarity(queryVector, chunk.embedding),
      citation: `[${position + 1}] ${chunk.documentTitle}, palavras ${chunk.startWord + 1}-${chunk.endWord}`
    }))
    .filter((result) => result.score >= config.threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, config.topK))
    .map((result, indexPosition) => ({
      ...result,
      citation: `[${indexPosition + 1}] ${result.chunk.documentTitle}, palavras ${result.chunk.startWord + 1}-${result.chunk.endWord}`
    }));
}

export function answerWithRag(index: LocalVectorIndex, query: string, config: RetrieverConfig = defaultRetrieverConfig): RagAnswer {
  const started = Date.now();
  const results = searchVectorIndex(index, query, config);
  const relevance = results.length ? Number((results.reduce((sum, result) => sum + result.score, 0) / results.length).toFixed(3)) : 0;
  const groundedness = results.length ? Number(Math.min(1, relevance + 0.2).toFixed(3)) : 0;
  const emptyResponse = results.length === 0;
  const answer = emptyResponse
    ? "Nao encontrei contexto suficiente no indice local para responder com seguranca."
    : [
        `Resposta baseada em ${results.length} trecho(s) recuperado(s).`,
        ...results.map((result, indexPosition) => {
          const excerpt = result.chunk.text.slice(0, 180);
          return `${indexPosition + 1}. ${excerpt}${result.chunk.text.length > 180 ? "..." : ""} ${result.citation}`;
        })
      ].join("\n");

  return {
    answer,
    query,
    results,
    latencyMs: Math.max(8, Date.now() - started + results.length * 12 + Math.ceil(index.chunks.length / 8)),
    groundedness,
    relevance,
    emptyResponse
  };
}

export function evaluateRagAnswer(answer: RagAnswer) {
  return {
    groundedness: answer.groundedness,
    relevance: answer.relevance,
    emptyResponse: answer.emptyResponse,
    latencyMs: answer.latencyMs,
    citationCount: answer.results.length
  };
}
