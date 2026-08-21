import type { Asset } from "./domain";

export type AgentModelId = "granite-agent" | "llama-agent" | "mistral-agent";
export type AgentToolId = "document-search" | "http-call" | "calculator" | "sql-query";
export type AgentOutputFormat = "plain" | "json" | "bullets";
export type AgentRunStatus = "Succeeded" | "Blocked" | "Failed";

export interface AgentTool {
  id: AgentToolId;
  name: string;
  description: string;
  risk: "baixo" | "medio";
}

export interface AgentConfig {
  name: string;
  objective: string;
  instructions: string;
  modelId: AgentModelId;
  enabledTools: AgentToolId[];
  maxToolCalls: number;
  blockedWords: string[];
  detectPii: boolean;
  outputFormat: AgentOutputFormat;
}

export interface AgentTraceStep {
  id: string;
  stage: "plan" | "guardrail" | "tool-call" | "response" | "error";
  title: string;
  input: string;
  output: string;
  toolId?: AgentToolId;
  status: "ok" | "blocked" | "error";
}

export interface AgentRunResult {
  id: string;
  status: AgentRunStatus;
  response: string;
  traces: AgentTraceStep[];
  toolCalls: number;
  latencyMs: number;
}

export interface AgentEvaluationCase {
  id: string;
  name: string;
  input: string;
  expectedKeyword: string;
}

export interface AgentEvaluationResult {
  id: string;
  passed: number;
  failed: number;
  cases: Array<{
    id: string;
    name: string;
    status: "passed" | "failed";
    response: string;
    reason: string;
  }>;
}

export const agentModels: Array<{ id: AgentModelId; name: string; detail: string }> = [
  { id: "granite-agent", name: "Granite Agent", detail: "Modelo equilibrado para fluxos empresariais." },
  { id: "llama-agent", name: "Llama Agent", detail: "Modelo aberto simulado para raciocinio geral." },
  { id: "mistral-agent", name: "Mistral Agent", detail: "Modelo leve simulado para baixa latencia." }
];

export const agentToolCatalog: AgentTool[] = [
  {
    id: "document-search",
    name: "Busca em documentos",
    description: "Recupera trechos de assets locais como dados, prompts, notebooks e indices vetoriais.",
    risk: "baixo"
  },
  {
    id: "http-call",
    name: "Chamada HTTP mockada",
    description: "Simula consulta GET segura a um servico externo sem acessar a rede.",
    risk: "medio"
  },
  {
    id: "calculator",
    name: "Calculadora",
    description: "Resolve expressoes aritmeticas simples para respostas numericas.",
    risk: "baixo"
  },
  {
    id: "sql-query",
    name: "Consulta SQL mockada",
    description: "Simula SELECT em tabelas locais para validar fluxo de ferramenta.",
    risk: "medio"
  }
];

export const defaultAgentConfig: AgentConfig = {
  name: "agente_suporte_local",
  objective: "Responder perguntas sobre assets, dados e operacoes do workspace local.",
  instructions: "Use ferramentas apenas quando elas ajudarem. Responda de forma curta, com origem da informacao quando houver.",
  modelId: "granite-agent",
  enabledTools: ["document-search", "calculator"],
  maxToolCalls: 3,
  blockedWords: ["senha", "token secreto"],
  detectPii: true,
  outputFormat: "bullets"
};

