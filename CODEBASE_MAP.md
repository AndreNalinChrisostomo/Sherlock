# Codebase Map

## 1. Project Identity

### What this project is
Sherlock is a local watsonx-inspired studio demo with workspaces, assets, data prep, visualization canvas, AutoAI, Prompt Lab, RAG Lab, Agent Lab, and runtime/notebook flows.

### App type
Client/server web app plus a separate Python desktop RL environment app.

### Main languages
TypeScript, TSX, CSS, Python.

### Main frameworks/libraries
React 19, Vite, Vitest, Playwright, Three.js, FastAPI, Polars, Parquet, scikit-learn.

### Package/build system
npm with Vite and TypeScript. Python backend is started by `vite.config.js`.

### Runtime requirements
Node.js/npm and Python with `backend/requirements.txt`.

## 2. How To Work With This Project

### Install command
```txt
npm install
pip install -r backend/requirements.txt
```

### Run command
```txt
npm run dev
```

### Build command
```txt
npm run build
```

### Test command
```txt
npm test
npm run rl:emulate
```

### Lint/typecheck command
```txt
npm run build
```

### Important environment variables
`SHERLOCK_PYTHON` can point Vite's backend launcher to a specific Python executable. `SHERLOCK_PYTHON_ARGS` can pass launcher arguments such as `-3.12` when using `py`.

### Local development notes
`vite.config.js` starts `backend/autoai_api.py` on `127.0.0.1:8001` and proxies `/api` to it. Demo videos can be recorded with `scripts/record-sherlock-demo.mjs` while a Vite server is running.

### Project rulebook
`RULEBOOK.md` in the repository root defines inquebravel rules for code quality, Refine, and Visualize. It must be checked before changing implementation style, dataset loading, analysis, previews, visualization DAG behavior, Python node flow handling, or chart execution.

## 3. Architecture Overview

### High-level architecture
React SPA with a local FastAPI backend for heavier AutoAI, visualization, and RL trainer endpoints.

### Entry points
`index.html`, `src/main.tsx`, `src/App.tsx`, `backend/autoai_api.py`.

### Main execution flow
`App.tsx` owns the studio shell and its persistent global tab manager. Feature views call backend `/api/*` routes for execution.

### Data flow
Studio assets/state flow from `App.tsx` into feature views. Uploaded CSV/TSV/TXT data assets are staged on the FastAPI backend, converted to Parquet with Polars, capped at 500,000 operational rows, and referenced from frontend assets by `metadata.backendDatasetId`; previews are visual ranges only. Files above the cap are not registered as operational assets and must become a deterministic random sample asset. AutoAI calls the backend for supervised/unsupervised trials and RL trainer updates.

### State management
React local state plus browser local storage through `src/storage.ts` and `src/studioTabs.ts`; backend keeps in-memory caches/sessions.

### Persistence/storage
Browser local storage, backend in-memory caches/sessions, staged upload files, Parquet datasets in `.sherlock_datasets/`, and a JSON dataset registry containing parquet path, source filename, schema, row count, delimiter and sampling metadata.

### External integrations
No required external service. AutoAI can call a configured external RL trainer API when URL points outside the local `/api` proxy.

## 4. Directory Map

### `src/`
Purpose: React UI, domain models, local engines, tests, styles.
Important files: `App.tsx`, `studioTabs.ts`, `AutoAiView.tsx`, `autoAi.ts`, `reinforcementApi.ts`, `styles.css`.
Common reasons to edit: Add UI modules, local simulation logic, asset/job registration, tests.

### `backend/`
Purpose: FastAPI engine for AutoAI, visualization, and RL trainer API.
Important files: `autoai_api.py`, `requirements.txt`.
Common reasons to edit: Add or change API-backed computation.

### `scripts/`
Purpose: Small local utility scripts for demo data generation and API flow diagnostics.
Important files: `emulate-rl-flow.py`, `generate-supervised-dataset.mjs`, `generate-unsupervised-dataset.mjs`, `record-sherlock-demo.mjs`.
Common reasons to edit: Add reproducible local diagnostics or dataset generators.

