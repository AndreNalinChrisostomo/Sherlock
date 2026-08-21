import { useMemo, useState } from "react";
import { BookOpen, Bot, Copy, FileText, MessageSquare, Play, Save, SlidersHorizontal, Split, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Asset } from "./domain";
import {
  defaultPromptParameters,
  exportDeploymentNotebook,
  extractPromptVariables,
  promptModels,
  promptSamples,
  renderPromptTemplate,
  runPrompt,
  type PromptMode,
  type PromptParameters,
  type PromptRun,
  type PromptTask
} from "./promptLab";

interface PromptTemplatePayload {
  name: string;
  description: string;
  template: string;
  variables: string[];
  modelId: string;
  parameters: PromptParameters;
  mode: PromptMode;
  task: PromptTask;
}

interface NotebookPayload {
  name: string;
  notebook: string;
  modelId: string;
  usesRag: boolean;
}

interface PromptLabViewProps {
  assets: Asset[];
  onSavePromptAsset: (payload: PromptTemplatePayload) => void;
  onExportNotebookAsset: (payload: NotebookPayload) => void;
}

const taskLabels: Record<PromptTask, string> = {
  classification: "Classificacao",
  extraction: "Extracao",
  generation: "Geracao",
  "question-answering": "Pergunta-resposta",
  summarization: "Sumarizacao"
};

const modeLabels: Record<PromptMode, string> = {
  freeform: "Livre",
  structured: "Estruturado",
  chat: "Chat"
};

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

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </article>
  );
}

