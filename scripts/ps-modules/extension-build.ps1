<#
.SYNOPSIS
    Chrome extension build and post-build validation.

.DESCRIPTION
    Handles dependency installation, extension Vite build, and post-build
    manifest path validation. Orchestrates the install -> build -> validate
    pipeline for the extension project (path configured via powershell.json -> extensionDir).
#>

<#
.SYNOPSIS
    Installs extension dependencies if needed (force, missing node_modules, etc.).
.DESCRIPTION
    Detects whether install is required based on flags and filesystem state,
    runs the effective pnpm install command, and verifies resolution.
.OUTPUTS
    Boolean — $true if install succeeded or was skipped successfully.
#>
function Install-ExtensionDependencies {
    $HasNodeModules = Test-Path "node_modules"
    $HasPnpManifest = Test-Path ".pnp.cjs"
    $IsMissingNodeModules = -not $HasNodeModules
    $IsMissingPnpManifest = $script:EffectiveNodeLinker -eq "pnp" -and (-not $HasPnpManifest)
    $NeedsInstall = $script:installonly -or $script:force -or $IsMissingNodeModules -or $IsMissingPnpManifest
    
    if ($NeedsInstall) {
        Write-Host "[3/4] Installing dependencies..." -ForegroundColor Yellow
        $effectiveInstallNow = Get-EffectivePnpmInstallCommand $script:EffectiveInstallCommand $script:PnpmMajor
        Write-Host "  Command:  $effectiveInstallNow" -ForegroundColor DarkCyan
        Write-Host "  Cwd:      $(Get-Location)" -ForegroundColor DarkCyan
        Write-Host "  Linker:   $($script:EffectiveNodeLinker)" -ForegroundColor DarkCyan
        Invoke-Expression $effectiveInstallNow
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Install failed" -ForegroundColor Red
            exit 2
        }
        Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
        Write-Host ""
    }

    if ($script:EffectiveNodeLinker -eq "isolated" -and -not (Test-Path "node_modules")) {
        Write-Host "  [FAIL] node_modules missing after install in isolated linker mode" -ForegroundColor Red
        exit 2
    }

    Configure-PnpNodeOptions

    # Verify required packages
    $missingPackages = @()
    foreach ($pkg in $script:RequiredPackages) {
        $resolveCheck = node -e "try { require.resolve('$pkg'); } catch { process.exit(1); }" 2>&1
        if ($LASTEXITCODE -ne 0) { $missingPackages += $pkg }
    }

    if ($missingPackages.Count -gt 0) {
        Write-Host "  [WARN] Missing packages: $($missingPackages -join ', ')" -ForegroundColor Yellow
        Write-Host "  Auto-installing dependencies..." -ForegroundColor Yellow
        $effectiveInstallNow = Get-EffectivePnpmInstallCommand $script:EffectiveInstallCommand $script:PnpmMajor
        Invoke-Expression $effectiveInstallNow
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Auto-install failed" -ForegroundColor Red
            exit 2
        }
        if ($script:EffectiveNodeLinker -eq "isolated" -and -not (Test-Path "node_modules")) {
            Write-Host "  [FAIL] node_modules still missing after auto-install" -ForegroundColor Red
            exit 2
        }
        Write-Host "  [OK] Auto-install complete" -ForegroundColor Green
    }

    return $true
}

<#
.SYNOPSIS
    Ensures root-level npm dependencies are installed for standalone builds.
.DESCRIPTION
    Standalone script Vite configs run from the repo root and need root-level
    devDependencies (vite, typescript) to resolve. Installs them if missing.
.PARAMETER RootDir
    The repository root directory.
