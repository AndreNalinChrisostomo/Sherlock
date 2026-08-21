# Double Pendulum RL Desktop App

Desktop app separado do Sherlock para treinar um ambiente de pendulo duplo usando a API RL do Sherlock.

## Como rodar

1. Inicie a API do Sherlock:

```txt
npm run dev
```

O backend FastAPI fica em `http://127.0.0.1:8001/api` e o Vite tambem proxy em `http://127.0.0.1:5174/api` ou porta equivalente.

2. Abra o app desktop:

```txt
python pendulum_rl_desktop/double_pendulum_trainer.py
```

## Como funciona

- Este app desktop mantem o ambiente e a fisica do pendulo duplo.
- Cada candidato cria sua propria sessao em `POST /api/rl/session`, informando `workspaceId`.
- A cada passo o app envia `observation`, `action`, `reward`, `nextObservation` e `done` para `POST /api/rl/session/{id}/step`.
- A API do Sherlock atualiza a politica e devolve `nextAction`, `loss`, `policyVersion` e `corrections`.
- Ao fim de cada epoca, o app envia o resumo para `POST /api/rl/session/{id}/episode`.
- A tela compara multiplos candidatos e permite avaliar o melhor. Durante avaliacao, clique/arraste no canvas para perturbar o pendulo.
- A aba **AutoAI > Adversarial / RL** do Sherlock mostra os ambientes ativos do workspace informado, progresso, epoca, melhor candidato e permite salvar o modelo treinado.
- Modelos salvos expõem endpoint de acao em `/api/rl/models/{modelId}/action`.
- Remover usa `DELETE /api/rl/session/{sessionId}` e remove o ambiente da listagem monitorada.
- A UI tambem pode chamar `DELETE /api/rl/environments/{sessionId}` para remover o ambiente da listagem monitorada.
- Para validar o contrato completo sem Postman, rode `npm run rl:emulate` na raiz do Sherlock.

## Observacao

O app nao altera o Sherlock. Ele so consome a API RL existente.
