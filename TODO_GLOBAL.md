# TODO Global - Clone IBM Watson Studio / IBM watsonx

Pesquisa baseada em documentacao e paginas oficiais da IBM consultadas em 2026-07-28.

Fontes principais:
- https://www.ibm.com/docs/en/watsonx/saas?topic=overview-watsonx
- https://www.ibm.com/docs/en/watsonx/saas?topic=watsonx-platform-architecture
- https://www.ibm.com/docs/en/watsonx/saas?topic=watsonx-feature-differences-between-deployments
- https://www.ibm.com/docs/en/watsonx/saas?topic=solutions-prompt-lab
- https://www.ibm.com/docs/en/watsonx/saas?topic=solutions-tuning-models
- https://www.ibm.com/docs/en/watsonx/saas?topic=deploying-ai
- https://www.ibm.com/docs/en/watsonx/saas?topic=services-deploying-ai-visual-tools
- https://www.ibm.com/docs/en/watsonxdata/standard/2.2.x?topic=overview
- https://www.ibm.com/products/watson-studio/pricing
- https://www.ibm.com/products/watson-studio/feature-platform

## Produto-alvo

Criar uma plataforma web single-user inspirada no IBM Watson Studio / IBM watsonx para organizar projetos de dados e IA, preparar dados, experimentar com modelos, criar prompts/agentes/RAG, treinar ou ajustar modelos, implantar assets em espacos de deployment, monitorar qualidade/governanca e rastrear o ciclo de vida dos experimentos.

## Principios do clone

- Primeiro construir uma experiencia funcional, nao apenas landing page.
- Separar claramente ambientes de trabalho locais: projetos, espacos de deployment e catalogo global.
- Modelar tudo como assets versionaveis: dados, conexoes, notebooks, prompts, modelos, pipelines, agentes, avaliacoes e deployments.
- Comecar com integracoes mockadas/local-first, mantendo interfaces prontas para provedores reais depois.
- Priorizar fluxos end-to-end: criar projeto, adicionar dado, criar prompt/modelo, avaliar, promover, implantar, monitorar.
- Pular recursos de colaboracao, organizacoes, convites, roles por usuario e multi-tenant; o produto sera usado por uma pessoa.
- Priorizar criacao de modelos no-code/low-code: o usuario deve configurar objetivos, dados, algoritmos e tecnicas avancadas por UI, sem precisar programar.
- Expor tecnicas avancadas como controles guiados: grid search, random search, bayesian optimization, dropout, regularizacao, early stopping, cross-validation, ensembling, threshold tuning e adversarial training.
- Priorizar tratamento de dados no-code/low-code: o usuario deve preparar, validar, transformar, enriquecer e criar features por UI, com tecnicas avancadas disponiveis em modo assistido e modo avancado.

## MVP 0 - Fundacao da aplicacao

- [x] Definir stack inicial do projeto: React, TypeScript, Vite, Vitest e lucide-react.
- [x] Criar app web com layout de produto operacional: sidebar, header, busca global, area principal e paineis de detalhes/resumo.
- [x] Criar perfil local unico com configuracoes pessoais.
- [x] Criar persistencia inicial para perfil, projetos, assets, configuracoes e eventos via localStorage.
- [x] Criar seed data realista para demonstrar o produto sem integracoes externas.
- [x] Criar design system basico: botoes, tabelas, cards, badges de status, paineis, busca e estados responsivos.
- [x] Criar auditoria de eventos para acoes importantes.
- [x] Criar teste de smoke para persistencia/auditoria local.

## MVP 1 - Home e navegacao watsonx-like

- [x] Dashboard inicial com atalhos para Prompt Lab, Agent Lab, projetos, deployments, catalogo, governanca e recursos.
- [x] Busca global por assets em todos os workspaces locais.
- [x] Resource Hub com exemplos: prompts, notebooks, datasets, projetos e modelos.
- [x] Pagina "Recentes" para assets abertos ou modificados.
- [x] Pagina "Servicos e integracoes" com status de runtimes e conectores.
- [x] Notificacoes de jobs, deployments e avaliacoes.

