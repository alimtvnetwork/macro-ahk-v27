<#
.SYNOPSIS
    Preflight toolchain check (-pf flag).

.DESCRIPTION
    Verifies that all required tools, dependencies, and configs are present
    and correctly configured before attempting a build. Reports pass/fail
    with detailed diagnostics.
#>

<#
.SYNOPSIS
    Runs the full preflight check and exits with 0 (pass) or 1 (fail).
.DESCRIPTION
    Checks: Node.js, pnpm, node linker, extension dir, package.json,
    node_modules/.pnp.cjs, required packages, .npmrc, dynamic import()
    violations in background/, and dynamic require() in vite.config.ts.
#>
function Invoke-PreflightCheck {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Preflight Check" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $preflightPass = $true

    # Node.js
    if (Test-Command "node") {
        $nv = node --version 2>&1
        Write-Host "  [OK] Node.js:        $nv (major: $($script:NodeMajor))" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Node.js:      NOT FOUND" -ForegroundColor Red
        $preflightPass = $false
    }

    # pnpm
    if (Test-Command "pnpm") {
        $pv = pnpm --version 2>&1
        Write-Host "  [OK] pnpm:           $pv (major: $($script:PnpmMajor))" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] pnpm:         NOT FOUND" -ForegroundColor Red
        $preflightPass = $false
    }

    Write-Host "  [INFO] Node linker:  $($script:EffectiveNodeLinker)" -ForegroundColor Cyan
    Write-Host "  [INFO] Install cmd:  $($script:EffectiveInstallCommand)" -ForegroundColor Cyan
    Write-Host "  [INFO] Build cmd:    $($script:EffectiveBuildCommand)" -ForegroundColor Cyan
    Write-Host "  [INFO] pnpm store:   $($script:PnpmStorePath)" -ForegroundColor Cyan

    # Extension dir
    if (Test-Path $script:ExtensionDir) {
        Write-Host "  [OK] Extension dir:  $($script:ExtensionDir)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Extension dir: $($script:ExtensionDir) (NOT FOUND)" -ForegroundColor Red
        $preflightPass = $false
    }

    # package.json
    $pkgJson = Join-Path $script:ExtensionDir "package.json"
    if (Test-Path $pkgJson) {
        Write-Host "  [OK] package.json:   found" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] package.json: NOT FOUND in $($script:ExtensionDir)" -ForegroundColor Red
        $preflightPass = $false
    }

    # node_modules / .pnp.cjs
    $hasNM = Test-Path (Join-Path $script:ExtensionDir "node_modules")
    $hasPnp = Test-Path (Join-Path $script:ExtensionDir ".pnp.cjs")
    if ($hasNM) {
        Write-Host "  [OK] node_modules:   present" -ForegroundColor Green
    } elseif ($hasPnp) {
        Write-Host "  [OK] .pnp.cjs:       present (PnP mode)" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Dependencies: not installed (run .\run.ps1 -i)" -ForegroundColor Yellow
    }

    # Required packages
    Push-Location $script:ExtensionDir
    try {
        $missing = @()
        foreach ($pkg in $script:RequiredPackages) {
            $resolveCheck = node -e "try { require.resolve('$pkg'); } catch { process.exit(1); }" 2>&1
            if ($LASTEXITCODE -ne 0) { $missing += $pkg }
        }
        if ($missing.Count -gt 0) {
            Write-Host "  [WARN] Missing pkgs: $($missing -join ', ')" -ForegroundColor Yellow
        } else {
            Write-Host "  [OK] Required pkgs:  all resolved" -ForegroundColor Green
        }
    } finally { Pop-Location }

    # .npmrc
    $npmrcPath = Join-Path $script:ExtensionDir ".npmrc"
    if (Test-Path $npmrcPath) {
        Write-Host "  [OK] .npmrc:         present" -ForegroundColor Green
        if ($script:verbose) {
            Get-Content $npmrcPath | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        }
    } else {
        Write-Host "  [INFO] .npmrc:       not present (will be created on build)" -ForegroundColor Gray
    }

    # Service worker: dynamic import() scan
    $bgDir = Join-Path (Join-Path $script:ExtensionDir "src") "background"
    if (Test-Path $bgDir) {
        $bgFiles = Get-ChildItem -Path $bgDir -Recurse -Include "*.ts" -File
        $dynamicImportViolations = @()
        foreach ($file in $bgFiles) {
            $content = Get-Content $file.FullName -Raw
            $matches = [regex]::Matches($content, "(?m)(?<!typeof\s)(?<!//.*)\bimport\s*\((?!.*\.d\.ts)")
            foreach ($m in $matches) {
                $lineNum = ($content.Substring(0, $m.Index) -split "`n").Count
                $relativePath = $file.FullName.Replace((Resolve-Path $script:ExtensionDir).Path, "").TrimStart("\", "/")
                $dynamicImportViolations += "${relativePath}:${lineNum}"
            }
        }
        if ($dynamicImportViolations.Count -gt 0) {
            Write-Host "  [FAIL] background/:  contains dynamic import() ($($dynamicImportViolations.Count) occurrence(s))" -ForegroundColor Red
            foreach ($v in $dynamicImportViolations) {
                Write-Host "    -> $v" -ForegroundColor Yellow
            }
            $preflightPass = $false
        } else {
            Write-Host "  [OK] background/:   no dynamic import() found (SW-safe)" -ForegroundColor Green
        }
    }

    # vite.config.ts: dynamic require() scan
    $viteConfigPath = Join-Path $script:ExtensionDir "vite.config.ts"
    if (Test-Path $viteConfigPath) {
        $viteConfigContent = Get-Content $viteConfigPath -Raw
        $requireMatches = [regex]::Matches($viteConfigContent, "(?m)(?<!//.*)\brequire\s*\(")
        if ($requireMatches.Count -gt 0) {
            Write-Host "  [FAIL] vite.config.ts: contains dynamic require()" -ForegroundColor Red
            $preflightPass = $false
        } else {
            Write-Host "  [OK] vite.config.ts: no dynamic require() (ESM-safe)" -ForegroundColor Green
        }
    }

    Write-Host ""
    if ($preflightPass) {
        Write-Host "  [OK] Preflight PASSED" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Preflight FAILED -- fix issues above" -ForegroundColor Red
    }

    return $preflightPass
}

