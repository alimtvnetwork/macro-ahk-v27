<#
.SYNOPSIS
    Browser detection, profile enumeration, and process management.

.DESCRIPTION
    Provides functions to resolve browser paths, detect installed versions,
    enumerate Chrome/Edge user profiles, and manage browser processes.
#>

<#
.SYNOPSIS
    Returns the user data directory for the selected browser.
#>
function Get-BrowserUserDataDir {
    switch ($script:browser.ToLower()) {
        "edge"   { return $script:EdgeUserDataDir }
        default  { return $script:ChromeUserDataDir }
    }
}

<#
.SYNOPSIS
    Returns the executable path for the selected browser.
.DESCRIPTION
    Uses the explicit path from powershell.json if set, otherwise
    falls back to the default install location.
#>
function Get-BrowserExePath {
    if ($script:BrowserExePathOverride -ne "") {
        return $script:BrowserExePathOverride
    }
    switch ($script:browser.ToLower()) {
        "edge"   { return "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" }
        default  { return "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe" }
    }
}

<#
.SYNOPSIS
    Extracts the major version from a browser executable's VersionInfo.
.PARAMETER BrowserExePath
    Full path to the browser .exe file.
.OUTPUTS
    Int or $null — the major version number.
#>
function Get-BrowserMajorVersion([string]$BrowserExePath) {
    try {
        $file = Get-Item $BrowserExePath
        $rawVersion = $file.VersionInfo.ProductVersion
        if ([string]::IsNullOrWhiteSpace($rawVersion)) {
            $rawVersion = $file.VersionInfo.FileVersion
        }
        if ([string]::IsNullOrWhiteSpace($rawVersion)) { return $null }

        $majorMatch = [regex]::Match($rawVersion, "^\d+")
        if ($majorMatch.Success) { return [int]$majorMatch.Value }
    } catch {}
    return $null
}

<#
.SYNOPSIS
    Enumerates all Chrome/Edge profiles in the user data directory.
.OUTPUTS
    Array of PSCustomObject with Folder and Name properties.
#>
function Get-AvailableProfiles {
    $userDataDir = Get-BrowserUserDataDir
    if (-not (Test-Path $userDataDir)) {
        Write-Host "  WARNING: Browser user data directory not found: $userDataDir" -ForegroundColor Yellow
        return @()
    }
    
    $profiles = @()
    
    $defaultPrefs = Join-Path $userDataDir "Default\Preferences"
    if (Test-Path $defaultPrefs) {
        try {
            $prefs = Get-Content $defaultPrefs -Raw | ConvertFrom-Json
            $name = if ($prefs.profile -and $prefs.profile.name) { $prefs.profile.name } else { "Default" }
            $profiles += [PSCustomObject]@{ Folder = "Default"; Name = $name }
        } catch {
            $profiles += [PSCustomObject]@{ Folder = "Default"; Name = "Default" }
        }
    }
    
    Get-ChildItem -Path $userDataDir -Directory -Filter "Profile *" -ErrorAction SilentlyContinue | ForEach-Object {
        $prefsFile = Join-Path $_.FullName "Preferences"
        if (Test-Path $prefsFile) {
            try {
                $prefs = Get-Content $prefsFile -Raw | ConvertFrom-Json
                $name = if ($prefs.profile -and $prefs.profile.name) { $prefs.profile.name } else { $_.Name }
                $profiles += [PSCustomObject]@{ Folder = $_.Name; Name = $name }
            } catch {
                $profiles += [PSCustomObject]@{ Folder = $_.Name; Name = $_.Name }
            }
        }
    }
    
    return $profiles
}

<#
.SYNOPSIS
    Resolves a profile name (display name or folder name) to the actual folder.
.PARAMETER ProfileName
    A profile display name like "Main Account" or folder name like "Profile 1".
.OUTPUTS
    String — the profile folder name, or $null if not found.
#>
function Find-ProfileFolder([string]$ProfileName) {
    $profiles = Get-AvailableProfiles
    
    $match = $profiles | Where-Object { $_.Folder -eq $ProfileName }
    if ($match) { return $match.Folder }
    
    $match = $profiles | Where-Object { $_.Name -eq $ProfileName }
    if ($match) { return $match.Folder }
    
    $match = $profiles | Where-Object { $_.Name -like "*$ProfileName*" }
    if ($match -and @($match).Count -eq 1) { return $match.Folder }
    
    return $null
}

<#
.SYNOPSIS
    Kills all running instances of the target browser.
.PARAMETER BrowserExePath
    Full path to the browser executable.
.OUTPUTS
    Boolean — $true if processes were found and killed.
#>
function Stop-BrowserProcesses([string]$BrowserExePath) {
    $browserProcessName = [System.IO.Path]::GetFileNameWithoutExtension($BrowserExePath)
    $runningProcesses = Get-Process -Name $browserProcessName -ErrorAction SilentlyContinue

    if (-not $runningProcesses) { return $false }

    Write-Host "  Killing running $browserProcessName instances (-k)..." -ForegroundColor Yellow
    $runningProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1200
    return $true
}

<#
.SYNOPSIS
    Checks if the extension dist path is already registered in Chrome's profile.
.PARAMETER UserDataDir
    Chrome/Edge user data directory.
.PARAMETER ProfileFolder
    The profile folder name (e.g. "Default", "Profile 1").
.PARAMETER DistAbsPath
    Absolute path to the extension's dist/ folder.
.OUTPUTS
    Boolean — $true if the extension path appears in the profile's Preferences.
#>
function Test-ExtensionInProfile([string]$UserDataDir, [string]$ProfileFolder, [string]$DistAbsPath) {
    try {
        $prefsPath = Join-Path $UserDataDir "$ProfileFolder\Preferences"
        if (-not (Test-Path $prefsPath)) { return $false }
        
        $prefsContent = Get-Content $prefsPath -Raw
        $normalizedDist = $DistAbsPath -replace '\\', '/'
        $containsPath = $prefsContent -match [regex]::Escape($normalizedDist) -or $prefsContent -match [regex]::Escape($DistAbsPath)
        return $containsPath
    } catch {
        return $false
    }
}
