import { useMemo, useState } from "react";
import { Bot, CheckCircle2, FlaskConical, Play, Rocket, Save, ShieldCheck, Wrench } from "lucide-react";
import type { Asset } from "./domain";
import {
  agentModels,
  agentToolCatalog,
  defaultAgentConfig,
  defaultEvaluationCases,
  evaluateAgent,
  runAgent,
  type AgentConfig,
  type AgentEvaluationResult,
  type AgentModelId,
  type AgentOutputFormat,
  type AgentRunResult,
  type AgentToolId
} from "./agentLab";

type AgentFlowStage = "draft" | "tested" | "saved" | "evaluated" | "deployed";

interface AgentLabViewProps {
  assets: Asset[];
  activeWorkspaceName: string;
  onSaveAgentAsset: (payload: AgentConfig) => void;
  onDeployAgentService: (payload: AgentConfig) => void;
  onRegisterAgentEvaluation: (payload: { config: AgentConfig; result: AgentEvaluationResult }) => void;
}

function configFromAsset(asset: Asset): AgentConfig {
  const metadata = asset.metadata ?? {};
  return {
    name: asset.name,
    objective: metadata.objective || asset.description,
    instructions: metadata.instructions || defaultAgentConfig.instructions,
    modelId: (metadata.model as AgentModelId) || defaultAgentConfig.modelId,
    enabledTools: (metadata.tools || "")
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean) as AgentToolId[],
    maxToolCalls: Number(metadata.maxToolCalls || defaultAgentConfig.maxToolCalls),
    blockedWords: (metadata.blockedWords || "")
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean),
    detectPii: metadata.detectPii !== "false",
    outputFormat: (metadata.outputFormat as AgentOutputFormat) || defaultAgentConfig.outputFormat
  };
}

function HelpTip({ title, body }: { title: string; body: string }) {
  return (
    <span className="help-wrap">
      <button aria-label={`Ajuda: ${title}`} className="help-button" type="button">
        ?
      </button>
      <span className="help-popover" role="tooltip">
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
    </span>
  );
}