### `pendulum_rl_desktop/`
Purpose: Separate desktop app for double-pendulum RL training against the Sherlock RL trainer API.
Important files: `double_pendulum_trainer.py`, `README.md`.
Common reasons to edit: Change pendulum physics, candidate search, UI controls, or API base behavior.
Notes: This app is intentionally separate from the Sherlock React app and only consumes `/api/rl/*`.

## 5. Feature Map

### Feature: AutoAI
User-facing meaning: No-code model training, visual pipelines, reinforcement, optimization.
Internal meaning: `AutoAiView.tsx` renders UI; `autoAi.ts` contains shared types and local simulation helpers; `backend/autoai_api.py` runs backend engines.
Related files: `src/AutoAiView.tsx`, `src/autoAi.ts`, `src/reinforcementApi.ts`, `backend/autoai_api.py`, `src/autoAi.test.ts`.
Known risks: AutoAI view is large; keep changes targeted.

### Feature: RL Trainer API
User-facing meaning: An external app owns the environment and starts training for a specific workspace; backend updates policy, tracks active sessions, and returns next action/corrections.
Internal meaning: `src/reinforcementApi.ts` is the frontend client; `backend/autoai_api.py` owns `/api/rl/*` trainer sessions.
Related files: `src/reinforcementApi.ts`, `src/AutoAiView.tsx`, `backend/autoai_api.py`.
Inputs: workspaceId, environment, candidateName, observation, action, reward, nextObservation, done, episode metadata.
Outputs: nextAction, loss, episodeReward, policyVersion, corrections, policy snapshot, connected environment status, saved model action endpoint, deleted environment status.
Notes: AutoAI Adversarial/RL polls connected environments automatically every 2 seconds while the tab is open. `DELETE /api/rl/session/{sessionId}` and `DELETE /api/rl/environments/{sessionId}` remove the environment from the monitored list.

### Feature: Double Pendulum Desktop Trainer
User-facing meaning: Standalone desktop app that owns the double-pendulum environment, trains multiple candidates, compares them, and evaluates the selected/best candidate interactively.
Internal meaning: Python/Tkinter app sends experience transitions to Sherlock `/api/rl/*` and uses returned `nextAction` values during training/evaluation.
Related files: `pendulum_rl_desktop/double_pendulum_trainer.py`, `pendulum_rl_desktop/README.md`.
Inputs: Sherlock API base URL, token, candidate count, epochs, steps per epoch, mouse disturbance during evaluation.
Outputs: Candidate table, reward/success/loss/policy metrics, interactive pendulum canvas.
Known risks: Evaluation keeps learning online by sending transitions to the API; RL sessions are in-memory in Sherlock backend.

## 6. Module Map

### Module: Backend AutoAI Engine
Purpose: FastAPI routes for `/api/autoai/run`, `/api/autoai/health`, and `/api/visualization/execute`.
Related files: `backend/autoai_api.py`.

### Module: Data Refinery
Purpose: Loads operational datasets from backend Parquet, applies no-code prep steps, computes complete profiles/quality/suggestions, and creates refined data assets.
Related files: `src/DataPrepView.tsx`, `src/dataPrep.ts`, `src/App.tsx`, `backend/autoai_api.py`.
Public behavior: Backend-backed data assets call `/api/datasets/{datasetId}/refinery/profile` for full-dataset health/profile and `/api/datasets/{datasetId}/refinery/run` to write a refined Parquet dataset. Browser rows are only display previews; source and transformed profile metadata come from the complete backend frame. Refined backend assets preserve `metadata.backendDatasetId` so later Data Refinery/Visualizer work stays on Parquet instead of `rowsJson`.

### Module: Visualization Canvas
Purpose: Executes visualization DAGs and renders charts from typed analytical tables.
Related files: `src/VisualizationCanvasView.tsx`, `src/visualizationCanvas.ts`.
Public behavior: backend serialization preserves Polars `datetime` and numeric dtypes in schema results. `datetime` fields are temporal X-axis candidates for line, area, bar, and 2D scatter charts; Y/Z, histograms, boxplots, and heatmaps remain numeric-only. Python nodes expose multiple typed input/output ports for distinguishable branches; code receives isolated `df` and `inputs` `pl.DataFrame` copies so mutations cannot affect parents or sibling nodes.
Data sources: Canvas execution accepts either legacy inline `rows` or a backend `datasetId`; backend-backed assets execute DAG nodes against the complete operational Parquet dataset while preview ranges only limit displayed rows. Oversized legacy CSV datasets are blocked with `DATASET_OVER_LIMIT` until a sample asset is created.

