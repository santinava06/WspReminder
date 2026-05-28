param(
  [string]$TunnelName = "wspreminder-bridge"
)

$ErrorActionPreference = "SilentlyContinue"

$targets = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq "node.exe" -and ($_.CommandLine -match "bridge-server.js" -or $_.CommandLine -match "bridge-proxy.js")) -or
  ($_.Name -like "cloudflared*" -and $_.CommandLine -match "tunnel run $TunnelName")
}

if (-not $targets) {
  Write-Host "No local stack processes found." -ForegroundColor Yellow
  exit 0
}

foreach ($process in $targets) {
  Write-Host "Stopping PID $($process.ProcessId): $($process.CommandLine)" -ForegroundColor Red
  Stop-Process -Id $process.ProcessId -Force
}

Write-Host "Local stack stopped." -ForegroundColor Green
