param([string]$BackupRoot = 'D:\VPS-Backups')
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($BackupRoot)
if (-not [System.IO.Path]::IsPathRooted($BackupRoot) -or $root -eq [System.IO.Path]::GetPathRoot($root)) { throw 'Use a dedicated absolute backup directory' }
if (Test-Path -LiteralPath $root) {
    if ((Get-Item -LiteralPath $root).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Backup directory cannot be a reparse point' }
}
$tools = Join-Path $root 'tools\age-v1.3.2'
$keys = Join-Path $root 'materials-keys'
$materials = Join-Path $root 'materials'
foreach ($directory in @($tools, $keys, $materials)) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }

# New backup subdirectories contain keys or decrypted recovery data. Do not
# change the ACL or contents of the pre-existing October Atlas backup.
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($directory in @($keys, $materials)) {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($currentSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $directory -AclObject $acl
}

$archive = Join-Path $tools 'age-v1.3.2-windows-amd64.zip'
$expected = 'f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7'
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-windows-amd64.zip' -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Official age release checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
try {
    foreach ($name in @('age.exe', 'age-keygen.exe')) {
        $entry = @($zip.Entries | Where-Object { $_.Name -eq $name })
        if ($entry.Count -ne 1) { throw "Cannot identify $name in the verified release" }
        $target = Join-Path $tools $name
        if (-not (Test-Path -LiteralPath $target)) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry[0], $target, $false) }
    }
} finally { $zip.Dispose() }
$identityFile = Join-Path $keys 'identity.agekey'
$keygen = Join-Path $tools 'age-keygen.exe'
if (-not (Test-Path -LiteralPath $identityFile)) {
    & $keygen -o $identityFile
    if ($LASTEXITCODE -ne 0) { throw 'Age identity generation failed' }
}
$recipient = (& $keygen -y $identityFile).Trim()
if ($LASTEXITCODE -ne 0 -or $recipient -notmatch '^age1[a-z0-9]+$') { throw 'Cannot read the public recipient' }
[System.IO.File]::WriteAllText((Join-Path $keys 'recipient.txt'), "$recipient`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Public recipient: $recipient"
Write-Output "Private identity stays on Windows: $identityFile"
Write-Output "Material archives: $materials"
