import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  Gauge,
  GitCompare,
  Network,
  Play,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  WandSparkles
} from "lucide-react";
import type { Asset } from "./domain";
import { deleteRlEnvironment, listConnectedRlEnvironments, listSavedTrainerModels, saveTrainerModel, type ConnectedRlEnvironment, type SavedRlModel } from "./reinforcementApi";
import {
  algorithmLabels,
  algorithmsForTask,
  columnsFromAsset,
  defaultAutoAiConfig,
  defaultVisualNodes,
  explainWinner,
  isUnsupervisedTask,
  metricsForTask,
  recommendExperiment,
  solveOptimization,
  taskLabels
} from "./autoAi";
import type {
  AlgorithmId,
  AutoAiConfig,
  AutoAiTask,
  OptimizationConfig,
  ReinforcementConfig,
  TrialResult,
  VisualNode
} from "./autoAi";

type AutoAiTab = "create" | "experiment" | "visual" | "reinforcement" | "optimization";

interface AutoAiViewProps {
  activeWorkspaceName: string;
  dataAssets: Asset[];
  onSaveModel: (payload: { config: AutoAiConfig; trial: TrialResult; explanation: string }) => void;
}

function Help({ children, title }: { children: string; title: string }) {
  return (
    <span className="autoai-help">
      <button aria-label={`Ajuda: ${title}`} type="button"><CircleHelp size={15} /></button>
      <span role="tooltip"><strong>{title}</strong>{children}</span>
    </span>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="autoai-toggle">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function NumberList({ label, onChange, value }: { label: string; onChange: (value: number[]) => void; value: number[] }) {
  return (
    <label>
      {label}
      <input
        onChange={(event) => onChange(event.target.value.split(",").map(Number).filter(Number.isFinite))}
        value={value.join(", ")}
      />
    </label>
  );
}

function metricPercent(metric: string, value: number) {
  return ["rmse", "mae", "mape", "smape", "log_loss", "davies_bouldin", "inertia", "reconstruction_error", "silhouette", "calinski_harabasz", "trustworthiness"].includes(metric) ? value.toFixed(4) : `${(value * 100).toFixed(2)}%`;
}

function Curve({ points, title }: { points?: Array<{ x: number; y: number }>; title: string }) {
  if (!points?.length) return <div className="autoai-empty">Nao aplicavel a esta tarefa.</div>;
  const path = points.map((point, index) => `${index ? "L" : "M"} ${28 + point.x * 250} ${178 - point.y * 140}`).join(" ");
  return (
    <div className="trial-curve">
      <strong>{title}</strong>
      <svg aria-label={title} role="img" viewBox="0 0 310 205">
        <line x1="28" x2="288" y1="178" y2="178" />
        <line x1="28" x2="28" y1="28" y2="178" />
        <path d={path} />
        <text x="140" y="200">Taxa / recall</text>
        <text x="3" y="20">Score</text>
      </svg>
    </div>
  );
}

function RegressionPlot({ trial }: { trial: TrialResult }) {
  const plot = trial.regressionPlot;
  const [showTrain, setShowTrain] = useState(true); const [showValidation, setShowValidation] = useState(true); const [showPrediction, setShowPrediction] = useState(true);
  if (!plot?.train.length) return null;
  const all = [...plot.train, ...plot.validation];
  const xs = all.map((point) => point.x); const ys = all.flatMap((point) => [point.actual, point.predicted]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const point = (item: { x: number; actual: number }) => `${40 + ((item.x - minX) / Math.max(maxX - minX, .001)) * 430},${220 - ((item.actual - minY) / Math.max(maxY - minY, .001)) * 180}`;
  const line = [...all].sort((a, b) => a.x - b.x).map((item, index) => `${index ? "L" : "M"}${40 + ((item.x - minX) / Math.max(maxX - minX, .001)) * 430},${220 - ((item.predicted - minY) / Math.max(maxY - minY, .001)) * 180}`).join(" ");
  return <section className="panel"><div className="panel-header"><div><span className="eyebrow">Regressao</span><h2>Treino, validacao e previsao</h2></div></div><div className="chart-key"><label><input checked={showTrain} onChange={(event) => setShowTrain(event.target.checked)} type="checkbox" />Treino</label><label><input checked={showValidation} onChange={(event) => setShowValidation(event.target.checked)} type="checkbox" />Validacao</label><label><input checked={showPrediction} onChange={(event) => setShowPrediction(event.target.checked)} type="checkbox" />Linha prevista</label></div><svg className="regression-plot" viewBox="0 0 500 250"><line x1="40" x2="470" y1="220" y2="220" /><line x1="40" x2="40" y1="20" y2="220" />{showPrediction ? <path d={line} /> : null}{showTrain ? plot.train.map((item, index) => <circle className="train-point" cx={point(item).split(",")[0]} cy={point(item).split(",")[1]} key={`train-${index}`} r="3" />) : null}{showValidation ? plot.validation.map((item, index) => <circle className="validation-point" cx={point(item).split(",")[0]} cy={point(item).split(",")[1]} key={`validation-${index}`} r="3" />) : null}</svg><div className="chart-key"><span><i className="train-key" />Treino</span><span><i className="validation-key" />Validacao</span><span><i className="prediction-key" />Linha prevista</span></div><p className="experiment-message">X: {plot.feature}. Cada ponto mostra o valor real; a linha mostra a previsao do modelo para aquela observacao.</p></section>;
}

function RegressionPlot3d({ trial }: { trial: TrialResult }) {
  const hostRef = useRef<HTMLDivElement>(null); const plot = trial.regressionPlot3d; const [showActual, setShowActual] = useState(true); const [showPredicted, setShowPredicted] = useState(true);
  useEffect(() => { const host = hostRef.current; if (!host || !plot) return; const scene = new THREE.Scene(); scene.background = new THREE.Color("#f8fafc"); const camera = new THREE.PerspectiveCamera(48, 1, .1, 100); camera.position.set(7, 6, 8); const renderer = new THREE.WebGLRenderer({ antialias: true }); host.replaceChildren(renderer.domElement); const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; scene.add(new THREE.AxesHelper(4)); scene.add(new THREE.GridHelper(8, 8)); const values = plot.points; const ranges = (key: "x" | "y" | "actual" | "predicted") => { const current = values.map((item) => item[key]); return [Math.min(...current), Math.max(...current)] as const; }; const [minX, maxX] = ranges("x"); const [minY, maxY] = ranges("y"); const [minZ, maxZ] = ranges("actual"); const predictedRange = ranges("predicted"); const toPoint = (item: { x: number; y: number; actual: number; predicted: number }, predicted = false) => new THREE.Vector3(((item.x - minX) / Math.max(maxX - minX, .001)) * 6 - 3, (((predicted ? item.predicted : item.actual) - Math.min(minZ, predictedRange[0])) / Math.max(Math.max(maxZ, predictedRange[1]) - Math.min(minZ, predictedRange[0]), .001)) * 6 - 3, ((item.y - minY) / Math.max(maxY - minY, .001)) * 6 - 3); values.forEach((item) => { if (showActual) { const actual = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 8), new THREE.MeshBasicMaterial({ color: item.validation ? "#da1e28" : "#198038" })); actual.position.copy(toPoint(item)); scene.add(actual); } if (showPredicted) { const predicted = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 8), new THREE.MeshBasicMaterial({ color: "#0f62fe" })); predicted.position.copy(toPoint(item, true)); scene.add(predicted); } }); const resize = () => { renderer.setSize(host.clientWidth, host.clientHeight, false); camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(host); resize(); let frame = 0; const render = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(render); }; render(); return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose(); host.replaceChildren(); }; }, [plot, showActual, showPredicted]);
  if (!plot) return null; return <section className="panel"><div className="panel-header"><div><span className="eyebrow">Regressao</span><h2>Treino e validacao em 3D</h2></div></div><div className="chart-key"><label><input checked={showActual} onChange={(event) => setShowActual(event.target.checked)} type="checkbox" />Pontos reais</label><label><input checked={showPredicted} onChange={(event) => setShowPredicted(event.target.checked)} type="checkbox" />Pontos previstos</label></div><div className="cluster-canvas" ref={hostRef} /><div className="chart-key"><span><i className="train-key" />Treino real</span><span><i className="validation-key" />Validacao real</span><span><i className="prediction-key" />Previsao do modelo</span></div><p className="experiment-message">Eixos: {plot.features[0]}, alvo e {plot.features[1]}. Pontos azuis sao previsoes; nao sao conectados porque duas features nao definem uma unica linha.</p></section>;
}

