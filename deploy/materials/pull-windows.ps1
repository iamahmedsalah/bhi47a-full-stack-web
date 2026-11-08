param(
    [string]$BackupRoot = 'D:\VPS-Backups',
    [string]$Target = 'bhi47a@169.58.108.189',
    [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh\github_actions_vps')
)
$ErrorActionPreference = 'Stop'
if ($Target -notmatch '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$') { throw 'Invalid SSH target' }
if (-not [System.IO.Path]::IsPathRooted($BackupRoot)) { throw 'Use an absolute backup directory' }
if ((Test-Path -LiteralPath $BackupRoot) -and ((Get-Item -LiteralPath $BackupRoot).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Backup root cannot be a reparse point' }
$root = [System.IO.Path]::GetFullPath((Join-Path $BackupRoot 'materials'))
[System.IO.Directory]::CreateDirectory($root) | Out-Null
if ((Get-Item -LiteralPath $root).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Backup directory cannot be a reparse point' }
$lock = $null
try { $lock = [System.IO.File]::Open((Join-Path $root '.pull.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
catch { throw 'Another materials backup download is running' }
function Assert-BackupPath([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Backup path escapes destination' }
    if ((Test-Path -LiteralPath $full) -and ((Get-Item -LiteralPath $full).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Backup target cannot be a reparse point' }
}
$sshArgs = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'StrictHostKeyChecking=yes', '-i', $IdentityFile)
try {
    $raw = & ssh.exe @sshArgs $Target 'python3 /home/bhi47a/app/deploy/materials/backup-state.py list'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list VPS encrypted backups' }
    $manifest = ($raw -join "`n") | ConvertFrom-Json
    if ($manifest.version -ne 1 -or $manifest.directory -ne '/srv/student-portal/material-backups') { throw 'Unexpected VPS backup directory' }
    $count = 0
    foreach ($item in @($manifest.archives)) {
        if ($item.file -notmatch '^materials-\d{8}T\d{6}(?:\d{9})?Z\.tar\.age$' -or $item.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid archive manifest' }
        $file = Join-Path $root $item.file
        $partial = "$file.partial"
        Assert-BackupPath $file
        Assert-BackupPath $partial
        $valid = (Test-Path -LiteralPath $file) -and ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -eq $item.sha256)
        if (-not $valid) {
            $remote = "$($manifest.directory)/$($item.file)"
            & scp.exe @sshArgs "${Target}:$remote" $partial
            if ($LASTEXITCODE -ne 0) { throw 'Encrypted archive download failed; previous copies were preserved' }
            if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { throw 'Downloaded archive checksum mismatch' }
            if (Test-Path -LiteralPath $file) {
                $quarantine = "$file.corrupt-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ'))"
                Assert-BackupPath $quarantine
                Move-Item -LiteralPath $file -Destination $quarantine
            }
            Move-Item -LiteralPath $partial -Destination $file
        }
        [System.IO.File]::WriteAllText("$file.sha256", "$($item.sha256)  $($item.file)`n")
        $receipt = & ssh.exe @sshArgs $Target "python3 /home/bhi47a/app/deploy/materials/backup-state.py ack $($item.file) $($item.sha256)"
        if ($LASTEXITCODE -ne 0) { throw 'VPS did not accept the off-server verification receipt' }
        $confirmation = ($receipt -join "`n") | ConvertFrom-Json
        if ($confirmation.verified -ne $item.file) { throw 'Unexpected verification receipt' }
        $count++
    }
    [System.IO.File]::WriteAllText((Join-Path $root 'last-pull.json'), (@{ completedAt = [DateTime]::UtcNow.ToString('o'); verifiedArchives = $count } | ConvertTo-Json))
    Write-Output "Verified $count encrypted archive(s) in $root. Existing Atlas backups were preserved."
} catch {
    [System.IO.File]::WriteAllText((Join-Path $root 'last-error.json'), (@{ failedAt = [DateTime]::UtcNow.ToString('o'); message = $_.Exception.Message } | ConvertTo-Json))
    throw
} finally { if ($lock) { $lock.Dispose() } }
