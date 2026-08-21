param(
  [int]$FrontendPort = 5173,
  [int]$BackendPort = 8001
)

$ports = @($FrontendPort, $BackendPort)
$listeners = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue
$pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $pids) {
  if ($processId -and $processId -ne $PID) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Seconds 1
npm run dev -- --host 127.0.0.1 --port $FrontendPort --strictPort