<#
.SYNOPSIS
    Runs the Node-based manifest preflight (check-manifest-version.mjs).
.DESCRIPTION
    Hard-fails the build if manifest.json is missing at the repo root or its
    "version" does not match EXTENSION_VERSION in src/shared/constants.ts.
    Must run BEFORE any vite build invocation.
.OUTPUTS
    Boolean — $true on pass. Calls `exit 3` directly on failure to abort the build.
#>
function Invoke-ManifestPreflight {
    $manifestCheckScript = Join-Path $script:ExtensionDir "scripts/check-manifest-version.mjs"

    if (-not (Test-Path $manifestCheckScript)) {
        Write-Host "  [FAIL] Manifest preflight script missing" -ForegroundColor Red
        Write-Host "    Path:    $manifestCheckScript" -ForegroundColor Yellow
        Write-Host "    Missing: scripts/check-manifest-version.mjs" -ForegroundColor Yellow
        Write-Host "    Reason:  Required preflight cannot run -- manifest version drift would go undetected." -ForegroundColor Yellow
        exit 3
    }

    Write-Host "  Running manifest preflight..." -ForegroundColor Gray
    Push-Location $script:ExtensionDir
    try {
        node $manifestCheckScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FAIL] Manifest preflight failed -- aborting build" -ForegroundColor Red
            exit 3
        }
    } finally {
        Pop-Location
    }

    return $true
}

<#
.SYNOPSIS
    Runs the Node-based manifest permission validator (check-manifest-permissions.mjs).
.DESCRIPTION
    Hard-fails the build if any chrome.* API used in src/ is missing its required
    permission in manifest.json, or if any declared permission is unused.
    Must run BEFORE any vite build invocation.
.OUTPUTS
    Boolean -- $true on pass. Calls `exit 3` directly on failure to abort the build.
#>
function Invoke-ManifestPermissionCheck {
    $permCheckScript = Join-Path $script:ExtensionDir "scripts/check-manifest-permissions.mjs"

    if (-not (Test-Path $permCheckScript)) {
        Write-Host "  [FAIL] Manifest permission check script missing" -ForegroundColor Red
        Write-Host "    Path:    $permCheckScript" -ForegroundColor Yellow
        Write-Host "    Missing: scripts/check-manifest-permissions.mjs" -ForegroundColor Yellow
        Write-Host "    Reason:  Required preflight cannot run -- permission drift would go undetected." -ForegroundColor Yellow
        exit 3
    }

    Write-Host "  Running manifest permission validator..." -ForegroundColor Gray
    Push-Location $script:ExtensionDir
    try {
        node $permCheckScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FAIL] Manifest permission check failed -- aborting build" -ForegroundColor Red
            exit 3
        }
    } finally {
        Pop-Location
    }

    return $true
}