### Module: Global Studio Tabs
Purpose: Keeps Home pinned and restores contextual workspace, data, visualization, notebook and lab tabs from browser local storage.
Related files: `src/App.tsx`, `src/studioTabs.ts`, `src/studioTabs.test.ts`, `src/styles.css`.
Public behavior: Existing matching view/context tabs are focused instead of duplicated; data assets, visualization flows and notebook assets receive distinct tabs. Projects, assets, Canvas, Data Refinery, AutoAI, Labs and notebooks remain mounted while hidden during the current session.

### Module: RL Trainer Client
Purpose: Typed frontend client for RL trainer sessions.
Related files: `src/reinforcementApi.ts`.
Public API: trainer session creation, transition training, episode finalization, active environment list, policy fetch, save/list saved models, delete session/environment with backend-staleness diagnostics.

### Module: RL Flow Emulator
Purpose: Reproducible local script that emulates an external RL environment through session creation, epochs, policy fetch, and complete deletion through both session and environment DELETE endpoints.
Related files: `scripts/emulate-rl-flow.py`.
Public API: Run with `npm run rl:emulate`.
Used by: Developers validating the RL API contract.

### Module: Desktop Double Pendulum App
Purpose: Tkinter desktop environment app and HTTP client for Sherlock RL trainer API.
Related files: `pendulum_rl_desktop/double_pendulum_trainer.py`.
Public API: Run with `python pendulum_rl_desktop/double_pendulum_trainer.py`.
Used by: User directly as a separate desktop app.

## 7. Glossary

### Term: RL trainer
Means: Backend service that updates a policy from app-provided environment data; it does not own or step the environment. It also tracks active sessions by workspace and stores model snapshots.
Related files: `src/reinforcementApi.ts`, `backend/autoai_api.py`, `src/AutoAiView.tsx`.

### Term: Environment app
Means: Separate app/UI/simulator that owns physics/state and sends experience tuples to the trainer API.

### Term: Saved RL model
Means: Snapshot of a trained policy saved from an active RL session. Use `/api/rl/models/{modelId}/action` to connect an external app to the saved policy.
Related files: `backend/autoai_api.py`, `src/reinforcementApi.ts`, `src/AutoAiView.tsx`.

## 8. Commands

### Development
```txt
npm run dev
python pendulum_rl_desktop/double_pendulum_trainer.py
$env:SHERLOCK_BASE_URL="http://127.0.0.1:5175"; node scripts/record-sherlock-demo.mjs
```

### Testing
```txt
npm test
npm run rl:emulate
```

### Build
```txt
npm run build
```

## 9. Conventions

Feature modules use PascalCase for React views and camelCase for engine helpers. Tests use Vitest under `src/**/*.test.ts`. Global tab identity is intentionally contextual: view + workspace + asset + flow + notebook.

## 10. Known Risks And Traps

- `src/App.tsx` and `src/AutoAiView.tsx` are large; avoid broad refactors.
- `vite.config.js` starts Python backend silently.
- `dist/`, logs, `node_modules/`, and `backend/__pycache__/` are generated/runtime artifacts.
- `pendulum_rl_desktop/__pycache__/` is generated by Python validation and ignored.
- RL trainer sessions are in-memory and reset when the backend restarts.

## 11. Map Maintenance Log

### Last updated
Date: 2026-08-12

### What changed
`vite.config.js` now selects a Python runtime that can import the backend's required FastAPI/Uvicorn/Polars stack before starting `backend/autoai_api.py`, preferring `py -3.12` when no explicit `SHERLOCK_PYTHON` is configured. Backend stdout/stderr is inherited by the dev server so startup failures are visible instead of leaving Vite connected to a stale incompatible process.
Added a persistent global tab manager with a fixed Home tab, contextual duplicate detection, close controls, keyboard/middle-click closure, localStorage restoration, and hidden mounted state for workspace, asset, canvas, data, AutoAI, lab and notebook views.

### Why the map changed
Navigation no longer relies on one global active view: workspace, asset, flow and notebook context now need to survive tab switching and reloads.

