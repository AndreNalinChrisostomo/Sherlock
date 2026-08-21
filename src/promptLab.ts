import type { Asset } from "./domain";

export type PromptMode = "freeform" | "structured" | "chat";
export type PromptTask = "classification" | "extraction" | "generation" | "question-answering" | "summarization";

export interface PromptModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  costPer1kTokens: number;
  strengths: string[];
}

export interface PromptParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  stopSequences: string;
  seed: number;
}

export interface PromptSample {
  task: PromptTask;
  label: string;
  template: string;
  variables: Record<string, string>;
}

export interface RetrievedDocument {
  assetId: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface PromptRun {
  id: string;
  mode: PromptMode;
  task: PromptTask;
  modelId: string;
  modelName: string;
  renderedPrompt: string;
  response: string;
  parameters: PromptParameters;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCost: number;
  retrievedDocuments: RetrievedDocument[];
  createdAt: string;
  rating: "up" | "down" | null;
  notes: string;
}

export interface RunPromptInput {
  mode: PromptMode;
  task: PromptTask;
  prompt: string;
  modelId: string;
  parameters: PromptParameters;
  assets: Asset[];
  useRag: boolean;
  selectedVectorAssetId?: string;
  now?: string;
}

export const promptModels: PromptModel[] = [
  {
    id: "granite-13b-chat",
    name: "Mock Granite 13B Chat",
    provider: "Local mock",
    contextWindow: 8192,
    costPer1kTokens: 0.0008,
    strengths: ["chat", "summarization", "grounded QA"]
  },
  {
    id: "granite-20b-code",
    name: "Mock Granite 20B Code",
    provider: "Local mock",
    contextWindow: 16384,
    costPer1kTokens: 0.0012,
    strengths: ["structured output", "reasoning", "code"]
  },
  {
    id: "mixtral-local",
    name: "Mock Mixtral Local",
    provider: "Local mock",
    contextWindow: 32768,
    costPer1kTokens: 0.0015,
    strengths: ["long context", "generation", "analysis"]
  }
];

export const promptSamples: PromptSample[] = [
  {
    task: "classification",
    label: "Classificar ticket",
    template: "Classifique o ticket abaixo em baixo, medio ou alto. Explique em uma frase.\n\nTicket: {{ticket}}",
    variables: { ticket: "Cliente relata falha intermitente no checkout e perda de vendas." }
  },
  {
    task: "extraction",
    label: "Extrair campos",
    template: "Extraia entidade, sentimento e acao recomendada em JSON.\n\nTexto: {{texto}}",
    variables: { texto: "Maria pediu reembolso por atraso de entrega e esta frustrada." }
  },
  {
    task: "generation",
    label: "Gerar resposta",
    template: "Crie uma resposta objetiva para {{publico}} com tom {{tom}} sobre: {{tema}}",
    variables: { publico: "suporte interno", tom: "profissional", tema: "incidente de SLA" }
  },
  {
    task: "question-answering",
    label: "Pergunta-resposta",
    template: "Responda usando apenas o contexto recuperado quando disponivel.\n\nPergunta: {{pergunta}}",
    variables: { pergunta: "Quais reclamacoes indicam prioridade alta?" }
  },
  {
    task: "summarization",
    label: "Sumarizar",
    template: "Resuma o conteudo em 3 bullets acionaveis.\n\nConteudo: {{conteudo}}",
    variables: { conteudo: "Tickets recentes mostram atraso, falha de pagamento e baixa satisfacao." }
  }
];

export const defaultPromptParameters: PromptParameters = {
  temperature: 0.3,
  maxTokens: 320,
  topP: 0.9,
  stopSequences: "",
  seed: 42
};

export function extractPromptVariables(template: string) {
  const names = new Set<string>();
  const matcher = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let match = matcher.exec(template);
  while (match) {
    names.add(match[1]);
    match = matcher.exec(template);
  }
  return Array.from(names);
}

export function renderPromptTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name: string) => values[name] ?? "");
}

export function estimateTokens(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function hashText(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function keywordScore(query: string, text: string) {
  const queryTerms = new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length > 2));
  const textTerms = text.toLowerCase();
  if (queryTerms.size === 0) return 0;
  let hits = 0;
  queryTerms.forEach((term) => {
    if (textTerms.includes(term)) hits += 1;
  });
  return hits / queryTerms.size;
}

