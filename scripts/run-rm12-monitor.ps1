$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runLog = Join-Path $taskRoot 'artifacts\staging\rm12-monitor-run.json'
$nodePath = (Get-Command node -ErrorAction Stop).Source
@{ startedAt = [DateTime]::UtcNow.ToString('o'); nodePath = $nodePath } | ConvertTo-Json | Set-Content -LiteralPath $runLog
& node (Join-Path $PSScriptRoot 'monitor-rm12-develop.mjs') --env-file 'C:\torneos\.env.cloud-development.local' --output (Join-Path $taskRoot 'artifacts\staging\rm12-monitor-latest.json')
$result = $LASTEXITCODE
@{ completedAt = [DateTime]::UtcNow.ToString('o'); nodePath = $nodePath; exitCode = $result } | ConvertTo-Json | Set-Content -LiteralPath $runLog
exit $result
