# Launch one bridge-server per WhatsApp account
# Each bridge runs on its own port with isolated auth directory.
# Each bridge opens in its OWN terminal window so you can scan QR codes.
#
# Usage: .\start-bridges.ps1
# To stop: close the windows or use stop-bridges.ps1

$bridgePorts = @{
  admin      = 9001
  erika      = 9002
  melina     = 9003
  "academico-1" = 9004
  in         = 9005
  luciana    = 9006
  yanina     = 9007
  julieta    = 9008
}

$rootDir = Get-Location

Write-Host "Starting bridge servers in separate windows..." -ForegroundColor Cyan

foreach ($session in $bridgePorts.Keys) {
  $port = $bridgePorts[$session]
  $authDir = Join-Path $rootDir "bridge-data\$session"

  New-Item -ItemType Directory -Path $authDir -Force | Out-Null

  $title = "Bridge-$session (port $port)"

  # Launch node in a new cmd window with env vars set
  $cmd = "title $title & set BRIDGE_PORT=$port & set BRIDGE_AUTH_DIR=$authDir & node bridge-server.js & pause"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -WindowStyle Normal

  Write-Host "  [$session] -> bridge on port $port" -ForegroundColor Green
}

Write-Host "`nAll bridges started in separate windows." -ForegroundColor Cyan
Write-Host "Scan each QR code to link the WhatsApp accounts." -ForegroundColor Cyan
Write-Host "Close the windows to stop each bridge, or use stop-bridges.ps1" -ForegroundColor Cyan
Write-Host "`nAdd these to your backend .env:" -ForegroundColor Yellow
foreach ($session in $bridgePorts.Keys) {
  $port = $bridgePorts[$session]
  $envKey = "BRIDGE_URL_$($session.ToUpper().Replace('-', '_'))"
  Write-Host "  $envKey=http://localhost:$port" -ForegroundColor White
}