## MVP 2 - Projetos single-user

- [x] CRUD de projetos com nome, descricao, tags, storage associado e status.
- [x] Projeto sandbox criado automaticamente no primeiro uso.
- [x] Tabs do projeto: Overview, Assets, Jobs, Manage, Activity.
- [x] Notas pessoais em assets.
- [x] Historico de atividades do projeto.
- [x] Exportacao e importacao de projeto como pacote.
- [x] Associar servicos ao projeto: runtime de IA, storage, catalogo, governanca.

## MVP 3 - Modelo de assets

- [x] Criar tabela/colecao generica de assets com tipo, estado, versao, tags, metadata e workspace.
- [x] Tipos de asset: data asset, connection, notebook, script, prompt template, model, tuned model, pipeline, Data Refinery flow, function, environment, job, AI service, agent, vector index.
- [x] Pagina de lista de assets com filtros por tipo, tag, status e workspace.
- [x] Pagina de detalhes do asset com metadados, versoes, dependencias, lineage, notas e acoes.
- [x] Versionamento simples em assets e preservacao em import/export de projeto.
- [x] Relacionamento de dependencias entre assets.
- [x] Sistema de tags e descricao enriquecida.
- [x] Acao de duplicar asset.
- [x] Acao de arquivar/remover asset com confirmacao para remocao.

## MVP 4 - Dados, conexoes e preparo

