$ports = 9001,9002,9003,9004,9005,9006,9007,9008,9090

Write-Host "Ports" -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, State, OwningProcess |
  Sort-Object LocalPort |
  Format-Table -AutoSize

Write-Host "Cloudflare tunnel" -ForegroundColor Cyan
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -like "cloudflared*" -and $_.CommandLine -match "tunnel run" } |
  Select-Object ProcessId, CommandLine |
  Format-Table -AutoSize

Write-Host "Admin bridge status" -ForegroundColor Cyan
try {
  Invoke-RestMethod "https://bridge.wspreminder.online/admin/status" |
    Select-Object ready, status, message |
    Format-List
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