export function PromptLabView({ assets, onExportNotebookAsset, onSavePromptAsset }: PromptLabViewProps) {
  const [mode, setMode] = useState<PromptMode>("structured");
  const [task, setTask] = useState<PromptTask>("classification");
  const initialSample = promptSamples.find((sample) => sample.task === "classification") ?? promptSamples[0];
  const [template, setTemplate] = useState(initialSample.template);
  const [freePrompt, setFreePrompt] = useState("Analise os principais riscos do ticket e sugira a proxima acao.");
  const [chatInput, setChatInput] = useState("Quais tickets parecem mais urgentes?");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "Abra um indice local ou escreva uma pergunta para testar o modelo." }
  ]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>(initialSample.variables);
  const [modelId, setModelId] = useState(promptModels[0].id);
  const [compareModelId, setCompareModelId] = useState(promptModels[1].id);
  const [parameters, setParameters] = useState<PromptParameters>(defaultPromptParameters);
  const [compareTemperature, setCompareTemperature] = useState(0.75);
  const [useRag, setUseRag] = useState(true);
  const vectorAssets = assets.filter((asset) => asset.type === "vector-index" && asset.visibility !== "archived");
  const [selectedVectorAssetId, setSelectedVectorAssetId] = useState(vectorAssets[0]?.id ?? "");
  const [runs, setRuns] = useState<PromptRun[]>([]);
  const [compareRuns, setCompareRuns] = useState<PromptRun[]>([]);
  const variables = useMemo(() => extractPromptVariables(template), [template]);
  const currentModel = promptModels.find((model) => model.id === modelId) ?? promptModels[0];
  const latestRun = runs[0];

  const renderedPrompt = mode === "structured" ? renderPromptTemplate(template, variableValues) : mode === "freeform" ? freePrompt : chatInput;

  const updateParameter = (key: keyof PromptParameters, value: string | number) => {
    setParameters((current) => ({
      ...current,
      [key]: typeof current[key] === "number" ? Number(value) : String(value)
    }));
  };

  const applySample = (sampleTask: PromptTask) => {
    const sample = promptSamples.find((item) => item.task === sampleTask) ?? promptSamples[0];
    setTask(sample.task);
    setMode("structured");
    setTemplate(sample.template);
    setVariableValues(sample.variables);
  };

  const executePrompt = () => {
    const run = runPrompt({
      mode,
      task,
      prompt: renderedPrompt,
      modelId,
      parameters,
      assets,
      useRag,
      selectedVectorAssetId: selectedVectorAssetId || undefined
    });
    setRuns((current) => [run, ...current].slice(0, 12));
    if (mode === "chat") {
      setChatMessages((current) => [
        ...current,
        { role: "user", content: chatInput },
        { role: "assistant", content: run.response }
      ]);
    }
  };

  const comparePrompt = () => {
    const baseRun = runPrompt({
      mode,
      task,
      prompt: renderedPrompt,
      modelId,
      parameters,
      assets,
      useRag,
      selectedVectorAssetId: selectedVectorAssetId || undefined
    });
    const variantRun = runPrompt({
      mode,
      task,
      prompt: renderedPrompt,
      modelId: compareModelId,
      parameters: { ...parameters, temperature: compareTemperature },
      assets,
      useRag,
      selectedVectorAssetId: selectedVectorAssetId || undefined
    });
    setCompareRuns([baseRun, variantRun]);
    setRuns((current) => [baseRun, variantRun, ...current].slice(0, 12));
  };

  const updateRun = (runId: string, patch: Partial<PromptRun>) => {
    setRuns((current) => current.map((run) => (run.id === runId ? { ...run, ...patch } : run)));
  };

  const saveTemplate = () => {
    onSavePromptAsset({
      name: `prompt_${task}_${Date.now()}`,
      description: `Template criado no Prompt Lab para ${taskLabels[task].toLowerCase()}.`,
      template: mode === "structured" ? template : renderedPrompt,
      variables,
      modelId,
      parameters,
      mode,
      task
    });
  };

  const exportNotebook = () => {
    const name = `deployment_prompt_${Date.now()}.ipynb`;
    onExportNotebookAsset({
      name,
      notebook: exportDeploymentNotebook({
        name,
        prompt: mode === "structured" ? template : renderedPrompt,
        modelId,
        parameters,
        useRag
      }),
      modelId,
      usesRag: useRag
    });
  };

  return (
    <section className="prompt-lab">
      <div className="panel prompt-header">
        <div>
          <span className="eyebrow">Prompt Lab</span>
          <h2>Experimentos com foundation models</h2>
          <p>Crie prompts, teste parametros, compare respostas e salve templates como assets locais.</p>
        </div>
        <div className="prompt-header-actions">
          <button className="button secondary" onClick={saveTemplate} type="button">
            <Save size={16} />
            Salvar template
          </button>
          <button className="button secondary" onClick={exportNotebook} type="button">
            <FileText size={16} />
            Exportar notebook
          </button>
          <button className="button primary" onClick={executePrompt} type="button">
            <Play size={16} />
            Executar
          </button>
        </div>
      </div>

      <div className="prompt-grid">
        <div className="prompt-main">
          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Editor</h2>
                <HelpTip
                  body="Area principal para escrever prompt livre, testar um template com variaveis ou conversar no modo chat."
                  title="Editor de prompt"
                />
              </div>
              <div className="segmented-control" aria-label="Modo do prompt">
                {(Object.keys(modeLabels) as PromptMode[]).map((item) => (
                  <button className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)} type="button">
                    {modeLabels[item]}
                  </button>
                ))}
              </div>
            </div>

            <div className="sample-grid" aria-label="Amostras por tarefa">
              {promptSamples.map((sample) => (
                <button className={task === sample.task ? "active" : ""} key={sample.task} onClick={() => applySample(sample.task)} type="button">
                  <BookOpen size={15} />
                  <span>{sample.label}</span>
                </button>
              ))}
            </div>

            {mode === "freeform" ? (
              <label className="field-block">
                <span>Prompt livre</span>
                <textarea onChange={(event) => setFreePrompt(event.target.value)} rows={10} value={freePrompt} />
              </label>
            ) : null}

            {mode === "structured" ? (
              <div className="structured-editor">
                <label className="field-block">
                  <span>Template com variaveis no formato {"{{variavel}}"}</span>
                  <textarea onChange={(event) => setTemplate(event.target.value)} rows={9} value={template} />
                </label>
                <div className="variable-panel">
                  <div className="title-row">
                    <h3>Formulario de teste</h3>
                    <HelpTip
                      body="Cada variavel encontrada no template vira um campo para testar o prompt sem editar o texto principal."
                      title="Variaveis"
                    />
                  </div>
                  {variables.length ? (
                    <div className="variable-grid">
                      {variables.map((name) => (
                        <label className="field-block compact" key={name}>
                          <span>{name}</span>
                          <input
                            onChange={(event) => setVariableValues((current) => ({ ...current, [name]: event.target.value }))}
                            value={variableValues[name] ?? ""}
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-text">Nenhuma variavel encontrada.</p>
                  )}
                </div>
              </div>
            ) : null}

            {mode === "chat" ? (
              <div className="chat-workspace">
                <div className="chat-thread" aria-label="Historico do chat">
                  {chatMessages.map((message, index) => (
                    <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                      <strong>{message.role === "user" ? "Voce" : "Assistente"}</strong>
                      <p>{message.content}</p>
                    </article>
                  ))}
                </div>
                <label className="field-block">
                  <span>Mensagem</span>
                  <textarea onChange={(event) => setChatInput(event.target.value)} rows={4} value={chatInput} />
                </label>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Resposta</h2>
                <HelpTip
                  body="Mostra a ultima resposta simulada, os documentos usados como contexto e metricas para avaliar custo e qualidade."
                  title="Resultado"
                />
              </div>
              <Bot size={18} />
            </div>
            {latestRun ? (
              <div className="run-output">
                <div className="metric-grid">
                  <MetricCard detail="tempo simulado" label="Latencia" value={`${latestRun.latencyMs} ms`} />
                  <MetricCard detail={`${latestRun.inputTokens} entrada / ${latestRun.outputTokens} saida`} label="Tokens" value={`${latestRun.inputTokens + latestRun.outputTokens}`} />
                  <MetricCard detail="estimativa local" label="Custo" value={`$${latestRun.estimatedCost.toFixed(6)}`} />
                  <MetricCard detail={taskLabels[latestRun.task]} label="Tarefa" value={latestRun.modelName} />
                </div>
                <pre>{latestRun.response}</pre>
                <div className="rag-results">
                  <strong>Contexto recuperado</strong>
                  {latestRun.retrievedDocuments.length ? (
                    latestRun.retrievedDocuments.map((document) => (
                      <article key={document.assetId}>
                        <span>{document.title}</span>
                        <p>{document.excerpt}</p>
                        <em>score {document.score}</em>
                      </article>
                    ))
                  ) : (
                    <p className="muted-text">Nenhum documento foi usado nesta execucao.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="empty-state">Execute um prompt para ver resposta, metricas, contexto RAG e avaliacao.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Comparacao</h2>
                <HelpTip
                  body="Executa o mesmo prompt com outro modelo ou temperatura para comparar resposta, latencia, tokens e custo."
                  title="Comparar respostas"
                />
              </div>
              <button className="button secondary" onClick={comparePrompt} type="button">
                <Split size={16} />
                Comparar
              </button>
            </div>
            <div className="comparison-controls">
              <label>
                <span>Modelo alternativo</span>
                <select onChange={(event) => setCompareModelId(event.target.value)} value={compareModelId}>
                  {promptModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Temperature alternativa</span>
                <input max="1" min="0" onChange={(event) => setCompareTemperature(Number(event.target.value))} step="0.05" type="number" value={compareTemperature} />
              </label>
            </div>
            <div className="comparison-grid">
              {compareRuns.map((run) => (
                <article key={run.id}>
                  <strong>{run.modelName}</strong>
                  <span>
                    {run.latencyMs} ms · {run.inputTokens + run.outputTokens} tokens · ${run.estimatedCost.toFixed(6)}
                  </span>
                  <p>{run.response}</p>
                </article>
              ))}
              {!compareRuns.length ? <p className="empty-state">Clique em Comparar para gerar duas respostas lado a lado.</p> : null}
            </div>
          </section>
        </div>

        <aside className="prompt-side">
          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Modelo</h2>
                <HelpTip
                  body="Seleciona o foundation model simulado usado para executar o prompt. Cada modelo tem janela e custo estimado diferentes."
                  title="Foundation model"
                />
              </div>
              <SlidersHorizontal size={18} />
            </div>
            <label className="field-block">
              <span>Foundation model</span>
              <select onChange={(event) => setModelId(event.target.value)} value={modelId}>
                {promptModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="model-summary">
              <strong>{currentModel.provider}</strong>
              <span>{currentModel.contextWindow.toLocaleString("pt-BR")} tokens de contexto</span>
              <p>{currentModel.strengths.join(", ")}</p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Parametros</h2>
                <HelpTip
                  body="Controla criatividade, limite de resposta, amostragem, parada e reprodutibilidade da execucao."
                  title="Parametros de inferencia"
                />
              </div>
            </div>
            <div className="parameter-grid">
              <label>
                <span>Temperature</span>
                <input max="1" min="0" onChange={(event) => updateParameter("temperature", event.target.value)} step="0.05" type="range" value={parameters.temperature} />
                <em>{parameters.temperature}</em>
              </label>
              <label>
                <span>Top-p</span>
                <input max="1" min="0.1" onChange={(event) => updateParameter("topP", event.target.value)} step="0.05" type="range" value={parameters.topP} />
                <em>{parameters.topP}</em>
              </label>
              <label>
                <span>Max tokens</span>
                <input min="32" onChange={(event) => updateParameter("maxTokens", event.target.value)} step="16" type="number" value={parameters.maxTokens} />
              </label>
              <label>
                <span>Seed</span>
                <input min="0" onChange={(event) => updateParameter("seed", event.target.value)} type="number" value={parameters.seed} />
              </label>
              <label className="wide-field">
                <span>Stop sequences</span>
                <input onChange={(event) => updateParameter("stopSequences", event.target.value)} placeholder="###, END" value={parameters.stopSequences} />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Documentos</h2>
                <HelpTip
                  body="Ativa grounding local usando assets de indice vetorial. A resposta mostra quais trechos foram recuperados."
                  title="Chat com documentos"
                />
              </div>
              <MessageSquare size={18} />
            </div>
            <label className="toggle-row">
              <input checked={useRag} onChange={(event) => setUseRag(event.target.checked)} type="checkbox" />
              <span>Usar indice vetorial local</span>
            </label>
            <label className="field-block">
              <span>Indice</span>
              <select disabled={!vectorAssets.length} onChange={(event) => setSelectedVectorAssetId(event.target.value)} value={selectedVectorAssetId}>
                {vectorAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
                {!vectorAssets.length ? <option value="">Nenhum indice disponivel</option> : null}
              </select>
            </label>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Historico</h2>
                <HelpTip
                  body="Guarda as execucoes desta sessao com metricas, avaliacao manual e notas. Prompts so viram asset ao salvar."
                  title="Historico da sessao"
                />
              </div>
              <Copy size={18} />
            </div>
            <div className="history-list">
              {runs.map((run) => (
                <article key={run.id}>
                  <strong>{run.modelName}</strong>
                  <span>
                    {new Date(run.createdAt).toLocaleTimeString("pt-BR")} · {run.latencyMs} ms · ${run.estimatedCost.toFixed(6)}
                  </span>
                  <div className="rating-row">
                    <button className={run.rating === "up" ? "active" : ""} onClick={() => updateRun(run.id, { rating: "up" })} type="button">
                      <ThumbsUp size={15} />
                      Bom
                    </button>
                    <button className={run.rating === "down" ? "active" : ""} onClick={() => updateRun(run.id, { rating: "down" })} type="button">
                      <ThumbsDown size={15} />
                      Ruim
                    </button>
                  </div>
                  <textarea
                    aria-label="Notas humanas da execucao"
                    onChange={(event) => updateRun(run.id, { notes: event.target.value })}
                    placeholder="Notas humanas..."
                    rows={2}
                    value={run.notes}
                  />
                </article>
              ))}
              {!runs.length ? <p className="empty-state">Nenhuma execucao nesta sessao.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