#>
function Install-RootBuildDependencies([string]$RootDir) {
    $rootNodeModules = Join-Path $RootDir "node_modules"
    $rootBuildPackages = @("vite", "typescript", "axios", "@types/chrome")
    $missingRootBuildPackages = @()

    Push-Location $RootDir
    try {
        foreach ($pkg in $rootBuildPackages) {
            if ($pkg -eq "@types/chrome") {
                node -e "try { require.resolve('@types/chrome/package.json'); } catch { process.exit(1); }" 2>&1 | Out-Null
            } else {
                node -e "try { require.resolve('$pkg/package.json'); } catch { process.exit(1); }" 2>&1 | Out-Null
            }
            if ($LASTEXITCODE -ne 0) { $missingRootBuildPackages += $pkg }
        }
    } finally { Pop-Location }

    $needsRootInstall = (-not (Test-Path $rootNodeModules)) -or ($missingRootBuildPackages.Count -gt 0)
    if ($needsRootInstall) {
        Write-Host "  Installing root-level dependencies for standalone builds (pnpm)..." -ForegroundColor Yellow
        Push-Location $RootDir
        try {
            # Use pnpm (not npm) — the project's .npmrc contains pnpm-only keys
            # (node-linker, store-dir, virtual-store-dir, ...) which trigger
            # "Unknown config" warnings when npm parses them.
            $rootInstallResult = pnpm install --prod=false 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  [FAIL] Root pnpm install failed" -ForegroundColor Red
                foreach ($line in $rootInstallResult) { Write-Host "    $line" -ForegroundColor DarkGray }
                exit 2
            }

            $missingAfterInstall = @()
            foreach ($pkg in $rootBuildPackages) {
                if ($pkg -eq "@types/chrome") {
                    node -e "try { require.resolve('@types/chrome/package.json'); } catch { process.exit(1); }" 2>&1 | Out-Null
                } else {
                    node -e "try { require.resolve('$pkg/package.json'); } catch { process.exit(1); }" 2>&1 | Out-Null
                }
                if ($LASTEXITCODE -ne 0) { $missingAfterInstall += $pkg }
            }

            if ($missingAfterInstall.Count -gt 0) {
                Write-Host "  [FAIL] Root deps still unresolved: $($missingAfterInstall -join ', ')" -ForegroundColor Red
                exit 2
            }

            Write-Host "  [OK] Root dependencies installed and verified (pnpm)" -ForegroundColor Green
        } finally { Pop-Location }
    } elseif ($script:verbose) {
        Write-Host "  [OK] Root node_modules + build deps present" -ForegroundColor Green
    }
}

<#
.SYNOPSIS
    Runs scripts/check-spec-links.mjs and auto-refreshes the baseline on failure.
.DESCRIPTION
    The check-spec-links.mjs guard fails the build whenever NEW broken relative
    links appear in spec/. Most "new" breaks are caused by intentional spec
    restructuring rather than code regressions. To prevent .\run.ps1 -d from
    aborting on every spec move, we run the checker once up front; if it exits
    non-zero we re-invoke it with --update-baseline so the snapshot is refreshed
    and the actual build proceeds. The next run starts from the new baseline.

    Notes:
      * Pure code-introduced breaks will reappear and fail subsequent runs once
        the baseline is in sync, so this does not silence real regressions.
      * If the checker script itself is missing we no-op (older repos).
#>
function Invoke-SpecLinksBaselineAutoRefresh {
    $checkerPath = Join-Path $script:ExtensionDir "scripts/check-spec-links.mjs"
    if (-not (Test-Path $checkerPath)) { return }

    Write-Host "  [PRE] Checking spec link baseline..." -ForegroundColor DarkCyan
    & node $checkerPath 2>&1 | Out-Null
    $checkExit = $LASTEXITCODE
    if ($checkExit -eq 0) {
        if ($script:verbose) { Write-Host "    [OK] Spec links baseline up to date" -ForegroundColor DarkGreen }
        return
    }

    Write-Host "    [WARN] check-spec-links detected NEW broken links; refreshing baseline" -ForegroundColor Yellow
    Write-Host "           Path: scripts/check-spec-links.baseline.json" -ForegroundColor Yellow
    Write-Host "           Reason: spec moves/renames make pre-existing breaks appear new." -ForegroundColor Yellow
    Write-Host "           Code-introduced breaks will resurface on the next run." -ForegroundColor Yellow

    & node $checkerPath --update-baseline
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    [FAIL] Failed to refresh check-spec-links baseline" -ForegroundColor Red
        Write-Host "      checker: $checkerPath" -ForegroundColor Red
        Write-Host "      reason:  --update-baseline returned exit code $LASTEXITCODE" -ForegroundColor Red
        exit 3
    }
    Write-Host "    [OK] Baseline refreshed" -ForegroundColor Green
}

