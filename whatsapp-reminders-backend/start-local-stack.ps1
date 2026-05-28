param(
  [string]$TunnelName = "wspreminder-bridge"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $RootDir "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$Bridges = @(
  @{ Session = "admin"; Port = 9001 },
  @{ Session = "erika"; Port = 9002 },
  @{ Session = "melina"; Port = 9003 },
  @{ Session = "academico-1"; Port = 9004 },
  @{ Session = "in"; Port = 9005 },
  @{ Session = "luciana"; Port = 9006 },
  @{ Session = "yanina"; Port = 9007 },
  @{ Session = "julieta"; Port = 9008 }
)

function Test-PortListening($Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Bridge($Session, $Port) {
  if (Test-PortListening $Port) {
    Write-Host "Bridge $Session already listening on $Port" -ForegroundColor Yellow
    return
  }

  $authDir = Join-Path $RootDir "bridge-data\$Session"
  New-Item -ItemType Directory -Path $authDir -Force | Out-Null

  $logFile = Join-Path $LogDir "bridge-$Session.log"
  $cmd = "set `"NODE_ENV=production`" & set `"BRIDGE_PORT=$Port`" & set `"BRIDGE_AUTH_DIR=$authDir`" & set `"LOG_LEVEL=info`" & node bridge-server.js > `"$logFile`" 2>&1"

  Start-Process -FilePath "cmd.exe" `
    -ArgumentList @("/c", $cmd) `
    -WorkingDirectory $RootDir `
    -WindowStyle Hidden

  Write-Host "Started bridge $Session on $Port" -ForegroundColor Green
}

function Start-Proxy {
  if (Test-PortListening 3190) {
    Write-Host "Bridge proxy already listening on 3190" -ForegroundColor Yellow
    return
  }

  $proxyLog = Join-Path $LogDir "bridge-proxy.log"
  $proxyCmd = "set `"NODE_ENV=production`" & set `"PROXY_PORT=9090`" & node bridge-proxy.js > `"$proxyLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList @("/c", $proxyCmd) `
    -WorkingDirectory $RootDir `
    -WindowStyle Hidden

  Write-Host "Started bridge proxy on 9090" -ForegroundColor Green
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

foreach ($bridge in $Bridges) {
  Start-Bridge -Session $bridge.Session -Port $bridge.Port
  Start-Sleep -Milliseconds 400
}

Start-Proxy
Start-Sleep -Seconds 2
Start-Tunnel

Write-Host ""
Write-Host "Local WhatsApp bridge stack is starting." -ForegroundColor Cyan
Write-Host "Public URL: https://bridge.wspreminder.online/admin/status" -ForegroundColor Cyan
Write-Host "Run .\status-local-stack.ps1 to verify ports and tunnel." -ForegroundColor Cyan