- [x] Upload de arquivos CSV, TSV, JSON e JSONL.
- [x] Upload/parsing real de XLSX e Parquet.
- [x] Preview tabular com inferencia de schema.
- [x] Perfil basico de dados: tipos inferidos, nulos, duplicados, cardinalidade, min/max/media e exemplos.
- [x] Perfil ampliado de dados: quantis numericos e frequencias principais por coluna.
- [x] Perfil completo de dados: histogramas, distribuicoes detalhadas, quantis, frequencias configuraveis no painel e boxplots derivados.
- [x] Data Refinery visual: ordenar, filtrar, renomear/remover colunas, converter tipos, tratar nulos, deduplicar e agregacao count.
- [x] Joins simples reais entre datasets via dataset de lookup.
- [x] Painel "Modo assistido" para sugerir automaticamente correcoes iniciais de qualidade, nulos, duplicados, categoricas e possiveis outliers.
- [x] Painel "Modo avancado" para visualizar tecnicas executaveis e tecnicas planejadas sem programar.
- [x] Painel "Modo avancado" completo para escolher e executar tecnicas avancadas por operacao, coluna, valor, alvo e dataset auxiliar.
- [x] Data quality scoring: score geral, completude, unicidade e duplicacao.
- [x] Deteccao real de schema drift e data drift entre baseline e dataset atual: colunas adicionadas/removidas, mudancas de tipo, media numerica e distribuicao categorica.
- [x] Validacao declarativa de dados executavel: obrigatorio, tipo esperado, range numerico, regex, dominios permitidos e unicidade.
- [x] Validacao declarativa restante: constraints compostas entre colunas, severidade por regra, exportacao de relatorio e checks customizados seguros.
- [x] Tratamento de nulos funcional por constante.
- [x] Tratamento avancado de nulos executavel: media, mediana e moda.
- [x] Tratamento avancado de nulos restante: forward/back fill, KNN imputation local, iterative imputation local e indicador de missingness.
- [x] Tratamento real de outliers com clipping por IQR.
- [x] Tratamento de outliers restante: z-score clipping, winsorization e isolamento local por score.
- [x] Encoding real de categoricas: one-hot e ordinal.
- [x] Encoding de categoricas restante: frequency, target encoding protegido com suavizacao e hashing trick.
- [x] Escalonamento/normalizacao real: standard scaler e min-max scaler.
- [x] Escalonamento/normalizacao restante: robust scaler, log transform, power transform e quantile transform.
- [x] Transformacoes reais de texto: limpeza, normalizacao, stopwords, stemming simples, n-grams, TF-IDF e embeddings hash.
- [x] Transformacoes temporais reais: parsing de datas, timezone, janelas, lags, rolling stats, sazonalidade, feriados e splits temporais.
- [x] Feature engineering visual executavel: formulas guiadas, bins, ratios, interacoes, agregacoes por grupo e features temporais.
- [x] Feature selection executavel antes do treino: baixa variancia, alta correlacao, mutual information local, importancia por modelo local e selecao manual.
- [x] Balanceamento real de datasets: stratified sampling, oversampling, undersampling, SMOTE local e pesos por classe.
- [x] Deteccao real de leakage: colunas altamente correlacionadas com alvo, datas posteriores ao evento, IDs proxy e features derivadas indevidas.
- [x] Deteccao real de vieses/sensibilidade: colunas sensiveis, proxies, distribuicoes por grupo e impacto em splits.
- [x] Split de dados no-code executavel: train/validation/test, stratified split, group split local, temporal split local e holdout bloqueado por coluna split.
- [x] Amostragem e profiling executaveis em datasets grandes: sample aleatorio deterministico, estratificado, head/tail e perfil incremental local.
- [x] Join avancado executavel: fuzzy matching normalizado, chaves compostas por coluna configuravel, validacao de cardinalidade e alertas de duplicacao.
- [x] Agregacoes avancadas executaveis: group-by, pivot/unpivot, window functions e rolling aggregations.
- [x] Enriquecimento de dados executavel: lookup tables, geocoding local por dicionario, calendario/feriados, dicionarios e regras reutilizaveis.
- [x] Receitas simples de preparo via lista ordenada de etapas.
- [x] Comparacao parcial antes/depois das transformacoes: contagem de linhas, score de qualidade, schema inferido e preview do resultado.
- [x] Comparacao completa antes/depois das transformacoes: distribuicoes, histogramas, deltas por coluna e exemplos lado a lado no painel de analise.
- [x] Explicacao em linguagem natural das transformacoes sugeridas e dos riscos.
- [x] Registro de passos ordenados de transformacao.
- [x] Execucao de transformacoes como job local.
- [x] Exportacao de resultado refinado como novo data asset.
- [x] Visualizacoes basicas implementadas para qualidade/completude.
- [x] Visualizacoes completas: barras, linhas, dispersao, histograma, boxplot e heatmap.
- [x] Visualizacoes avancadas reais para preparo: matriz de correlacao, missingness map, distribution comparison, drift report e target leakage report.
- [x] Conectores mockados para bancos e object storage.
- [x] Interface para credenciais/teste de conexao simulado.

## MVP 5 - Prompt Lab

- [x] Editor de prompt livre.
- [x] Modo chat com historico de mensagens.
- [x] Modo estruturado com variaveis de prompt.
- [x] Selecionador de modelo/foundation model.
- [x] Parametros de inferencia: temperature, max tokens, top-p, stop sequences, seed.
- [x] Painel de amostras por tarefa: classificacao, extracao, geracao, pergunta-resposta e sumarizacao.
- [x] Historico de execucoes da sessao.
- [x] Salvar prompt como prompt template asset.
- [x] Comparar respostas entre modelos ou parametros.
- [x] Avaliacao simples de prompt: latencia, tokens, custo estimado, thumbs up/down, notas humanas.
- [x] Variaveis de prompt e formulario de teste.
- [x] Chat com documentos via indice vetorial local.
- [x] Exportar notebook de deployment gerado a partir de prompt/RAG.

## MVP 6 - RAG e indices vetoriais

- [x] Upload de documentos para grounding.
- [x] Chunking configuravel.
- [x] Geracao de embeddings com provider abstrato.
- [x] Armazenamento vetorial local inicial.
- [x] Busca semantica e preview de trechos recuperados.
- [x] Configuracao de retriever: top-k, filtros, threshold.
- [x] Pipeline RAG visual: input, retrieve, prompt, generate, output.
- [x] Citacoes das fontes recuperadas na resposta.
- [x] Avaliacao de RAG: groundedness, relevancia, resposta vazia, latencia.
- [x] Promover RAG como AI service.

