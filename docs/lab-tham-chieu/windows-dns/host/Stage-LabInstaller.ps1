# Host-side media preparation only. Never starts a VM or configures host IP/DNS.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('server','client')][string]$Role,
    [switch]$Watch,
    [ValidateRange(1,360)][int]$WaitMinutes = 180
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$labPlanRoot = Split-Path $PSScriptRoot -Parent
$labProjectRoot = (Resolve-Path -LiteralPath (Join-Path $labPlanRoot '..\..\..')).Path
$labRoot = Join-Path $labProjectRoot 'output\labs\windows-dns'
$labVBox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$labProfiles = @{
    server=@{Name='SupportLab-SRV-01';Uuid='4e8381f2-bfdc-4c70-928b-d526e5df3c6e';File='windows-server-2022-eval-en-us.iso';Bytes=5044094976L;Sha256=$null;DiskUuid='d304c8f7-7723-4b0a-9a47-0d5ba83fdcc1'}
    client=@{Name='SupportLab-CLIENT-01';Uuid='92b2f409-bff1-475d-a864-9d0daa2b996a';File='windows-11-enterprise-26h2-eval-en-us.iso';Bytes=8225329152L;Sha256='bc3f24086ebadc94489066b5ad78089e2cf5c3491e90e790bb81a2b199c10e38';DiskUuid='7baa67e8-67cd-441c-acc4-15c3829d41d8'}
}
$labProfile = $labProfiles[$Role]
$labIsoPath = Join-Path (Join-Path $labRoot 'media') $labProfile.File
$labStatusPath = Join-Path $labRoot ('stage-' + $Role + '.json')
$labStarted = [DateTime]::UtcNow
$labMutex = New-Object Threading.Mutex($false,('Local\SupportLab-Stage-' + $labProfile.Uuid))
$labOwnsMutex = $false
$labStatus = [ordered]@{
    schemaVersion=1;kind='supportlab-vm-media-staging';role=$Role;vm=$labProfile.Name
    workerPid=$PID;startedAt=$labStarted.ToString('o');updatedAt=$labStarted.ToString('o')
    status='starting';downloadedBytes=0;expectedBytes=$labProfile.Bytes;percent=0
    isoPath=$labIsoPath;sha256=$null;independentHashComparison='not-yet-checked'
    sourceUrl=if ($Role -eq 'server') {'https://go.microsoft.com/fwlink/p/?LinkID=2195280&clcid=0x409&culture=en-us&country=US'} else {'https://go.microsoft.com/fwlink/?LinkId=2382600&clcid=0x409&culture=en-us&country=us'}
    vmStarted=$false;guestInstallation='not-run';message='Waiting for a complete verified installer ISO.'
}
function Save-LabStageStatus {
    $labStatus.updatedAt=[DateTime]::UtcNow.ToString('o')
    $labTempStatus=$labStatusPath + '.' + $PID + '.tmp'
    $labStatus | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $labTempStatus -Encoding UTF8
    Move-Item -LiteralPath $labTempStatus -Destination $labStatusPath -Force
}
function Get-LabVmInfo {
    $labLines=@(& $labVBox showvminfo $labProfile.Uuid --machinereadable 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read the expected VM.' }
    $labInfo=@{}
    foreach ($labLine in $labLines) {
        if ([string]$labLine -match '^"?([^"=]+)"?="(.*)"$') { $labInfo[$Matches[1]]=$Matches[2] }
    }
    if ($labInfo['name'] -ne $labProfile.Name -or $labInfo['hardwareuuid'] -ne $labProfile.Uuid) { throw 'VM identity changed; refusing media attachment.' }
    if ($labInfo['VMState'] -ne 'poweroff') { throw 'VM must be powered off. No VM was stopped or changed.' }
    if ($labInfo['nic1'] -ne 'intnet' -or $labInfo['intnet1'] -ne 'SupportLab-DNS') { throw 'Expected isolated Internal Network is not configured.' }
    foreach ($labNic in 2..8) { if ($labInfo['nic'+$labNic] -ne 'none') { throw 'Unexpected extra network adapter; refusing.' } }
    if ($labInfo['SATA-ImageUUID-0-0'] -ne $labProfile.DiskUuid) { throw 'The expected lab VDI is not attached.' }
    return $labInfo
}

try {
    try { $labOwnsMutex=$labMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $labOwnsMutex=$true }
    if (-not $labOwnsMutex) { throw 'Another staging worker already owns this VM.' }
    if (-not (Test-Path -LiteralPath $labVBox -PathType Leaf)) { throw 'VirtualBox is not installed.' }
    if (-not (Test-Path -LiteralPath $labRoot -PathType Container)) { throw 'Expected lab directory does not exist.' }
    [void](Get-LabVmInfo)
    while (-not (Test-Path -LiteralPath $labIsoPath -PathType Leaf)) {
        $labStatus.status='waiting-download'
        $labPartPath=$labIsoPath + '.part'
        if (Test-Path -LiteralPath $labPartPath -PathType Leaf) {
            # NTFS directory metadata may be stale while curl keeps the file open.
            try {
                $labPartStream=[IO.File]::Open($labPartPath,'Open','Read',([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
                try { $labStatus.downloadedBytes=$labPartStream.Length } finally { $labPartStream.Dispose() }
            } catch [IO.FileNotFoundException] {
                # The downloader can rename a completed file between Test-Path and Open.
                if (Test-Path -LiteralPath $labIsoPath -PathType Leaf) { continue }
                throw
            }
            if ($labStatus.downloadedBytes -gt $labProfile.Bytes) { throw 'Partial ISO is larger than the expected installer.' }
            $labStatus.percent=[math]::Round(100*$labStatus.downloadedBytes/$labProfile.Bytes,1)
        }
        Save-LabStageStatus
        if (-not $Watch) { Write-Output ('Installer not ready; status: ' + $labStatusPath); return }
        if (([DateTime]::UtcNow-$labStarted).TotalMinutes -ge $WaitMinutes) { throw 'Wait limit reached; no ISO attached and no VM started.' }
        Start-Sleep -Seconds 15
    }
    if ((Get-Item -LiteralPath $labIsoPath).Length -ne $labProfile.Bytes) { throw 'Complete ISO size does not match expected media.' }
    $labStatus.status='verifying'
    $labStatus.downloadedBytes=$labProfile.Bytes
    $labStatus.percent=100
    Save-LabStageStatus
    $labHash=(Get-FileHash -LiteralPath $labIsoPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($null -ne $labProfile.Sha256 -and $labHash -ne $labProfile.Sha256) { throw 'Microsoft-published SHA-256 does not match; refusing the ISO.' }
    $labStatus.sha256=$labHash
    $labStatus.independentHashComparison=if ($null -ne $labProfile.Sha256) {'match'} else {'not-available-server-source-is-microsoft-https'}
    $labInfo=Get-LabVmInfo
    $labCurrentDvd=$labInfo['SATA-1-0']
    $labAlreadyAttached=$labCurrentDvd -eq $labIsoPath.Replace('\','\\')
    if ($labCurrentDvd -ne 'emptydrive' -and -not $labAlreadyAttached) { throw 'A different DVD is already attached; refusing to replace it.' }
    if (-not $labAlreadyAttached) {
        $labAttachOutput=@(& $labVBox storageattach $labProfile.Uuid --storagectl SATA --port 1 --device 0 --type dvddrive --medium $labIsoPath 2>&1)
        if ($LASTEXITCODE -ne 0) { throw 'VirtualBox did not attach the verified ISO.' }
    }
    $labVerifiedInfo=Get-LabVmInfo
    if ($labVerifiedInfo['SATA-1-0'] -ne $labIsoPath.Replace('\','\\')) { throw 'Could not confirm the requested optical media.' }
    $labStatus.status='staged'
    $labStatus.message=if ($null -ne $labProfile.Sha256) {
        'ISO size and published SHA-256 match. Attached to the powered-off VM; installation not run.'
    } else {
        'Microsoft HTTPS ISO size checked and SHA-256 recorded; independent hash unavailable. Attached to the powered-off VM; installation not run.'
    }
    Save-LabStageStatus
    Write-Output $labStatus.message
} catch {
    if ($labOwnsMutex -and (Test-Path -LiteralPath $labRoot -PathType Container)) {
        $labStatus.status='blocked'
        $labStatus.message=$_.Exception.Message
        Save-LabStageStatus
    }
    throw
} finally {
    if ($labOwnsMutex) { $labMutex.ReleaseMutex() }
    $labMutex.Dispose()
}