### Current update
Visualization-flow imports now preserve the active notebook draft before opening the selection canvas, and selecting a node in notebook import mode executes it to make a real snapshot available. Python DAG nodes support multiple isolated input frames through `inputs` and persist colored secondary-port connections.

### Current update
Canvas node dragging now runs from global pointer movement, keeping the gesture active when the pointer crosses node boundaries or leaves the canvas element. Buttons, fields, resize handles, and connection ports do not start a node drag.

### Current update
Python visualization nodes now expose up to ten paired, dynamically positioned input/output channels. Each numbered channel runs against an isolated Polars table copy and is cached as its own branch result. Data casts accept an optional datetime format so temporal schemas are retained predictably.

### Current update
Visualization date casts now treat a lone `%Y` format as an explicit year extraction from parseable date strings, returning a numeric year column. Full date formats such as `%d/%m/%Y` still parse into datetime columns for temporal chart axes.

### Current update
`RULEBOOK.md` now includes a global code-quality rule: new code must be clean, optimized, readable, maintainable, aligned with local best practices, and never merely cosmetic.

### Current update
Visualizer execution reports backend source-read and total execution timing, but the canvas no longer switches to manual recalculation for slow datasets. Node/config/range changes always schedule automatic branch execution; the right inspector `Executar` button remains available as an explicit rerun control.

### Current update
Bar chart configuration now treats the X axis as categorical or temporal, keeps numeric columns such as `count` as measures, rejects `series` equal to the X column, and limits legends to the visible rendered series so grouped/stacked bars do not create phantom legend entries or ultra-thin bars from invalid self-series settings.

### Current update
Visualizer backend execution caches the unchanged source Polars DataFrame by dataset file signature so downstream branches can reuse node results without rereading Parquet files first. This cache supports the always-live canvas execution model after manual recalculation mode was removed.

### Current update
Backend dataset handling migrated from CSV-operational flow to Polars/Parquet. CSV/TSV/TXT uploads are staged, delimiter-detected, counted, converted to Parquet when <=500,000 rows, or blocked with a sampling prompt when larger. New `/api/datasets/{id}/sample` creates deterministic 500,000-row Parquet sample assets, legacy CSV datasets lazily migrate or return `DATASET_OVER_LIMIT`, visualization DAG execution/info/describe/Python code nodes operate on `pl.DataFrame`, frontend upload UI handles per-file sampling/cancel flows, and Vite can launch a chosen backend Python through `SHERLOCK_PYTHON`.

### Current update
Data Refinery backend-backed assets now compute source profile, transformed profile, quality score, suggestions, and refined outputs through FastAPI/Polars over the complete operational Parquet dataset. The frontend uses backend results for health/profile while keeping only preview rows in memory, and refined backend outputs are registered as Parquet assets with their backend dataset id preserved.

### Current update
Data Refinery now treats `backendDatasetId` assets as backend-only for health/profile decisions: it no longer falls back to `profileRows` over preview rows while backend profile data is loading or unavailable. Backend refined outputs are blocked unless the backend returns a valid Parquet dataset id, and the Visualization Canvas reads preserved `backendSchema` metadata before preview rows so refined backend assets reopen against the complete operational dataset instead of the visual sample.

### Current update
Data Refinery preview display for backend-backed assets now falls back only to the visual backend preview when no recipe steps are applied and the transformed preview has not arrived yet. This keeps the grid from showing zero rows without using preview rows for health, profile, validation, transformation, or refined asset creation.

### Current update
Backend-backed Data Refinery assets no longer fabricate an interim empty profile where every column is marked as fully missing while the complete backend profile is loading. Pending backend profile state now keeps column null counts at zero and the summary shows an explicit loading label until the full Polars/Parquet profile arrives or an error is displayed.

### Current update
Data Refinery now centralizes pending backend profile creation/detection in `src/dataPrep.ts` and tests that pending profiles do not fabricate null counts. The table headers, health drawer, schema list, and quality bars render explicit loading states while backend profile data is pending instead of showing `Empty`, `0% completo`, or fake column metrics.

### Current update
`RULEBOOK.md` now includes the local runtime invariant that only one backend instance may run at a time. `vite.config.js` enforces it by stopping any existing listener on backend port `8001` before spawning `backend/autoai_api.py`, keeping the Vite proxy from attaching to a stale backend after launcher or backend changes.
