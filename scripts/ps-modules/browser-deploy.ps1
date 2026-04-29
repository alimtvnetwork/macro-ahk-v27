<#
.SYNOPSIS
    Extension deployment and Chrome for Testing download.

.DESCRIPTION
    Deploys the built extension to a Chrome/Edge profile via three strategies
    (direct mode, hot-reload, cold launch) and provides an automated
    Chrome for Testing downloader.
    
    Depends on: browser-profiles.ps1 (Get-BrowserUserDataDir, Get-BrowserExePath,
    Get-BrowserMajorVersion, Stop-BrowserProcesses, Test-ExtensionInProfile)
#>

<#
.SYNOPSIS
    Deploys the built extension to a Chrome/Edge profile.
.DESCRIPTION
    Supports three strategies:
    1. Direct mode (-dm): prints the unpacked extension path for manual loading
    2. Hot-reload: when browser is running or Chrome v137+ (--load-extension disabled)
    3. Cold launch: starts browser with --load-extension flag
.PARAMETER ProfileFolder
    The resolved profile folder name.
#>
function Deploy-Extension([string]$ProfileFolder) {
    $userDataDir = Get-BrowserUserDataDir

    if ($script:DistDir -match '^[A-Za-z]:' -or $script:DistDir -match '^\\\\') {
        Write-Host "  ERROR: DistDir is an absolute path ('$($script:DistDir)') -- expected relative (e.g. 'chrome-extension')." -ForegroundColor Red
        exit 1
    }

    $extDistPath = Join-Path $script:ExtensionDir $script:DistDir
    
    if (-not (Test-Path $extDistPath)) {
        Write-Host "  ERROR: Extension build output not found: $extDistPath" -ForegroundColor Red
        exit 1
    }
    
    $manifestPath = Join-Path $extDistPath "manifest.json"
    if (-not (Test-Path $manifestPath)) {
        Write-Host "  ERROR: manifest.json not found in $($script:DistDir)/" -ForegroundColor Red
        Write-Host "    Checked path: $manifestPath" -ForegroundColor Red
        Write-Host "    Hint: the build likely produced the preview app instead of the extension bundle." -ForegroundColor Yellow
        exit 1
    }
    
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $extName = $manifest.name
    $extVersion = $manifest.version
    $extDistAbsolute = (Resolve-Path $extDistPath).Path

    $script:LastDeployMode = $null
    $script:LastDeployTarget = if ($script:directmode) { "Direct / Load unpacked" } else { "$($script:browser) / $ProfileFolder" }
    $script:LastDeployPath = $extDistAbsolute
    $script:LastDeployNote = $null
    
    if ($script:directmode) {
        $script:LastDeployMode = "Direct mode"
        $script:LastDeployNote = "Load unpacked manually from the chrome-extension/ folder (powershell.json -> distDir)."
        Write-Host ""
        Write-Host "  +---------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host "  |  LOAD THIS FOLDER IN chrome://extensions -> Load unpacked  |" -ForegroundColor Cyan
        Write-Host "  |  Path: $extDistAbsolute" -ForegroundColor White
        Write-Host "  +---------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  [OK] $extName v$extVersion ready for direct loading" -ForegroundColor Green
        return
    }
    
    $browserExe = Get-BrowserExePath
    if (-not (Test-Path $browserExe)) {
        Write-Host "  ERROR: Browser not found at: $browserExe" -ForegroundColor Red
        exit 1
    }

    if ($script:killbrowser) {
        [void](Stop-BrowserProcesses $browserExe)
    }

    $browserMajor = Get-BrowserMajorVersion $browserExe
    $isLoadExtDisabled = ($script:browser.ToLower() -eq "chrome" -and $null -ne $browserMajor -and $browserMajor -ge 137)
    $browserProcessName = [System.IO.Path]::GetFileNameWithoutExtension($browserExe)
    $runningBrowser = Get-Process -Name $browserProcessName -ErrorAction SilentlyContinue
    $isBrowserRunning = $null -ne $runningBrowser

    if ($isLoadExtDisabled -or $isBrowserRunning) {
        # Hot-reload strategy
        $isFirstLoad = -not (Test-ExtensionInProfile $userDataDir $ProfileFolder $extDistAbsolute)

        if ($isLoadExtDisabled -and -not $isBrowserRunning) {
            Write-Host "  Chrome v$browserMajor detected -- --load-extension disabled." -ForegroundColor Yellow
            Start-Process -FilePath $browserExe -ArgumentList @("--profile-directory=`"$ProfileFolder`"")
            Write-Host "  [OK] Chrome launched" -ForegroundColor Green
        } elseif ($isBrowserRunning) {
            if ($isFirstLoad) {
                Write-Host "  Browser running, but this unpacked extension path is NOT loaded in profile '$ProfileFolder'." -ForegroundColor Yellow
                Write-Host "  Reload will keep refreshing the older unpacked extension until you load this folder once." -ForegroundColor Yellow
            } else {
                Write-Host "  Browser running -- existing unpacked extension will auto-reload via hot-reload." -ForegroundColor Yellow
            }
        }

        if ($isFirstLoad) {
            $script:LastDeployMode = "Manual first load"
            $script:LastDeployNote = "Open chrome://extensions, remove/disable any older unpacked Marco copy if needed, then load this chrome-extension/ folder once."
        } elseif ($isLoadExtDisabled -and -not $isBrowserRunning) {
            $script:LastDeployMode = "Hot reload"
            $script:LastDeployNote = "Browser launched; existing unpacked extension will auto-reload."
        } else {
            $script:LastDeployMode = "Hot reload"
            $script:LastDeployNote = "Browser already running; extension auto-reloads in ~2 seconds."
        }

        Write-Host ""
        if ($isFirstLoad) {
            Write-Host "  ACTION REQUIRED: chrome://extensions -> Remove or disable the old unpacked Marco extension if it points elsewhere." -ForegroundColor Yellow
            Write-Host "  Then click 'Load unpacked' and select:" -ForegroundColor Yellow
            Write-Host "  Path: $extDistAbsolute" -ForegroundColor White
            Write-Host "  After this one-time load, future builds auto-reload (~2s)." -ForegroundColor Green
        } else {
            Write-Host "  [OK] Extension will auto-reload in ~2 seconds (v$extVersion)" -ForegroundColor Green
            Write-Host "  [OK] Active unpacked path: $extDistAbsolute" -ForegroundColor Green
        }

        Write-Host "  [OK] $extName v$extVersion built successfully" -ForegroundColor Green

        if ($isLoadExtDisabled) {
            Write-Host ""
            Write-Host "  TIP: Use -dl to download Chrome for Testing (supports --load-extension)" -ForegroundColor Gray
        }
    } else {
        # Cold launch strategy
        $profileDir = Join-Path $userDataDir $ProfileFolder
        if (-not (Test-Path $profileDir)) {
            Write-Host "  ERROR: Profile directory not found: $profileDir" -ForegroundColor Red
            exit 1
        }

        $script:LastDeployMode = "Cold launch"
        $script:LastDeployNote = "Browser launched with --load-extension."
        Write-Host "  Extension: $extDistAbsolute" -ForegroundColor DarkCyan
        Write-Host "  Browser:   $browserExe" -ForegroundColor DarkCyan
        Write-Host "  Profile:   $ProfileFolder" -ForegroundColor DarkCyan

        $launchArgs = @(
            "--load-extension=`"$extDistAbsolute`""
            "--profile-directory=`"$ProfileFolder`""
        )
        
        Start-Process -FilePath $browserExe -ArgumentList $launchArgs
        
        Write-Host "  [OK] Launched $extName v$extVersion -> $ProfileFolder" -ForegroundColor Green
        Write-Host "  [OK] Loaded from: $extDistAbsolute" -ForegroundColor Green
    }
}

<#
.SYNOPSIS
    Downloads Chrome for Testing and saves the path to powershell.json.
.DESCRIPTION
    Fetches the latest stable Chrome for Testing build from the official API,
    downloads the win64 zip, extracts it, and updates powershell.json.
.OUTPUTS
    String — path to the downloaded chrome.exe, or $null on failure.
#>
function Download-ChromeForTesting {
    $apiUrl = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
    $installDir = Join-Path $script:ScriptDir ".chrome-for-testing"

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Chrome for Testing -- Downloader" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    $existingExe = Join-Path $installDir "chrome-win64\chrome.exe"
    if (Test-Path $existingExe) {
        $existingVersion = (Get-Item $existingExe).VersionInfo.ProductVersion
        Write-Host "  Existing install found: v$existingVersion" -ForegroundColor Gray
        $answer = Read-Host "  Re-download latest? (y/N)"
        if ($answer -ne 'y' -and $answer -ne 'Y') {
            Write-Host "  Keeping existing install." -ForegroundColor Gray
            return $existingExe
        }
    }

    Write-Host "  Fetching latest version info..." -ForegroundColor Gray
    try {
        $json = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing
    } catch {
        Write-Host "  ERROR: Failed to fetch version info: $_" -ForegroundColor Red
        return $null
    }

    $channel = $json.channels.Stable
    $version = $channel.version
    $downloadEntry = $channel.downloads.chrome | Where-Object { $_.platform -eq "win64" }

    if (-not $downloadEntry) {
        Write-Host "  ERROR: No win64 download found for v$version" -ForegroundColor Red
        return $null
    }

    $downloadUrl = $downloadEntry.url
    $zipPath = Join-Path $env:TEMP "chrome-win64.zip"

    Write-Host "  Version:  $version" -ForegroundColor Cyan
    Write-Host "  Downloading..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-Host "  ERROR: Download failed: $_" -ForegroundColor Red
        return $null
    }
    Write-Host "  [OK] Downloaded ($([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB)" -ForegroundColor Green

    if (Test-Path $installDir) { Remove-Item -Recurse -Force $installDir }
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $installDir -Force
    Remove-Item $zipPath -Force

    $chromePath = Join-Path $installDir "chrome-win64\chrome.exe"
    if (-not (Test-Path $chromePath)) {
        Write-Host "  ERROR: chrome.exe not found after extraction" -ForegroundColor Red
        return $null
    }

    Write-Host "  [OK] Extracted Chrome for Testing v$version" -ForegroundColor Green

    try {
        $configContent = Get-Content $script:ConfigPath -Raw | ConvertFrom-Json
        $configContent.browserExePath = $chromePath
        $configContent | ConvertTo-Json -Depth 10 | Set-Content $script:ConfigPath -Encoding UTF8
        Write-Host "  [OK] powershell.json updated" -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: Could not update powershell.json: $_" -ForegroundColor Yellow
    }

    return $chromePath
}
