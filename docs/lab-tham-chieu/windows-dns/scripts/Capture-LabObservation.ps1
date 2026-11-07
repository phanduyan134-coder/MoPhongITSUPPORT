#Requires -Version 5.1
<#
Run INSIDE the configured SRV-01 or CLIENT-01 guest in administrator PowerShell.
Phase is an operator label, never a claim that the expected state was observed.
This script does not start/stop services or repair configuration. On the client,
ipconfig /flushdns is recorded as preparation for a fresh HTTP observation.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('server', 'client')]
    [string]$Role,

    [Parameter(Mandatory)]
    [ValidateSet('healthy', 'dns-stopped', 'restored')]
    [string]$Phase,

    [ValidatePattern('^[A-Za-z0-9_-]{1,60}$')]
    [string]$RunLabel = 'D02-reference-01'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# No directory creation, file writes, or network commands occur before this
# guard. It checks the exact VirtualBox UUID, hostname, OS role and lab network.
. (Join-Path $PSScriptRoot 'Assert-LabGuest.ps1')
$labGuest = Assert-LabGuest -Role $Role
if (-not [Environment]::Is64BitProcess) { throw 'Run this capture in 64-bit Windows PowerShell inside the guest.' }

$labCaptureStarted = [datetime]::UtcNow
$labCaptureId = [guid]::NewGuid().ToString('D')
$labFolderName = '{0}-{1}-{2}-{3}' -f $labCaptureStarted.ToString('yyyyMMddTHHmmssfffZ'), $Role, $Phase, $labCaptureId.Substring(0, 8)
$labOutputRoot = 'C:\SupportLab\evidence'
$labRunFolder = Join-Path $labOutputRoot $RunLabel
$labCaptureFolder = Join-Path $labRunFolder $labFolderName
if (Test-Path -LiteralPath $labCaptureFolder) { throw 'Capture folder already exists; refusing to overwrite evidence.' }
New-Item -ItemType Directory -Path $labRunFolder -Force | Out-Null
New-Item -ItemType Directory -Path $labCaptureFolder | Out-Null
$labUtf8 = New-Object System.Text.UTF8Encoding($false)
$labCommands = New-Object 'System.Collections.Generic.List[object]'

function Invoke-LabCaptureCommand {
    param(
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][string]$DisplayCommand,
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [ValidateRange(1, 30)][int]$TimeoutSeconds = 20,
        [string]$Preparation = ''
    )

    # Arguments come only from the fixed command definitions below. No shell
    # command string or caller-provided command is evaluated here.
    $stdoutName = $Id + '.stdout.txt'
    $stderrName = $Id + '.stderr.txt'
    $stdoutPath = Join-Path $labCaptureFolder $stdoutName
    $stderrPath = Join-Path $labCaptureFolder $stderrName
    $stdoutStream = [System.IO.File]::Open($stdoutPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    $stderrStream = [System.IO.File]::Open($stderrPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = $FilePath
    $process.StartInfo.Arguments = $Arguments -join ' '
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $startedAt = [datetime]::UtcNow
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $timedOut = $false
    $exitCode = $null
    $launchError = $null
    $stdoutTask = $null
    $stderrTask = $null
    $started = $false

    try {
        $started = $process.Start()
        if (-not $started) { throw 'Process did not start.' }
        # Copy raw output bytes rather than reformatting native command output.
        # Reading both streams concurrently prevents pipe-buffer deadlocks.
        $stdoutTask = $process.StandardOutput.BaseStream.CopyToAsync($stdoutStream)
        $stderrTask = $process.StandardError.BaseStream.CopyToAsync($stderrStream)
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $timedOut = $true
            # Only the process created by this function is stopped on timeout.
            try { $process.Kill() } catch {
                if (-not $process.HasExited) { throw }
            }
            if (-not $process.WaitForExit(5000)) { throw 'Timed-out observation process did not exit.' }
        }
        $exitCode = $process.ExitCode
    } catch {
        $launchError = $_.Exception.Message
        if ($started -and -not $process.HasExited) {
            try { $process.Kill(); $null = $process.WaitForExit(5000) } catch { }
        }
    } finally {
        if ($null -ne $stdoutTask) { $stdoutTask.GetAwaiter().GetResult() }
        if ($null -ne $stderrTask) { $stderrTask.GetAwaiter().GetResult() }
        $stdoutStream.Dispose()
        $stderrStream.Dispose()
        $timer.Stop()
        $process.Dispose()
    }

    $labCommands.Add([pscustomobject]@{
        id = $Id
        command = $DisplayCommand
        startedAt = $startedAt.ToString('o')
        durationMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 3)
        timeoutSeconds = $TimeoutSeconds
        timedOut = $timedOut
        exitCode = $exitCode
        launchError = $launchError
        preparation = $Preparation
        stdoutFile = $stdoutName
        stderrFile = $stderrName
        stdoutSha256 = (Get-FileHash -LiteralPath $stdoutPath -Algorithm SHA256).Hash.ToLowerInvariant()
        stderrSha256 = (Get-FileHash -LiteralPath $stderrPath -Algorithm SHA256).Hash.ToLowerInvariant()
    })
}

