# Build a source archive from this working tree without staging or committing files.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot 'outputs/vps-release'
[System.IO.Directory]::CreateDirectory($outputDir) | Out-Null
$candidates = & git -C $repoRoot -c core.quotepath=false ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) { throw 'Cannot list repository source files' }
$files = @($candidates | Where-Object {
    ($_ -match '^(apps/(api|web)/|packages/shared/|deploy/)') -or
    ($_ -match '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json|\.npmrc|\.dockerignore|Dockerfile\.(api|web)|docker-compose\.prod\.yml|\.env\.prod\.example)$')
} | Where-Object {
    ($_ -notmatch '(^|/)(node_modules|\.git|\.next|dist|coverage|\.turbo)(/|$)') -and
    (($_ -notmatch '(^|/)\.env($|\.)') -or ($_ -match '\.example$')) -and
    ($_ -notmatch '(?i)\.(pem|key|p12|pfx|log)$') -and
    ($_ -notmatch '(?i)(service[-_]?account|credentials)[^/]*\.json$')
} | Sort-Object -Unique)
if ($files.Count -eq 0) { throw 'No deployable files found' }
$listPath = Join-Path $outputDir 'source-files.txt'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($listPath, [string[]]$files, $utf8)
$archive = Join-Path $outputDir 'student-portal.tar.gz'
& tar -czf $archive -C $repoRoot -T $listPath
if ($LASTEXITCODE -ne 0) { throw 'Source archive creation failed' }
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText("$archive.sha256", "$digest  student-portal.tar.gz`n", $utf8)
Write-Output "Archive: $archive"
Write-Output "SHA256: $digest"
Write-Output "Source files: $($files.Count). No Git files were staged or committed."
