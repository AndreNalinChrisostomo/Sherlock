import type { Asset } from "./domain";

export type RuntimeLanguage = "python" | "r";
export type RuntimeKind = "python-basic" | "python-gpu" | "r-basic";
export type ExecutableKind = "notebook" | "script";

export interface RuntimeEnvironment {
  id: RuntimeKind;
  name: string;
  language: RuntimeLanguage;
  accelerator: "CPU" | "GPU mock";
  packages: string[];
  status: "Ready" | "Mocked";
}

export interface NotebookCell {
  id: string;
  type: "markdown" | "code";
  source: string;
}

export interface RuntimeExecution {
  id: string;
  assetName: string;
  kind: ExecutableKind;
  environmentId: RuntimeKind;
  status: "Running" | "Succeeded" | "Failed";
  logs: string[];
  artifacts: Array<{ name: string; type: "text" | "csv" | "json"; content: string }>;
  startedAt: string;
  duration: string;
}

export const runtimeEnvironments: RuntimeEnvironment[] = [
  {
    id: "python-basic",
    name: "Python basico",
    language: "python",
    accelerator: "CPU",
    packages: ["polars", "numpy", "scikit-learn", "matplotlib"],
    status: "Ready"
  },
  {
    id: "python-gpu",
    name: "Python GPU mockado",
    language: "python",
    accelerator: "GPU mock",
    packages: ["polars", "numpy", "torch", "accelerate"],
    status: "Mocked"
  },
  {
    id: "r-basic",
    name: "R basico mockado",
    language: "r",
    accelerator: "CPU",
    packages: ["tidyverse", "caret", "ggplot2"],
    status: "Mocked"
  }
];

export const defaultNotebookCells: NotebookCell[] = [
  {
    id: "cell-intro",
    type: "markdown",
    source: "# Analise local\nNotebook simples para inspecionar dados e registrar saidas."
  },
  {
    id: "cell-profile",
    type: "code",
    source: "import polars as pl\nprint('Carregando dataset local em Parquet...')\nprint('Linhas analisadas:', 1000)"
  }
];

export const defaultPythonScript = [
  "import polars as pl",
  "",
  "def main():",
  "    print('Executando script local')",
  "    print('Gerando artefato de resumo')",
  "",
  "main()"
].join("\n");

export function notebookAssets(assets: Asset[]) {
  return assets.filter((asset) => asset.type === "notebook" && asset.visibility !== "archived");
}

export function scriptAssets(assets: Asset[]) {
  return assets.filter((asset) => asset.type === "script" && asset.visibility !== "archived");
}

export function environmentAssets(assets: Asset[]) {
  return assets.filter((asset) => asset.type === "environment" && asset.visibility !== "archived");
}

export function notebookToText(cells: NotebookCell[]) {
  return cells.map((cell) => `${cell.type === "markdown" ? "%%markdown" : "%%code"}\n${cell.source}`).join("\n\n");
}

export function parseNotebookText(text: string): NotebookCell[] {
  const sections = text.split(/\n(?=%%(?:markdown|code)\n)/);
  const cells = sections.flatMap((section, index) => {
    const match = section.match(/^%%(markdown|code)\n([\s\S]*)$/);
    if (!match) return [];
    return [{ id: `cell-${index + 1}`, type: match[1] as NotebookCell["type"], source: match[2].trim() }];
  });
  return cells.length ? cells : [{ id: "cell-1", type: "code", source: text }];
}

export function simulateRuntimeExecution(options: {
  assetName: string;
  kind: ExecutableKind;
  source: string;
  environmentId: RuntimeKind;
  now?: string;
}): RuntimeExecution {
  const lines = options.source.split(/\r?\n/).filter(Boolean);
  const hasError = /raise\s+|throw\s+|ERROR_SIMULADO/i.test(options.source);
  const logPrefix = options.kind === "notebook" ? "Notebook" : "Script";
  const logs = [
    `[00:00] ${logPrefix} ${options.assetName} enviado para runtime ${options.environmentId}.`,
    `[00:01] Ambiente preparado com kernel local mockado.`,
    `[00:02] ${lines.length} linha(s) de codigo/conteudo detectadas.`,
    hasError ? "[00:03] Falha simulada detectada no codigo." : "[00:03] Execucao finalizada sem erros.",
    hasError ? "[00:03] Status: Failed." : "[00:04] Artefatos gravados no workspace local."
  ];

  return {
    id: `runtime-execution-${Date.now()}`,
    assetName: options.assetName,
    kind: options.kind,
    environmentId: options.environmentId,
    status: hasError ? "Failed" : "Succeeded",
    logs,
    artifacts: hasError
      ? [{ name: "error-log.txt", type: "text", content: logs.join("\n") }]
      : [
          { name: `${options.assetName.replace(/\W+/g, "_")}_summary.json`, type: "json", content: JSON.stringify({ lines: lines.length, environment: options.environmentId }, null, 2) },
          { name: `${options.assetName.replace(/\W+/g, "_")}_stdout.txt`, type: "text", content: logs.join("\n") }
        ],
    startedAt: options.now ?? new Date().toISOString(),
    duration: hasError ? "3s" : "4s"
  };
}

export function simulateGitSync(repositoryUrl: string, assetCount: number) {
  const target = repositoryUrl.trim() || "repositorio-local";
  return [
    `Conexao preparada: ${target}`,
    `${assetCount} asset(s) elegiveis para sincronizacao.`,
    "Publicacao simulada concluida. Integracao real com Git fica pronta para adapter futuro."
  ];
}

export function runTerminalCommand(command: string, assets: Asset[]) {
  const normalized = command.trim();
  if (!normalized) return "Digite um comando.";
  if (normalized === "ls assets") return assets.map((asset) => asset.name).join("\n") || "Nenhum asset.";
  if (normalized === "pwd") return "/workspace/local-studio";
  if (normalized.startsWith("echo ")) return normalized.slice(5);
  return `Comando mockado: ${normalized}\nNenhuma operacao real foi executada.`;
}