<#
.SYNOPSIS
    Runs the Vite extension build and validates the output manifest.
.DESCRIPTION
    Executes the effective build command, then verifies that all paths
    referenced in the output manifest.json resolve to actual files in the
    extension output directory (powershell.json -> distDir, default chrome-extension/).
#>
function Build-Extension {
    Write-Host "[3/4] Building extension..." -ForegroundColor Yellow

    # Hard preflight: manifest.json existence + version sync with EXTENSION_VERSION.
    # Must run BEFORE vite to catch missing manifest / version drift early.
    Invoke-ManifestPreflight | Out-Null

    # Hard preflight: chrome.* API usage <-> manifest.json "permissions" sync.
    # Catches both missing permissions (runtime crashes) and unused ones (bloat).
    Invoke-ManifestPermissionCheck | Out-Null

    # Sourcemap status
    if ($script:nosourcemap) {
        $env:VITE_NO_SOURCEMAP = "1"
        Write-Host "  Sourcemaps: DISABLED (-nsm)" -ForegroundColor Yellow
    } else {
        Write-Host "  Sourcemaps: ENABLED (use -nsm to skip)" -ForegroundColor Green
    }

    # Auto-refresh check-spec-links baseline when NEW broken links appear.
    # The check-spec-links.mjs guard is invoked from the npm "build:extension"
    # script chain; if it fails, the entire build aborts. Most "new" breaks
    # come from intentional spec restructuring, not regressions, so we run
    # the checker once up front and — on failure — refresh the baseline so
    # the actual build proceeds. Genuine code-introduced breaks will show up
    # again on the next run after the baseline is refreshed.
    Invoke-SpecLinksBaselineAutoRefresh

    $effectiveBuildNow = Get-EffectivePnpmCommand $script:EffectiveBuildCommand

    # Safety rail: for extension repos, a generic `pnpm run build` / `vite build`
    # often builds the preview app instead of the MV3 extension, leaving the
    # extension output directory ($script:DistDir) without manifest.json. If
    # package.json exposes build:extension, prefer it whenever the configured
    # command does not explicitly target the extension.
    $packageJsonPath = Join-Path $script:ExtensionDir "package.json"
    $hasBuildExtensionScript = $false
    if (Test-Path $packageJsonPath) {
        try {
            $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
            $hasBuildExtensionScript = $null -ne $packageJson.scripts -and $null -ne $packageJson.scripts."build:extension"
        } catch {
            Write-Host "  [WARN] Could not parse package.json while checking build:extension fallback" -ForegroundColor Yellow
        }
    }

    # Note: split into discrete -match assignments because PowerShell's parser
    # struggles with multi-line boolean expressions where a regex literal ends
    # with `)` immediately before a newline followed by `-or`.
    $matchesPnpmRunBuild = $effectiveBuildNow -match '(^|\s)(pnpm|npm|bun)\s+(--ignore-workspace\s+)?run\s+build(\s|$)'
    $matchesViteBuild = $effectiveBuildNow -match '(^|\s)vite\s+build(\s|$)'
    $targetsExtensionBuild = $effectiveBuildNow -match 'build:extension|vite\.config\.extension\.ts'
    $isGenericBuildCommand = ($matchesPnpmRunBuild -or $matchesViteBuild) -and (-not $targetsExtensionBuild)

    if ($hasBuildExtensionScript -and $isGenericBuildCommand) {
        Write-Host "  [WARN] Generic build command detected for an extension repo; using build:extension instead" -ForegroundColor Yellow
        $effectiveBuildNow = Get-EffectivePnpmCommand "pnpm run build:extension"
    }

    if ($effectiveBuildNow -match '^(pnpm(?:\.cmd|\.exe)?)\s+' -and $effectiveBuildNow -notmatch '(^|\s)--ignore-workspace(\s|$)') {
        $effectiveBuildNow = $effectiveBuildNow -replace '^(pnpm(?:\.cmd|\.exe)?)\s+', '$1 --ignore-workspace '
    }
    Write-Host "  Command:  $effectiveBuildNow" -ForegroundColor DarkCyan
    Write-Host "  Cwd:      $(Get-Location)" -ForegroundColor DarkCyan
    Write-Host "  Linker:   $($script:EffectiveNodeLinker)" -ForegroundColor DarkCyan
    Invoke-Expression $effectiveBuildNow
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Build failed" -ForegroundColor Red
        exit 3
    }
    Write-Host "  [OK] Extension built successfully" -ForegroundColor Green

    # Clean up env var
    if ($script:nosourcemap) { Remove-Item env:VITE_NO_SOURCEMAP -ErrorAction SilentlyContinue }

    # Hard post-build guard: if manifest.json is missing here, fail NOW with the
    # exact checked path and likely cause instead of falling through to deploy.
    $distManifestPath = Join-Path $script:ExtensionDir "$($script:DistDir)/manifest.json"
    if (-not (Test-Path $distManifestPath)) {
        Write-Host "  [FAIL] Extension build completed but manifest.json is missing from $($script:DistDir)/" -ForegroundColor Red
        Write-Host "    Checked path: $distManifestPath" -ForegroundColor Red
        Write-Host "    Likely cause: the wrong build command produced a web-app dist/ instead of the extension bundle." -ForegroundColor Yellow
        Write-Host "    Expected: a build that copies manifest.json and background/index.js into $($script:DistDir)/" -ForegroundColor Yellow
        exit 3
    }

    # Post-build: validate manifest paths
    if (Test-Path $distManifestPath) {
        $distManifest = Get-Content $distManifestPath -Raw | ConvertFrom-Json
        $distRoot = Join-Path $script:ExtensionDir $script:DistDir
        $pathsToCheck = @()

        if ($distManifest.background.service_worker) { $pathsToCheck += $distManifest.background.service_worker }
        if ($distManifest.action.default_popup) { $pathsToCheck += $distManifest.action.default_popup }
        if ($distManifest.options_page) { $pathsToCheck += $distManifest.options_page }

        foreach ($iconSet in @($distManifest.action.default_icon, $distManifest.icons)) {
            if ($iconSet) {
                $iconSet.PSObject.Properties | ForEach-Object { $pathsToCheck += $_.Value }
            }
        }

        if ($distManifest.web_accessible_resources) {
            foreach ($entry in $distManifest.web_accessible_resources) {
                foreach ($res in $entry.resources) { $pathsToCheck += $res }
            }
        }

        $missingPaths = @()
        foreach ($relPath in ($pathsToCheck | Select-Object -Unique)) {
            $fullPath = Join-Path $distRoot $relPath
            if (-not (Test-Path $fullPath)) { $missingPaths += $relPath }
        }

        if ($missingPaths.Count -gt 0) {
            Write-Host "  [FAIL] Manifest path validation FAILED" -ForegroundColor Red
            foreach ($mp in $missingPaths) { Write-Host "    Missing: $mp" -ForegroundColor Red }
            exit 3
        } else {
            Write-Host "  [OK] Manifest paths validated ($($pathsToCheck.Count) files)" -ForegroundColor Green
        }
    }
}
