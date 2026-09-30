$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'data\store.pid'
New-Item -ItemType Directory -Force (Join-Path $projectRoot 'data') | Out-Null
if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "Store is already running with PID $oldPid."
        exit 0
    }
}
$process = Start-Process -FilePath 'node' -ArgumentList '--disable-warning=ExperimentalWarning','src/server.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
Start-Sleep -Seconds 1
$health = Invoke-RestMethod 'http://localhost:9100/api/health'
Write-Host "Store started: http://localhost:9100 (PID $($process.Id), status $($health.status))."
