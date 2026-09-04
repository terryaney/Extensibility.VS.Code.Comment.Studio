# release.ps1
# Bumps patch version, packages the extension to /dist, and updates the files
# that name the .vsix (README.md and the docs install page).

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptDir
$packageJsonPath = Join-Path $repoRoot "package.json"
$distDir = Join-Path $repoRoot "dist"
$readmePath = Join-Path $repoRoot "README.md"
$installDocPath = Join-Path $repoRoot "docs\articles\install.html"
$packageName = "kat-comment-studio"

$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$currentVersion = $packageJson.version

$parts = $currentVersion -split '\.'
$parts[2] = [int]$parts[2] + 1
$newVersion = $parts -join '.'

Write-Host "Version bump: $currentVersion -> $newVersion" -ForegroundColor Cyan

$packageJsonContent = Get-Content $packageJsonPath -Raw
$packageJsonContent = $packageJsonContent -replace ([regex]::Escape("`"version`": `"$currentVersion`"")), "`"version`": `"$newVersion`""
Set-Content -Path $packageJsonPath -Value $packageJsonContent -NoNewline

$vsixName = "$packageName-$newVersion.vsix"
$vsixDest = Join-Path $distDir $vsixName

if (-not (Test-Path $distDir)) {
    New-Item -Path $distDir -ItemType Directory -Force | Out-Null
}

Write-Host "Running vsce package..." -ForegroundColor Cyan
Push-Location $repoRoot
try {
    & npx @vscode/vsce package --allow-missing-repository --no-yarn --no-update-package-json --out $vsixDest
    if ($LASTEXITCODE -ne 0) {
        Write-Error "vsce package failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $vsixDest)) {
    Write-Error "Expected .vsix not found: $vsixDest"
    exit 1
}

Write-Host "Created $vsixName -> dist/" -ForegroundColor Green

# Every file that names the .vsix gets the new version. The literal
# "kat-comment-studio-<version>.vsix" must stay intact in these files for the
# replace to find it.
$oldVsix = "$packageName-$currentVersion.vsix"

foreach ($path in @($readmePath, $installDocPath)) {
    if (-not (Test-Path $path)) {
        Write-Warning "Skipped (not found): $path"
        continue
    }

    $original = Get-Content $path -Raw
    $updated = $original -replace ([regex]::Escape($oldVsix)), $vsixName
    if ($updated -eq $original) {
        Write-Warning "No '$oldVsix' reference found in $(Split-Path -Leaf $path)"
        continue
    }

    Set-Content -Path $path -Value $updated -NoNewline
    Write-Host "$(Split-Path -Leaf $path) updated: download links -> $newVersion" -ForegroundColor Green
}

Write-Host ""
Write-Host "Release $newVersion complete!" -ForegroundColor Green