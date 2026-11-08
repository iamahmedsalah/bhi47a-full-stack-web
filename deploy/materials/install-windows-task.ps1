param([string]$BackupRoot = 'D:\VPS-Backups')
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($BackupRoot)
if (-not [System.IO.Path]::IsPathRooted($BackupRoot) -or $root -eq [System.IO.Path]::GetPathRoot($root) -or $root.Contains('"')) { throw 'Use a dedicated absolute backup directory' }
if ((Test-Path -LiteralPath $root) -and ((Get-Item -LiteralPath $root).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Backup root cannot be a reparse point' }
$scripts = Join-Path $root 'scripts'
[System.IO.Directory]::CreateDirectory($scripts) | Out-Null
if ((Get-Item -LiteralPath $scripts).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Backup scripts directory cannot be a reparse point' }
$current = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($current.User.Value, 'S-1-5-18', 'S-1-5-32-544')) {
    $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
}
Set-Acl -LiteralPath $scripts -AclObject $acl
$runner = Join-Path $scripts 'pull-windows.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'pull-windows.ps1') -Destination $runner -Force
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -BackupRoot "{1}"' -f $runner, $root
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$triggers = @((New-ScheduledTaskTrigger -Daily -At '09:00'), (New-ScheduledTaskTrigger -AtLogOn -User $current.Name))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId $current.Name -LogonType Interactive -RunLevel Limited
$name = 'Student Portal - Encrypted Materials Pull'
$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing -and $existing.Actions.Arguments -notlike '*\VPS-Backups\scripts\pull-windows.ps1*') { throw 'An unrelated task uses the same name; review it before replacing' }
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Pull and SHA-256 verify encrypted course-material backups; catch up missed archives after logon.' -Force | Out-Null
Get-ScheduledTask -TaskName $name | Select-Object TaskName,State
Write-Output 'Schedule: daily 09:00 Windows local time plus logon catch-up. Windows timezone is Cairo. The laptop must be on and signed in.'
