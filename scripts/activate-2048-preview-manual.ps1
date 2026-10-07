# Manual activation prepared after automatic review rejected the authorized restart.
# Stops only the verified Next listener on 3083; keeps the Snake listener on 3090.
param([int]$ExpectedNextPid = 43740)
$ErrorActionPreference = 'Stop'
$taskRoot = 'C:\torneos'
$taskBuild = '.next/snake-sa15-circle-death-014'
$taskServer = Join-Path $taskRoot "$taskBuild/standalone/server.js"
$taskHelper = Join-Path $taskRoot 'scripts/snake-practice-local.mjs'
$taskNode = (Get-Command node -ErrorAction Stop).Source
foreach ($taskFile in @($taskServer, $taskHelper, (Join-Path $taskRoot '.env.snake-practice.local'))) {
    if (-not (Test-Path -LiteralPath $taskFile -PathType Leaf)) { throw "Required file missing: $taskFile" }
}
function Get-ListenerPid([int]$taskPort) {
    $taskIds = @(Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($taskIds.Count -ne 1) { throw "Expected one listener on $taskPort" }
    return [int]$taskIds[0]
}
$taskSnakePid = Get-ListenerPid 3090
$taskNextPid = Get-ListenerPid 3083
if ($taskNextPid -ne $ExpectedNextPid) { throw 'Next PID changed; inspect it before running this script again.' }
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $taskNextPid"
$taskExpectedCommand = '"' + $taskNode + '" ' + $taskServer.Replace('/', '\')
if ($taskProcess.CommandLine -cne $taskExpectedCommand) { throw 'Next command does not match the prepared standalone server.' }
$taskHealth = Invoke-RestMethod 'http://127.0.0.1:3090/snake-arena/health' -TimeoutSec 10
if ($taskHealth.ccu -ne 0 -or $taskHealth.rooms -ne 0) { throw 'Players or rooms exist; wait before restarting Next.' }
$taskArtifactRoot = Join-Path $taskRoot 'artifacts/2048-gap-closure'
$null = New-Item -ItemType Directory -Path $taskArtifactRoot -Force
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Stop-Process -Id $taskNextPid -ErrorAction Stop
$env:SNAKE_PREVIEW_BUILD_DIR = $taskBuild
$env:SNAKE_FUNNEL_PILOT = '1'
$taskStarted = Start-Process -FilePath $taskNode -ArgumentList @($taskHelper, 'next', '3083') `
    -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $taskArtifactRoot "next-$taskStamp.out.log") `
    -RedirectStandardError (Join-Path $taskArtifactRoot "next-$taskStamp.err.log")
$taskReady = $false
for ($taskTry = 0; $taskTry -lt 20; $taskTry++) {
    Start-Sleep -Seconds 1
    try {
        $taskCapsule = Invoke-WebRequest 'http://127.0.0.1:3090/games/2048/unity-2048-007/index.html' -UseBasicParsing -TimeoutSec 5
        if ($taskCapsule.StatusCode -eq 200) { $taskReady = $true; break }
    } catch { }
}
if ((Get-ListenerPid 3090) -ne $taskSnakePid) { throw 'Snake listener changed during activation.' }
if (-not $taskReady) { throw "Next activation not verified; inspect next-$taskStamp logs. Helper PID $($taskStarted.Id)." }
$taskHealthAfter = Invoke-RestMethod 'http://127.0.0.1:3090/snake-arena/health' -TimeoutSec 10
Write-Output "PASS: 2048 index HTTP 200; Snake PID $taskSnakePid preserved; CCU $($taskHealthAfter.ccu)."
