# Host orchestrator for an ALREADY INSTALLED and initialized isolated DNS lab.
# Never initializes networking, boots VMs, or changes host IP/DNS. Not yet run.
# Requires Guest Additions and the four reviewed scripts in C:\SupportLab\scripts.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_-]{1,60}$')]
    [string]$RunLabel = ('D02-reference-' + [datetime]::UtcNow.ToString('yyyyMMddTHHmmssZ')),
    [switch]$SkipScreenshots
)
Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
$labProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path
$labRoot = Join-Path $labProjectRoot 'output\labs\windows-dns'
$labRunFolder = Join-Path (Join-Path $labProjectRoot 'output\evidence\windows-dns') $RunLabel
$labVBox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$labGuestScripts = 'C:\SupportLab\scripts'
$labGuestEvidence = 'C:\SupportLab\evidence\' + $RunLabel
$labGuestPowerShell = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$labProfiles = @{
    server = @{Name='SupportLab-SRV-01';Uuid='4e8381f2-bfdc-4c70-928b-d526e5df3c6e';DiskUuid='d304c8f7-7723-4b0a-9a47-0d5ba83fdcc1'}
    client = @{Name='SupportLab-CLIENT-01';Uuid='92b2f409-bff1-475d-a864-9d0daa2b996a';DiskUuid='7baa67e8-67cd-441c-acc4-15c3829d41d8'}
}
foreach ($labRole in @('server','client')) {
    $labProfiles[$labRole].PasswordFile = Join-Path (Join-Path (Join-Path $labRoot 'private') $labRole) 'guest-password.txt'
}
$labSourceHashes = [ordered]@{}
foreach ($labSourceName in @('Assert-LabGuest.ps1','Initialize-LabServer.ps1','Initialize-LabClient.ps1','Capture-LabObservation.ps1')) {
    $labSourcePath = Join-Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts') $labSourceName
    $labSourceHashes[$labSourceName] = (Get-FileHash -LiteralPath $labSourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$labCommands = New-Object 'System.Collections.Generic.List[object]'
$labCaptures = New-Object 'System.Collections.Generic.List[object]'
$labScreenshots = New-Object 'System.Collections.Generic.List[object]'
$labErrors = New-Object 'System.Collections.Generic.List[string]'
$labCounter = 0
$labRestoreRequired = $false
$labDnsRestored = $false
$labRunCreated = $false
$labOwnsMutex = $false
$labMutex = New-Object Threading.Mutex($false,'Local\SupportLab-DNS-Reference-Experiment')
$labStartedAt = [datetime]::UtcNow

function ConvertTo-LabNativeArgument {
    param([AllowEmptyString()][string]$Value)
    # Windows CommandLineToArgvW quoting; no shell evaluates these arguments.
    if ($Value -notmatch '[\s"]' -and $Value.Length -gt 0) { return $Value }
    $labQuoted = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $labQuoted = [regex]::Replace($labQuoted, '(\\+)$', '$1$1')
    return '"' + $labQuoted + '"'
}

function Assert-LabPhysicalFile {
    param([Parameter(Mandatory)][string]$Path,[Parameter(Mandatory)][string]$Root)
    $labPhysicalRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $labPhysicalPath = [IO.Path]::GetFullPath($Path)
    if (-not $labPhysicalPath.StartsWith($labPhysicalRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Lab file is outside its dedicated VM directory.' }
    $labResolved = Resolve-Path -LiteralPath $labPhysicalPath
    if ($labResolved.Provider.Name -ne 'FileSystem') { throw 'Only local filesystem lab files are allowed.' }
    $labFileItem = Get-Item -LiteralPath $labResolved.ProviderPath -Force
    if ($labFileItem -is [IO.DirectoryInfo]) { throw 'Expected a lab file, not a directory.' }
    # Reject junctions/symlinks anywhere in the path, including VM/workspace
    # parents. Lexical containment alone would allow a VDI redirected elsewhere.
    $labPathItem = $labFileItem
    while ($null -ne $labPathItem) {
        if (($labPathItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse points are forbidden in the lab file path.' }
        if ($labPathItem -is [IO.DirectoryInfo]) { $labPathItem = $labPathItem.Parent }
        else { $labPathItem = $labPathItem.Directory }
    }
    return [IO.Path]::GetFullPath($labResolved.ProviderPath)
}

function Get-LabVerifiedDiskAncestry {
    param(
        [ValidateSet('server','client')][string]$Role,
        [Parameter(Mandatory)][string]$CurrentUuid,
        [Parameter(Mandatory)][string]$CurrentPath
    )
    $labProfile = $labProfiles[$Role]
    $labVmRoot = Join-Path (Join-Path $labRoot 'vms') $labProfile.Name
    $labExpectedBasePath = [IO.Path]::GetFullPath((Join-Path $labVmRoot ($labProfile.Name+'.vdi')))
    $labExpectedCapacity = if ($Role -eq 'server') { '61440 MBytes' } else { '65536 MBytes' }
    $labUuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if ($CurrentUuid -notmatch $labUuidPattern) { throw 'The attached disk UUID is missing or invalid.' }
    $labAttachedPath = Assert-LabPhysicalFile -Path $CurrentPath -Root $labVmRoot
    $labSeen = @{}
    $labAncestry = New-Object 'System.Collections.Generic.List[object]'
    $labNextUuid = $CurrentUuid
    for ($labDepth = 0; $labDepth -lt 16; $labDepth++) {
        if ($labNextUuid -notmatch $labUuidPattern -or $labSeen.ContainsKey($labNextUuid)) { throw 'Invalid or cyclic lab VDI ancestry.' }
        $labSeen[$labNextUuid] = $true
        $labPreviousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $labMediumLines = @(& $labVBox showmediuminfo disk $labNextUuid 2>&1)
            $labMediumExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $labPreviousPreference }
        if ($labMediumExit -ne 0) { throw 'Cannot inspect an ancestor of the attached lab VDI.' }
        $labMedium = @{}
        foreach ($labMediumLine in $labMediumLines) {
            if ([string]$labMediumLine -match '^([^:]+):\s*(.*)$') { $labMedium[$Matches[1].Trim()] = $Matches[2].Trim() }
        }
        if ($labMedium['UUID'] -ne $labNextUuid -or $labMedium['Storage format'] -ne 'VDI' -or $labMedium['Capacity'] -ne $labExpectedCapacity -or $labMedium['Encryption'] -ne 'disabled') { throw 'VDI ancestor identity, format, capacity, or encryption differs from the dedicated lab profile.' }
        $labMediumPath = Assert-LabPhysicalFile -Path ([string]$labMedium['Location']) -Root $labVmRoot
        if ([IO.Path]::GetExtension($labMediumPath) -ne '.vdi') { throw 'Only .vdi files are permitted in the lab disk ancestry.' }
        if ($labDepth -eq 0 -and $labMediumPath -ne $labAttachedPath) { throw 'Attached VDI path differs from the inspected current medium.' }
        $labIsBase = $labNextUuid -eq $labProfile.DiskUuid
        if ($labIsBase) {
            if ($labMedium['Parent UUID'] -ne 'base' -or $labMediumPath -ne $labExpectedBasePath -or $labMedium['Type'] -ne 'normal (base)' -or $labMedium['Format variant'] -ne 'dynamic default') { throw 'The original dedicated dynamic base VDI identity/path is not intact.' }
        } elseif ($labMedium['Parent UUID'] -notmatch $labUuidPattern -or $labMedium['Type'] -ne 'normal (differencing)' -or $labMedium['Format variant'] -ne 'differencing default') { throw 'A non-base ancestor is not a normal differencing VDI.' }
        $labAncestry.Add([pscustomobject]@{depth=$labDepth;uuid=$labNextUuid;parentUuid=$labMedium['Parent UUID'];path=$labMediumPath;format=$labMedium['Storage format'];variant=$labMedium['Format variant'];originalBase=$labIsBase})
        if ($labIsBase) { return $labAncestry.ToArray() }
        $labNextUuid = $labMedium['Parent UUID']
    }
    throw 'VDI ancestry exceeds 16 media or does not reach the original dedicated base VDI.'
}

function Assert-LabHostIsolation {
    param([ValidateSet('server','client')][string]$Role)
    $labProfile = $labProfiles[$Role]
    $labPreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $labLines = @(& $labVBox showvminfo $labProfile.Uuid --machinereadable 2>&1)
        $labExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $labPreviousPreference }
    if ($labExit -ne 0) { throw ('Cannot inspect ' + $labProfile.Name) }
    $labInfo = @{}
    foreach ($labLine in $labLines) {
        if ([string]$labLine -match '^"?([^"=]+)"?="(.*)"$') { $labInfo[$Matches[1]] = $Matches[2].Replace('\\','\') }
        elseif ([string]$labLine -match '^([^=]+)=(.*)$') { $labInfo[$Matches[1]] = $Matches[2] }
    }
    if ($labInfo['name'] -ne $labProfile.Name -or $labInfo['UUID'] -ne $labProfile.Uuid -or $labInfo['hardwareuuid'] -ne $labProfile.Uuid) { throw 'The dedicated VM identity changed.' }
    if ($labInfo['VMState'] -ne 'running') { throw ($labProfile.Name + ' must already be running; this script never starts it.') }
    if ($labInfo['nic1'] -ne 'intnet' -or $labInfo['intnet1'] -ne 'SupportLab-DNS') { throw 'The dedicated Internal Network is not configured.' }
    foreach ($labNic in 2..8) { if ($labInfo['nic'+$labNic] -ne 'none') { throw 'An unexpected additional VM network adapter exists.' } }
    $labVmRoot = Join-Path (Join-Path $labRoot 'vms') $labProfile.Name
    $labVmCfg = Assert-LabPhysicalFile -Path ([string]$labInfo['CfgFile']) -Root $labVmRoot
    if ($labVmCfg -ne [IO.Path]::GetFullPath((Join-Path $labVmRoot ($labProfile.Name+'.vbox')))) { throw 'Dedicated VM configuration path changed.' }
    [xml]$labVmXml = Get-Content -LiteralPath $labVmCfg -Raw
    $labCurrentMachine = $labVmXml.SelectSingleNode('/*[local-name()="VirtualBox"]/*[local-name()="Machine"]')
    if ($null -eq $labCurrentMachine) { throw 'Cannot locate the current VM hardware configuration.' }
    # Inspect current Hardware only; disks recorded under historical Snapshot
    # nodes are not additional currently attached disks.
    $labAttachedDevices = @($labCurrentMachine.SelectNodes('./*[local-name()="Hardware"]/*[local-name()="StorageControllers"]/*[local-name()="StorageController"]/*[local-name()="AttachedDevice"] | ./*[local-name()="StorageControllers"]/*[local-name()="StorageController"]/*[local-name()="AttachedDevice"]'))
    $labHardDisks = @($labAttachedDevices | Where-Object { $_.GetAttribute('type') -eq 'HardDisk' })
    if ($labHardDisks.Count -ne 1 -or $labHardDisks[0].ParentNode.GetAttribute('name') -ne 'SATA' -or $labHardDisks[0].GetAttribute('port') -ne '0' -or $labHardDisks[0].GetAttribute('device') -ne '0') { throw 'Exactly one dedicated SATA disk at port 0/device 0 is required.' }
    foreach ($labDevice in $labAttachedDevices) {
        if ($labDevice.GetAttribute('type') -eq 'HardDisk') { continue }
        if ($labDevice.GetAttribute('type') -ne 'DVD' -or $labDevice.ParentNode.GetAttribute('name') -ne 'SATA' -or $labDevice.GetAttribute('port') -ne '1' -or $labDevice.GetAttribute('device') -ne '0' -or $labDevice.GetAttribute('passthrough') -eq 'true') { throw 'Unexpected extra attached storage device or host DVD passthrough.' }
    }
    if (@($labInfo.Keys | Where-Object { $_ -match '-ImageUUID-\d+-\d+$' -and $_ -notin @('SATA-ImageUUID-0-0','SATA-ImageUUID-1-0') }).Count -gt 0) { throw 'Unexpected extra attached media in the live VM configuration.' }
    $labCurrentDiskUuid = [string]$labInfo['SATA-ImageUUID-0-0']
    $labCurrentImage = $labHardDisks[0].SelectSingleNode('./*[local-name()="Image"]')
    if ($null -eq $labCurrentImage -or $labCurrentImage.GetAttribute('uuid').Trim('{}') -ne $labCurrentDiskUuid) { throw 'Current XML and live VM disk identities differ.' }
    $labDiskAncestry = @(Get-LabVerifiedDiskAncestry -Role $Role -CurrentUuid $labCurrentDiskUuid -CurrentPath ([string]$labInfo['SATA-0-0']))
    if ($labInfo['clipboard'] -ne 'disabled' -or $labInfo['draganddrop'] -ne 'disabled') { throw 'Clipboard and drag-and-drop must remain disabled.' }
    if (@($labInfo.Keys | Where-Object { $_ -match '(?i)SharedFolder' }).Count -gt 0) { throw 'Host shared folders are forbidden for this lab.' }
    [IO.File]::WriteAllLines((Join-Path $labRunFolder ($Role + '-vminfo.txt')),[string[]]@($labLines | ForEach-Object { [string]$_ }),(New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $labRunFolder ($Role+'-disk-ancestry.json')),($labDiskAncestry | ConvertTo-Json -Depth 4),(New-Object Text.UTF8Encoding($false)))
}

function Invoke-LabNative {
    param(
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][string[]]$Arguments,
        [ValidateRange(10,300)][int]$TimeoutSeconds = 210,
        [string]$GuestCommand = ''
    )
    $script:labCounter++
    $labId = '{0:D2}-{1}' -f $script:labCounter,$Label
    $labStdoutPath = Join-Path $labRunFolder ($labId+'.stdout.txt')
    $labStderrPath = Join-Path $labRunFolder ($labId+'.stderr.txt')
    if ($GuestCommand) { [IO.File]::WriteAllText((Join-Path $labRunFolder ($labId+'.guest-command.ps1')),$GuestCommand,(New-Object Text.UTF8Encoding($false))) }
    $labStdoutStream = [IO.File]::Open($labStdoutPath,'CreateNew','Write','Read')
    $labStderrStream = [IO.File]::Open($labStderrPath,'CreateNew','Write','Read')
    $labProcess = New-Object Diagnostics.Process
    $labProcess.StartInfo.FileName = $labVBox
    $labProcess.StartInfo.Arguments = (@($Arguments | ForEach-Object { ConvertTo-LabNativeArgument $_ }) -join ' ')
    $labProcess.StartInfo.UseShellExecute = $false
    $labProcess.StartInfo.CreateNoWindow = $true
    $labProcess.StartInfo.RedirectStandardOutput = $true
    $labProcess.StartInfo.RedirectStandardError = $true
    $labStdoutTask = $null
    $labStderrTask = $null
    $labStarted = $false
    $labTimedOut = $false
    $labExitCode = $null
    $labError = $null
    $labCommandStartedAt = [datetime]::UtcNow
    try {
        $labStarted = $labProcess.Start()
        if (-not $labStarted) { throw 'Could not start VBoxManage.' }
        $labStdoutTask = $labProcess.StandardOutput.BaseStream.CopyToAsync($labStdoutStream)
        $labStderrTask = $labProcess.StandardError.BaseStream.CopyToAsync($labStderrStream)
        if (-not $labProcess.WaitForExit($TimeoutSeconds*1000)) {
            $labTimedOut = $true
            $labProcess.Kill()
            if (-not $labProcess.WaitForExit(5000)) { throw 'VBoxManage did not exit after timeout.' }
        }
        $labExitCode = $labProcess.ExitCode
    } catch { $labError = $_.Exception.Message }
    finally {
        if ($labStarted -and -not $labProcess.HasExited) { try { $labProcess.Kill(); [void]$labProcess.WaitForExit(5000) } catch { } }
        try {
            if ($null -ne $labStdoutTask) { [void]$labStdoutTask.GetAwaiter().GetResult() }
            if ($null -ne $labStderrTask) { [void]$labStderrTask.GetAwaiter().GetResult() }
        } finally { $labStdoutStream.Dispose(); $labStderrStream.Dispose(); $labProcess.Dispose() }
    }
    $labMetadata = [pscustomobject]@{
        id=$labId;startedAt=$labCommandStartedAt.ToString('o');finishedAt=[datetime]::UtcNow.ToString('o')
        exitCode=$labExitCode;timedOut=$labTimedOut;launchError=$labError
        stdoutFile=[IO.Path]::GetFileName($labStdoutPath);stderrFile=[IO.Path]::GetFileName($labStderrPath)
        stdoutSha256=(Get-FileHash -LiteralPath $labStdoutPath -Algorithm SHA256).Hash.ToLowerInvariant()
        stderrSha256=(Get-FileHash -LiteralPath $labStderrPath -Algorithm SHA256).Hash.ToLowerInvariant()
        # Arguments contain only a password FILE path, never password contents.
        arguments=@($Arguments)
    }
    $labCommands.Add($labMetadata)
    if ($labError -or $labTimedOut -or $labExitCode -ne 0) { throw ('Command '+$labId+' failed; retain its raw logs. Exit='+$labExitCode+'; timeout='+$labTimedOut) }
    return [IO.File]::ReadAllText($labStdoutPath,[Text.Encoding]::UTF8)
}

function Get-LabGuestPreamble {
    param([ValidateSet('server','client')][string]$Role)
    $labHashLiteral = '@{' + ((@($labSourceHashes.Keys | ForEach-Object { "'"+$_+"'='"+$labSourceHashes[$_]+"'" })) -join ';') + '}'
    return @'
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$expectedHashes=__HASHES__
foreach($name in $expectedHashes.Keys){
    $path=Join-Path 'C:\SupportLab\scripts' $name
    if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHashes[$name]){throw 'Guest script differs from reviewed source; refusing experiment.'}
}
. 'C:\SupportLab\scripts\Assert-LabGuest.ps1'
$null=Assert-LabGuest -Role __ROLE__
'@.Replace('__HASHES__',$labHashLiteral).Replace('__ROLE__',$Role)
}

function Invoke-LabGuest {
    param([ValidateSet('server','client')][string]$Role,[string]$Label,[string]$Body)
    Assert-LabHostIsolation -Role $Role
    $labProfile = $labProfiles[$Role]
    $labCommand = (Get-LabGuestPreamble -Role $Role) + "`r`n" + $Body
    $labWrapped = "try {`r`n" + $labCommand + "`r`nexit 0`r`n} catch { [Console]::Error.WriteLine(`$_.ToString()); exit 1 }"
    $labEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($labWrapped))
    $labArguments = @('guestcontrol',$labProfile.Uuid,'run','--username=Administrator',('--passwordfile='+$labProfile.PasswordFile),('--exe='+$labGuestPowerShell),'--quiet','--wait-stdout','--wait-stderr','--timeout=180000','--','-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-OutputFormat','Text','-EncodedCommand',$labEncoded)
    return Invoke-LabNative -Label ($Role+'-'+$Label) -Arguments $labArguments -GuestCommand $labCommand
}

function Save-LabScreenshot {
    param([ValidateSet('server','client')][string]$Role,[string]$Phase)
    if ($SkipScreenshots) { return }
    $labScreenshotName = $Phase+'-'+$Role+'-console.png'
    try {
        Assert-LabHostIsolation -Role $Role
        [void](Invoke-LabNative -Label ($Role+'-'+$Phase+'-screenshot') -Arguments @('controlvm',$labProfiles[$Role].Uuid,'screenshotpng',(Join-Path $labRunFolder $labScreenshotName)) -TimeoutSeconds 30)
        $labScreenshots.Add([pscustomobject]@{role=$Role;phaseLabel=$Phase;file=$labScreenshotName;sha256=(Get-FileHash -LiteralPath (Join-Path $labRunFolder $labScreenshotName) -Algorithm SHA256).Hash.ToLowerInvariant();actualVmConsole=$true;provesDisplayedCommandResults=$false;note='Real VM console image; guestcontrol output is not necessarily visible in its desktop session.'})
    } catch { $labErrors.Add('Optional screenshot: '+$_.Exception.Message) }
}

function Capture-LabPhase {
    param([ValidateSet('server','client')][string]$Role,[ValidateSet('healthy','dns-stopped','restored')][string]$Phase)
    $labBody = @'
$runLabel='__RUN__'
$phase='__PHASE__'
$runRoot=Join-Path 'C:\SupportLab\evidence' $runLabel
$before=@(if(Test-Path -LiteralPath $runRoot){Get-ChildItem -LiteralPath $runRoot -Directory | ForEach-Object {$_.FullName}})
& 'C:\SupportLab\scripts\Capture-LabObservation.ps1' -Role __ROLE__ -Phase $phase -RunLabel $runLabel
$new=@(Get-ChildItem -LiteralPath $runRoot -Directory | Where-Object {$_.FullName -notin $before})
if($new.Count -ne 1){throw 'Expected exactly one fresh capture folder.'}
$record=Get-Content -LiteralPath (Join-Path $new[0].FullName 'observation.json') -Raw | ConvertFrom-Json
if($record.role -ne '__ROLE__' -or $record.phaseLabel -ne $phase -or $record.runLabel -ne $runLabel){throw 'Capture identity mismatch.'}
[Console]::WriteLine('SUPPORTLAB_CAPTURE_JSON='+([ordered]@{path=$new[0].FullName;captureId=$record.captureId} | ConvertTo-Json -Compress))
'@.Replace('__RUN__',$RunLabel).Replace('__PHASE__',$Phase).Replace('__ROLE__',$Role)
    $labOutput = Invoke-LabGuest -Role $Role -Label ('capture-'+$Phase) -Body $labBody
    $labResultLines = @($labOutput -split '\r?\n' | Where-Object { $_.StartsWith('SUPPORTLAB_CAPTURE_JSON=') })
    if ($labResultLines.Count -ne 1) { throw 'The guest did not identify its capture folder uniquely; retain logs.' }
    $labResult = $labResultLines[0].Substring('SUPPORTLAB_CAPTURE_JSON='.Length) | ConvertFrom-Json
    $labGuestPath = [string]$labResult.path
    if ([IO.Path]::GetDirectoryName($labGuestPath) -ne $labGuestEvidence -or [IO.Path]::GetFileName($labGuestPath) -notmatch ('^\d{8}T\d{9}Z-'+$Role+'-'+$Phase+'-[0-9a-f]{8}$')) { throw 'Unexpected guest capture path; refusing copy.' }
    $labCapture = [pscustomobject]@{role=$Role;phaseLabel=$Phase;captureId=[string]$labResult.captureId;guestPath=$labGuestPath;copied=$false;hostObservation=$null;assessment='not-reviewed'}
    $labCaptures.Add($labCapture)
    $labDestinationRoot = Join-Path $labRunFolder $Role
    if (-not (Test-Path -LiteralPath $labDestinationRoot)) { [void](New-Item -ItemType Directory -Path $labDestinationRoot) }
    # A fresh explicit destination avoids VBox interpreting an existing folder
    # as a file target. This form was exercised on the server setup export.
    $labDestination = Join-Path $labDestinationRoot $Phase
    if (Test-Path -LiteralPath $labDestination) { throw 'Capture destination already exists; refusing replacement.' }
    Assert-LabHostIsolation -Role $Role
    $labProfile = $labProfiles[$Role]
    [void](Invoke-LabNative -Label ($Role+'-copy-'+$Phase) -Arguments @('guestcontrol',$labProfile.Uuid,'copyfrom','--username=Administrator',('--passwordfile='+$labProfile.PasswordFile),'--quiet','--no-replace','--recursive',$labGuestPath,$labDestination) -TimeoutSeconds 180)
    $labObservations = @(Get-ChildItem -LiteralPath $labDestination -File -Filter observation.json -Recurse | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json).captureId -eq $labResult.captureId })
    if ($labObservations.Count -ne 1) { throw 'Copied observation could not be located uniquely.' }
    $labObservation = Get-Content -LiteralPath $labObservations[0].FullName -Raw | ConvertFrom-Json
    foreach ($labProbe in $labObservation.commands) {
        foreach ($labStream in @('stdout','stderr')) {
            $labProbeFile = Join-Path $labObservations[0].DirectoryName ([string]$labProbe.($labStream+'File'))
            if ((Get-FileHash -LiteralPath $labProbeFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $labProbe.($labStream+'Sha256')) { throw 'Copied raw probe hash differs from guest observation.' }
        }
    }
    $labCapture.copied = $true
    $labCapture.hostObservation = $labObservations[0].FullName.Substring($labRunFolder.Length+1)
    Save-LabScreenshot -Role $Role -Phase $Phase
}

try {
    try { $labOwnsMutex=$labMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $labOwnsMutex=$true }
    if (-not $labOwnsMutex) { throw 'Another DNS reference experiment already owns this lab.' }
    if (Test-Path -LiteralPath $labRunFolder) { throw 'Host evidence run folder already exists; choose a fresh RunLabel.' }
    if (-not (Test-Path -LiteralPath $labVBox -PathType Leaf)) { throw 'VirtualBox is unavailable.' }
    foreach ($labRole in @('server','client')) {
        if (-not (Test-Path -LiteralPath $labProfiles[$labRole].PasswordFile -PathType Leaf)) { throw ('Missing private guest password file for '+$labRole) }
    }
    [void](New-Item -ItemType Directory -Path $labRunFolder)
    $labRunCreated = $true
    foreach ($labRole in @('server','client')) {
        $labPreflightBody = "if(Test-Path -LiteralPath '"+$labGuestEvidence+"'){throw 'Guest evidence run folder already exists; select a fresh RunLabel.'}; Get-Service VBoxService | Format-List Name,Status; if((Get-Service VBoxService).Status -ne 'Running'){throw 'Guest Additions service is not running.'}; [Console]::WriteLine('Guest identity, source hashes and initialized network accepted.')"
        [void](Invoke-LabGuest -Role $labRole -Label 'preflight' -Body $labPreflightBody)
    }
    [void](Invoke-LabGuest -Role server -Label 'baseline-dns-state' -Body "Get-Service DNS | Format-List Name,Status; if((Get-Service DNS).Status -ne 'Running'){throw 'DNS must already be running before the experiment.'}")
    Capture-LabPhase -Role server -Phase healthy
    Capture-LabPhase -Role client -Phase healthy
    # Set BEFORE issuing Stop-Service: even a lost command acknowledgement must
    # cause a guarded restore attempt in finally. No initializer is ever called.
    $labRestoreRequired = $true
    [void](Invoke-LabGuest -Role server -Label 'stop-dns' -Body "Get-Service DNS | Format-List Name,Status; Stop-Service -Name DNS -ErrorAction Stop; (Get-Service DNS).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(15)); Get-Service DNS | Format-List Name,Status; if((Get-Service DNS).Status -ne 'Stopped'){throw 'DNS did not stop.'}")
    Capture-LabPhase -Role server -Phase dns-stopped
    Capture-LabPhase -Role client -Phase dns-stopped
} catch {
    $labErrors.Add($_.Exception.Message)
} finally {
    if ($labRestoreRequired) {
        # Always attempt restoration after an issued stop, including capture,
        # transport or copy failures. Physical power loss cannot be guaranteed.
        try {
            [void](Invoke-LabGuest -Role server -Label 'restore-dns' -Body "Get-Service DNS | Format-List Name,Status; Start-Service -Name DNS -ErrorAction Stop; (Get-Service DNS).WaitForStatus('Running',[TimeSpan]::FromSeconds(15)); Get-Service DNS | Format-List Name,Status; if((Get-Service DNS).Status -ne 'Running'){throw 'DNS did not restart.'}")
            $labDnsRestored = $true
            foreach ($labRole in @('server','client')) {
                try { Capture-LabPhase -Role $labRole -Phase restored } catch { $labErrors.Add('Restored capture: '+$_.Exception.Message) }
            }
        } catch { $labErrors.Add('DNS RESTORATION FAILED: '+$_.Exception.Message) }
    }
    try {
        if ($labRunCreated) {
            $labCollectedCount = @($labCaptures | Where-Object { $_.copied }).Count
            $labManifest = [ordered]@{
                schemaVersion=1;kind='windows-dns-reference-run';runLabel=$RunLabel
                startedAt=$labStartedAt.ToString('o');finishedAt=[datetime]::UtcNow.ToString('o')
                status=$(if($labCollectedCount -eq 6 -and $labDnsRestored){'collected-not-reviewed'}else{'incomplete-not-reviewed'})
                assessment='not-reviewed';simulatorComparison='not-run';aiEvaluation='not-run'
                dnsStopIssued=$labRestoreRequired;dnsRestorationConfirmed=$labDnsRestored
                expectedCaptureCount=6;copiedCaptureCount=$labCollectedCount
                sourceHashes=$labSourceHashes;commands=@($labCommands.ToArray());captures=@($labCaptures.ToArray());screenshots=@($labScreenshots.ToArray());errors=@($labErrors.ToArray())
                limitations=@('Phase labels and completed collection do not establish expected DNS/HTTP behavior. Review all raw guest outputs.','Console screenshots are real VM images but may not display guestcontrol command results.','No claim of simulator accuracy, AI accuracy, or learning effectiveness is inferred.','If DNS restoration is unconfirmed, inspect the isolated server VM and restore its DNS service before further work.')
            }
            [IO.File]::WriteAllText((Join-Path $labRunFolder 'manifest.json'),($labManifest | ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
        }
    } finally {
        if ($labOwnsMutex) { $labMutex.ReleaseMutex() }
        $labMutex.Dispose()
    }
}
if (-not $labRunCreated) { throw ($labErrors -join ' | ') }
if ($labRestoreRequired -and -not $labDnsRestored) { throw ('DNS restoration was not confirmed. Inspect SRV-01; raw evidence: '+$labRunFolder) }
if (@($labCaptures | Where-Object {$_.copied}).Count -ne 6) { throw ('Reference collection is incomplete. Review manifest and raw logs: '+$labRunFolder) }
Write-Output ('Six observations copied; DNS restart confirmed. Manual review and simulator comparison remain pending: '+$labRunFolder)
