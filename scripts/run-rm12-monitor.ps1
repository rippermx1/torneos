$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& node (Join-Path $PSScriptRoot 'monitor-rm12-develop.mjs') --env-file 'C:\torneos\.env.cloud-development.local' --output (Join-Path $taskRoot 'artifacts\staging\rm12-monitor-latest.json')
exit $LASTEXITCODE
