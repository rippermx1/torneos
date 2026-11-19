param([string]$UnityEditor = 'C:/Program Files/Unity/Hub/Editor/6000.3.24f1-x86_64/Editor/Unity.exe')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$projectPath = Join-Path $repoRoot 'games/2048/UnityProject'
$evidencePath = Join-Path $repoRoot 'artifacts/unity-2048'
New-Item -ItemType Directory -Force $evidencePath | Out-Null
if (-not (Test-Path -LiteralPath $UnityEditor)) { throw 'Unity 6000.3.24f1 is required; pass -UnityEditor if installed elsewhere.' }
function RunUnity([string[]]$Extra, [string]$LogName) {
  $argsList = @('-batchmode','-projectPath',('"'+$projectPath+'"'),'-logFile',('"'+(Join-Path $evidencePath $LogName)+'"')) + $Extra
  $process = Start-Process -FilePath $UnityEditor -ArgumentList $argsList -WindowStyle Hidden -PassThru
  $process.WaitForExit(); $process.Refresh()
  if ($process.ExitCode -ne 0) { throw "Unity exit $($process.ExitCode): $LogName" }
}
RunUnity @('-executeMethod','Torneos.Puzzle2048.Editor.PuzzleBuilder.ImportTextResources') 'import-text.log'
RunUnity @('-executeMethod','Torneos.Puzzle2048.Editor.PuzzleBuilder.ConfigureProject','-quit') 'create-scene.log'
foreach ($testMode in @('EditMode','PlayMode')) {
  $resultPath = Join-Path $evidencePath ($testMode.ToLower()+'.xml')
  RunUnity @('-runTests','-testPlatform',$testMode,'-testResults',('"'+$resultPath+'"')) ($testMode.ToLower()+'.log')
  [xml]$results = Get-Content -LiteralPath $resultPath
  if ($results.'test-run'.result -ne 'Passed') { throw "$testMode tests did not pass" }
  Write-Output "$testMode : $($results.'test-run'.passed)/$($results.'test-run'.total)"
}
RunUnity @('-executeMethod','Torneos.Puzzle2048.Editor.PuzzleBuilder.BuildWebGL','-quit') 'webgl.log'
Push-Location $repoRoot
try { & node scripts/publish-unity.mjs 2048 unity-2048-007; if ($LASTEXITCODE -ne 0) { throw 'Local publishing failed' } } finally { Pop-Location }