## MVP 7 - Agent Lab

- [x] Builder visual de agente com nome, objetivo, instrucoes, modelo e ferramentas.
- [x] Catalogo de ferramentas: busca em documentos, chamada HTTP mockada, calculadora, consulta SQL mockada.
- [x] Test console com traces de pensamento operacional: etapas, tool calls, inputs, outputs e erros.
- [x] Guardrails por agente: limites de ferramentas, palavras bloqueadas, PII, formato de resposta.
- [x] Salvar agente como asset.
- [x] Deploy de agente como AI service.
- [x] Catalogo governado de agentes e ferramentas.
- [x] Avaliacao de agente com casos de teste.

## MVP 8 - Notebooks, scripts e ambientes

- [x] Listagem e metadados de notebooks.
- [x] Editor simples de notebook ou integracao com JupyterLab em fase posterior.
- [x] Editor de scripts Python.
- [x] Ambientes de execucao: Python basico, Python GPU mockado, R mockado.
- [x] Jobs para executar notebook/script.
- [x] Logs de execucao em tempo real.
- [x] Artefatos de saida de jobs.
- [x] Integracao Git futura: conectar repositorio, publicar notebook, sincronizar assets.
- [x] Terminal de projeto futura para operacoes avancadas.

## MVP 9 - AutoAI, ML visual e experimentos

- [x] Criar assistente no-code "Criar modelo" com escolha de tarefa: classificacao, regressao, previsao temporal, ranking, extracao, sumarizacao, RAG, agente ou reforco.
- [x] Criar experimento AutoAI para dataset tabular sem exigir codigo.
- [x] Selecionar coluna alvo, metrica e tipo de tarefa.
- [x] Sugerir automaticamente tipo de tarefa, metrica e features a partir do dataset.
- [x] Painel "Modo assistido" com configuracoes recomendadas.
- [x] Painel "Modo avancado" para controlar tecnicas de treino sem programar.
- [x] Selecionar algoritmos candidatos: regressao/logistica, arvores, random forest, gradient boosting, redes neurais simples e ensembles.
- [ ] Futuro: integrar executores reais de XGBoost e LightGBM.
- [x] Configurar busca de hiperparametros: grid search, random search e bayesian optimization.
- [x] Configurar espaco de busca por parametro: learning rate, max depth, estimators, regularizacao, batch size, epochs, dropout e thresholds.
- [x] Configurar validacao: holdout, k-fold cross-validation, stratified k-fold e validacao temporal.
- [x] Configurar regularizacao: L1, L2, elastic net, weight decay e dropout para modelos neurais.
- [x] Configurar early stopping e learning-rate schedule.
- [x] Configurar balanceamento de classes: class weights, oversampling e undersampling.
- [x] Configurar feature selection: baixa variancia, alta correlacao, importancia de features e selecao manual.
- [x] Configurar ensembling: voting, bagging, boosting e stacking.
- [x] Configurar calibracao de probabilidades e threshold tuning.
- [x] Configurar data augmentation quando aplicavel por tipo de dado.
- [x] Configurar adversarial training para dados tabulares/texto quando aplicavel: gerar exemplos dificeis, perturbacoes controladas e avaliacao de robustez.
- [x] Criar fila de trials com limites de tempo, custo, numero maximo de combinacoes e parada antecipada.
- [x] Gerar pipelines candidatos mockados ou reais via biblioteca local.
- [x] Ranking de pipelines por metrica.
- [x] Detalhes de pipeline: preprocessamento, algoritmo, hiperparametros, tecnicas aplicadas, metricas e custo estimado.
- [x] Comparar trials lado a lado com metricas, parametros, matriz de confusao, curva ROC/PR quando aplicavel e importancia de features.
- [x] Explicar em linguagem natural por que um pipeline venceu.
- [x] Salvar configuracao do experimento como preset reutilizavel.
- [x] Salvar melhor pipeline como model asset.
- [x] Visual Modeler inspirado em SPSS: nos de dados, transformacao, treino, avaliacao e score.
- [x] Visual Modeler deve permitir blocos no-code para preprocessamento, treino, busca de hiperparametros, validacao, avaliacao e deploy.
- [x] Adversarial/RL builder: configurar ambiente, agente, adversario, recompensas, episodios, self-play e metricas sem escrever codigo.
- [x] Decision Optimization backlog: modelos de otimizacao, variaveis, restricoes, objetivos e resultados.

