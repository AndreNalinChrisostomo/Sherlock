import { useEffect, useMemo, useState } from "react";
import { DatabaseZap, FileSearch, FileUp, Layers3, Play, Rocket, Save, Search, Settings2 } from "lucide-react";
import {
  answerWithRag,
  buildVectorIndex,
  defaultIndexConfig,
  defaultRetrieverConfig,
  evaluateRagAnswer,
  searchVectorIndex,
  type LocalVectorIndex,
  type RagAnswer,
  type RagDocument,
  type RetrieverConfig,
  type VectorIndexConfig
} from "./ragLab";

const storageKey = "sherlock-rag-indexes";
const legacyStorageKey = "watson-clone-rag-indexes";

interface RagLabViewProps {
  onCreateVectorIndexAsset: (payload: { name: string; documentCount: number; chunkCount: number; embeddingModel: string }) => void;
  onPromoteRagService: (payload: { name: string; indexName: string; topK: number; threshold: number }) => void;
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

function loadStoredIndexes() {
  try {
    const raw = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
    return raw ? (JSON.parse(raw) as LocalVectorIndex[]) : [];
  } catch {
    return [];
  }
}

function PipelineNode({ label, detail, status }: { label: string; detail: string; status: "done" | "active" | "blocked" | "idle" }) {
  return (
    <article className={status}>
      <strong>{label}</strong>
      <span>{detail}</span>
      <em>{status === "blocked" ? "Bloqueado" : status === "done" ? "Pronto" : status === "active" ? "Ativo" : "Aguardando"}</em>
    </article>
  );
}

export function RagLabView({ onCreateVectorIndexAsset, onPromoteRagService }: RagLabViewProps) {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [indexes, setIndexes] = useState<LocalVectorIndex[]>(() => loadStoredIndexes());
  const [selectedIndexId, setSelectedIndexId] = useState(indexes[0]?.id ?? "");
  const [indexName, setIndexName] = useState("support_rag_index");
  const [indexConfig, setIndexConfig] = useState<VectorIndexConfig>(defaultIndexConfig);
  const [retrieverConfig, setRetrieverConfig] = useState<RetrieverConfig>(defaultRetrieverConfig);
  const [query, setQuery] = useState("Quais problemas indicam prioridade alta?");
  const [answer, setAnswer] = useState<RagAnswer | null>(null);
  const [message, setMessage] = useState("");

  const selectedIndex = useMemo(
    () => indexes.find((index) => index.id === selectedIndexId) ?? indexes[0],
    [indexes, selectedIndexId]
  );
  const previewResults = selectedIndex ? searchVectorIndex(selectedIndex, query, retrieverConfig) : [];
  const evaluation = answer ? evaluateRagAnswer(answer) : null;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(indexes));
    localStorage.removeItem(legacyStorageKey);
  }, [indexes]);

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const loaded = await Promise.all(
      Array.from(files).map(async (file, index) => ({
        id: `doc-${Date.now()}-${index}`,
        title: file.name,
        text: await file.text(),
        metadata: {
          type: file.type || "text/plain",
          size: String(file.size),
          uploadedAt: new Date().toISOString()
        }
      }))
    );
    setDocuments((current) => [...loaded, ...current]);
    setMessage(`${loaded.length} documento(s) carregado(s) para grounding.`);
  };

  const createIndex = () => {
    const usableDocuments = documents.filter((document) => document.text.trim().length > 0);
    if (!usableDocuments.length) {
      setMessage("Carregue pelo menos um documento com texto antes de criar o indice.");
      return;
    }
    const index = buildVectorIndex(usableDocuments, indexConfig, {
      id: `local-rag-index-${Date.now()}`,
      name: indexName || "local_rag_index"
    });
    setIndexes((current) => [index, ...current]);
    setSelectedIndexId(index.id);
    setAnswer(null);
    setMessage(`Indice ${index.name} criado com ${index.chunks.length} chunks. Ele tambem aparece em Assets como vector-index.`);
    onCreateVectorIndexAsset({
      name: index.name,
      documentCount: index.documents.length,
      chunkCount: index.chunks.length,
      embeddingModel: index.config.embeddingModel
    });
  };

  const runQuery = () => {
    if (!selectedIndex) {
      setMessage("Crie ou selecione um indice antes de buscar.");
      return;
    }
    const nextAnswer = answerWithRag(selectedIndex, query, retrieverConfig);
    setAnswer(nextAnswer);
    setMessage(nextAnswer.emptyResponse ? "Busca concluida sem contexto suficiente." : "Resposta RAG gerada com citacoes.");
  };

  const promoteService = () => {
    if (!selectedIndex) {
      setMessage("Selecione um indice para promover como AI service.");
      return;
    }
    onPromoteRagService({
      name: `rag_service_${selectedIndex.name}`,
      indexName: selectedIndex.name,
      topK: retrieverConfig.topK,
      threshold: retrieverConfig.threshold
    });
    setMessage(`${selectedIndex.name} promovido como AI service local. Abra Assets para ver o servico criado.`);
  };

  return (
    <section className="rag-lab">
      <div className="panel rag-header">
        <div>
          <span className="eyebrow">RAG Lab</span>
          <h2>Indices vetoriais e grounding local</h2>
          <p>Carregue documentos, crie chunks, gere embeddings locais, busque trechos relevantes e teste respostas com citacoes.</p>
        </div>
        <div className="rag-header-actions">
          <label className="upload-button">
            <FileUp size={16} />
            Upload documentos
            <input accept=".txt,.md,.csv,.json,.jsonl" multiple onChange={(event) => void readFiles(event.target.files)} type="file" />
          </label>
          <button className="button secondary" onClick={createIndex} type="button">
            <Save size={16} />
            Criar indice
          </button>
          <button className="button primary" onClick={runQuery} type="button">
            <Play size={16} />
            Buscar
          </button>
        </div>
      </div>

      {message ? <div className="status-message">{message}</div> : null}

      <div className="rag-grid">
        <main className="rag-main">
          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Documentos</h2>
                <HelpTip
                  body="Arquivos carregados viram fontes de grounding. Nesta versao, textos, Markdown, CSV, JSON e JSONL sao lidos no navegador."
                  title="Upload de documentos"
                />
              </div>
              <FileSearch size={18} />
            </div>
            <div className="document-list">
              <label className="field-block rag-visible-upload">
                <span>Selecionar documentos locais</span>
                <input accept=".txt,.md,.csv,.json,.jsonl" multiple onChange={(event) => void readFiles(event.target.files)} type="file" />
              </label>
              {documents.map((document) => (
                <article key={document.id}>
                  <strong>{document.title}</strong>
                  <span>{document.text.length.toLocaleString("pt-BR")} caracteres · {document.metadata.type}</span>
                  <p>{document.text.slice(0, 220)}{document.text.length > 220 ? "..." : ""}</p>
                </article>
              ))}
              {!documents.length ? <p className="empty-state">Carregue documentos para construir um indice vetorial local.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Pipeline RAG</h2>
                <HelpTip
                  body="Mostra o fluxo executavel: entrada do usuario, retrieve no indice, montagem do contexto, geracao e resposta com fontes."
                  title="Pipeline visual"
                />
              </div>
              <Layers3 size={18} />
            </div>
            <div className="rag-pipeline">
              <PipelineNode status={query.trim().length > 0 ? "done" : "blocked"} detail="Pergunta do usuario" label="Input" />
              <PipelineNode status={selectedIndex ? "done" : "blocked"} detail={selectedIndex ? `${selectedIndex.chunks.length} chunks indexados` : "crie um indice primeiro"} label="Retrieve" />
              <PipelineNode status={!selectedIndex ? "blocked" : previewResults.length > 0 ? "done" : "idle"} detail={`${previewResults.length} trechos candidatos`} label="Contexto" />
              <PipelineNode status={!selectedIndex || !previewResults.length ? "blocked" : answer ? "done" : "idle"} detail={answer ? "resposta gerada" : "execute Buscar"} label="Generate" />
              <PipelineNode status={answer?.results.length ? "done" : "blocked"} detail={answer?.results.length ? "citacoes anexadas" : "sem citacoes ainda"} label="Output" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Busca semantica</h2>
                <HelpTip
                  body="Consulta o indice vetorial local usando similaridade por embedding hash. Ajuste top-k, threshold e filtro no painel lateral."
                  title="Busca e preview"
                />
              </div>
              <Search size={18} />
            </div>
            <label className="field-block">
              <span>Pergunta</span>
              <textarea onChange={(event) => setQuery(event.target.value)} rows={4} value={query} />
            </label>
            <div className="rag-results-grid">
              {previewResults.map((result) => (
                <article key={result.chunk.id}>
                  <strong>{result.citation}</strong>
                  <span>score {result.score}</span>
                  <p>{result.chunk.text}</p>
                </article>
              ))}
              {selectedIndex && !previewResults.length ? <p className="empty-state">Nenhum trecho acima do threshold atual.</p> : null}
              {!selectedIndex ? <p className="empty-state">Crie um indice para visualizar trechos recuperados.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Resposta grounded</h2>
                <HelpTip
                  body="Gera uma resposta usando apenas os trechos recuperados e inclui citacoes para auditar a origem."
                  title="Resposta com citacoes"
                />
              </div>
              <DatabaseZap size={18} />
            </div>
            {answer ? (
              <div className="rag-answer">
                <pre>{answer.answer}</pre>
                <div className="rag-metrics">
                  <article>
                    <strong>{evaluation?.groundedness}</strong>
                    <span>groundedness</span>
                  </article>
                  <article>
                    <strong>{evaluation?.relevance}</strong>
                    <span>relevancia</span>
                  </article>
                  <article>
                    <strong>{evaluation?.citationCount}</strong>
                    <span>citacoes</span>
                  </article>
                  <article>
                    <strong>{evaluation?.latencyMs} ms</strong>
                    <span>latencia</span>
                  </article>
                </div>
              </div>
            ) : (
              <p className="empty-state">Execute uma busca para gerar resposta, citacoes e avaliacao.</p>
            )}
          </section>
        </main>

        <aside className="rag-side">
          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Chunking</h2>
                <HelpTip
                  body="Define o tamanho dos trechos e a sobreposicao. Chunks menores melhoram precisao, chunks maiores preservam contexto."
                  title="Configuracao do indice"
                />
              </div>
              <Settings2 size={18} />
            </div>
            <div className="rag-form-grid">
              <label>
                <span>Nome do indice</span>
                <input onChange={(event) => setIndexName(event.target.value)} value={indexName} />
              </label>
              <label>
                <span>Chunk size</span>
                <input min="20" onChange={(event) => setIndexConfig((current) => ({ ...current, chunkSize: Number(event.target.value) }))} type="number" value={indexConfig.chunkSize} />
              </label>
              <label>
                <span>Overlap</span>
                <input min="0" onChange={(event) => setIndexConfig((current) => ({ ...current, overlap: Number(event.target.value) }))} type="number" value={indexConfig.overlap} />
              </label>
              <label>
                <span>Dimensoes</span>
                <input min="8" onChange={(event) => setIndexConfig((current) => ({ ...current, dimensions: Number(event.target.value) }))} type="number" value={indexConfig.dimensions} />
              </label>
              <label>
                <span>Embedding</span>
                <select onChange={(event) => setIndexConfig((current) => ({ ...current, embeddingModel: event.target.value }))} value={indexConfig.embeddingModel}>
                  <option value="mock-hash-embedding">mock-hash-embedding</option>
                  <option value="mock-keyword-embedding">mock-keyword-embedding</option>
                </select>
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Retriever</h2>
                <HelpTip
                  body="Controla quantos trechos voltam, o score minimo e um filtro textual para restringir fontes."
                  title="Configuracao de busca"
                />
              </div>
            </div>
            <div className="rag-form-grid">
              <label>
                <span>Indice ativo</span>
                <select onChange={(event) => setSelectedIndexId(event.target.value)} value={selectedIndex?.id ?? ""}>
                  {indexes.map((index) => (
                    <option key={index.id} value={index.id}>
                      {index.name}
                    </option>
                  ))}
                  {!indexes.length ? <option value="">Nenhum indice</option> : null}
                </select>
              </label>
              <label>
                <span>Top-k</span>
                <input min="1" onChange={(event) => setRetrieverConfig((current) => ({ ...current, topK: Number(event.target.value) }))} type="number" value={retrieverConfig.topK} />
              </label>
              <label>
                <span>Threshold</span>
                <input max="1" min="-1" onChange={(event) => setRetrieverConfig((current) => ({ ...current, threshold: Number(event.target.value) }))} step="0.01" type="number" value={retrieverConfig.threshold} />
              </label>
              <label>
                <span>Filtro</span>
                <input onChange={(event) => setRetrieverConfig((current) => ({ ...current, filter: event.target.value }))} placeholder="nome, tag ou termo" value={retrieverConfig.filter} />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Indices locais</h2>
                <HelpTip
                  body="Lista os indices armazenados no navegador. Ao criar um indice, tambem e criado um asset vector-index no inventario."
                  title="Armazenamento local"
                />
              </div>
            </div>
            <div className="index-list">
              {indexes.map((index) => (
                <button className={selectedIndex?.id === index.id ? "active" : ""} key={index.id} onClick={() => setSelectedIndexId(index.id)} type="button">
                  <strong>{index.name}</strong>
                  <span>{index.documents.length} docs · {index.chunks.length} chunks · {index.config.embeddingModel}</span>
                </button>
              ))}
              {!indexes.length ? <p className="empty-state">Nenhum indice salvo nesta maquina.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="title-row">
                <h2>Promover</h2>
                <HelpTip
                  body="Cria um AI service local baseado no indice e nas configuracoes atuais para uso em deployments futuros."
                  title="AI service"
                />
              </div>
              <Rocket size={18} />
            </div>
            <button className="button primary full-width-button" onClick={promoteService} type="button">
              <Rocket size={16} />
              Promover RAG como AI service
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}
