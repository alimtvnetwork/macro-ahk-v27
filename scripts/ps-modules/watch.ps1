<#
.SYNOPSIS
    File system watch mode for continuous rebuild.

.DESCRIPTION
    Watches the extension's src/ folder (resolved from powershell.json -> extensionDir)
    for file changes and triggers rebuilds with configurable debounce.
    Optionally re-deploys after each rebuild.
#>

<#
.SYNOPSIS
    Starts the file watcher loop. Blocks until Ctrl+C.
.DESCRIPTION
    Creates a FileSystemWatcher on the extension src/ directory, debounces
    changes at 1-second intervals, rebuilds on change, and optionally
    re-deploys to the target browser profile.
#>
function Start-WatchMode {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Watch mode active" -ForegroundColor Cyan
    Write-Host "  Watching: $($script:ExtensionDir)\src" -ForegroundColor Cyan
    Write-Host "  Press Ctrl+C to stop" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = Join-Path $script:ExtensionDir "src"
    $watcher.IncludeSubdirectories = $true
    $watcher.Filter = "*.*"
    $watcher.EnableRaisingEvents = $true
    
    $lastBuild = [DateTime]::MinValue
    $debounceMs = 1000
    
    while ($true) {
        $result = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::All, 1000)
        if (-not $result.TimedOut) {
            $now = [DateTime]::Now
            if (($now - $lastBuild).TotalMilliseconds -gt $debounceMs) {
                $lastBuild = $now
                Write-Host ""
                Write-Host "  File changed: $($result.Name)" -ForegroundColor Yellow
                Write-Host "  Rebuilding..." -ForegroundColor Gray
                
                Push-Location $script:ExtensionDir
                try {
                    $watchBuildCommand = Get-EffectivePnpmCommand $script:EffectiveBuildCommand
                    Invoke-Expression $watchBuildCommand
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "  [OK] Rebuilt successfully" -ForegroundColor Green
                        
                        if ($script:deploy) {
                            $profileFolder = Find-ProfileFolder $script:TargetProfile
                            if ($profileFolder) {
                                Deploy-Extension -ProfileFolder $profileFolder
                            }
                        }
                        
                        $reloadSignal = Join-Path $script:ExtensionDir ".reload-signal"
                        Set-Content -Path $reloadSignal -Value (Get-Date -Format "o")
                    } else {
                        Write-Host "  [FAIL] Build failed" -ForegroundColor Red
                    }
                }
                finally { Pop-Location }
            }
        }
    }
}