## MVP 10 - Tuning Studio

- [ ] Criar tuning experiment a partir de projeto.
- [ ] Selecionar foundation model base.
- [ ] Upload de dataset JSON/JSONL com pares input/output.
- [ ] Validacao de dados de treinamento.
- [ ] Assistente no-code para tuning: objetivo, dataset, modelo base, metrica, limites de custo e criterio de parada.
- [ ] Configurar metodo de tuning e parametros sem codigo.
- [ ] Painel avancado para tuning: learning rate, epochs, batch size, warmup, weight decay, dropout quando suportado, early stopping e validacao.
- [ ] Busca de hiperparametros para tuning: grid search, random search e bayesian optimization quando suportado pelo backend.
- [ ] Adversarial prompt tuning: gerar casos dificeis, avaliar robustez, comparar respostas e registrar falhas.
- [ ] Job de tuning com status, progresso e logs.
- [ ] Grafico de loss/metricas.
- [ ] Registrar tuned model como asset.
- [ ] Comparar modelo base vs tuned model no Prompt Lab.
- [ ] Deploy de tuned model para deployment space.

## MVP 11 - Deployment spaces e runtime

- [ ] CRUD de deployment spaces.
- [ ] Tabs do space: Overview, Assets, Deployments, Jobs, Monitor, Activity.
- [ ] Promover assets de projeto para space.
- [ ] Importar assets diretamente para space.
- [ ] Deployment online para modelos, prompt templates, AI services e agentes.
- [ ] Deployment batch para modelos e funcoes.
- [ ] Endpoint REST simulado para cada deployment.
- [ ] Interface de teste de deployment.
- [ ] Versionamento de deployments.
- [ ] Rollback para versao anterior.
- [ ] Logs, metricas e status de saude.
- [ ] Gerar snippets de API para curl, Python e JavaScript.

## MVP 12 - Pipelines e jobs

- [ ] Orchestration Pipelines visual com etapas e dependencias.
- [ ] Tipos de etapa: executar notebook, script, Data Refinery flow, treino, avaliacao, deploy.
- [ ] Parametros de pipeline.
- [ ] Agendamento manual e recorrente.
- [ ] Retentativas e timeout.
- [ ] Historico de execucoes.
- [ ] Logs por etapa.
- [ ] Visualizacao de DAG.
- [ ] Notificacoes de sucesso/falha.

## MVP 13 - Governanca e AI Factsheets

- [ ] Inventario de casos de uso de IA.
- [ ] Factsheet para modelos, prompts, agentes e deployments.
- [ ] Capturar origem, owner, objetivo, dataset, parametros, metricas, aprovacoes e status de ciclo de vida.
- [ ] Workflow de aprovacoes: draft, review, approved, deployed, retired.
- [ ] Avaliacao de modelos ML: qualidade, drift, fairness e explicabilidade.
- [ ] Avaliacao de prompts/generative AI: qualidade, PII, toxicidade/profanidade, relevancia e groundedness.
- [ ] Guardrail manager com politicas reutilizaveis.
- [ ] Associar guardrails a prompts, agentes e deployments.
- [ ] Relatorios de compliance por projeto/space.
- [ ] Linha do tempo de governanca e auditoria.

## MVP 14 - Catalogo de plataforma

- [ ] Platform connections catalog compartilhado.
- [ ] AI use cases catalog.
- [ ] Guardrail policy catalog.
- [ ] Governed agentic catalog.
- [ ] Busca e filtros globais.
- [ ] Visibilidade por item: ativo, arquivado, oculto.
- [ ] Reutilizacao de assets entre projetos e spaces.
- [ ] Metadados ativos: classificacao, sensibilidade, owner, origem e qualidade.