function ClusterProjection3d({ trial }: { trial: TrialResult }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const projection = trial.projection3d;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !projection) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f8fafc");
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(8, 7, 9);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.screenSpacePanning = true;
    controls.minDistance = 4;
    controls.maxDistance = 25;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AxesHelper(4.8));
    const grid = new THREE.GridHelper(9, 9, "#c7d2e2", "#e3eaf3");
    grid.position.y = -4.2;
    scene.add(grid);
    scene.add(new THREE.AmbientLight("#ffffff", 1.8));

    const palette = ["#0f62fe", "#198038", "#8a3ffc", "#d12771", "#ff832b", "#005d5d"];
    const positions = new Float32Array(projection.points.length * 3);
    const colors = new Float32Array(projection.points.length * 3);
    projection.points.forEach((point, index) => {
      positions.set([point.x, point.y, point.z], index * 3);
      const color = new THREE.Color(palette[point.cluster % palette.length]);
      colors.set([color.r, color.g, color.b], index * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.16, sizeAttenuation: true, vertexColors: true }));
    scene.add(cloud);

    const resize = () => {
      const { clientHeight, clientWidth } = host;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      renderer.dispose();
      host.replaceChildren();
    };
  }, [projection]);

  if (!projection) return null;
  return (
    <section className="panel cluster-projection-panel">
      <div className="panel-header"><div><span className="eyebrow">Exploracao nao supervisionada</span><div className="title-row"><h2>Projecao de clusters em 3D</h2><Help title="Grafico 3D">Cada ponto representa uma linha. Use o mouse para girar, a roda para aproximar e o botao direito para mover a camera.</Help></div></div><span className="badge success">{projection.clusterCount} grupos</span></div>
      <div className="cluster-canvas" ref={hostRef} role="img" aria-label={`Projecao 3D com ${projection.points.length} linhas em ${projection.clusterCount} grupos`} />
      <div className="cluster-projection-footer"><div className="three-axis-key"><span><i className="axis-x" />X: {projection.axes[0]}</span><span><i className="axis-y" />Y: {projection.axes[1]}</span><span><i className="axis-z" />Z: {projection.axes[2]}</span></div><p>K-Means com K={projection.clusterCount}: {projection.points.length} linhas da {projection.source === "asset-preview" ? "amostra do data asset" : "projecao demonstrativa"}. Cores representam os grupos encontrados.</p></div>
    </section>
  );
}

