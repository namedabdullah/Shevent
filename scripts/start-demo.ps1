# Starts the model server and a Cloudflare quick tunnel to it, for the deployed web app. Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1
# Leave the window open for the whole demo; Ctrl+C stops both. Needs Ollama running with the model pulled,
# server\.env.local (see server\.env.example) and cloudflared (winget install Cloudflare.cloudflared).
#
# The tunnel address changes every time this starts. Put the printed address in Vercel as MODEL_SERVER_URL and
# redeploy; only the model server is exposed, Ollama stays on this machine.
param([int]$Port = 8000)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$python = Join-Path $root 'ml\.venv\Scripts\python.exe'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$logs = Join-Path $env:TEMP 'shevent-demo'
New-Item -ItemType Directory -Force $logs | Out-Null

foreach ($need in @($python, $cloudflared, (Join-Path $root 'server\.env.local'))) {
    if (-not (Test-Path $need)) { throw "Missing: $need" }
}
try {
    $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
} catch {
    throw 'Ollama is not answering on http://127.0.0.1:11434. Start it first (the assistant needs it).'
}
if (-not ($tags.models | Where-Object { $_.name -like 'qwen2.5:3b-instruct*' })) {
    throw 'The model is missing: run `ollama pull qwen2.5:3b-instruct`.'
}

$server = $null
$tunnel = $null
try {
    Write-Host 'Starting the model server (loading the models takes a few seconds)...'
    $server = Start-Process -FilePath $python -WorkingDirectory $root -NoNewWindow -PassThru `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--app-dir', 'server', '--env-file', 'server\.env.local',
                        '--host', '127.0.0.1', '--port', $Port) `
        -RedirectStandardOutput (Join-Path $logs 'server.out.log') -RedirectStandardError (Join-Path $logs 'server.err.log')

    $health = $null
    for ($i = 0; $i -lt 60 -and -not $health; $i++) {
        if ($server.HasExited) { throw "The model server stopped. See $logs\server.err.log" }
        try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3 } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $health) { throw "The model server did not answer in 2 minutes. See $logs\server.err.log" }
    Write-Host "Model server is up: $($health | ConvertTo-Json -Compress)"

    Write-Host 'Opening the tunnel...'
    $tunnelLog = Join-Path $logs 'tunnel.err.log'
    $tunnel = Start-Process -FilePath $cloudflared -NoNewWindow -PassThru `
        -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port") `
        -RedirectStandardOutput (Join-Path $logs 'tunnel.out.log') -RedirectStandardError $tunnelLog

    $address = $null
    for ($i = 0; $i -lt 30 -and -not $address; $i++) {
        Start-Sleep -Seconds 2
        if ($tunnel.HasExited) { throw "cloudflared stopped. See $tunnelLog" }
        if (Test-Path $tunnelLog) {
            $found = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            if ($found) { $address = $found.Matches[0].Value }
        }
    }
    if (-not $address) { throw "No tunnel address after a minute. See $tunnelLog" }

    # The tunnel can take a few seconds to start routing.
    $reached = $false
    for ($i = 0; $i -lt 15 -and -not $reached; $i++) {
        try { $null = Invoke-RestMethod -Uri "$address/health" -TimeoutSec 5; $reached = $true } catch { Start-Sleep -Seconds 2 }
    }
    Write-Host ''
    Write-Host "MODEL_SERVER_URL=$address" -ForegroundColor Green
    if ($reached) { Write-Host 'The address answers /health from outside.' } else { Write-Host 'The address was created but /health did not answer yet; try again in a minute.' -ForegroundColor Yellow }
    Write-Host 'Leave this window open. Ctrl+C stops the server and the tunnel.'
    while ($true) {
        Start-Sleep -Seconds 5
        if ($server.HasExited) { throw "The model server stopped. See $logs\server.err.log" }
        if ($tunnel.HasExited) { throw "The tunnel stopped. See $tunnelLog; restarting gives a new address." }
    }
} finally {
    foreach ($p in @($tunnel, $server)) {
        if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
}
