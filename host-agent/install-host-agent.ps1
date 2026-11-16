# Installs PC Deck to start hidden at every Windows logon. No admin rights needed
# for the startup entry; the firewall rule step asks for elevation once.
#   .\install-host-agent.ps1            (port 80, or the one already in .env)
#   .\install-host-agent.ps1 -Port 8080
# Re-run any time to refresh the venv, rebuild the UI or recreate the startup entry.
#
# Launch chain: Startup\PCDeckHostAgent.vbs (no window) -> run-hidden.bat
# (restarts the process if it exits) -> pythonw.exe agent.py.

param([int]$Port = 0)
$ErrorActionPreference = "Stop"

$agentDir = $PSScriptRoot
$root = Split-Path $agentDir -Parent
$venvDir = Join-Path $agentDir ".venv"
$venvPip = Join-Path $venvDir "Scripts\pip.exe"

# Port: -Port wins, then DECK_PORT already in .env, then 80. Written back to .env.
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root ".env.example") $envFile }
$envText = Get-Content $envFile -Raw
if ($Port -eq 0) {
    if ($envText -match '(?m)^DECK_PORT=(\d+)') { $Port = [int]$Matches[1] } else { $Port = 80 }
}
if ($envText -match '(?m)^DECK_PORT=') { $envText = $envText -replace '(?m)^DECK_PORT=.*', "DECK_PORT=$Port" }
else { $envText += "`r`nDECK_PORT=$Port`r`n" }
Set-Content -Path $envFile -Value $envText -Encoding UTF8 -NoNewline
$base = if ($Port -eq 80) { "http://127.0.0.1" } else { "http://127.0.0.1:$Port" }

if (-not (Test-Path (Join-Path $venvDir "Scripts\pythonw.exe"))) {
    Write-Host "Creating virtual environment..."
    python -m venv $venvDir
}
& $venvPip install -r (Join-Path $agentDir "requirements.txt")

Write-Host "Building the tablet UI..."
Push-Location (Join-Path $root "frontend")
npm install
npm run build
Pop-Location

$batPath = Join-Path $agentDir "run-hidden.bat"
$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) "PCDeckHostAgent.vbs"
Set-Content -Path $startupLink -Encoding ASCII -Value @"
Set objShell = CreateObject("WScript.Shell")
objShell.Run """$batPath""", 0, False
"@
Write-Host "Startup entry: $startupLink"

$rule = Get-NetFirewallRule -DisplayName "PC Deck (LAN)" -ErrorAction SilentlyContinue
$rulePort = if ($rule) { ($rule | Get-NetFirewallPortFilter).LocalPort } else { $null }
if ("$rulePort" -ne "$Port") {
    Write-Host "Firewall rule for TCP $Port, local subnet only. Accept the UAC prompt."
    Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -Command Remove-NetFirewallRule -DisplayName 'PC Deck (LAN)' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'PC Deck (LAN)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Profile Any"
}

Start-Process wscript.exe -ArgumentList "`"$startupLink`""
Start-Sleep -Seconds 5
try {
    Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 5 | Out-Null
    Write-Host "PC Deck is up. Pair a tablet: open $base/pair on this PC."
    Start-Process "$base/pair"
} catch {
    Write-Warning "PC Deck did not answer yet. Check $agentDir\deck.log and launcher.log."
}
