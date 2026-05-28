param(
  [string]$TunnelName = "wspreminder-bridge"
)

$ErrorActionPreference = "SilentlyContinue"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $RootDir "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Test-PortListening($Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Backend {
  if (Test-PortListening 9090) {
    Write-Host "Backend already listening on 9090" -ForegroundColor Yellow
    return
  }

  $logFile = Join-Path $LogDir "backend.log"
  $cmd = "set `"NODE_ENV=production`" & set `"PORT=9090`" & set `"LOG_LEVEL=info`" & node index.js > `"$logFile`" 2>&1"

  Start-Process -FilePath "cmd.exe" `
    -ArgumentList @("/c", $cmd) `
    -WorkingDirectory $RootDir `
    -WindowStyle Hidden

  Write-Host "Started backend on port 9090" -ForegroundColor Green
}

function Start-Tunnel {
  $running = Get-CimInstance Win32_Process |
    Where-Object { $_.Name -like "cloudflared*" -and $_.CommandLine -match "tunnel run $TunnelName" }

  if ($running) {
    Write-Host "Cloudflare tunnel $TunnelName already running" -ForegroundColor Yellow
    return
  }

  Start-Process -FilePath "cloudflared" `
    -ArgumentList @("tunnel", "run", $TunnelName) `
    -WorkingDirectory $RootDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "cloudflared-named.log") `
    -RedirectStandardError (Join-Path $LogDir "cloudflared-named.err.log")

  Write-Host "Started Cloudflare tunnel $TunnelName" -ForegroundColor Green
}

Start-Backend
Start-Sleep -Seconds 3
Start-Tunnel

Write-Host ""
Write-Host "Backend started on http://localhost:9090" -ForegroundColor Cyan
Write-Host "Public URL: https://bridge.wspreminder.online" -ForegroundColor Cyan
Write-Host "API base: https://bridge.wspreminder.online/api/login" -ForegroundColor Cyan
Write-Host "Health:   https://bridge.wspreminder.online/health" -ForegroundColor Cyan