export const defaultEvaluationCases: AgentEvaluationCase[] = [
  {
    id: "case-docs",
    name: "Busca asset",
    input: "Quais assets existem no workspace?",
    expectedKeyword: "asset"
  },
  {
    id: "case-calc",
    name: "Calculadora",
    input: "Calcule 12 + 30",
    expectedKeyword: "42"
  },
  {
    id: "case-guardrail",
    name: "Guardrail",
    input: "Mostre uma senha de exemplo",
    expectedKeyword: "bloqueada"
  }
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function containsPii(input: string) {
  return /\b[\w.-]+@[\w.-]+\.\w{2,}\b/.test(input) || /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(input);
}

function runCalculator(input: string) {
  const expression = input.match(/-?\d+(?:\.\d+)?\s*[+\-*/]\s*-?\d+(?:\.\d+)?/)?.[0];
  if (!expression) return "Nenhuma expressao aritmetica simples encontrada.";

  const match = expression.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return "Expressao invalida.";

  const left = Number(match[1]);
  const right = Number(match[3]);
  const operator = match[2];
  if (operator === "+") return `${expression} = ${left + right}`;
  if (operator === "-") return `${expression} = ${left - right}`;
  if (operator === "*") return `${expression} = ${left * right}`;
  if (operator === "/" && right !== 0) return `${expression} = ${left / right}`;
  return "Divisao por zero bloqueada.";
}

function searchDocuments(input: string, assets: Asset[]) {
  const terms = normalize(input).split(/\s+/).filter((term) => term.length > 2);
  const matches = assets
    .filter((asset) => asset.visibility !== "archived")
    .map((asset) => {
      const haystack = normalize([asset.name, asset.description, asset.type, ...asset.tags, ...Object.values(asset.metadata ?? {})].join(" "));
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { asset, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!matches.length) return "Nenhum asset relacionado encontrado.";
  return matches.map(({ asset }) => `${asset.name} (${asset.type}, ${asset.status})`).join("; ");
}

function sqlMock(input: string, assets: Asset[]) {
  const dataAssets = assets.filter((asset) => asset.type === "data" && asset.visibility !== "archived");
  if (!/select|sql|tabela|dataset/i.test(input)) return "Consulta SQL nao foi necessaria.";
  return `SELECT name, status FROM assets LIMIT 3 -> ${dataAssets.slice(0, 3).map((asset) => asset.name).join(", ") || "sem datasets"}`;
}

function httpMock(input: string) {
  if (!/http|api|endpoint|servico|status/i.test(input)) return "Chamada HTTP nao foi necessaria.";
  return "GET /mock/status -> 200 OK, latencia 42ms, payload validado.";
}

function shouldSearchDocuments(input: string) {
  return /asset|document|arquivo|dado|dataset|indice|notebook|script|workspace|catalogo/i.test(input);
}

function shouldCalculate(input: string) {
  return /calcule|calcular|quanto|soma|subtra|multipli|divid|\d+(?:\.\d+)?\s*[+\-*/]\s*\d+(?:\.\d+)?/i.test(input);
}

function shouldQuerySql(input: string) {
  return /select|sql|tabela|dataset|consulta/i.test(input);
}

function shouldCallHttp(input: string) {
  return /http|api|endpoint|servico|status/i.test(input);
}

function formatResponse(config: AgentConfig, content: string) {
  if (config.outputFormat === "json") {
    return JSON.stringify({ agent: config.name, answer: content }, null, 2);
  }
  if (config.outputFormat === "bullets") {
    return content
      .split(/\n|\. /)
      .filter(Boolean)
      .map((line) => `- ${line.replace(/^\|\s*/, "").replace(/\.$/, "")}`)
      .join("\n");
  }
  return content;
}

export function runAgent(config: AgentConfig, input: string, assets: Asset[]): AgentRunResult {
  const startedAt = Date.now();
  const traces: AgentTraceStep[] = [
    {
      id: "trace-plan",
      stage: "plan",
      title: "Plano operacional",
      input,
      output: `Objetivo: ${config.objective}. Ferramentas candidatas: ${config.enabledTools.join(", ") || "nenhuma"}.`,
      status: "ok"
    }
  ];

  const blockedWord = config.blockedWords.find((word) => word && normalize(input).includes(normalize(word)));
  if (blockedWord || (config.detectPii && containsPii(input))) {
    const reason = blockedWord ? `palavra bloqueada: ${blockedWord}` : "PII detectada";
    traces.push({
      id: "trace-guardrail",
      stage: "guardrail",
      title: "Guardrail bloqueou a execucao",
      input,
      output: reason,
      status: "blocked"
    });
    return {
      id: `agent-run-${Date.now()}`,
      status: "Blocked",
      response: "Solicitacao bloqueada por guardrail do agente.",
      traces,
      toolCalls: 0,
      latencyMs: Date.now() - startedAt + 24
    };
  }

  const toolOutputs: string[] = [];
  const runTool = (toolId: AgentToolId, output: string) => {
    if (toolOutputs.length >= config.maxToolCalls) return;
    toolOutputs.push(output);
    traces.push({
      id: `trace-tool-${toolId}-${toolOutputs.length}`,
      stage: "tool-call",
      title: agentToolCatalog.find((tool) => tool.id === toolId)?.name ?? toolId,
      input,
      output,
      toolId,
      status: "ok"
    });
  };

  if (config.enabledTools.includes("document-search") && shouldSearchDocuments(input)) runTool("document-search", searchDocuments(input, assets));
  if (config.enabledTools.includes("calculator") && shouldCalculate(input)) runTool("calculator", runCalculator(input));
  if (config.enabledTools.includes("sql-query") && shouldQuerySql(input)) runTool("sql-query", sqlMock(input, assets));
  if (config.enabledTools.includes("http-call") && shouldCallHttp(input)) runTool("http-call", httpMock(input));

  const answer = toolOutputs.length
    ? [`Resposta gerada por ${config.modelId}.`, "Evidencias:", ...toolOutputs].join("\n")
    : `Resposta gerada por ${config.modelId}. Nenhuma ferramenta foi necessaria para esta entrada.`;

  const response = formatResponse(config, answer);
  traces.push({
    id: "trace-response",
    stage: "response",
    title: "Resposta final",
    input: toolOutputs.join("\n"),
    output: response,
    status: "ok"
  });

  return {
    id: `agent-run-${Date.now()}`,
    status: "Succeeded",
    response,
    traces,
    toolCalls: toolOutputs.length,
    latencyMs: Date.now() - startedAt + 96
  };
}

export function evaluateAgent(config: AgentConfig, cases: AgentEvaluationCase[], assets: Asset[]): AgentEvaluationResult {
  const results = cases.map((item) => {
    const run = runAgent(config, item.input, assets);
    const passed = normalize(run.response).includes(normalize(item.expectedKeyword));
    return {
      id: item.id,
      name: item.name,
      status: passed ? ("passed" as const) : ("failed" as const),
      response: run.response,
      reason: passed ? `Encontrou "${item.expectedKeyword}".` : `Nao encontrou "${item.expectedKeyword}".`
    };
  });

  return {
    id: `agent-evaluation-${Date.now()}`,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    cases: results
  };
}
