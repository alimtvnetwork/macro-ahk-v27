# run-bootstrap.ps1 — Pre-flight module restore + run.ps1 launcher
# Usage: .\run-bootstrap.ps1 [any run.ps1 flags, e.g. -d, -b, -r]

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ScriptDir)) { $ScriptDir = Get-Location }

$buildModules = Join-Path $ScriptDir "build\ps-modules"
$trackedModules = Join-Path $ScriptDir "scripts\ps-modules"

# Restore build/ps-modules from tracked source if missing
if (-not (Test-Path $buildModules)) {
    if (Test-Path $trackedModules) {
        Write-Host "[bootstrap] Restoring build\ps-modules from scripts\ps-modules..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Path $buildModules -Force | Out-Null
        Copy-Item -Path (Join-Path $trackedModules "*") -Destination $buildModules -Force
        Write-Host "[bootstrap] Restored." -ForegroundColor Green
    } else {
        Write-Host "[bootstrap] ERROR: Neither build\ps-modules nor scripts\ps-modules found." -ForegroundColor Red
        Write-Host "[bootstrap] Run 'git pull' to restore project files." -ForegroundColor Yellow
        exit 1
    }
} else {
    # Patch any individually missing files
    if (Test-Path $trackedModules) {
        $needed = Get-ChildItem -Path $trackedModules -Filter "*.ps1"
        foreach ($f in $needed) {
            $dest = Join-Path $buildModules $f.Name
            if (-not (Test-Path $dest)) {
                Copy-Item -Path $f.FullName -Destination $dest -Force
                Write-Host "[bootstrap] Restored missing $($f.Name)" -ForegroundColor Cyan
            }
        }
    }
}

# Forward all arguments to run.ps1
$runScript = Join-Path $ScriptDir "run.ps1"
if (-not (Test-Path $runScript)) {
    Write-Host "[bootstrap] ERROR: run.ps1 not found at $runScript" -ForegroundColor Red
    exit 1
}

& $runScript @args
