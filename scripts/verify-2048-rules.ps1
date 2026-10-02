param(
  [string]$UnityCli = 'C:/Users/valde/AppData/Local/Unity/bin/unity.exe',
  [string]$UnityEditor = 'C:/Program Files/Unity/Hub/Editor/6000.3.24f1-x86_64/Editor/Unity.exe'
)
$ErrorActionPreference = 'Stop'
$ruleRepoRoot = Split-Path $PSScriptRoot -Parent
$ruleProject = Join-Path $ruleRepoRoot 'games/2048/UnityProject'
$ruleArtifacts = Join-Path $ruleRepoRoot 'artifacts/2048-equivalence'
if (-not (Test-Path -LiteralPath $UnityCli) -or -not (Test-Path -LiteralPath $UnityEditor)) { throw 'Existing Unity CLI and Editor 6000.3.24f1 are required. No installation is performed.' }
$ruleEditorProcesses = Get-CimInstance Win32_Process -Filter "Name='Unity.exe'"
foreach ($ruleEditorProcess in $ruleEditorProcesses) {
  if ($ruleEditorProcess.CommandLine -match '(?i)games[\\/]2048[\\/]UnityProject') { throw '2048 is already open. Finish the existing Editor operation before the batch test.' }
}
New-Item -ItemType Directory -Force $ruleArtifacts | Out-Null
Push-Location $ruleRepoRoot
try {
  & node scripts/2048-rule-cases.mjs --check
  if ($LASTEXITCODE -ne 0) { throw 'Shared rule corpus differs; review before regeneration.' }
  & npx vitest run __tests__/2048-rule-equivalence.test.ts __tests__/engine.test.ts __tests__/rng.test.ts --reporter=json --outputFile=artifacts/2048-equivalence/web-tests.json
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript rule tests failed.' }
  # Keep CLI/Editor diagnostics local; never echo licensing command arguments.
  & $UnityCli test $ruleProject --editor-path $UnityEditor --mode EditMode --output (Join-Path $ruleArtifacts 'editmode.xml') --timeout 300 --format json --non-interactive -- -nographics -logFile (Join-Path $ruleArtifacts 'editmode.log') *> (Join-Path $ruleArtifacts 'unity-cli.log')
  if ($LASTEXITCODE -ne 0) { throw 'Unity rule tests failed; inspect local EditMode report/log.' }
  [xml]$ruleResults = Get-Content -LiteralPath (Join-Path $ruleArtifacts 'editmode.xml')
  if ($ruleResults.'test-run'.result -ne 'Passed') { throw 'Unity EditMode did not report Passed.' }
  $ruleWebResults = Get-Content -LiteralPath (Join-Path $ruleArtifacts 'web-tests.json') | ConvertFrom-Json
  Write-Output "2048 rules: $($ruleWebResults.numPassedTests) web tests; $($ruleResults.'test-run'.passed) Editor tests. Reports: $ruleArtifacts"
} finally { Pop-Location }
