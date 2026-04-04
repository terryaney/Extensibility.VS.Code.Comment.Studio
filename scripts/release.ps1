# release.ps1
# Bumps patch version, packages the extension to /dist, and updates README.md.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptDir
$packageJsonPath = Join-Path $repoRoot "package.json"
$distDir = Join-Path $repoRoot "dist"
$readmePath = Join-Path $repoRoot "README.md"
$repoUrl = "https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio"
$packageName = "kat-comment-studio"

function Get-PreviousVersionEntries {
    param(
        [string]$ReadmeContent
    )

    $lines = $ReadmeContent -split "`r?`n"
    $startIndex = -1
    $endIndex = $lines.Length

    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i].TrimEnd() -eq '## Previous Versions') {
            $startIndex = $i
            break
        }
    }

    if ($startIndex -lt 0) {
        return @()
    }

    for ($i = $startIndex + 1; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '^##\s+') {
            $endIndex = $i
            break
        }
    }

    $entries = @()
    for ($i = $startIndex + 1; $i -lt $endIndex; $i++) {
        $line = $lines[$i].TrimEnd()
        if ($line -match '^\d+\.\s+\[[^\]]+\]\([^\)]+\)$') {
            $entries += $line
        }
    }

    return $entries
}

function Set-PreviousVersionsSection {
    param(
        [string]$ReadmeContent,
        [string[]]$Entries
    )

    $lines = $ReadmeContent -split "`r?`n"
    $startIndex = -1
    $endIndex = $lines.Length

    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i].TrimEnd() -eq '## Previous Versions') {
            $startIndex = $i
            break
        }
    }

    if ($startIndex -lt 0) {
        Write-Warning "## Previous Versions section not found in README.md - skipping version list update."
        return $ReadmeContent
    }

    for ($i = $startIndex + 1; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '^##\s+') {
            $endIndex = $i
            break
        }
    }

    $replacement = @('## Previous Versions', '')
    if ($Entries.Length -gt 0) {
        $replacement += $Entries
    }
    else {
        $replacement += 'No previous VSIX releases yet.'
    }
    $replacement += ''

    $before = @()
    if ($startIndex -gt 0) {
        $before = $lines[0..($startIndex - 1)]
    }

    $after = @()
    if ($endIndex -lt $lines.Length) {
        $after = $lines[$endIndex..($lines.Length - 1)]
    }

    return ($before + $replacement + $after) -join "`n"
}

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

$readmeOriginal = Get-Content $readmePath -Raw
$existingEntries = Get-PreviousVersionEntries -ReadmeContent $readmeOriginal | Where-Object { $_ -notmatch "\[$([regex]::Escape($currentVersion))\]\(" }

$readmeUpdated = $readmeOriginal -replace ([regex]::Escape("$packageName-$currentVersion.vsix")), "$packageName-$newVersion.vsix"

$previousEntry = "1. [$currentVersion]($repoUrl/raw/main/dist/$packageName-$currentVersion.vsix)"
$allEntries = @($previousEntry) + $existingEntries
$uniqueEntries = [System.Collections.Generic.List[string]]::new()
foreach ($entry in $allEntries) {
    if (-not [string]::IsNullOrWhiteSpace($entry) -and -not $uniqueEntries.Contains($entry)) {
        $uniqueEntries.Add($entry)
    }
}

$readmeUpdated = Set-PreviousVersionsSection -ReadmeContent $readmeUpdated -Entries $uniqueEntries.ToArray()
Set-Content -Path $readmePath -Value $readmeUpdated -NoNewline

Write-Host "README.md updated: Getting Started -> $newVersion, Previous Versions <- $currentVersion" -ForegroundColor Green
Write-Host ""
Write-Host "Release $newVersion complete!" -ForegroundColor Green