[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Command = 'help',
    [Parameter(Position = 1)][string]$Name,
    [string]$DeepLink,
    [string]$BuildProfile = 'production-apk',
    [string]$OutDir,
    [string]$Copy = 'C:\work\kjn',
    [string]$Avd = 'test_phone',
    [int]$Port = 8083,
    [int]$Limit = 10,
    [int]$TimeoutMin = 45,
    [switch]$Delete,
    [switch]$StopEmulator,
    [switch]$UseRunning,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$StateDir = Join-Path $env:TEMP 'jew365-native'
$StateFile = Join-Path $StateDir 'run.json'
$RunLog = Join-Path $StateDir 'run.log'
$ExcludedPrefixes = @('.claude/', '.agents/', '.idea/', 'design/', 'docs/', 'release/', 'coverage/')
$NativePattern = '^(pnpm-lock\.yaml|app\.json|app\.config\.[^/]+|plugins/.+|assets/.+|android/.+|ios/.+|scripts/with[^/]*\.js|locales/[^/]+\.json)$'
$Serial = $null

function Say([string]$Message) { Write-Host "[native] $Message" }

function Fail([string]$Message) { throw $Message }

function Get-AppConfig {
    (Get-Content -Raw -Encoding UTF8 (Join-Path $Repo 'app.json') | ConvertFrom-Json).expo
}

function Get-Sdk {
    foreach ($candidate in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

function Get-AdbExe {
    $onPath = Get-Command adb -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    $sdk = Get-Sdk
    if ($sdk) {
        $inSdk = Join-Path $sdk 'platform-tools\adb.exe'
        if (Test-Path $inSdk) { return $inSdk }
    }
    $winget = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (Test-Path $winget) {
        $found = Get-ChildItem $winget -Filter 'Google.PlatformTools*' -Directory |
            ForEach-Object { Join-Path $_.FullName 'platform-tools\adb.exe' } |
            Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($found) { return $found }
    }
    Fail 'adb not found: install platform-tools or set ANDROID_HOME'
}

function Get-EmulatorExe {
    $sdk = Get-Sdk
    if ($sdk) {
        $exe = Join-Path $sdk 'emulator\emulator.exe'
        if (Test-Path $exe) { return $exe }
    }
    Fail 'emulator.exe not found under the Android SDK'
}

function Get-AaptExe {
    $sdk = Get-Sdk
    if (-not $sdk) { return $null }
    $tools = Join-Path $sdk 'build-tools'
    if (-not (Test-Path $tools)) { return $null }
    Get-ChildItem $tools -Directory |
        Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
        ForEach-Object { Join-Path $_.FullName 'aapt.exe' } |
        Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Start-AdbProcess([string[]]$AdbArgs, [int]$TimeoutSec) {
    $psi = [Diagnostics.ProcessStartInfo]::new((Get-AdbExe))
    if ($script:Serial) { $psi.ArgumentList.Add('-s'); $psi.ArgumentList.Add($script:Serial) }
    foreach ($item in $AdbArgs) { $psi.ArgumentList.Add($item) }
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $process = [Diagnostics.Process]::Start($psi)
    $memory = [IO.MemoryStream]::new()
    $copied = $process.StandardOutput.BaseStream.CopyToAsync($memory)
    $errored = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSec * 1000)) {
        $process.Kill($true)
        return @{ TimedOut = $true; Bytes = [byte[]]@(); Error = ''; ExitCode = -1 }
    }
    $process.WaitForExit()
    $copied.Wait()
    return @{ TimedOut = $false; Bytes = $memory.ToArray(); Error = $errored.Result; ExitCode = $process.ExitCode }
}

function Invoke-Adb([string[]]$AdbArgs, [int]$TimeoutSec = 30, [switch]$AllowFailure) {
    $result = Start-AdbProcess $AdbArgs $TimeoutSec
    $label = "adb $($AdbArgs -join ' ')"
    if ($result.TimedOut) { Fail "$label timed out after $TimeoutSec s: the emulator does not answer, restart it" }
    if ($result.ExitCode -ne 0 -and -not $AllowFailure) { Fail "$label failed with exit code $($result.ExitCode): $($result.Error.Trim())" }
    return [Text.Encoding]::UTF8.GetString($result.Bytes)
}

function Get-AvdName([string]$Candidate) {
    $previous = $script:Serial
    $script:Serial = $Candidate
    try { $result = Start-AdbProcess @('emu', 'avd', 'name') 10 } finally { $script:Serial = $previous }
    if ($result.TimedOut -or $result.ExitCode -ne 0) { return $null }
    $lines = [Text.Encoding]::UTF8.GetString($result.Bytes) -split "`r?`n"
    return ($lines | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -First 1)
}

function Get-AvdSerial {
    foreach ($line in (& (Get-AdbExe) devices)) {
        if ($line -match '^(emulator-\d+)\s+device\b') {
            $candidate = $Matches[1]
            if ((Get-AvdName $candidate) -eq $Avd) { return $candidate }
        }
    }
    return $null
}

function Read-State {
    if (Test-Path $StateFile) { return Get-Content -Raw $StateFile | ConvertFrom-Json }
    return $null
}

function Update-State([hashtable]$Set = @{}, [string[]]$Remove = @()) {
    $current = @{}
    $existing = Read-State
    if ($existing) { foreach ($property in $existing.PSObject.Properties) { $current[$property.Name] = $property.Value } }
    foreach ($key in $Set.Keys) { $current[$key] = $Set[$key] }
    foreach ($key in $Remove) { $current.Remove($key) }
    if ($current.Count -eq 0) {
        Remove-Item $StateFile -ErrorAction SilentlyContinue
        return
    }
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
    $current | ConvertTo-Json | Set-Content -Path $StateFile
}

function Get-OwnedProcess($State) {
    if (-not $State -or -not $State.pid) { return $null }
    $process = Get-Process -Id $State.pid -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    if ($State.pidStart -and $process.StartTime.ToFileTimeUtc() -ne [long]$State.pidStart) { return $null }
    return $process
}

function Assert-CopyPath {
    $full = [IO.Path]::GetFullPath($Copy).TrimEnd('\')
    $repoFull = [IO.Path]::GetFullPath($Repo).TrimEnd('\')
    $ignoreCase = [StringComparison]::OrdinalIgnoreCase
    if (-not $full.StartsWith('C:\work\', $ignoreCase)) { Fail "-Copy must be a folder under C:\work\ (got $full)" }
    if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\')) { Fail "-Copy must not be a drive root (got $full)" }
    if ($full.Equals($repoFull, $ignoreCase) -or $full.StartsWith("$repoFull\", $ignoreCase) -or $repoFull.StartsWith("$full\", $ignoreCase)) {
        Fail "-Copy must not be the repo, inside it, or a parent of it (got $full)"
    }
}

function Assert-CopyOwned {
    if ((Test-Path $Copy) -and -not (Test-Path (Join-Path $Copy '.kjn-manifest')) -and @(Get-ChildItem -Force $Copy).Count -gt 0) {
        Fail "$Copy is not empty and has no .kjn-manifest: it was not created by this skill, refusing to touch it"
    }
}

function Remove-Tree([string]$Path) {
    if (Test-Path $Path) {
        cmd.exe /c rmdir /s /q $Path | Out-Null
        if (Test-Path $Path) { Fail "could not delete $Path" }
    }
}

function Invoke-In([string]$Directory, [scriptblock]$Block) {
    Push-Location $Directory
    try {
        & $Block
        if ($LASTEXITCODE -ne 0) { Fail "command failed with exit code $LASTEXITCODE" }
    } finally { Pop-Location }
}

function Stop-Gradle {
    $gradlew = Join-Path $Copy 'android\gradlew.bat'
    if (Test-Path $gradlew) {
        Say 'stopping the Gradle daemon'
        Invoke-In (Join-Path $Copy 'android') { & .\gradlew.bat --stop }
    }
}

function Get-SourceFiles {
    Push-Location $Repo
    try { $raw = & git ls-files -z -co --exclude-standard } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Fail 'git ls-files failed' }
    $text = $raw -join "`n"
    $files = foreach ($entry in $text.Split([char]0)) {
        $path = $entry.Trim("`n", "`r")
        if (-not $path) { continue }
        $skip = $false
        foreach ($prefix in $ExcludedPrefixes) {
            if ($path.StartsWith($prefix)) { $skip = $true; break }
        }
        if (-not $skip -and (Test-Path -LiteralPath (Join-Path $Repo $path) -PathType Leaf)) { $path }
    }
    $files | Sort-Object -Unique
}

function Get-NativeHash([string[]]$Files) {
    $parts = foreach ($path in $Files) {
        if ($path -match $NativePattern) {
            $hash = (Get-FileHash -LiteralPath (Join-Path $Repo $path) -Algorithm SHA256).Hash
            "${path}:${hash}"
        }
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) } finally { $sha.Dispose() }
}

function Sync-Source([string[]]$Files, [string]$Target) {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    $manifest = Join-Path $Target '.kjn-manifest'
    $previous = @()
    if (Test-Path $manifest) { $previous = Get-Content -Encoding UTF8 $manifest }
    $copied = 0
    foreach ($path in $Files) {
        $source = Join-Path $Repo $path
        $dest = Join-Path $Target $path
        $same = $false
        if (Test-Path -LiteralPath $dest) {
            $a = Get-Item -LiteralPath $source
            $b = Get-Item -LiteralPath $dest
            $same = ($a.Length -eq $b.Length) -and ($a.LastWriteTimeUtc -eq $b.LastWriteTimeUtc)
        }
        if (-not $same) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
            [IO.File]::Copy($source, $dest, $true)
            $copied++
        }
    }
    $removed = 0
    $keep = [Collections.Generic.HashSet[string]]::new([string[]]$Files)
    foreach ($path in $previous) {
        if ($path -and -not $keep.Contains($path)) {
            $stale = Join-Path $Target $path
            if (Test-Path -LiteralPath $stale) { Remove-Item -LiteralPath $stale -Force; $removed++ }
        }
    }
    Set-Content -Encoding UTF8 -Path $manifest -Value $Files
    return @{ Copied = $copied; Removed = $removed }
}

function Ensure-HoistedNpmrc([string]$Target) {
    $npmrc = Join-Path $Target '.npmrc'
    $lines = @()
    if (Test-Path $npmrc) { $lines = Get-Content -Encoding UTF8 $npmrc }
    if ($lines -notcontains 'node-linker=hoisted') {
        Set-Content -Encoding UTF8 -Path $npmrc -Value ($lines + 'node-linker=hoisted')
    }
}

function Invoke-Prepare {
    $files = @(Get-SourceFiles)
    if ($files.Count -eq 0) { Fail 'git ls-files returned nothing' }
    $hash = Get-NativeHash $files
    $hashFile = Join-Path $Copy '.kjn-native-hash'
    $oldHash = $null
    if (Test-Path $hashFile) { $oldHash = (Get-Content -Raw $hashFile).Trim() }
    $needsInstall = $Force -or ($oldHash -ne $hash) -or -not (Test-Path (Join-Path $Copy 'node_modules'))

    Assert-CopyOwned
    if ($needsInstall) { Stop-Gradle }
    $result = Sync-Source $files $Copy
    Say "synced $($files.Count) files to $Copy ($($result.Copied) copied, $($result.Removed) removed)"
    Ensure-HoistedNpmrc $Copy

    if (-not $needsInstall) {
        Say 'lockfile and native config unchanged since the last prepare: reusing node_modules and the android project'
        return
    }
    foreach ($generated in @('android', 'ios')) {
        $dir = Join-Path $Copy $generated
        if (Test-Path $dir) { Say "removing stale $generated/ so prebuild runs again"; Remove-Tree $dir }
    }
    Say 'pnpm install --frozen-lockfile (hoisted)'
    $env:HUSKY = '0'
    $env:CI = 'true'
    try { Invoke-In $Copy { & pnpm install --frozen-lockfile } } finally {
        Remove-Item Env:\HUSKY -ErrorAction SilentlyContinue
        Remove-Item Env:\CI -ErrorAction SilentlyContinue
    }
    Set-Content -Path $hashFile -Value $hash -NoNewline
    Say "prepared $Copy (native hash $($hash.Substring(0, 12)))"
}

function Start-EmulatorIfNeeded {
    & (Get-AdbExe) start-server | Out-Null
    $state = Read-State
    $running = Get-AvdSerial
    if ($running) {
        $ours = [bool]($state -and $state.startedByUs -and $state.serial -eq $running)
        if (-not $ours -and -not $UseRunning) {
            Fail "emulator $running (AVD $Avd) is running but was not started by this skill: it belongs to another session. Ask the user, or pass -UseRunning to attach to it"
        }
        $script:Serial = $running
        Update-State @{ serial = $running; startedByUs = $ours }
        if ($ours) { Say "emulator $running (started by this skill) already running" } else { Say "attaching to emulator $running (AVD $Avd) that this skill did not start (-UseRunning)" }
    } else {
        $emulator = Get-EmulatorExe
        $avds = & $emulator -list-avds
        if ($avds -notcontains $Avd) { Fail "AVD '$Avd' does not exist (found: $($avds -join ', '))" }
        Say "starting AVD $Avd"
        Start-Process -FilePath $emulator -ArgumentList @('-avd', $Avd) | Out-Null
        $deadline = (Get-Date).AddMinutes(3)
        while (-not $script:Serial) {
            if ((Get-Date) -gt $deadline) { Fail 'the emulator did not show up in adb within 3 minutes' }
            Start-Sleep -Seconds 3
            $script:Serial = Get-AvdSerial
        }
        Update-State @{ serial = $script:Serial; startedByUs = $true }
    }
    $deadline = (Get-Date).AddMinutes(5)
    while ($true) {
        $booted = ''
        try { $booted = (Invoke-Adb @('shell', 'getprop', 'sys.boot_completed') 10 -AllowFailure).Trim() } catch { $booted = '' }
        if ($booted -eq '1') { break }
        if ((Get-Date) -gt $deadline) { Fail 'sys.boot_completed did not reach 1 within 5 minutes' }
        Start-Sleep -Seconds 3
    }
    Say "emulator $($script:Serial) booted"
}

function Get-MetroListener {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Remove-AnsiCodes([string]$Text) { [regex]::Replace($Text, '\x1B\[[0-9;?]*[A-Za-z]', '') }

function Read-LogTail([int]$Lines) {
    if (-not (Test-Path $RunLog)) { return '' }
    $content = Get-Content -Path $RunLog -Tail $Lines -ErrorAction SilentlyContinue
    return (Remove-AnsiCodes ($content -join "`n"))
}

function Open-DeepLink([string]$Url) {
    if ($Url -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') { Fail "deep link '$Url' is not a URL with a scheme" }
    $package = (Get-AppConfig).android.package
    Say "opening $Url"
    $out = Invoke-Adb @('shell', "am start -a android.intent.action.VIEW -d '$Url' $package") 30 -AllowFailure
    if ($out -match 'Error|Exception') { Fail "am start failed: $($out.Trim())" }
}

function Invoke-Run {
    if (-not (Test-Path (Join-Path $Copy 'node_modules'))) { Fail "$Copy is not prepared: run 'native.ps1 prepare' first" }
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
    Start-EmulatorIfNeeded
    Invoke-Adb @('reverse', "tcp:$Port", "tcp:$Port") | Out-Null
    Say "adb reverse tcp:$Port set"

    $state = Read-State
    $listener = Get-MetroListener
    $reuse = $false
    if ($listener) {
        if ($state -and $state.port -eq $Port -and (Get-OwnedProcess $state)) {
            Say "Metro from the previous run is still listening on ${Port}, reusing it"
            $reuse = $true
        } else {
            Fail "port $Port is held by PID $($listener.OwningProcess), not by this skill's run; free it or pass -Port"
        }
    }

    if (-not $reuse) {
        Remove-Item $RunLog -ErrorAction SilentlyContinue
        $commandLine = "/c pnpm exec expo run:android --device $Avd --port $Port > `"$RunLog`" 2>&1"
        Say "starting the dev build: pnpm exec expo run:android --device $Avd --port $Port (log: $RunLog)"
        $process = Start-Process -FilePath 'cmd.exe' -ArgumentList $commandLine -WorkingDirectory $Copy -WindowStyle Hidden -PassThru
        Update-State @{ pid = $process.Id; pidStart = $process.StartTime.ToFileTimeUtc(); port = $Port; log = $RunLog }
        $deadline = (Get-Date).AddMinutes($TimeoutMin)
        $ready = $false
        while (-not $ready) {
            Start-Sleep -Seconds 5
            $tail = Read-LogTail 60
            if ($tail -match 'BUILD FAILED|FAILURE: Build failed') { Fail "the Android build failed:`n$(Read-LogTail 40)" }
            if ($tail -match 'Logs for your project will appear below') { $ready = $true; break }
            if ($process.HasExited) { Fail "expo run:android exited (code $($process.ExitCode)) before Metro was ready:`n$(Read-LogTail 40)" }
            if ((Get-Date) -gt $deadline) { Fail "the dev build was not ready within $TimeoutMin minutes:`n$(Read-LogTail 40)" }
        }
        Say 'dev build installed and Metro is up'
        Invoke-Adb @('reverse', "tcp:$Port", "tcp:$Port") | Out-Null
    }

    $slug = (Get-AppConfig).slug
    $devClient = "exp+${slug}://expo-development-client/?url=" + [uri]::EscapeDataString("http://localhost:$Port")
    Open-DeepLink $devClient
    if ($DeepLink) {
        Start-Sleep -Seconds 5
        Open-DeepLink $DeepLink
    }
    Say 'run done'
}

function Get-DisplayIds {
    $text = ''
    try { $text = Invoke-Adb @('shell', 'dumpsys', 'SurfaceFlinger', '--display-id') 15 -AllowFailure } catch { $text = '' }
    $ids = [Collections.Generic.List[string]]::new()
    foreach ($line in $text -split "`r?`n") {
        if ($line -match '^Display (\d+)') {
            if ($line -match 'HWC display 0\b') { $ids.Insert(0, $Matches[1]) } else { $ids.Add($Matches[1]) }
        }
    }
    return $ids
}

function Test-Png([byte[]]$Bytes) {
    $Bytes.Length -gt 1024 -and $Bytes[0] -eq 0x89 -and $Bytes[1] -eq 0x50 -and $Bytes[2] -eq 0x4E -and $Bytes[3] -eq 0x47
}

function Get-Screencap([string[]]$Extra) {
    $result = Start-AdbProcess (@('exec-out', 'screencap', '-p') + $Extra) 30
    if ($result.TimedOut) { Fail 'screencap timed out after 30 s: the emulator does not answer, restart it' }
    return $result
}

function Invoke-Shot {
    if (-not $Name -or $Name -notmatch '^[A-Za-z0-9._-]+$') { Fail "usage: native.ps1 shot <name>  (letters, digits, dot, dash, underscore)" }
    $state = Read-State
    $recorded = if ($state) { $state.serial } else { $null }
    if (-not $recorded -or (Get-AvdName $recorded) -ne $Avd) { Fail "no emulator recorded by native.ps1 run (AVD $Avd): run native.ps1 run first" }
    $script:Serial = $recorded
    if (-not $OutDir) { $OutDir = Join-Path $StateDir 'shots' }
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    $attempts = @()
    foreach ($id in Get-DisplayIds) { $attempts += , @('-d', $id) }
    $attempts += , @()
    $shot = $null
    foreach ($extra in $attempts) {
        $result = Get-Screencap $extra
        if (Test-Png $result.Bytes) { $shot = $result; break }
        Say "screencap $($extra -join ' ') did not return a PNG ($($result.Error.Trim()))"
    }
    if (-not $shot) { Fail 'screencap returned no PNG on any display' }
    $path = Join-Path (Resolve-Path $OutDir).Path "$Name.png"
    [IO.File]::WriteAllBytes($path, $shot.Bytes)
    Say "screenshot saved: $path ($($shot.Bytes.Length) bytes)"
}

function Invoke-Teardown {
    Stop-Gradle
    $state = Read-State
    $owned = Get-OwnedProcess $state
    if ($owned) {
        Say "stopping the dev build process tree started by this skill (PID $($owned.Id))"
        taskkill /PID $owned.Id /T /F | Out-Null
    }
    Update-State -Remove @('pid', 'pidStart', 'port', 'log')
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-MetroListener) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
    $listener = Get-MetroListener
    if ($listener) { Fail "port $Port is held by PID $($listener.OwningProcess), which is not a Metro this skill started: left running, ask the user" }
    Say "Metro stopped, port $Port free"
    if ($StopEmulator) {
        $state = Read-State
        if ($state -and $state.startedByUs -and $state.serial) {
            if ((Get-AvdName $state.serial) -eq $Avd) {
                $script:Serial = $state.serial
                Say "stopping $($state.serial), started by this skill"
                Invoke-Adb @('emu', 'kill') 15 -AllowFailure | Out-Null
            } else {
                Say "emulator $($state.serial) is no longer running"
            }
            Update-State -Remove @('serial', 'startedByUs')
        } else {
            Say 'not stopping the emulator: this skill did not start it'
        }
    }
    if ($Delete) {
        if (Test-Path $Copy) {
            if (-not (Test-Path (Join-Path $Copy '.kjn-manifest'))) { Fail "$Copy has no .kjn-manifest: it was not created by this skill, refusing to delete it" }
            Say "deleting $Copy"
            Remove-Tree $Copy
        } else {
            Say "$Copy does not exist, nothing to delete"
        }
    }
    Say 'teardown done'
}

function ConvertFrom-EasBuildList([string]$Text) {
    $match = [regex]::Match($Text, '(?m)^\[\s*$')
    $start = if ($match.Success) { $match.Index } else { $Text.IndexOf('[') }
    $end = $Text.LastIndexOf(']')
    if ($start -lt 0 -or $end -le $start) { Fail "eas build:list printed no JSON array:`n$Text" }
    $Text.Substring($start, $end - $start + 1) | ConvertFrom-Json
}

function Select-LatestBuild($Builds, [string]$BuildProfile) {
    $Builds |
        Where-Object { $_.status -eq 'FINISHED' -and $_.buildProfile -eq $BuildProfile } |
        Sort-Object { [datetime]($(if ($_.completedAt) { $_.completedAt } else { $_.createdAt })) } -Descending |
        Select-Object -First 1
}

function Get-ApkBadging([string]$Path) {
    $aapt = Get-AaptExe
    if (-not $aapt) { return $null }
    $text = (& $aapt dump badging $Path 2>&1 | Out-String)
    if ($text -notmatch "package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'") {
        Fail "aapt could not read the package line of ${Path}:`n$text"
    }
    return @{ Package = $Matches[1]; VersionCode = $Matches[2]; VersionName = $Matches[3] }
}

function Invoke-Apk {
    Say "listing the latest EAS Android builds (profile $BuildProfile)"
    Push-Location $Repo
    try {
        $output = & npx --yes eas-cli build:list --platform android --limit $Limit --json --non-interactive
        if ($LASTEXITCODE -ne 0) { Fail "eas build:list failed with exit code $LASTEXITCODE`n$($output -join "`n")" }
    } finally { Pop-Location }
    $builds = @(ConvertFrom-EasBuildList ($output -join "`n"))
    $build = Select-LatestBuild $builds $BuildProfile
    if (-not $build) {
        $seen = ($builds | ForEach-Object { "$($_.id) $($_.buildProfile) $($_.status)" }) -join "`n"
        Fail "no finished build of profile '$BuildProfile' among the last $Limit; found:`n$seen (raise -Limit or build first)"
    }
    $url = $build.artifacts.buildUrl
    if (-not $url) { $url = $build.artifacts.applicationArchiveUrl }
    if (-not $url) { Fail "build $($build.id) has no downloadable artifact (expired or not an APK/AAB build)" }
    $extension = [IO.Path]::GetExtension(([uri]$url).AbsolutePath)
    if (-not $extension) { $extension = '.apk' }
    $downloads = Join-Path $HOME 'Downloads'
    New-Item -ItemType Directory -Force -Path $downloads | Out-Null
    $target = Join-Path $downloads "jew365-$($build.appVersion)-$($build.appBuildVersion)$extension"
    Say "latest build $($build.id): version $($build.appVersion), build number $($build.appBuildVersion), finished $($build.completedAt)"
    if ((Test-Path $target) -and (Get-Item $target).Length -gt 0) {
        Say "already downloaded: $target"
    } else {
        $part = "$target.part"
        Say "downloading to $target"
        $previousProgress = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try { Invoke-WebRequest -Uri $url -OutFile $part } finally { $ProgressPreference = $previousProgress }
        Move-Item -Force -LiteralPath $part -Destination $target
    }

    $expectedPackage = (Get-AppConfig).android.package
    $badging = $null
    if ($extension -eq '.apk') { $badging = Get-ApkBadging $target }
    if ($badging) {
        Say "aapt: package $($badging.Package), versionCode $($badging.VersionCode), versionName $($badging.VersionName)"
        if ($badging.Package -ne $expectedPackage) { Fail "package is $($badging.Package), expected $expectedPackage" }
        if ($build.appBuildVersion -and "$($build.appBuildVersion)" -ne $badging.VersionCode) {
            Fail "versionCode in the APK is $($badging.VersionCode), the build record says $($build.appBuildVersion)"
        }
    } else {
        Say "aapt unavailable or the artifact is not an APK: values below come from the EAS build record, not from the file"
        Say "build record: package $($build.appIdentifier), versionCode $($build.appBuildVersion), versionName $($build.appVersion)"
    }
    Say "apk ready: $target ($([math]::Round((Get-Item $target).Length / 1MB, 1)) MB)"
}

function Show-Help {
    @'
native.ps1 <command> [options]   (PowerShell 7: pwsh -NoProfile -File native.ps1 ...)

  prepare                 copy tracked + untracked files to the short path (-Copy, default C:\work\kjn),
                          pnpm install --frozen-lockfile with node-linker=hoisted; reuses the install and
                          android project when pnpm-lock.yaml and the native config are unchanged
  run [-DeepLink <url>] [-UseRunning]
                          start AVD test_phone (or use the one this skill started), expo run:android
                          --device test_phone --port 8083 in the copy, adb reverse, open the dev client,
                          then the deep link (jew365://...). An emulator of that AVD that this skill did
                          not start belongs to another session: it stops, unless -UseRunning is passed
  shot <name> [-OutDir d] adb exec-out screencap of the emulator recorded by run to <OutDir>\<name>.png
  teardown [-Delete] [-StopEmulator]
                          gradlew --stop, stop the Metro this skill started, optionally delete the copy
                          (only a folder this skill created) / close the emulator (only one this skill started)
  apk [-BuildProfile p]   download the latest finished EAS Android build of profile p (default
                          production-apk) to ~\Downloads\jew365-<version>-<buildNumber>.apk and verify it
  help                    this text

Options: -Copy <dir under C:\work\> -Avd <name> -Port <n> -Limit <n> -TimeoutMin <n> -UseRunning -Force
'@ | Write-Host
}

function Main {
    if ($Command -in @('prepare', 'run', 'teardown')) { Assert-CopyPath }
    switch ($Command) {
        'prepare' { Invoke-Prepare }
        'run' { Invoke-Run }
        'shot' { Invoke-Shot }
        'teardown' { Invoke-Teardown }
        'apk' { Invoke-Apk }
        'help' { Show-Help }
        default { Show-Help; Fail "unknown command '$Command'" }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try { Main } catch {
        Write-Host "[native] FAILED: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}
