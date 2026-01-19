<#
.SYNOPSIS
    Prepare browser-ai for Git release (public or full).
.DESCRIPTION
    Creates release packages for two different repositories:
    - Full: Complete project including CDC (internal)
    - Public: Library + docs only (open source)
.PARAMETER Type
    Release type: 'full' or 'public'
.PARAMETER OutputDir
    Output directory for the release package
.EXAMPLE
    .\prepare-release.ps1 -Type public -OutputDir C:\releases\browser-ai-public
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('full', 'public')]
    [string]$Type,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputDir = ".\release-$Type"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$WorkspaceRoot = Split-Path -Parent $RepoRoot
$LibraryRoot = $RepoRoot

Write-Host "🚀 Preparing $Type release..." -ForegroundColor Cyan
Write-Host "   Workspace root: $WorkspaceRoot"
Write-Host "   Library root: $LibraryRoot"
Write-Host "   Output dir: $OutputDir"

# Clean output directory
if (Test-Path $OutputDir) {
    Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null

if ($Type -eq 'full') {
    # Full release: copy everything
    Write-Host "📦 Copying full project (with CDC)..." -ForegroundColor Yellow
    
    # Copy CDC files from workspace root (outside public repo)
    $cdcFiles = Get-ChildItem -Path $WorkspaceRoot -File -Filter "*.md" |
        Where-Object { $_.Name -match '^(cdc_|analyse_)' -or $_.Name -match 'compl.*cdc' }
    
    $cdcDir = Join-Path $OutputDir "cdc"
    New-Item -ItemType Directory -Path $cdcDir | Out-Null
    
    foreach ($file in $cdcFiles) {
        Copy-Item $file.FullName $cdcDir
        Write-Host "   ✓ CDC: $($file.Name)" -ForegroundColor Green
    }

    # Copy internal readme (kept outside public repo)
    $internalReadme = Join-Path $WorkspaceRoot "README-INTERNAL.md"
    if (Test-Path $internalReadme) {
        Copy-Item $internalReadme $OutputDir
        Write-Host "   ✓ README-INTERNAL.md" -ForegroundColor Green
    }
    
    # Copy library
    $excludes = @("node_modules", ".git", "dist", "*.log", "test-results", "playwright-report")
    Copy-Item -Path "$LibraryRoot\*" -Destination $OutputDir -Recurse -Exclude $excludes
    
    Write-Host "   ✓ Library copied" -ForegroundColor Green
    
} else {
    # Public release: library + docs only (no CDC)
    Write-Host "📦 Copying public release (lib + docs)..." -ForegroundColor Yellow
    
    $excludes = @("node_modules", ".git", "dist", "*.log", "test-results", "playwright-report")
    Copy-Item -Path "$LibraryRoot\*" -Destination $OutputDir -Recurse -Exclude $excludes
    
    Write-Host "   ✓ Library copied (without CDC)" -ForegroundColor Green
}

# Initialize git repo
Write-Host "🔧 Initializing Git repository..." -ForegroundColor Yellow
Push-Location $OutputDir
git init
git add .
$commitMsg = if ($Type -eq 'full') { "Initial commit (full project with CDC)" } else { "Initial commit (public release)" }
git commit -m $commitMsg
Pop-Location

Write-Host ""
Write-Host "✅ Release prepared at: $OutputDir" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "   cd $OutputDir"
Write-Host "   git remote add origin <your-repo-url>"
Write-Host "   git push -u origin main"
