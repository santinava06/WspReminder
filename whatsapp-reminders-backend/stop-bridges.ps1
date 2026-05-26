# Stop all bridge-server processes
$bridgeProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'bridge-server' }

if (-not $bridgeProcs) {
  Write-Host "No bridge processes found." -ForegroundColor Yellow
  exit
}

Write-Host "Stopping bridge servers..." -ForegroundColor Cyan
foreach ($p in $bridgeProcs) {
  Write-Host "  Stopping PID $($p.ProcessId) ($($p.CommandLine -replace '.*BRIDGE_PORT=(\d+).*','port $1'))" -ForegroundColor Red
  Stop-Process -Id $p.ProcessId -Force
}
Write-Host "Done." -ForegroundColor Green
