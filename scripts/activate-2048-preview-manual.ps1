# Launch an isolated existing 2048 preview without replacing any listener.
param([string]$BuildDirectory = '.next/2048-preview', [int]$Port = 3083)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskResolved = [IO.Path]::GetFullPath((Join-Path $taskRoot $BuildDirectory))
if (-not $taskResolved.StartsWith((Join-Path $taskRoot '.next') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Preview must be inside .next.' }
$taskServer = Join-Path $taskResolved 'standalone/server.js'
if (-not (Test-Path -LiteralPath $taskServer -PathType Leaf)) { throw 'Compile and package the 2048 preview first.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'Port already in use.' }
$env:PORT = [string]$Port
$env:HOSTNAME = '127.0.0.1'
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskStarted = Start-Process -FilePath $taskNode -ArgumentList @(('"' + $taskServer + '"')) -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
Write-Output "2048 preview PID $($taskStarted.Id): http://127.0.0.1:$Port/play"
