$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'data\store.pid'
if (-not (Test-Path $pidFile)) { Write-Host 'Store is not running.'; exit 0 }
$storePid = Get-Content $pidFile
$process = Get-Process -Id $storePid -ErrorAction SilentlyContinue
if ($process) { Stop-Process -Id $storePid -Force }
Remove-Item -LiteralPath $pidFile -Force
Write-Host 'Store stopped.'