export function AgentLabView({
  activeWorkspaceName,
  assets,
  onDeployAgentService,
  onRegisterAgentEvaluation,
  onSaveAgentAsset
}: AgentLabViewProps) {
  const [config, setConfig] = useState<AgentConfig>(defaultAgentConfig);
  const [testInput, setTestInput] = useState("Quais assets existem e quanto e 12 + 30?");
  const [runResult, setRunResult] = useState<AgentRunResult | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<AgentEvaluationResult | null>(null);
  const [flowStage, setFlowStage] = useState<AgentFlowStage>("draft");
  const [statusMessage, setStatusMessage] = useState("Configure o agente, rode um teste e salve antes do deploy.");
  const agentAssets = useMemo(() => assets.filter((asset) => asset.type === "agent" && asset.visibility !== "archived"), [assets]);
  const serviceAssets = useMemo(
    () => assets.filter((asset) => asset.type === "ai-service" && asset.tags.includes("agent") && asset.visibility !== "archived"),
    [assets]
  );

  const updateConfig = (patch: Partial<AgentConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setFlowStage("draft");
    setEvaluationResult(null);
    setStatusMessage("Alteracoes no builder ainda nao foram salvas.");
  };

  const toggleTool = (toolId: AgentToolId) => {
    const enabled = new Set(config.enabledTools);
    if (enabled.has(toolId)) enabled.delete(toolId);
    else enabled.add(toolId);
    updateConfig({ enabledTools: Array.from(enabled) });
  };

  const runTest = () => {
    setRunResult(runAgent(config, testInput, assets));
    setFlowStage("tested");
    setStatusMessage("Teste executado. Revise os traces e salve o agente quando estiver satisfeito.");
  };

  const runEvaluation = () => {
    if (evaluationResult) return;
    const result = evaluateAgent(config, defaultEvaluationCases, assets);
    setEvaluationResult(result);
    setFlowStage("evaluated");
    setStatusMessage(`Avaliacao concluida: ${result.passed}/${result.passed + result.failed} casos passaram.`);
    onRegisterAgentEvaluation({ config, result });
  };

  const saveAgent = () => {
    onSaveAgentAsset(config);
    setFlowStage("saved");
    setStatusMessage("Agente salvo como asset. O deploy agora fica vinculado a esse agente.");
  };

  const deployAgent = () => {
    if (flowStage === "draft" || flowStage === "tested") return;
    onDeployAgentService(config);
    setFlowStage("deployed");
    setStatusMessage("AI service do agente criado no catalogo local.");
  };

  const loadAgent = (asset: Asset) => {
    setConfig(configFromAsset(asset));
    setRunResult(null);
    setEvaluationResult(null);
    setFlowStage("saved");
    setStatusMessage(`${asset.name} carregado no builder.`);
  };

  const flowSteps: Array<{ id: AgentFlowStage; label: string }> = [
    { id: "draft", label: "Configurar" },
    { id: "tested", label: "Testar" },
    { id: "saved", label: "Salvar" },
    { id: "evaluated", label: "Avaliar" },
    { id: "deployed", label: "Deploy" }
  ];
  const currentStepIndex = flowSteps.findIndex((step) => step.id === flowStage);

  return (
    <section className="agent-lab">
      <div className="panel agent-header">
        <div>
          <span className="eyebrow">MVP 7</span>
          <h2>Agent Lab</h2>
          <p>Workspace ativo: {activeWorkspaceName}. Crie agentes com ferramentas, guardrails, traces e avaliacao local.</p>
        </div>
        <div className="agent-header-actions">
          <button className="button secondary" onClick={saveAgent} type="button">
            <Save size={16} />
            Salvar agente
          </button>
          <button
            className="button primary"
            disabled={flowStage === "draft" || flowStage === "tested"}
            onClick={deployAgent}
            title={flowStage === "draft" || flowStage === "tested" ? "Salve o agente antes do deploy." : undefined}
            type="button"
          >
            <Rocket size={16} />
            Deploy AI service
          </button>
        </div>
      </div>

      <section className="panel agent-flow-panel">
        <div className="agent-flow">
          {flowSteps.map((step, index) => (
            <span className={index <= currentStepIndex ? "done" : ""} key={step.id}>
              {step.label}
            </span>
          ))}
        </div>
        <p>{statusMessage}</p>
      </section>

      <div className="agent-grid">
        <main className="agent-main">
          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Builder visual</h2>
                <HelpTip
                  body="Define identidade, objetivo, instrucoes, modelo e ferramentas que o agente pode usar."
                  title="Builder de agente"
                />
              </div>
              <Bot size={18} />
            </div>
            <div className="agent-form-grid">
              <label>
                Nome
                <input value={config.name} onChange={(event) => updateConfig({ name: event.target.value })} />
              </label>
              <label>
                Modelo
                <select value={config.modelId} onChange={(event) => updateConfig({ modelId: event.target.value as AgentModelId })}>
                  {agentModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide-field">
                Objetivo
                <input value={config.objective} onChange={(event) => updateConfig({ objective: event.target.value })} />
              </label>
              <label className="wide-field">
                Instrucoes
                <textarea value={config.instructions} onChange={(event) => updateConfig({ instructions: event.target.value })} />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Catalogo de ferramentas</h2>
                <HelpTip
                  body="Escolha quais ferramentas o agente pode chamar durante o teste. Todas sao locais ou mockadas neste MVP."
                  title="Ferramentas"
                />
              </div>
              <Wrench size={18} />
            </div>
            <div className="tool-catalog">
              {agentToolCatalog.map((tool) => (
                <label className={config.enabledTools.includes(tool.id) ? "tool-card active" : "tool-card"} key={tool.id}>
                  <input checked={config.enabledTools.includes(tool.id)} onChange={() => toggleTool(tool.id)} type="checkbox" />
                  <strong>{tool.name}</strong>
                  <span>risco {tool.risk}</span>
                  <p>{tool.description}</p>
                </label>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Test console</h2>
                <HelpTip
                  body="Executa uma pergunta contra o agente e mostra etapas, chamadas de ferramenta, entradas, saidas e bloqueios."
                  title="Console de teste"
                />
              </div>
              <button className="button primary" onClick={runTest} type="button">
                <Play size={16} />
                Testar
              </button>
            </div>
            <label className="field-block">
              Entrada do usuario
              <textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} />
            </label>
            {runResult ? (
              <div className="agent-run">
                <div className="agent-response">
                  <strong>{runResult.status}</strong>
                  <span>{runResult.toolCalls} chamada(s) de ferramenta / {runResult.latencyMs}ms</span>
                  <pre>{runResult.response}</pre>
                </div>
                <div className="trace-list">
                  {runResult.traces.map((trace) => (
                    <article className={trace.status} key={trace.id}>
                      <span>{trace.stage}</span>
                      <strong>{trace.title}</strong>
                      <p>Input: {trace.input}</p>
                      <p>Output: {trace.output}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="empty-state">Rode um teste para ver resposta e traces.</p>
            )}
          </section>
        </main>

        <aside className="agent-side">
          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Guardrails</h2>
                <HelpTip
                  body="Restringe ferramentas, bloqueia palavras sensiveis, detecta PII e padroniza formato de resposta."
                  title="Guardrails"
                />
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="agent-form-grid single">
              <label>
                Limite de chamadas de ferramenta
                <input
                  min={0}
                  max={8}
                  type="number"
                  value={config.maxToolCalls}
                  onChange={(event) => updateConfig({ maxToolCalls: Number(event.target.value) })}
                />
              </label>
              <label>
                Palavras bloqueadas
                <input
                  value={config.blockedWords.join(", ")}
                  onChange={(event) =>
                    updateConfig({ blockedWords: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })
                  }
                />
              </label>
              <label>
                Formato
                <select value={config.outputFormat} onChange={(event) => updateConfig({ outputFormat: event.target.value as AgentOutputFormat })}>
                  <option value="bullets">Bullets</option>
                  <option value="plain">Texto</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input checked={config.detectPii} onChange={(event) => updateConfig({ detectPii: event.target.checked })} type="checkbox" />
                Bloquear PII
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Avaliacao</h2>
                <HelpTip
                  body="Roda casos fixos de regressao para validar se o agente responde, usa ferramentas e respeita guardrails."
                  title="Casos de teste"
                />
              </div>
              <button className="button secondary" disabled={Boolean(evaluationResult)} onClick={runEvaluation} type="button">
                <FlaskConical size={16} />
                {evaluationResult ? "Avaliado" : "Avaliar"}
              </button>
            </div>
            <div className="evaluation-list">
              {evaluationResult ? (
                <>
                  <div className="evaluation-score">
                    <strong>{evaluationResult.passed}/{evaluationResult.passed + evaluationResult.failed}</strong>
                    <span>casos passaram</span>
                  </div>
                  {evaluationResult.cases.map((item) => (
                    <article key={item.id}>
                      <CheckCircle2 size={16} />
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.status === "passed" ? "passou" : "falhou"} / {item.reason}</span>
                      </div>
                    </article>
                  ))}
                </>
              ) : (
                defaultEvaluationCases.map((item) => (
                  <article key={item.id}>
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>{item.name}</strong>
                      <span>espera: {item.expectedKeyword}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Catalogo governado</h2>
                <HelpTip
                  body="Mostra agentes e AI services registrados como assets locais com status e tags de governanca."
                  title="Catalogo"
                />
              </div>
            </div>
            <div className="governed-list">
              {[...agentAssets, ...serviceAssets].map((asset) => (
                <article key={asset.id}>
                  <strong>{asset.name}</strong>
                  <span>{asset.type} / {asset.status} / v{asset.version}</span>
                  <p>{asset.description}</p>
                  {asset.type === "agent" ? (
                    <button className="button secondary" onClick={() => loadAgent(asset)} type="button">
                      Abrir no builder
                    </button>
                  ) : (
                    <em>{asset.metadata?.endpoint ?? "AI service local"}</em>
                  )}
                </article>
              ))}
              {!agentAssets.length && !serviceAssets.length ? <p className="empty-state">Nenhum agente salvo ou service deployado.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