export function AutoAiView({ activeWorkspaceName, dataAssets, onSaveModel }: AutoAiViewProps) {
  const firstAsset = dataAssets[0];
  const [tab, setTab] = useState<AutoAiTab>("create");
  const [config, setConfig] = useState<AutoAiConfig>(() => defaultAutoAiConfig(firstAsset));
  const [advanced, setAdvanced] = useState(false);
  const [trials, setTrials] = useState<TrialResult[]>([]);
  const [selectedTrialIds, setSelectedTrialIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Configure o experimento e execute a fila de trials.");
  const [presets, setPresets] = useState<AutoAiConfig[]>(() => {
    try { return JSON.parse(window.localStorage.getItem("sherlock:autoai-presets") ?? window.localStorage.getItem("watson-clone:autoai-presets") ?? "[]") as AutoAiConfig[]; } catch { return []; }
  });
  const [nodes, setNodes] = useState<VisualNode[]>(defaultVisualNodes);
  const [nodeType, setNodeType] = useState<VisualNode["type"]>("transform");
  const [visualMessage, setVisualMessage] = useState("Fluxo pronto para validacao.");
  const [rlConfig, setRlConfig] = useState<ReinforcementConfig>({
    apiUrl: "/api",
    apiToken: "",
    environment: "ambiente-app-separado",
    agent: "q-learning",
    adversary: "self-play",
    rewardGoal: "Maximizar taxa de sucesso com robustez",
    episodes: 40,
    maxSteps: 120,
    learningRate: 0.12,
    discount: 0.99,
    exploration: 0.1,
    selfPlay: true,
    perturbation: 0.08
  });
  const [rlMessage, setRlMessage] = useState("Aguardando ambientes externos conectarem neste workspace.");
  const [rlEnvironments, setRlEnvironments] = useState<ConnectedRlEnvironment[]>([]);
  const [rlModels, setRlModels] = useState<SavedRlModel[]>([]);
  const [selectedRlSessionId, setSelectedRlSessionId] = useState("");
  const [rlLoading, setRlLoading] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationConfig>({ objective: "maximize", objectiveName: "Lucro total", variables: 12, constraints: 18, timeLimitSeconds: 30 });
  const [optimizationResult, setOptimizationResult] = useState<ReturnType<typeof solveOptimization> | null>(null);

  const selectedAsset = dataAssets.find((asset) => asset.id === config.datasetId) ?? firstAsset;
  const columns = useMemo(() => columnsFromAsset(selectedAsset), [selectedAsset]);
  const assetRows = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedAsset?.metadata?.rowsJson ?? selectedAsset?.metadata?.previewRows ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
    } catch { return []; }
  }, [selectedAsset]);
  const recommendation = useMemo(() => recommendExperiment(selectedAsset), [selectedAsset]);
  const issues = useMemo(() => {
    const next: string[] = [];
    if (!config.datasetId) next.push("Selecione um data asset.");
    if (!["rag", "agent", "reinforcement", "summarization", "extraction"].includes(config.task) && !isUnsupervisedTask(config.task) && !config.target) next.push("Selecione um alvo.");
    if (!config.features.length && config.task !== "reinforcement") next.push("Selecione features.");
    return next;
  }, [config]);
  const bestTrial = trials.find((trial) => trial.status === "Succeeded");
  const comparedTrials = selectedTrialIds.map((id) => trials.find((trial) => trial.id === id)).filter((trial): trial is TrialResult => Boolean(trial));

  const patchConfig = <K extends keyof AutoAiConfig>(key: K, value: AutoAiConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setTrials([]);
    setSelectedTrialIds([]);
    setProgress(0);
    setMessage("Configuracao alterada. Execute novamente para gerar resultados atualizados.");
  };

  const selectDataset = (assetId: string) => {
    const asset = dataAssets.find((item) => item.id === assetId);
    setConfig(defaultAutoAiConfig(asset));
    setTrials([]);
    setSelectedTrialIds([]);
  };

  const applyRecommendations = () => {
    setConfig((current) => ({ ...current, task: recommendation.task, target: recommendation.target, metric: recommendation.metric, features: recommendation.features }));
    setMessage("Recomendacoes aplicadas. Revise e execute o experimento.");
  };

  const runExperiment = async () => {
    if (issues.length) { setMessage(issues.join(" ")); return; }
    if (config.task === "reinforcement") {
      setMessage("Use a aba Adversarial / RL para executar o ambiente Q-learning.");
      return;
    }
    setRunning(true);
    setTrials([]);
    setProgress(5);
    setMessage("Preparando dados e validacao...");
    try {
      const response = await fetch("/api/autoai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, rows: assetRows })
      });
      const payload = await response.json() as TrialResult[] | { detail?: string };
      if (!response.ok || !Array.isArray(payload)) throw new Error(Array.isArray(payload) ? "Falha no motor local." : payload.detail || "Falha no motor local.");
      const generated = payload;
      setTrials(generated);
      setSelectedTrialIds(generated.slice(0, 2).map((trial) => trial.id));
      setProgress(100);
      setMessage(`${generated.length} trials reais concluidos pelo motor local. Tempos e metricas foram medidos durante esta execucao.`);
      setTab("experiment");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no treino local.");
    } finally {
      setRunning(false);
    }
  };

  const savePreset = () => {
    const next = [{ ...config, name: `${config.name} preset` }, ...presets.filter((item) => item.name !== `${config.name} preset`)].slice(0, 12);
    setPresets(next);
    window.localStorage.setItem("sherlock:autoai-presets", JSON.stringify(next));
    window.localStorage.removeItem("watson-clone:autoai-presets");
    setMessage("Preset salvo localmente.");
  };

  const toggleTrialComparison = (trialId: string) => {
    setSelectedTrialIds((current) => current.includes(trialId) ? current.filter((id) => id !== trialId) : current.length < 3 ? [...current, trialId] : current);
  };

  const saveBestModel = () => {
    if (!bestTrial) return;
    const explanation = explainWinner(bestTrial, config);
    onSaveModel({ config, trial: bestTrial, explanation });
    setMessage(`${config.name} salvo como model asset.`);
  };

  const rlApi = useMemo(() => ({ baseUrl: rlConfig.apiUrl || "/api", token: rlConfig.apiToken ?? "", environment: rlConfig.environment }), [rlConfig.apiToken, rlConfig.apiUrl, rlConfig.environment]);
  const rlWorkspaceId = activeWorkspaceName;

  const refreshRlMonitor = async (signal?: AbortSignal) => {
    setRlLoading(true);
    try {
      const [environmentPayload, modelPayload] = await Promise.all([
        listConnectedRlEnvironments(rlApi, rlWorkspaceId, signal),
        listSavedTrainerModels(rlApi, rlWorkspaceId, signal)
      ]);
      setRlEnvironments(environmentPayload.environments);
      setRlModels(modelPayload.models);
      setSelectedRlSessionId((current) => current || environmentPayload.environments[0]?.sessionId || "");
      setRlMessage(environmentPayload.environments.length ? `${environmentPayload.environments.length} ambiente(s) conectado(s) neste workspace.` : "Nenhum ambiente externo conectado neste workspace.");
    } catch (error) {
      if (!signal?.aborted) setRlMessage(error instanceof Error ? error.message : "Falha ao consultar ambientes RL.");
    } finally {
      if (!signal?.aborted) setRlLoading(false);
    }
  };

  const saveSelectedRlModel = async () => {
    const selected = rlEnvironments.find((environment) => environment.sessionId === selectedRlSessionId) ?? rlEnvironments[0];
    if (!selected) {
      setRlMessage("Nenhum ambiente conectado para salvar.");
      return;
    }
    try {
      const model = await saveTrainerModel(rlApi, selected.sessionId, `${selected.environment} - ${selected.candidateName}`);
      setRlMessage(`Modelo ${model.name} salvo. Conecte em ${model.actionUrl}.`);
      await refreshRlMonitor();
    } catch (error) {
      setRlMessage(error instanceof Error ? error.message : "Falha ao salvar modelo RL.");
    }
  };

  const deleteRlEnvironmentBySession = async (environment: ConnectedRlEnvironment) => {
    if (!environment) {
      setRlMessage("Nenhum ambiente conectado para deletar.");
      return;
    }
    try {
      await deleteRlEnvironment(rlApi, environment.sessionId);
      if (selectedRlSessionId === environment.sessionId) setSelectedRlSessionId("");
      setRlMessage(`Ambiente ${environment.environment} / ${environment.candidateName} deletado.`);
      await refreshRlMonitor();
    } catch (error) {
      setRlMessage(error instanceof Error ? error.message : "Falha ao deletar ambiente RL.");
    }
  };

  useEffect(() => {
    if (tab !== "reinforcement") return;
    const abort = new AbortController();
    void refreshRlMonitor(abort.signal);
    const timer = window.setInterval(() => void refreshRlMonitor(abort.signal), 2000);
    return () => {
      abort.abort();
      window.clearInterval(timer);
    };
  }, [tab, rlApi, rlWorkspaceId]);

  const moveNode = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return;
    setNodes((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const tabs: Array<{ id: AutoAiTab; label: string; icon: React.ElementType }> = [
    { id: "create", label: "Criar modelo", icon: WandSparkles },
    { id: "experiment", label: "Experimento", icon: FlaskConical },
    { id: "visual", label: "Visual Modeler", icon: Network },
    { id: "reinforcement", label: "Adversarial / RL", icon: ShieldCheck },
    { id: "optimization", label: "Otimizacao", icon: Target }
  ];

  return (
    <section className="autoai-shell">
      <div className="autoai-context">
        <div><span className="eyebrow">Workspace ativo</span><strong>{activeWorkspaceName}</strong><p>Experimentos e modelos ficam salvos neste projeto.</p></div>
        <div><span>Data assets</span><strong>{dataAssets.length}</strong></div>
        <div><span>Trials</span><strong>{trials.length}</strong></div>
        <div><span>Melhor score</span><strong>{bestTrial ? metricPercent(bestTrial.metric, bestTrial.score) : "-"}</strong></div>
      </div>

      <nav aria-label="Modulos do AutoAI" className="autoai-tabs">
        {tabs.map((item) => (
          <button aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button">
            <item.icon size={16} />{item.label}
          </button>
        ))}
      </nav>

      {tab === "create" ? (
        <div className="autoai-create-grid">
          <section className="panel autoai-builder">
            <div className="panel-header"><div><span className="eyebrow">Etapa 1</span><div className="title-row"><h2>Assistente no-code</h2><Help title="Assistente no-code">Define objetivo, dataset, alvo e metrica sem escrever codigo.</Help></div></div><Sparkles size={19} /></div>
            <div className="autoai-form-grid">
              <label>Nome do experimento<input onChange={(event) => patchConfig("name", event.target.value)} value={config.name} /></label>
              <label>Data asset<select onChange={(event) => selectDataset(event.target.value)} value={config.datasetId}><option value="">Selecione...</option>{dataAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
              <label>Tipo de tarefa<select onChange={(event) => { const task = event.target.value as AutoAiTask; setConfig((current) => ({ ...current, task, metric: metricsForTask(task)[0], target: isUnsupervisedTask(task) ? "" : current.target, algorithms: algorithmsForTask(task), validation: isUnsupervisedTask(task) ? "holdout" : current.validation, clusterCount: Math.max(2, current.clusterCount ?? 3) })); setTrials([]); setSelectedTrialIds([]); setProgress(0); setMessage("Configuracao alterada. Execute novamente para gerar resultados atualizados."); }} value={config.task}>{Object.entries(taskLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              {!isUnsupervisedTask(config.task) ? <label>Coluna alvo<select disabled={!columns.length} onChange={(event) => patchConfig("target", event.target.value)} value={config.target}><option value="">Nao aplicavel</option>{columns.map((column) => <option key={column.name} value={column.name}>{column.name} ({column.kind})</option>)}</select></label> : <div className="autoai-form-note"><strong>Sem coluna alvo</strong><span>Clustering encontra grupos a partir das features selecionadas.</span></div>}
              <label>Metrica principal<select onChange={(event) => patchConfig("metric", event.target.value)} value={config.metric}>{metricsForTask(config.task).map((metric) => <option key={metric}>{metric}</option>)}</select></label>
              <label>Validacao<select onChange={(event) => patchConfig("validation", event.target.value as AutoAiConfig["validation"])} value={config.validation}><option value="holdout">Holdout</option><option value="k-fold">K-fold</option><option value="stratified-k-fold">Stratified K-fold</option><option value="temporal">Temporal</option></select></label>
              {config.task === "clustering" ? <label>Numero de clusters<input max="12" min="2" onChange={(event) => patchConfig("clusterCount", Number(event.target.value))} type="number" value={config.clusterCount} /></label> : null}
            </div>

            <fieldset className="autoai-feature-picker"><legend>Features ({config.features.length})</legend>{columns.filter((item) => isUnsupervisedTask(config.task) || item.name !== config.target).map((item) => <label key={item.name}><input checked={config.features.includes(item.name)} onChange={(event) => patchConfig("features", event.target.checked ? [...config.features, item.name] : config.features.filter((feature) => feature !== item.name))} type="checkbox" /><span>{item.name}</span><em>{item.kind}</em></label>)}</fieldset>

            <div className="autoai-mode-header"><div><span className="eyebrow">Modo assistido</span><h3>Configuracao recomendada</h3></div><button className="button secondary" onClick={applyRecommendations} type="button"><WandSparkles size={15} />Aplicar recomendacoes</button></div>
            <div className="recommendation-grid"><article><strong>{taskLabels[recommendation.task]}</strong><span>Tarefa sugerida</span></article><article><strong>{recommendation.target || "n/a"}</strong><span>Alvo sugerido</span></article><article><strong>{recommendation.metric}</strong><span>Metrica sugerida</span></article><article><strong>{recommendation.features.length}</strong><span>Features sugeridas</span></article></div>
            <div className="recommendation-reasons">{recommendation.reasons.map((reason) => <span key={reason}><CheckCircle2 size={14} />{reason}</span>)}{recommendation.warnings.map((warning) => <span className="warning" key={warning}><Gauge size={14} />{warning}</span>)}</div>

            <div className="autoai-mode-header"><div><span className="eyebrow">Modo avancado</span><h3>Tecnicas de treino</h3></div><button className="button secondary" onClick={() => setAdvanced((current) => !current)} type="button"><SlidersHorizontal size={15} />{advanced ? "Ocultar" : "Configurar"}</button></div>
            {advanced ? <AdvancedConfig config={config} patchConfig={patchConfig} /> : null}

            <div className="autoai-footer-actions"><button className="button secondary" onClick={savePreset} type="button"><Save size={16} />Salvar preset</button><button className="button primary" disabled={running || Boolean(issues.length)} onClick={() => void runExperiment()} type="button"><Play size={16} />Executar AutoAI</button></div>
            {presets.length ? <div className="preset-list"><strong>Presets reutilizaveis</strong>{presets.map((preset) => <button key={preset.name} onClick={() => setConfig(preset)} type="button">{preset.name}<ChevronRight size={14} /></button>)}</div> : null}
          </section>

          <aside className="panel autoai-run-panel"><div className="panel-header"><div><span className="eyebrow">Fila</span><h2>Limites do experimento</h2></div><FlaskConical size={18} /></div><label>Maximo de trials<input max="60" min="1" onChange={(event) => patchConfig("maxTrials", Number(event.target.value))} type="number" value={config.maxTrials} /></label><label>Tempo maximo (min)<input min="1" onChange={(event) => patchConfig("timeLimitMinutes", Number(event.target.value))} type="number" value={config.timeLimitMinutes} /></label><label>Custo maximo<input min="0" onChange={(event) => patchConfig("costLimit", Number(event.target.value))} step="0.5" type="number" value={config.costLimit} /></label><label>Estrategia<select onChange={(event) => patchConfig("searchStrategy", event.target.value as AutoAiConfig["searchStrategy"])} value={config.searchStrategy}><option value="grid">Grid search</option><option value="random">Random search</option><option value="bayesian">Bayesian optimization</option></select></label><div className="autoai-progress"><span>{message}</span><div><i style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong></div>{issues.map((issue) => <p className="inline-error" key={issue}>{issue}</p>)}</aside>
        </div>
      ) : null}

      {tab === "experiment" ? <ExperimentView bestTrial={bestTrial} comparedTrials={comparedTrials} config={config} message={message} onCompare={toggleTrialComparison} onRun={() => void runExperiment()} onSave={saveBestModel} selectedTrialIds={selectedTrialIds} trials={trials} /> : null}
      {tab === "visual" ? <VisualModeler nodeType={nodeType} nodes={nodes} onAdd={() => setNodes((current) => [...current, { id: `node-${Date.now()}`, type: nodeType, label: nodeType, configuration: "Defina o que este bloco deve executar", enabled: true }])} onConfigure={(id, configuration) => setNodes((current) => current.map((node) => node.id === id ? { ...node, configuration } : node))} onMove={moveNode} onNodeType={setNodeType} onRemove={(id) => setNodes((current) => current.filter((node) => node.id !== id))} onRun={async () => { const runnable = nodes.some((node) => node.enabled && node.type === "training"); if (!runnable) { setVisualMessage("Adicione e ative um bloco de Treino para executar o fluxo."); return; } await runExperiment(); setVisualMessage("Fluxo executado: o ranking e as metricas foram gerados pelo motor local."); }} onToggle={(id) => setNodes((current) => current.map((node) => node.id === id ? { ...node, enabled: !node.enabled } : node))} visualMessage={visualMessage} /> : null}
      {tab === "reinforcement" ? <ReinforcementBuilder config={rlConfig} environments={rlEnvironments} loading={rlLoading} message={rlMessage} models={rlModels} onChange={setRlConfig} onDeleteEnvironment={(environment) => void deleteRlEnvironmentBySession(environment)} onRefresh={() => void refreshRlMonitor()} onSaveModel={() => void saveSelectedRlModel()} onSelectSession={setSelectedRlSessionId} selectedSessionId={selectedRlSessionId} workspaceId={rlWorkspaceId} /> : null}
      {tab === "optimization" ? <OptimizationBuilder config={optimization} onChange={setOptimization} onRun={() => setOptimizationResult(solveOptimization(optimization))} result={optimizationResult} /> : null}
    </section>
  );
}

function AdvancedConfig({ config, patchConfig }: { config: AutoAiConfig; patchConfig: <K extends keyof AutoAiConfig>(key: K, value: AutoAiConfig[K]) => void }) {
  const validationPercent = Math.min(90, Math.max(5, config.testSize));
  const trainPercent = 100 - validationPercent;
  const algorithms = algorithmsForTask(config.task);
  return (
    <div className="autoai-advanced">
      <fieldset><legend>Algoritmos candidatos</legend>{algorithms.map((algorithm) => <label key={algorithm}><input checked={config.algorithms.includes(algorithm)} onChange={(event) => patchConfig("algorithms", event.target.checked ? [...config.algorithms, algorithm] : config.algorithms.filter((item) => item !== algorithm))} type="checkbox" />{algorithmLabels[algorithm]}</label>)}</fieldset>
      <div className="autoai-form-grid"><label>Split treino / validacao<div className="split-slider"><input aria-label="Validacao" max="90" min="5" onChange={(event) => patchConfig("testSize", Number(event.target.value))} type="range" value={validationPercent} /><span>{trainPercent}% treino / {validationPercent}% validacao</span></div></label><label>Regularizacao<select onChange={(event) => patchConfig("regularization", event.target.value as AutoAiConfig["regularization"])} value={config.regularization}><option value="none">Nenhuma</option><option value="l1">L1</option><option value="l2">L2</option><option value="elastic-net">Elastic net</option><option value="weight-decay">Weight decay</option></select></label><label>Dropout<input max="0.9" min="0" onChange={(event) => patchConfig("dropout", Number(event.target.value))} step="0.05" type="number" value={config.dropout} /></label><label>Schedule<select onChange={(event) => patchConfig("learningRateSchedule", event.target.value as AutoAiConfig["learningRateSchedule"])} value={config.learningRateSchedule}><option value="constant">Constante</option><option value="step">Step</option><option value="cosine">Cosine</option><option value="plateau">Reduce on plateau</option></select></label><label>Balanceamento<select onChange={(event) => patchConfig("balancing", event.target.value as AutoAiConfig["balancing"])} value={config.balancing}><option value="none">Nenhum</option><option value="class-weights">Class weights</option><option value="oversampling">Oversampling</option><option value="undersampling">Undersampling</option></select></label><label>Feature selection<select onChange={(event) => patchConfig("featureSelection", event.target.value as AutoAiConfig["featureSelection"])} value={config.featureSelection}><option value="none">Nenhuma</option><option value="low-variance">Baixa variancia</option><option value="high-correlation">Alta correlacao</option><option value="importance">Importancia</option><option value="manual">Manual</option></select></label><label>Ensembling<select onChange={(event) => patchConfig("ensembling", event.target.value as AutoAiConfig["ensembling"])} value={config.ensembling}><option value="none">Nenhum</option><option value="voting">Voting</option><option value="bagging">Bagging</option><option value="boosting">Boosting</option><option value="stacking">Stacking</option></select></label><label>Calibracao<select onChange={(event) => patchConfig("calibration", event.target.value as AutoAiConfig["calibration"])} value={config.calibration}><option value="none">Nenhuma</option><option value="sigmoid">Sigmoid</option><option value="isotonic">Isotonic</option></select></label><label>Folds<input max="20" min="2" onChange={(event) => patchConfig("folds", Number(event.target.value))} type="number" value={config.folds} /></label></div>
      <div className="autoai-toggle-grid"><Toggle checked={config.earlyStopping} label="Early stopping" onChange={(value) => patchConfig("earlyStopping", value)} /><Toggle checked={config.thresholdTuning} label="Threshold tuning" onChange={(value) => patchConfig("thresholdTuning", value)} /><Toggle checked={config.dataAugmentation} label="Data augmentation" onChange={(value) => patchConfig("dataAugmentation", value)} /><Toggle checked={config.adversarialTraining} label="Adversarial training" onChange={(value) => patchConfig("adversarialTraining", value)} /></div>
      <div className="autoai-form-grid"><NumberList label="Learning rates" onChange={(value) => patchConfig("learningRates", value)} value={config.learningRates} /><NumberList label="Max depths" onChange={(value) => patchConfig("maxDepths", value)} value={config.maxDepths} /><NumberList label="Estimators" onChange={(value) => patchConfig("estimators", value)} value={config.estimators} /><NumberList label="Batch sizes" onChange={(value) => patchConfig("batchSizes", value)} value={config.batchSizes} /><NumberList label="Epochs" onChange={(value) => patchConfig("epochs", value)} value={config.epochs} /><label>Forca adversarial<input disabled={!config.adversarialTraining} max="0.5" min="0" onChange={(event) => patchConfig("adversarialStrength", Number(event.target.value))} step="0.01" type="number" value={config.adversarialStrength} /></label></div>
    </div>
  );
}

function ExperimentView({ bestTrial, comparedTrials, config, message, onCompare, onRun, onSave, selectedTrialIds, trials }: { bestTrial?: TrialResult; comparedTrials: TrialResult[]; config: AutoAiConfig; message: string; onCompare: (id: string) => void; onRun: () => void; onSave: () => void; selectedTrialIds: string[]; trials: TrialResult[] }) {
  const hasCurves = Boolean(comparedTrials[0]?.rocCurve?.length || comparedTrials[0]?.prCurve?.length);
  return <div className="experiment-layout"><section className="panel"><div className="panel-header"><div><span className="eyebrow">Etapa 2</span><div className="title-row"><h2>Ranking de pipelines</h2><Help title="Ranking">Ordena trials pela metrica principal, respeitando custo e parada antecipada.</Help></div></div><div className="result-actions"><button className="button secondary" onClick={onRun} type="button"><Play size={15} />Executar novamente</button><button className="button primary" disabled={!bestTrial} onClick={onSave} type="button"><Save size={15} />Salvar melhor modelo</button></div></div>{!trials.length ? <div className="autoai-empty"><FlaskConical size={30} /><strong>Nenhum trial executado</strong><span>Volte a Criar modelo ou execute com a configuracao atual.</span><button className="button primary" onClick={onRun} type="button">Executar agora</button></div> : <div className="trial-table-wrap"><table><thead><tr><th>Comparar</th><th>Rank</th><th>Pipeline</th><th>{config.metric}</th><th>Tempo</th><th>Custo</th><th>Status</th></tr></thead><tbody>{trials.map((trial) => <tr className={trial.rank === 1 ? "winner" : ""} key={trial.id}><td><input aria-label={`Comparar ${trial.id}`} checked={selectedTrialIds.includes(trial.id)} disabled={!selectedTrialIds.includes(trial.id) && selectedTrialIds.length >= 3} onChange={() => onCompare(trial.id)} type="checkbox" /></td><td><strong>#{trial.rank}</strong></td><td><strong>{algorithmLabels[trial.algorithm]}</strong><span>{trial.techniques.join(" / ")}</span></td><td>{metricPercent(trial.metric, trial.score)}</td><td>{trial.durationSeconds}s</td><td>{trial.estimatedCost.toFixed(2)}</td><td><span className={`badge ${trial.status === "Succeeded" ? "success" : "attention"}`}>{trial.status}</span></td></tr>)}</tbody></table></div>}<p className="experiment-message">{message}</p>{bestTrial ? <div className="winner-explanation"><BrainCircuit size={20} /><div><strong>Por que este pipeline venceu?</strong><p>{explainWinner(bestTrial, config)}</p></div></div> : null}</section>{bestTrial?.projection3d ? <ClusterProjection3d trial={bestTrial} /> : null}{bestTrial?.regressionPlot ? <RegressionPlot trial={bestTrial} /> : null}{bestTrial?.regressionPlot3d ? <RegressionPlot3d trial={bestTrial} /> : null}{comparedTrials.length ? <section className="panel trial-comparison"><div className="panel-header"><div><span className="eyebrow">Comparacao</span><div className="title-row"><h2>Trials lado a lado</h2><Help title="Comparacao de trials">Compara metricas, parametros, custo, matriz de confusao, curvas e importancia.</Help></div></div><GitCompare size={18} /></div><div className="comparison-grid">{comparedTrials.map((trial) => <article key={trial.id}><span>#{trial.rank}</span><h3>{algorithmLabels[trial.algorithm]}</h3><strong>{metricPercent(trial.metric, trial.score)}</strong><small>{trial.durationSeconds}s / custo {trial.estimatedCost}</small><dl>{Object.entries(trial.parameters).slice(0, 7).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>{trial.confusionMatrix ? <div className="confusion"><span>TN {trial.confusionMatrix[0][0]}</span><span>FP {trial.confusionMatrix[0][1]}</span><span>FN {trial.confusionMatrix[1][0]}</span><span>TP {trial.confusionMatrix[1][1]}</span></div> : null}<div className="importance-list">{trial.featureImportance.slice(0, 5).map((item) => <span key={item.feature}><em>{item.feature}</em><i style={{ width: `${item.importance * 100}%` }} /><b>{item.importance}</b></span>)}</div></article>)}</div>{hasCurves ? <div className="curve-grid"><Curve points={comparedTrials[0]?.rocCurve} title="Curva ROC" /><Curve points={comparedTrials[0]?.prCurve} title="Curva Precision-Recall" /></div> : null}</section> : null}</div>;
}

function VisualModeler({ nodeType, nodes, onAdd, onConfigure, onMove, onNodeType, onRemove, onRun, onToggle, visualMessage }: { nodeType: VisualNode["type"]; nodes: VisualNode[]; onAdd: () => void; onConfigure: (id: string, configuration: string) => void; onMove: (index: number, direction: -1 | 1) => void; onNodeType: (type: VisualNode["type"]) => void; onRemove: (id: string) => void; onRun: () => void; onToggle: (id: string) => void; visualMessage: string }) {
  return <section className="panel visual-modeler"><div className="panel-header"><div><span className="eyebrow">Etapa 3</span><div className="title-row"><h2>Visual Modeler</h2><Help title="Visual Modeler">Monta um pipeline no-code com blocos ordenados de dados ate deploy.</Help></div></div><button className="button primary" onClick={onRun} type="button"><Play size={15} />Executar fluxo</button></div><div className="node-toolbar"><select aria-label="Tipo do novo bloco" onChange={(event) => onNodeType(event.target.value as VisualNode["type"])} value={nodeType}><option value="data">Dados</option><option value="transform">Transformacao</option><option value="training">Treino</option><option value="tuning">Busca de hiperparametros</option><option value="validation">Validacao</option><option value="evaluation">Avaliacao</option><option value="score">Score</option><option value="deploy">Deploy</option></select><button className="button secondary" onClick={onAdd} type="button"><Plus size={15} />Adicionar bloco</button><span>{visualMessage}</span></div><div className="visual-flow">{nodes.map((node, index) => <div className={node.enabled ? "visual-node active" : "visual-node"} key={node.id}><span>{index + 1}</span><div><em>{node.type}</em><strong>{node.label}</strong></div><label className="node-configuration">Execucao<input aria-label={`Configuracao de ${node.label}`} onChange={(event) => onConfigure(node.id, event.target.value)} value={node.configuration} /></label><Toggle checked={node.enabled} label="Ativo" onChange={() => onToggle(node.id)} /><div className="node-actions"><button aria-label={`Mover ${node.label} para cima`} disabled={index === 0} onClick={() => onMove(index, -1)} type="button"><ArrowUp size={14} /></button><button aria-label={`Mover ${node.label} para baixo`} disabled={index === nodes.length - 1} onClick={() => onMove(index, 1)} type="button"><ArrowDown size={14} /></button><button aria-label={`Remover ${node.label}`} onClick={() => onRemove(node.id)} type="button"><Trash2 size={14} /></button></div>{index < nodes.length - 1 ? <ChevronRight className="node-connector" size={18} /> : null}</div>)}</div></section>;
}

function ReinforcementBuilder({
  config,
  environments,
  loading,
  message,
  models,
  onChange,
  onDeleteEnvironment,
  onRefresh,
  onSaveModel,
  onSelectSession,
  selectedSessionId,
  workspaceId
}: {
  config: ReinforcementConfig;
  environments: ConnectedRlEnvironment[];
  loading: boolean;
  message: string;
  models: SavedRlModel[];
  onChange: (config: ReinforcementConfig) => void;
  onDeleteEnvironment: (environment: ConnectedRlEnvironment) => void;
  onRefresh: () => void;
  onSaveModel: () => void;
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string;
  workspaceId: string;
}) {
  const patch = <K extends keyof ReinforcementConfig>(key: K, value: ReinforcementConfig[K]) => onChange({ ...config, [key]: value });
  const selected = environments.find((environment) => environment.sessionId === selectedSessionId) ?? environments[0];
  const best = environments.reduce<ConnectedRlEnvironment | undefined>((current, item) => !current || item.bestReward > current.bestReward ? item : current, undefined);
  return <div className="rl-layout"><section className="panel"><div className="panel-header"><div><span className="eyebrow">Adversarial / RL</span><div className="title-row"><h2>Ambientes conectados</h2><Help title="Contrato da API">O ambiente externo inicia o treino e informa workspaceId. Esta aba monitora sessoes ativas, progresso, melhor candidato e modelos salvos.</Help></div></div><ShieldCheck size={19} /></div><div className="autoai-form-grid"><label>URL da API<input onChange={(event) => patch("apiUrl", event.target.value)} placeholder="/api" value={config.apiUrl ?? ""} /></label><label>Token<input onChange={(event) => patch("apiToken", event.target.value)} placeholder="Opcional" type="password" value={config.apiToken ?? ""} /></label><label>Workspace monitorado<input readOnly value={workspaceId} /></label><label>Filtro ambiente<input onChange={(event) => patch("environment", event.target.value)} value={config.environment} /></label></div><p className="experiment-message">{message}</p><div className="result-actions"><button className="button secondary" disabled={loading} onClick={onRefresh} type="button"><Gauge size={15} />Atualizar</button><button className="button primary" disabled={!selected} onClick={onSaveModel} type="button"><Save size={15} />Salvar modelo treinado</button></div><div className="trial-table-wrap"><table><thead><tr><th>Ambiente</th><th>Candidato</th><th>Status</th><th>Epoca</th><th>Progresso</th><th>Reward medio</th><th>Melhor</th><th>Policy</th></tr></thead><tbody>{environments.map((environment) => <tr className={environment.sessionId === selected?.sessionId ? "winner" : ""} key={environment.sessionId} onClick={() => onSelectSession(environment.sessionId)}><td><div className="table-cell-action"><div><strong>{environment.environment}</strong><span>{environment.sessionId}</span></div><button aria-label={`Deletar ambiente ${environment.environment}`} onClick={(event) => { event.stopPropagation(); onDeleteEnvironment(environment); }} title="Deletar ambiente" type="button"><Trash2 size={14} /></button></div></td><td>{environment.candidateName}</td><td><span className={`badge ${environment.status === "active" ? "success" : "neutral"}`}>{environment.status}</span></td><td>{environment.currentEpisode}</td><td>{Math.round(environment.progress * 100)}%</td><td>{environment.averageReward.toFixed(2)}</td><td>{environment.bestReward.toFixed(2)}</td><td>v{environment.policyVersion}</td></tr>)}</tbody></table>{!environments.length ? <div className="autoai-empty">Nenhum ambiente conectado no workspace {workspaceId}.</div> : null}</div></section><section className="panel"><div className="panel-header"><div><span className="eyebrow">Treinamento</span><h2>Status e modelos</h2></div><Gauge size={18} /></div><div className="recommendation-grid"><article><strong>{environments.length}</strong><span>Ambientes ativos/salvos</span></article><article><strong>{best ? best.candidateName : "-"}</strong><span>Melhor candidato</span></article><article><strong>{best ? best.bestReward.toFixed(2) : "-"}</strong><span>Melhor reward</span></article></div>{selected ? <p className="experiment-message">Selecionado: {selected.environment} / {selected.candidateName}. Epoca {selected.currentEpisode}, policy v{selected.policyVersion}, sucesso {(selected.successRate * 100).toFixed(1)}%.</p> : null}<div className="trial-table-wrap"><table><thead><tr><th>Modelo salvo</th><th>Candidato</th><th>Reward</th><th>Conectar</th></tr></thead><tbody>{models.map((model) => <tr key={model.modelId}><td><strong>{model.name}</strong><span>{model.modelId}</span></td><td>{model.candidateName}</td><td>{model.averageReward.toFixed(2)}</td><td><code>{model.actionUrl}</code></td></tr>)}</tbody></table>{!models.length ? <div className="autoai-empty">Nenhum modelo RL salvo neste workspace.</div> : null}</div></section></div>;
}
function OptimizationBuilder({ config, onChange, onRun, result }: { config: OptimizationConfig; onChange: (config: OptimizationConfig) => void; onRun: () => void; result: ReturnType<typeof solveOptimization> | null }) {
  const patch = <K extends keyof OptimizationConfig>(key: K, value: OptimizationConfig[K]) => onChange({ ...config, [key]: value });
  return <div className="optimization-layout"><section className="panel"><div className="panel-header"><div><span className="eyebrow">Decision Optimization</span><div className="title-row"><h2>Modelo declarativo</h2><Help title="Otimizacao">Define objetivo, variaveis, restricoes e limite do solver sem codigo.</Help></div></div><Target size={19} /></div><div className="autoai-form-grid"><label>Objetivo<select onChange={(event) => patch("objective", event.target.value as OptimizationConfig["objective"])} value={config.objective}><option value="maximize">Maximizar</option><option value="minimize">Minimizar</option></select></label><label>Nome do objetivo<input onChange={(event) => patch("objectiveName", event.target.value)} value={config.objectiveName} /></label><label>Variaveis<input min="1" onChange={(event) => patch("variables", Number(event.target.value))} type="number" value={config.variables} /></label><label>Restricoes<input min="0" onChange={(event) => patch("constraints", Number(event.target.value))} type="number" value={config.constraints} /></label><label>Limite do solver (s)<input min="1" onChange={(event) => patch("timeLimitSeconds", Number(event.target.value))} type="number" value={config.timeLimitSeconds} /></label></div><button className="button primary" onClick={onRun} type="button"><Play size={15} />Resolver modelo</button></section><section className="panel"><div className="panel-header"><div><span className="eyebrow">Resultado</span><h2>Solucao</h2></div><CheckCircle2 size={18} /></div>{result ? <div className="optimization-result"><article><span>Status</span><strong>{result.status}</strong></article><article><span>{config.objectiveName}</span><strong>{result.objectiveValue}</strong></article><article><span>Gap</span><strong>{result.gap}%</strong></article><article><span>Nos explorados</span><strong>{result.exploredNodes}</strong></article><article><span>Duracao</span><strong>{result.durationSeconds}s</strong></article></div> : <div className="autoai-empty">Configure e resolva o modelo para ver a solucao.</div>}</section></div>;
}
