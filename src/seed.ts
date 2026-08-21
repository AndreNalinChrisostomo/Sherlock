import type { StudioState } from "./domain";
import { carCrashStudyAssets, carCrashStudyWorkspaces } from "./carCrashStudyAssets";
import { trainingDatasetAssets } from "./trainingDatasets";

export const seedState: StudioState = {
  profile: {
    id: "profile-local",
    name: "Meu Studio",
    defaultProjectId: "project-sandbox",
    promptRetention: "explicit-save-only",
    preferredProvider: "Mock Granite"
  },
  workspaces: [
    ...carCrashStudyWorkspaces,
    {
      id: "project-sandbox",
      type: "project",
      name: "Sandbox",
      description: "Projeto inicial para explorar dados, prompts e modelos.",
      status: "Active",
      updatedAt: "2026-07-28T12:00:00-03:00",
      tags: ["sandbox", "demo"],
      storage: "Storage local",
      serviceIds: ["service-runtime", "service-llm", "service-object-storage", "service-governance"]
    },
    {
      id: "space-dev",
      type: "deployment-space",
      name: "Dev deployments",
      description: "Espaco local para testar assets antes de producao.",
      status: "Active",
      updatedAt: "2026-07-28T12:15:00-03:00",
      tags: ["deployments"],
      storage: "Storage local",
      serviceIds: ["service-llm", "service-object-storage"]
    },
    {
      id: "catalog-local",
      type: "catalog",
      name: "Catalogo local",
      description: "Conexoes, guardrails e assets reutilizaveis.",
      status: "Active",
      updatedAt: "2026-07-28T11:40:00-03:00",
      tags: ["catalogo"],
      storage: "Storage local",
      serviceIds: ["service-object-storage", "service-governance"]
    },
    {
      id: "project-treinos",
      type: "project",
      name: "treinos",
      description: "Workspace com datasets supervisionado e nao supervisionado para praticar preparo e AutoAI.",
      status: "Active",
      updatedAt: "2026-07-31T17:30:00-03:00",
      tags: ["treino", "autoai", "datasets"],
      storage: "Storage local",
      serviceIds: ["service-runtime", "service-object-storage"]
    }
  ],
  assets: [
    ...carCrashStudyAssets,
    ...trainingDatasetAssets,
    {
      id: "asset-support-prompt",
      workspaceId: "project-sandbox",
      type: "prompt-template",
      name: "Resumo de reclamacoes",
      description: "Prompt com variaveis para resumir reclamacoes em uma frase.",
      status: "Draft",
      version: 2,
      tags: ["prompt", "summarization"],
      updatedAt: "2026-07-28T12:12:00-03:00",
      lineage: ["asset-customer-data"],
      metadata: {
        model: "Mock Granite",
        mode: "structured",
        variables: "complaint_text, tone"
      },
      dependencies: ["asset-customer-data"],
      visibility: "active"
    },
    {
      id: "asset-refinery-flow",
      workspaceId: "project-sandbox",
      type: "data-refinery-flow",
      name: "Limpeza de reclamacoes",
      description: "Fluxo visual para normalizar texto, remover duplicados e mapear prioridade.",
      status: "Draft",
      version: 1,
      tags: ["data-refinery", "preparo"],
      updatedAt: "2026-07-28T12:08:00-03:00",
      lineage: ["asset-customer-data"],
      metadata: {
        steps: "5",
        output: "complaints_clean.parquet"
      },
      dependencies: ["asset-customer-data"],
      visibility: "active"
    },
    {
      id: "asset-notebook-profile",
      workspaceId: "project-sandbox",
      type: "notebook",
      name: "perfil_dados.ipynb",
      description: "Notebook para perfil estatistico e validacao de schema.",
      status: "Ready",
      version: 1,
      tags: ["notebook", "python"],
      updatedAt: "2026-07-28T12:09:00-03:00",
      lineage: ["asset-customer-data"],
      metadata: {
        runtime: "Python local",
        kernel: "python3"
      },
      dependencies: ["asset-customer-data"],
      visibility: "active"
    },
    {
      id: "asset-vector-index",
      workspaceId: "project-sandbox",
      type: "vector-index",
      name: "complaints_vector_index",
      description: "Indice vetorial local para busca semantica nos textos de reclamacao.",
      status: "Ready",
      version: 1,
      tags: ["rag", "embeddings"],
      updatedAt: "2026-07-28T12:14:00-03:00",
      lineage: ["asset-customer-data"],
      metadata: {
        chunks: "420",
        embedding: "mock-embedding-768"
      },
      dependencies: ["asset-customer-data"],
      visibility: "active"
    },
    {
      id: "asset-python-env",
      workspaceId: "catalog-local",
      type: "environment",
      name: "Python local base",
      description: "Ambiente local para notebooks, scripts e jobs de dados.",
      status: "Ready",
      version: 1,
      tags: ["runtime", "python"],
      updatedAt: "2026-07-28T12:01:00-03:00",
      lineage: [],
      metadata: {
        python: "3.12",
        packages: "polars, numpy, scikit-learn"
      },
      dependencies: [],
      visibility: "active"
    },
    {
      id: "asset-priority-model",
      workspaceId: "project-sandbox",
      type: "tuned-model",
      name: "priority_classifier_tuned",
      description: "Modelo ajustado simulado para classificar prioridade de atendimento.",
      status: "Ready",
      version: 1,
      tags: ["modelo", "tuning", "classificacao"],
      updatedAt: "2026-07-28T12:16:00-03:00",
      lineage: ["asset-customer-data"],
      metadata: {
        baseModel: "Mock Granite classifier",
        metric: "f1=0.82"
      },
      dependencies: ["asset-customer-data", "asset-python-env"],
      visibility: "active"
    },
    {
      id: "asset-risk-factsheet",
      workspaceId: "catalog-local",
      type: "evaluation",
      name: "Factsheet base",
      description: "Modelo de rastreio para objetivo, dataset, metricas e decisoes.",
      status: "Ready",
      version: 1,
      tags: ["governanca", "factsheet"],
      updatedAt: "2026-07-28T11:58:00-03:00",
      lineage: [],
      metadata: {
        workflow: "draft-review-approved",
        scope: "modelos, prompts, agentes"
      },
      dependencies: [],
      visibility: "active"
    },
    {
      id: "asset-service",
      workspaceId: "space-dev",
      type: "ai-service",
      name: "Complaint summarizer API",
      description: "Endpoint simulado para testar deploy online.",
      status: "Deployed",
      version: 1,
      tags: ["deployment", "api"],
      updatedAt: "2026-07-28T12:18:00-03:00",
      lineage: ["asset-support-prompt"],
      metadata: {
        endpoint: "/deployments/complaint-summarizer",
        mode: "online"
      },
      dependencies: ["asset-support-prompt", "asset-vector-index"],
      visibility: "active"
    },
    {
      id: "asset-score-function",
      workspaceId: "space-dev",
      type: "function",
      name: "score_complaint_priority",
      description: "Funcao simulada para score batch de prioridade.",
      status: "Ready",
      version: 1,
      tags: ["function", "batch"],
      updatedAt: "2026-07-28T12:17:00-03:00",
      lineage: ["asset-customer-data"],
      metadata: {
        language: "Python",
        entrypoint: "score(payload)"
      },
      dependencies: ["asset-python-env"],
      visibility: "active"
    }
  ],
  jobs: [
    {
      id: "job-profile",
      workspaceId: "project-sandbox",
      name: "Perfil de customer_complaints.csv",
      status: "Succeeded",
      startedAt: "2026-07-28T12:03:00-03:00",
      duration: "18s"
    },
    {
      id: "job-deploy",
      workspaceId: "space-dev",
      name: "Deploy Complaint summarizer API",
      status: "Succeeded",
      startedAt: "2026-07-28T12:16:00-03:00",
      duration: "44s"
    }
  ],
  events: [
    {
      id: "event-created",
      actor: "system",
      action: "Criou projeto sandbox",
      target: "Sandbox",
      createdAt: "2026-07-28T12:00:00-03:00"
    },
    {
      id: "event-upload",
      actor: "local-user",
      action: "Adicionou data asset",
      target: "customer_complaints.csv",
      createdAt: "2026-07-28T12:02:00-03:00"
    },
    {
      id: "event-prompt",
      actor: "local-user",
      action: "Salvou prompt template",
      target: "Resumo de reclamacoes",
      createdAt: "2026-07-28T12:12:00-03:00"
    }
  ],
  resources: [
    {
      id: "resource-prompt-summarize",
      kind: "prompt",
      name: "Prompt de sumarizacao de suporte",
      description: "Template com variaveis para resumir tickets, sentimento e proxima acao.",
      tags: ["prompt", "suporte", "granite"],
      estimatedTime: "5 min"
    },
    {
      id: "resource-notebook-profile",
      kind: "notebook",
      name: "Notebook de perfil de dados",
      description: "Fluxo Python para schema, nulos, cardinalidade e distribuicoes basicas.",
      tags: ["notebook", "dados"],
      estimatedTime: "12 min"
    },
    {
      id: "resource-dataset-complaints",
      kind: "dataset",
      name: "Dataset demo de reclamacoes",
      description: "CSV sintetico para classificacao, extracao e RAG local.",
      tags: ["dataset", "demo"],
      estimatedTime: "3 min"
    },
    {
      id: "resource-project-rag",
      kind: "project",
      name: "Projeto inicial RAG",
      description: "Estrutura de projeto com documentos, prompt, indice vetorial e avaliacao.",
      tags: ["rag", "projeto"],
      estimatedTime: "18 min"
    },
    {
      id: "resource-model-risk",
      kind: "model",
      name: "Modelo tabular de risco",
      description: "Blueprint de experimento AutoAI para classificar prioridade de atendimento.",
      tags: ["modelo", "autoai"],
      estimatedTime: "20 min"
    }
  ],
  services: [
    {
      id: "service-runtime",
      name: "Runtime Python local",
      category: "Runtime",
      status: "Online",
      detail: "Ambiente base para jobs, notebooks e scripts.",
      updatedAt: "2026-07-28T12:20:00-03:00"
    },
    {
      id: "service-llm",
      name: "Mock Granite provider",
      category: "Runtime",
      status: "Online",
      detail: "Provider simulado para Prompt Lab e AI services.",
      updatedAt: "2026-07-28T12:21:00-03:00"
    },
    {
      id: "service-object-storage",
      name: "Storage local",
      category: "Storage",
      status: "Online",
      detail: "Persistencia local para assets e configuracoes.",
      updatedAt: "2026-07-28T12:20:00-03:00"
    },
    {
      id: "service-s3",
      name: "S3 compativel",
      category: "Connector",
      status: "Needs setup",
      detail: "Conector planejado para object storage externo.",
      updatedAt: "2026-07-28T12:10:00-03:00"
    },
    {
      id: "service-governance",
      name: "Factsheets locais",
      category: "Governance",
      status: "Online",
      detail: "Registro local de origem, decisoes, metricas e deploys.",
      updatedAt: "2026-07-28T12:19:00-03:00"
    }
  ],
  notifications: [
    {
      id: "notification-deploy",
      tone: "success",
      title: "Deployment pronto",
      detail: "Complaint summarizer API esta disponivel no space Dev deployments.",
      createdAt: "2026-07-28T12:18:00-03:00",
      read: false
    },
    {
      id: "notification-profile",
      tone: "success",
      title: "Perfil de dados concluido",
      detail: "customer_complaints.csv foi analisado com sucesso.",
      createdAt: "2026-07-28T12:03:00-03:00",
      read: false
    },
    {
      id: "notification-guardrail",
      tone: "warning",
      title: "Guardrails pendentes",
      detail: "O prompt Resumo de reclamacoes ainda nao possui politica associada.",
      createdAt: "2026-07-28T12:13:00-03:00",
      read: true
    }
  ]
};