function Invoke-LabCapturePowerShell {
    param([string]$Id, [string]$DisplayCommand, [string]$Command)
    $wrapped = '$ErrorActionPreference = ''Stop''; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); try { ' + $Command + '; exit 0 } catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }'
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($wrapped))
    Invoke-LabCaptureCommand -Id $Id -DisplayCommand $DisplayCommand -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Arguments @('-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', $encoded)
}

$labAdapterIndex = $labGuest.Adapter.ifIndex
$labOs = Get-CimInstance Win32_OperatingSystem
$labProduct = Get-CimInstance Win32_ComputerSystemProduct
$labSystem = Get-CimInstance Win32_ComputerSystem
$labBuildRegistry = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$labBuildRevision = if ($null -ne $labBuildRegistry.PSObject.Properties['UBR']) { $labBuildRegistry.UBR } else { $null }
$labDisplayVersion = if ($null -ne $labBuildRegistry.PSObject.Properties['DisplayVersion']) { $labBuildRegistry.DisplayVersion } else { $null }
$labNetwork = [pscustomobject]@{
    adapter = $labGuest.Adapter | Select-Object Name, InterfaceDescription, ifIndex, Status, MacAddress, LinkSpeed
    ipv4 = @(Get-NetIPAddress -InterfaceIndex $labAdapterIndex -AddressFamily IPv4 | Select-Object IPAddress, PrefixLength, PrefixOrigin, SuffixOrigin, AddressState)
    dns = @(Get-DnsClientServerAddress -InterfaceIndex $labAdapterIndex -AddressFamily IPv4 | Select-Object InterfaceAlias, ServerAddresses)
    ipv4DefaultRoutes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object DestinationPrefix, NextHop, InterfaceIndex, RouteMetric)
}
$labHostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$labPortalHostsOverrides = @(Get-Content -LiteralPath $labHostsPath | Where-Object { $_ -match '^\s*[^#\s].*\bportal\.lab\.test\b' })

