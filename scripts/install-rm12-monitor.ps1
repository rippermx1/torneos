param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$taskName = 'Torneos-RM12-Develop-Monitor'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$monitor = Join-Path $taskRoot 'scripts\monitor-rm12-develop.mjs'
$output = Join-Path $taskRoot 'artifacts\staging\rm12-monitor-latest.json'
$envFile = 'C:\torneos\.env.cloud-development.local'
if ($Remove) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false; return }
if (!(Test-Path -LiteralPath $monitor) -or !(Test-Path -LiteralPath $envFile)) { throw 'Falta el monitor o su configuración dev' }
$shellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'run-rm12-monitor.ps1') + '"'
$action = New-ScheduledTaskAction -Execute $shellPath -Argument $arguments -WorkingDirectory $taskRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Execute -ne $shellPath -or $existing.Actions.WorkingDirectory -ne $taskRoot -or $existing.Actions.Arguments -notlike ('*"' + (Join-Path $PSScriptRoot 'run-rm12-monitor.ps1') + '"'))) { throw 'La tarea existente tiene otro propietario/configuración; no se sustituye' }
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Select-Object TaskName,State
Start-ScheduledTask -TaskName $taskName
