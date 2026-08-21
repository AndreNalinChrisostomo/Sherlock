import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn, spawnSync } from "node:child_process";

const backendPort = 8001;
const backendPythonArgs = (process.env.SHERLOCK_PYTHON_ARGS || "").split(/\s+/).filter(Boolean);

function canRunBackend(command, args = []) {
  const result = spawnSync(command, [...args, "-c", "import fastapi, uvicorn, polars"], {
    cwd: process.cwd(),
    stdio: "ignore",
    windowsHide: true
  });
  return result.status === 0;
}

function selectBackendPython() {
  const configured = process.env.SHERLOCK_PYTHON || process.env.PYTHON;
  const candidates = configured
    ? [{ command: configured, args: backendPythonArgs }]
    : [
        { command: "py", args: ["-3.12", ...backendPythonArgs] },
        { command: "python", args: backendPythonArgs }
      ];
  return candidates.find((candidate) => canRunBackend(candidate.command, candidate.args)) ?? candidates[0];
}

const backendPython = selectBackendPython();

function stopBackendOnPort(port) {
  if (process.platform === "win32") {
    const script = [
      `$port = ${port}`,
      `$currentPid = ${process.pid}`,
      "$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue",
      "$listenerPids = $connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -and $_ -ne $currentPid }",
      "foreach ($ownerPid in $listenerPids) { Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue }"
    ].join("; ");
    spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      cwd: process.cwd(),
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  spawnSync("sh", ["-c", `pids=$(lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null); if [ -n "$pids" ]; then kill $pids; fi`], {
    cwd: process.cwd(),
    stdio: "ignore"
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-autoai-engine",
      configureServer(server) {
        stopBackendOnPort(backendPort);
        const engine = spawn(backendPython.command, [...backendPython.args, "backend/autoai_api.py"], { cwd: process.cwd(), stdio: "inherit", windowsHide: true });
        server.httpServer?.once("close", () => engine.kill());
      }
    }
  ],
  server: { proxy: { "/api": `http://127.0.0.1:${backendPort}` } }
});
