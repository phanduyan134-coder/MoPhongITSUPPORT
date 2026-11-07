# Host-side resumable Microsoft ISO download. Does not start or configure a VM.
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('server','client')][string]$Role)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$labProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path
$labRoot = Join-Path $labProjectRoot 'output\labs\windows-dns'
$labMediaRoot = Join-Path $labRoot 'media'
$labProfiles = @{
    server=@{File='windows-server-2022-eval-en-us.iso';Bytes=5044094976L;Sha256=$null;Url='https://go.microsoft.com/fwlink/p/?LinkID=2195280&clcid=0x409&culture=en-us&country=US'}
    client=@{File='windows-11-enterprise-26h2-eval-en-us.iso';Bytes=8225329152L;Sha256='bc3f24086ebadc94489066b5ad78089e2cf5c3491e90e790bb81a2b199c10e38';Url='https://go.microsoft.com/fwlink/?LinkId=2382600&clcid=0x409&culture=en-us&country=us'}
}
$labProfile=$labProfiles[$Role]
$labFinal=Join-Path $labMediaRoot $labProfile.File
$labPartial=$labFinal+'.part'
$labMutex=New-Object Threading.Mutex($false,('Local\SupportLab-Download-'+$Role))
$labOwnsMutex=$false
$labStatus=[ordered]@{
    schemaVersion=1;kind='supportlab-media-download';role=$Role;workerPid=$PID
    startedAt=[DateTime]::UtcNow.ToString('o');updatedAt=[DateTime]::UtcNow.ToString('o')
    sourceUrl=$labProfile.Url;expectedBytes=$labProfile.Bytes;resumedFromBytes=0
    status='starting';path=$labFinal;sha256=$null;independentHashComparison='not-yet-checked'
    message='Only downloads media; no guest or host network configuration.'
}
function Save-LabDownloadStatus {
    $labStatus.updatedAt=[DateTime]::UtcNow.ToString('o')
    $labStatus | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $labRoot ('download-'+$Role+'.json')) -Encoding UTF8
}
try {
    try {$labOwnsMutex=$labMutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$labOwnsMutex=$true}
    if (-not $labOwnsMutex) {throw 'A download worker already owns this role.'}
    if (-not (Test-Path -LiteralPath $labMediaRoot -PathType Container)) {throw 'Expected lab media folder is missing.'}
    $labCurl=(Get-Command curl.exe -ErrorAction Stop).Source
    # Do not resume a file another curl process is still writing.
    $labOtherCurl=@(Get-CimInstance Win32_Process -Filter "Name='curl.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($labProfile.File)})
    if ($labOtherCurl.Count -gt 0) {throw 'Another curl process is using this ISO. No second writer started.'}
    if (-not (Test-Path -LiteralPath $labFinal -PathType Leaf)) {
        if (Test-Path -LiteralPath $labPartial -PathType Leaf) {
            $labStream=[IO.File]::Open($labPartial,'Open','Read',([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
            try {$labStatus.resumedFromBytes=$labStream.Length} finally {$labStream.Dispose()}
            if ($labStatus.resumedFromBytes -gt $labProfile.Bytes) {throw 'Partial download exceeds expected size.'}
        }
        $labStatus.status='downloading';Save-LabDownloadStatus
        if ($labStatus.resumedFromBytes -lt $labProfile.Bytes) {
            for ($labAttempt=1; $labAttempt -le 9; $labAttempt++) {
                $labStatus['attempt']=$labAttempt
                Save-LabDownloadStatus
                # Resume is recalculated on EACH new curl invocation, including
                # connection resets (56), rather than discarding partial bytes.
                & $labCurl --location --fail --silent --show-error --continue-at - --retry 3 --retry-delay 5 --connect-timeout 30 --speed-limit 1024 --speed-time 120 --output $labPartial $labProfile.Url
                $labCurlExit=$LASTEXITCODE
                if ($labCurlExit -eq 0) {break}
                $labPartialBytes=if (Test-Path -LiteralPath $labPartial) {(Get-Item -LiteralPath $labPartial).Length} else {0}
                if ($labPartialBytes -eq $labProfile.Bytes) {break}
                if ($labPartialBytes -gt $labProfile.Bytes) {throw 'Partial download exceeds expected size after curl failure.'}
                if ($labCurlExit -notin @(6,7,18,28,35,52,55,56) -or $labAttempt -eq 9) {
                    throw ('curl failed with exit code '+$labCurlExit+'. Partial file retained for resume.')
                }
                $labStatus.message='Connection interrupted; resuming the retained partial file.'
                Save-LabDownloadStatus
                Start-Sleep -Seconds 5
            }
        }
        $labCandidate=$labPartial
    } else {$labCandidate=$labFinal}
    $labStatus.status='verifying';Save-LabDownloadStatus
    if ((Get-Item -LiteralPath $labCandidate).Length -ne $labProfile.Bytes) {throw 'Downloaded ISO length differs from expected size.'}
    $labHash=(Get-FileHash -LiteralPath $labCandidate -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($null -ne $labProfile.Sha256 -and $labHash -ne $labProfile.Sha256) {throw 'ISO SHA-256 does not match Microsoft; retained without promotion.'}
    $labStatus.sha256=$labHash
    $labStatus.independentHashComparison=if ($null -ne $labProfile.Sha256) {'match'} else {'not-available-server-source-is-microsoft-https'}
    # Promote only after size/hash checks, so staging cannot consume an incomplete file.
    if ($labCandidate -eq $labPartial) {Move-Item -LiteralPath $labPartial -Destination $labFinal}
    $labStatus.status='downloaded'
    $labStatus.message='Complete media stored. No VM started and Windows installation not run.'
    Save-LabDownloadStatus
    Write-Output $labStatus.message
} catch {
    if ($labOwnsMutex -and (Test-Path -LiteralPath $labRoot -PathType Container)) {
        $labStatus.status='blocked';$labStatus.message=$_.Exception.Message;Save-LabDownloadStatus
    }
    throw
} finally {
    if ($labOwnsMutex) {$labMutex.ReleaseMutex()}
    $labMutex.Dispose()
}