export function retrieveLocalDocuments(query: string, assets: Asset[], selectedVectorAssetId?: string) {
  const searchableAssets = assets.filter((asset) => {
    if (asset.visibility === "archived") return false;
    if (selectedVectorAssetId) return asset.id === selectedVectorAssetId || asset.dependencies?.includes(selectedVectorAssetId);
    return ["vector-index", "data", "prompt-template", "notebook"].includes(asset.type);
  });

  return searchableAssets
    .map<RetrievedDocument>((asset) => {
      const source = `${asset.name} ${asset.description} ${asset.tags.join(" ")} ${Object.values(asset.metadata ?? {}).join(" ")}`;
      const score = Number(Math.min(1, keywordScore(query, source) + (asset.type === "vector-index" ? 0.2 : 0)).toFixed(2));
      return {
        assetId: asset.id,
        title: asset.name,
        excerpt: `${asset.description} Tags: ${asset.tags.join(", ")}.`,
        score
      };
    })
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

function taskInstruction(task: PromptTask) {
  const labels: Record<PromptTask, string> = {
    classification: "Classificacao sugerida com justificativa curta",
    extraction: "Campos extraidos em estrutura simples",
    generation: "Texto gerado pronto para revisao",
    "question-answering": "Resposta direta com base no contexto",
    summarization: "Resumo operacional em bullets"
  };
  return labels[task];
}

export function runPrompt(input: RunPromptInput): PromptRun {
  const model = promptModels.find((item) => item.id === input.modelId) ?? promptModels[0];
  const retrievedDocuments = input.useRag ? retrieveLocalDocuments(input.prompt, input.assets, input.selectedVectorAssetId) : [];
  const grounding = retrievedDocuments.length
    ? `\n\nContexto local usado:\n${retrievedDocuments.map((doc) => `- ${doc.title}: ${doc.excerpt}`).join("\n")}`
    : "";
  const fullPrompt = `${input.prompt}${grounding}`;
  const inputTokens = estimateTokens(fullPrompt);
  const outputTokens = Math.min(input.parameters.maxTokens, Math.max(48, Math.ceil(inputTokens * (0.45 + input.parameters.temperature))));
  const fingerprint = hashText(`${fullPrompt}:${input.modelId}:${input.parameters.seed}:${input.parameters.temperature}`);
  const latencyMs = 280 + (fingerprint % 950) + Math.round(outputTokens * 1.7);
  const estimatedCost = Number((((inputTokens + outputTokens) / 1000) * model.costPer1kTokens).toFixed(6));
  const preview = input.prompt.replace(/\s+/g, " ").slice(0, 180);
  const responseLines = [
    `${taskInstruction(input.task)}.`,
    `Modelo: ${model.name}.`,
    `Resposta simulada para: "${preview}${input.prompt.length > 180 ? "..." : ""}".`,
    retrievedDocuments.length
      ? `Grounding: ${retrievedDocuments.map((document) => document.title).join(", ")}.`
      : "Grounding: nenhum indice local usado.",
    `Parametros: temperature ${input.parameters.temperature}, top-p ${input.parameters.topP}, max tokens ${input.parameters.maxTokens}, seed ${input.parameters.seed}.`
  ];

  return {
    id: `prompt-run-${fingerprint}-${Date.now()}`,
    mode: input.mode,
    task: input.task,
    modelId: model.id,
    modelName: model.name,
    renderedPrompt: input.prompt,
    response: responseLines.join("\n"),
    parameters: { ...input.parameters },
    inputTokens,
    outputTokens,
    latencyMs,
    estimatedCost,
    retrievedDocuments,
    createdAt: input.now ?? new Date().toISOString(),
    rating: null,
    notes: ""
  };
}

export function exportDeploymentNotebook(options: {
  name: string;
  prompt: string;
  modelId: string;
  parameters: PromptParameters;
  useRag: boolean;
}) {
  return JSON.stringify(
    {
      cells: [
        {
          cell_type: "markdown",
          metadata: {},
          source: [`# Deployment notebook - ${options.name}\n`, "\n", "Notebook gerado pelo Prompt Lab local.\n"]
        },
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: [
            `MODEL_ID = ${JSON.stringify(options.modelId)}\n`,
            `PROMPT_TEMPLATE = ${JSON.stringify(options.prompt)}\n`,
            `PARAMETERS = ${JSON.stringify(options.parameters, null, 2)}\n`,
            `USE_RAG = ${JSON.stringify(options.useRag)}\n`
          ]
        },
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: [
            "def deploy(payload):\n",
            "    return {\n",
            "        'model_id': MODEL_ID,\n",
            "        'prompt': PROMPT_TEMPLATE.format(**payload),\n",
            "        'parameters': PARAMETERS,\n",
            "        'uses_rag': USE_RAG,\n",
            "    }\n"
          ]
        }
      ],
      metadata: {
        kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
        language_info: { name: "python", version: "3.x" }
      },
      nbformat: 4,
      nbformat_minor: 5
    },
    null,
    2
  );
}