Invoke-LabCaptureCommand -Id '01-ipconfig' -DisplayCommand 'ipconfig.exe /all' -FilePath (Join-Path $env:SystemRoot 'System32\ipconfig.exe') -Arguments @('/all')
if ($Role -eq 'server') {
    Invoke-LabCapturePowerShell -Id '02-dns-service' -DisplayCommand 'Get-Service DNS' -Command 'Get-Service -Name DNS | Select-Object Name, Status, StartType | Format-List | Out-String -Width 240'
    Invoke-LabCapturePowerShell -Id '03-dns-record' -DisplayCommand 'Get-DnsServerResourceRecord -ZoneName lab.test -Name portal -RRType A' -Command 'Get-DnsServerResourceRecord -ZoneName lab.test -Name portal -RRType A | Select-Object HostName, RecordType, TimeToLive, @{Name=''IPv4Address'';Expression={$_.RecordData.IPv4Address.IPAddressToString}} | Format-List | Out-String -Width 240'
    Invoke-LabCapturePowerShell -Id '04-iis-site' -DisplayCommand 'Get-Website; Get-WebBinding' -Command 'Import-Module WebAdministration; Get-Website | Select-Object Name, State, PhysicalPath | Format-Table -AutoSize | Out-String -Width 240; Get-WebBinding | Select-Object Protocol, BindingInformation | Format-Table -AutoSize | Out-String -Width 240'
} else {
    Invoke-LabCaptureCommand -Id '02-ping-server' -DisplayCommand 'ping.exe -n 2 -w 1000 192.168.10.10' -FilePath (Join-Path $env:SystemRoot 'System32\ping.exe') -Arguments @('-n', '2', '-w', '1000', '192.168.10.10') -TimeoutSeconds 10
    Invoke-LabCaptureCommand -Id '03-dns-default' -DisplayCommand 'nslookup.exe -type=A -timeout=2 -retry=1 portal.lab.test' -FilePath (Join-Path $env:SystemRoot 'System32\nslookup.exe') -Arguments @('-type=A', '-timeout=2', '-retry=1', 'portal.lab.test') -TimeoutSeconds 15
    Invoke-LabCaptureCommand -Id '04-dns-explicit' -DisplayCommand 'nslookup.exe -type=A -timeout=2 -retry=1 portal.lab.test 192.168.10.10' -FilePath (Join-Path $env:SystemRoot 'System32\nslookup.exe') -Arguments @('-type=A', '-timeout=2', '-retry=1', 'portal.lab.test', '192.168.10.10') -TimeoutSeconds 15
    Invoke-LabCaptureCommand -Id '05-flush-client-cache' -DisplayCommand 'ipconfig.exe /flushdns' -FilePath (Join-Path $env:SystemRoot 'System32\ipconfig.exe') -Arguments @('/flushdns') -Preparation 'Clear the client resolver cache before HTTP. This is probe preparation, not a repair of DNS Server.'
    Invoke-LabCaptureCommand -Id '06-http-by-name' -DisplayCommand 'curl.exe --noproxy "*" --include --connect-timeout 5 --max-time 15 http://portal.lab.test' -FilePath (Join-Path $env:SystemRoot 'System32\curl.exe') -Arguments @('--noproxy', '*', '--include', '--connect-timeout', '5', '--max-time', '15', 'http://portal.lab.test') -TimeoutSeconds 20
    Invoke-LabCaptureCommand -Id '07-http-by-ip' -DisplayCommand 'curl.exe --noproxy "*" --include --connect-timeout 5 --max-time 15 http://192.168.10.10' -FilePath (Join-Path $env:SystemRoot 'System32\curl.exe') -Arguments @('--noproxy', '*', '--include', '--connect-timeout', '5', '--max-time', '15', 'http://192.168.10.10') -TimeoutSeconds 20
}

$labSourceHashes = [ordered]@{}
foreach ($labSourceName in @('Capture-LabObservation.ps1', 'Assert-LabGuest.ps1')) {
    $labSourceHashes[$labSourceName] = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $labSourceName) -Algorithm SHA256).Hash.ToLowerInvariant()
}
$labRecord = [ordered]@{
    schemaVersion = 1
    kind = 'windows-reference-observation'
    protocolVersion = 'windows-dns-d02-capture-v2'
    captureId = $labCaptureId
    runLabel = $RunLabel
    role = $Role
    phaseLabel = $Phase
    phaseLabelIsVerifiedState = $false
    startedAt = $labCaptureStarted.ToString('o')
    finishedAt = [datetime]::UtcNow.ToString('o')
    machine = [ordered]@{
        name = $labSystem.Name
        manufacturer = $labSystem.Manufacturer
        model = $labSystem.Model
        computerUuid = $labProduct.UUID
        osCaption = $labOs.Caption
        osVersion = $labOs.Version
        osBuildNumber = $labOs.BuildNumber
        osBuildRevision = $labBuildRevision
        osDisplayVersion = $labDisplayVersion
        osArchitecture = $labOs.OSArchitecture
        powerShellVersion = $PSVersionTable.PSVersion.ToString()
        hypervisorHostVersion = 'record-separately-on-host'
    }
    network = $labNetwork
    portalHostsOverrides = $labPortalHostsOverrides
    sourceHashes = $labSourceHashes
    commands = @($labCommands.ToArray())
    assessment = 'not-reviewed'
    limitations = @(
        'Operator phase labels do not prove the actual phase; review raw outputs from both guests.',
        'No automated claim of Windows/simulator equivalence, AI quality, or user-learning effectiveness.',
        'Native stdout/stderr files preserve captured bytes; use the appropriate Windows encoding when opening.',
        'Record hypervisor settings, actual screenshots and the simulator version separately.',
        'Client cache flush is recorded probe preparation; no DNS service state is changed by this script.'
    )
}
$labJsonPath = Join-Path $labCaptureFolder 'observation.json'
if (Test-Path -LiteralPath $labJsonPath) { throw 'Observation JSON already exists; refusing to overwrite.' }
[System.IO.File]::WriteAllText($labJsonPath, ($labRecord | ConvertTo-Json -Depth 12), $labUtf8)
Write-Output ('Observation saved: ' + $labCaptureFolder)
Write-Output 'Review the raw outputs from both guests before filling the comparison sheet. No pass/fail conclusion was inferred.'