## MVP 15 - Lakehouse / watsonx.data inspirado

- [ ] Area de fontes de dados: object storage, tabelas, arquivos e conexoes.
- [ ] Separar conceitos de storage, metadata e compute engines.
- [ ] Catalogar tabelas e schemas.
- [ ] Preview e query SQL.
- [ ] Engines abstratos: SQL local, Spark futuro, Presto futuro, vector futuro.
- [ ] Suporte inicial a formatos abertos: CSV, Parquet, JSON.
- [ ] Governanca de dados local: mascaramento, classificacao, lineage e qualidade.
- [ ] Lineage de dataset para modelo/deployment.

## MVP 16 - Seguranca, privacidade e administracao

- [ ] Criptografia de segredos em repouso.
- [ ] Mascaramento de credenciais na UI e nos logs.
- [ ] Politica de nao armazenar prompts brutos salvo quando o usuario salvar explicitamente.
- [ ] Configuracao local para retencao de logs e prompts.
- [ ] API keys locais para providers externos.
- [ ] Limites locais de uso por provider/modelo para controlar custo.
- [ ] Auditoria pessoal de acoes importantes.
- [ ] Configuracao de regioes/providers.

## MVP 17 - APIs e integracoes

- [ ] API REST para projetos, assets, jobs, spaces e deployments.
- [ ] SDK JavaScript minimal.
- [ ] SDK Python minimal.
- [ ] Webhooks para eventos de jobs/deployments.
- [ ] Integracao com provedores LLM via adapter: OpenAI, local, IBM futuro.
- [ ] Integracao com storage S3 compativel.
- [ ] Integracao GitHub futura para notebooks e assets.
- [ ] Import/export compativel com pacotes internos do clone.

## MVP 18 - Observabilidade e custo

- [ ] Coletar latencia, tokens, erros, throughput e custo estimado por execucao.
- [ ] Dashboards por projeto, modelo e deployment.
- [ ] Alertas de falha, drift, custo e SLA.
- [ ] Tracing de pipelines e agentes.
- [ ] Logs estruturados pesquisaveis.
- [ ] Cotas por workspace.

## MVP 19 - Experiencia visual e UX

- [ ] Layout denso e operacional, adequado para ferramenta enterprise.
- [ ] Tabelas com filtros, ordenacao, colunas configuraveis e bulk actions.
- [ ] Painel lateral de detalhes para assets.
- [ ] Estados claros: Draft, Running, Failed, Ready, Deployed, Retired.
- [ ] Empty states acionaveis.
- [ ] Breadcrumbs para workspace > asset.
- [ ] Acessibilidade: foco, teclado, contraste, labels e feedback de erro.
- [ ] Responsividade desktop-first com suporte tablet/mobile para monitoramento.

## Roadmap sugerido de implementacao

1. Criar fundacao full-stack, perfil local, schema e shell da UI.
2. Implementar projetos, assets e upload/preview de dados.
3. Implementar Prompt Lab com provider mock/local.
4. Implementar deployment spaces e endpoint simulado.
5. Implementar jobs/pipelines basicos.
6. Implementar RAG local.
7. Implementar governanca/factsheets/guardrails.
8. Implementar criacao de modelos no-code com AutoAI, tuning avancado, agentes e adversarial/RL builder.
9. Substituir mocks por providers reais e hardening de seguranca.

## Definicao de pronto para o primeiro milestone

- Usuario consegue criar projeto.
- Usuario consegue adicionar dataset.
- Usuario consegue criar prompt template.
- Usuario consegue executar prompt contra provider mock/local.
- Usuario consegue salvar asset.
- Usuario consegue promover asset para deployment space.
- Usuario consegue criar deployment online.
- Usuario consegue testar endpoint simulado.
- Usuario consegue ver factsheet basico e audit trail.
- Testes de smoke passam.
