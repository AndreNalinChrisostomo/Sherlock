from __future__ import annotations

import json
import math
import queue
import random
import threading
import time
import tkinter as tk
from dataclasses import dataclass, field
from tkinter import ttk
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class PendulumState:
    theta1: float
    theta2: float
    omega1: float
    omega2: float


@dataclass
class Candidate:
    name: str
    torque: float
    learning_rate: float
    discount: float
    exploration: float
    workspace_id: str = "Sandbox"
    target_episodes: int = 1
    session_id: str = ""
    action: int = 1
    average_reward: float = 0.0
    best_reward: float = -1_000_000.0
    success_rate: float = 0.0
    policy_version: int = 0
    last_loss: float = 0.0
    status: str = "idle"
    rewards: list[float] = field(default_factory=list)


class SherlockRlClient:
    def __init__(self, api_base: str, token: str = "") -> None:
        self.api_base = api_base.rstrip("/")
        self.token = token

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(f"{self.api_base}{path}", data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=12) as response:
                return json.loads(response.read().decode("utf-8") or "{}")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"API {error.code}: {detail}") from error
        except URLError as error:
            raise RuntimeError(f"Nao foi possivel conectar na API: {error.reason}") from error

    def create_session(self, candidate: Candidate) -> dict[str, Any]:
        return self._request("POST", "/rl/session", {
            "environment": "desktop-double-pendulum",
            "workspaceId": candidate.workspace_id,
            "candidateName": candidate.name,
            "observationSize": 4,
            "actionCount": 3,
            "targetEpisodes": candidate.target_episodes,
            "learningRate": candidate.learning_rate,
            "discount": candidate.discount,
            "exploration": candidate.exploration,
            "algorithm": "q-learning",
        })

    def train_step(
        self,
        session_id: str,
        observation: list[float],
        action: int,
        reward: float,
        next_observation: list[float],
        done: bool,
        episode: int,
    ) -> dict[str, Any]:
        return self._request("POST", f"/rl/session/{session_id}/step", {
            "observation": observation,
            "action": action,
            "reward": reward,
            "nextObservation": next_observation,
            "done": done,
            "episode": episode,
        })

    def finish_episode(self, session_id: str, episode: int, total_reward: float, steps: int, success: bool) -> dict[str, Any]:
        return self._request("POST", f"/rl/session/{session_id}/episode", {
            "episode": episode,
            "totalReward": total_reward,
            "steps": steps,
            "success": success,
        })


def normalize_angle(value: float) -> float:
    while value > math.pi:
        value -= math.tau
    while value < -math.pi:
        value += math.tau
    return value


def reset_state() -> PendulumState:
    return PendulumState(
        theta1=random.uniform(-0.12, 0.12),
        theta2=random.uniform(-0.16, 0.16),
        omega1=random.uniform(-0.04, 0.04),
        omega2=random.uniform(-0.04, 0.04),
    )


def observe(state: PendulumState) -> list[float]:
    return [
        max(-2.0, min(2.0, state.theta1)),
        max(-2.0, min(2.0, state.theta2)),
        max(-2.0, min(2.0, state.omega1 / 4.0)),
        max(-2.0, min(2.0, state.omega2 / 4.0)),
    ]


def failed(state: PendulumState) -> bool:
    return abs(state.theta1) > 1.35 or abs(state.theta2) > 1.45


def step_physics(state: PendulumState, action: int, torque_limit: float, disturbance: float = 0.0, dt: float = 0.025) -> PendulumState:
    torque = (action - 1) * torque_limit
    coupling = math.sin(state.theta2 - state.theta1)
    alpha1 = 8.8 * math.sin(state.theta1) + 1.45 * coupling + 0.66 * torque + 0.25 * disturbance - 0.12 * state.omega1
    alpha2 = 7.4 * math.sin(state.theta2) - 1.2 * coupling + 0.18 * torque + 0.72 * disturbance - 0.09 * state.omega2
    omega1 = max(-8.0, min(8.0, state.omega1 + alpha1 * dt))
    omega2 = max(-8.0, min(8.0, state.omega2 + alpha2 * dt))
    return PendulumState(
        theta1=normalize_angle(state.theta1 + omega1 * dt),
        theta2=normalize_angle(state.theta2 + omega2 * dt),
        omega1=omega1,
        omega2=omega2,
    )


def reward_for(state: PendulumState, action: int) -> float:
    if failed(state):
        return -12.0
    posture = 5.2 * state.theta1 * state.theta1 + 4.0 * state.theta2 * state.theta2
    velocity = 0.06 * state.omega1 * state.omega1 + 0.04 * state.omega2 * state.omega2
    effort = 0.025 * abs(action - 1)
    return 2.4 - posture - velocity - effort


class TrainerApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Double Pendulum RL Trainer - Sherlock API")
        self.geometry("1180x760")
        self.minsize(980, 640)

        self.events: queue.Queue[tuple[str, Any]] = queue.Queue()
        self.stop_training = threading.Event()
        self.candidates: list[Candidate] = []
        self.best_candidate: Candidate | None = None
        self.eval_state = reset_state()
        self.eval_action = 1
        self.eval_running = False
        self.pointer_down = False
        self.disturbance = 0.0

        self._build_ui()
        self.after(50, self._drain_events)
        self.after(25, self._eval_tick)

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=10)
        root.pack(fill=tk.BOTH, expand=True)
        root.columnconfigure(0, weight=0)
        root.columnconfigure(1, weight=1)
        root.rowconfigure(1, weight=1)

        controls = ttk.LabelFrame(root, text="Sherlock RL API", padding=10)
        controls.grid(row=0, column=0, columnspan=2, sticky="ew")
        controls.columnconfigure(1, weight=1)
        self.api_var = tk.StringVar(value="http://127.0.0.1:8001/api")
        self.token_var = tk.StringVar(value="")
        self.workspace_var = tk.StringVar(value="Sandbox")
        ttk.Label(controls, text="API base").grid(row=0, column=0, sticky="w")
        ttk.Entry(controls, textvariable=self.api_var).grid(row=0, column=1, sticky="ew", padx=8)
        ttk.Label(controls, text="Token").grid(row=0, column=2, sticky="w")
        ttk.Entry(controls, textvariable=self.token_var, show="*").grid(row=0, column=3, sticky="ew", padx=8)
        self.episodes_var = tk.IntVar(value=45)
        self.steps_var = tk.IntVar(value=140)
        self.count_var = tk.IntVar(value=6)
        ttk.Label(controls, text="Candidatos").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Spinbox(controls, from_=1, to=12, textvariable=self.count_var, width=7).grid(row=1, column=1, sticky="w", padx=8, pady=(8, 0))
        ttk.Label(controls, text="Workspace").grid(row=1, column=2, sticky="w", pady=(8, 0))
        ttk.Entry(controls, textvariable=self.workspace_var, width=16).grid(row=1, column=3, sticky="w", padx=8, pady=(8, 0))
        ttk.Label(controls, text="Epocas").grid(row=1, column=4, sticky="w", pady=(8, 0))
        ttk.Spinbox(controls, from_=1, to=500, textvariable=self.episodes_var, width=7).grid(row=1, column=5, sticky="w", padx=8, pady=(8, 0))
        ttk.Label(controls, text="Passos/epoca").grid(row=1, column=6, sticky="w", pady=(8, 0))
        ttk.Spinbox(controls, from_=20, to=1000, textvariable=self.steps_var, width=8).grid(row=1, column=7, sticky="w", padx=8, pady=(8, 0))
        ttk.Button(controls, text="Treinar candidatos", command=self.start_training).grid(row=0, column=8, rowspan=2, sticky="ns", padx=(14, 0))
        ttk.Button(controls, text="Parar", command=self.stop_training.set).grid(row=0, column=9, rowspan=2, sticky="ns", padx=(8, 0))

        left = ttk.LabelFrame(root, text="Candidatos", padding=8)
        left.grid(row=1, column=0, sticky="nsew", pady=(10, 0), padx=(0, 10))
        self.tree = ttk.Treeview(left, columns=("reward", "success", "loss", "policy", "status"), show="headings", height=20)
        for key, label, width in [
            ("reward", "reward medio", 95),
            ("success", "sucesso", 80),
            ("loss", "loss", 80),
            ("policy", "policy v", 80),
            ("status", "status", 100),
        ]:
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, anchor=tk.CENTER)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind("<<TreeviewSelect>>", self._select_candidate)

        right = ttk.Frame(root)
        right.grid(row=1, column=1, sticky="nsew", pady=(10, 0))
        right.rowconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)
        self.canvas = tk.Canvas(right, bg="#f8fafc", highlightthickness=1, highlightbackground="#cbd5e1")
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.canvas.bind("<ButtonPress-1>", self._pointer_press)
        self.canvas.bind("<B1-Motion>", self._pointer_motion)
        self.canvas.bind("<ButtonRelease-1>", self._pointer_release)
        footer = ttk.Frame(right)
        footer.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        ttk.Button(footer, text="Avaliar melhor", command=self.start_eval).pack(side=tk.LEFT)
        ttk.Button(footer, text="Pausar avaliacao", command=self.stop_eval).pack(side=tk.LEFT, padx=8)
        ttk.Button(footer, text="Reset", command=self.reset_eval).pack(side=tk.LEFT)
        self.status_var = tk.StringVar(value="Pronto. Inicie o Sherlock backend e treine candidatos.")
        ttk.Label(root, textvariable=self.status_var).grid(row=2, column=0, columnspan=2, sticky="ew", pady=(8, 0))

    def _make_candidates(self) -> list[Candidate]:
        count = max(1, min(12, int(self.count_var.get())))
        torques = [5.5, 7.0, 8.5, 10.0]
        learning_rates = [0.08, 0.12, 0.18]
        explorations = [0.08, 0.14, 0.22]
        candidates = []
        for index in range(count):
            candidates.append(Candidate(
                name=f"C{index + 1}",
                torque=torques[index % len(torques)],
                learning_rate=learning_rates[(index // len(torques)) % len(learning_rates)],
                discount=0.985,
                exploration=explorations[index % len(explorations)],
                workspace_id=self.workspace_var.get().strip() or "Sandbox",
                target_episodes=max(1, int(self.episodes_var.get())),
            ))
        return candidates

    def start_training(self) -> None:
        if any(candidate.status == "running" for candidate in self.candidates):
            return
        self.stop_training.clear()
        self.candidates = self._make_candidates()
        self.best_candidate = None
        self.tree.delete(*self.tree.get_children())
        for candidate in self.candidates:
            self.tree.insert("", tk.END, iid=candidate.name, values=("0.00", "0%", "0.0000", "0", "idle"))
        thread = threading.Thread(target=self._train_worker, daemon=True)
        thread.start()

    def _train_worker(self) -> None:
        client = SherlockRlClient(self.api_var.get(), self.token_var.get())
        for candidate in self.candidates:
            if self.stop_training.is_set():
                break
            try:
                session = client.create_session(candidate)
                candidate.session_id = str(session["sessionId"])
                candidate.status = "running"
                self.events.put(("candidate", candidate))
                successes = 0
                for episode in range(1, int(self.episodes_var.get()) + 1):
                    if self.stop_training.is_set():
                        break
                    state = reset_state()
                    total_reward = 0.0
                    steps = 0
                    action = 1
                    for step in range(int(self.steps_var.get())):
                        observation = observe(state)
                        next_state = step_physics(state, action, candidate.torque)
                        reward = reward_for(next_state, action)
                        done = failed(next_state) or step == int(self.steps_var.get()) - 1
                        result = client.train_step(candidate.session_id, observation, action, reward, observe(next_state), done, episode)
                        candidate.policy_version = int(result["policyVersion"])
                        candidate.last_loss = float(result["loss"])
                        action = int(result["nextAction"])
                        total_reward += reward
                        steps = step + 1
                        state = next_state
                        if done:
                            break
                    success = total_reward > 0 and not failed(state)
                    if success:
                        successes += 1
                    client.finish_episode(candidate.session_id, episode, total_reward, steps, success)
                    candidate.rewards.append(total_reward)
                    candidate.average_reward = sum(candidate.rewards) / max(len(candidate.rewards), 1)
                    candidate.best_reward = max(candidate.best_reward, total_reward)
                    candidate.success_rate = successes / episode
                    self.events.put(("candidate", candidate))
                candidate.status = "done"
                self.events.put(("candidate", candidate))
            except Exception as error:
                candidate.status = "error"
                self.events.put(("candidate", candidate))
                self.events.put(("status", f"{candidate.name}: {error}"))
        done_candidates = [item for item in self.candidates if item.rewards]
        self.best_candidate = max(done_candidates, key=lambda item: (item.average_reward, item.success_rate), default=None)
        self.events.put(("best", self.best_candidate))

    def _drain_events(self) -> None:
        try:
            while True:
                event, payload = self.events.get_nowait()
                if event == "candidate":
                    self._render_candidate(payload)
                elif event == "status":
                    self.status_var.set(str(payload))
                elif event == "best":
                    if payload:
                        self.status_var.set(f"Melhor candidato: {payload.name} | reward medio {payload.average_reward:.2f} | sessao {payload.session_id}")
                    else:
                        self.status_var.set("Treino encerrado sem candidato valido.")
        except queue.Empty:
            pass
        self.after(50, self._drain_events)

    def _render_candidate(self, candidate: Candidate) -> None:
        self.tree.item(candidate.name, values=(
            f"{candidate.average_reward:.2f}",
            f"{candidate.success_rate * 100:.1f}%",
            f"{candidate.last_loss:.4f}",
            str(candidate.policy_version),
            candidate.status,
        ))

    def _select_candidate(self, _event: tk.Event) -> None:
        selection = self.tree.selection()
        if not selection:
            return
        name = selection[0]
        self.best_candidate = next((candidate for candidate in self.candidates if candidate.name == name), self.best_candidate)
        if self.best_candidate:
            self.status_var.set(f"Selecionado {self.best_candidate.name}: sessao {self.best_candidate.session_id or 'sem sessao'}")

    def start_eval(self) -> None:
        if not self.best_candidate or not self.best_candidate.session_id:
            self.status_var.set("Treine ou selecione um candidato com sessao antes de avaliar.")
            return
        self.eval_running = True

    def stop_eval(self) -> None:
        self.eval_running = False

    def reset_eval(self) -> None:
        self.eval_state = reset_state()
        self.eval_action = 1
        self.disturbance = 0.0
        self._draw()

    def _eval_tick(self) -> None:
        if self.eval_running and self.best_candidate:
            previous = self.eval_state
            self.eval_state = step_physics(previous, self.eval_action, self.best_candidate.torque, self.disturbance)
            reward = reward_for(self.eval_state, self.eval_action)
            try:
                client = SherlockRlClient(self.api_var.get(), self.token_var.get())
                result = client.train_step(
                    self.best_candidate.session_id,
                    observe(previous),
                    self.eval_action,
                    reward,
                    observe(self.eval_state),
                    failed(self.eval_state),
                    999_999,
                )
                self.eval_action = int(result["nextAction"])
            except Exception as error:
                self.status_var.set(str(error))
                self.eval_running = False
            if failed(self.eval_state):
                self.eval_state = reset_state()
            self.disturbance *= 0.88
        self._draw()
        self.after(35, self._eval_tick)

    def _pointer_press(self, event: tk.Event) -> None:
        self.pointer_down = True
        self._apply_pointer(event)

    def _pointer_motion(self, event: tk.Event) -> None:
        if self.pointer_down:
            self._apply_pointer(event)

    def _pointer_release(self, _event: tk.Event) -> None:
        self.pointer_down = False

    def _apply_pointer(self, event: tk.Event) -> None:
        width = max(1, self.canvas.winfo_width())
        self.disturbance = ((event.x / width) - 0.5) * 22.0

    def _draw(self) -> None:
        canvas = self.canvas
        width = max(1, canvas.winfo_width())
        height = max(1, canvas.winfo_height())
        canvas.delete("all")
        canvas.create_rectangle(0, 0, width, height, fill="#f8fafc", outline="")
        for x in range(0, width, 40):
            canvas.create_line(x, 0, x, height, fill="#e2e8f0")
        origin_x = width / 2
        origin_y = min(110, height * 0.2)
        length1 = min(width, height) * 0.27
        length2 = min(width, height) * 0.23
        state = self.eval_state
        joint_x = origin_x + math.sin(state.theta1) * length1
        joint_y = origin_y + math.cos(state.theta1) * length1
        bob_x = joint_x + math.sin(state.theta1 + state.theta2) * length2
        bob_y = joint_y + math.cos(state.theta1 + state.theta2) * length2
        canvas.create_line(origin_x, origin_y - 60, origin_x, origin_y + length1 + length2 + 30, fill="#94a3b8")
        canvas.create_line(origin_x, origin_y, joint_x, joint_y, fill="#0f62fe", width=7)
        canvas.create_line(joint_x, joint_y, bob_x, bob_y, fill="#0f62fe", width=7)
        canvas.create_oval(origin_x - 8, origin_y - 8, origin_x + 8, origin_y + 8, fill="#111827", outline="")
        canvas.create_oval(joint_x - 12, joint_y - 12, joint_x + 12, joint_y + 12, fill="#198038", outline="")
        canvas.create_oval(bob_x - 15, bob_y - 15, bob_x + 15, bob_y + 15, fill="#da1e28", outline="")
        if abs(self.disturbance) > 0.2:
            canvas.create_text(20, 24, anchor="w", text=f"perturbacao {self.disturbance:.1f}", fill="#b45309")
        candidate = self.best_candidate.name if self.best_candidate else "nenhum"
        canvas.create_text(
            16,
            height - 22,
            anchor="w",
            text=f"candidato {candidate} | theta1 {state.theta1:.2f} theta2 {state.theta2:.2f} | clique/arraste para perturbar",
            fill="#253041",
        )


if __name__ == "__main__":
    random.seed(739)
    app = TrainerApp()
    app.mainloop()
