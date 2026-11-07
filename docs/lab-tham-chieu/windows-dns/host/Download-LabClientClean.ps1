# Independent clean range download after an ISO failed its published checksum.
# No VM, host network or existing partial-file mutations before full validation.
[CmdletBinding()]
param([string]$ResumeFolder)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$labProject=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path
$labRoot=Join-Path $labProject 'output\labs\windows-dns'
$labMedia=Join-Path $labRoot 'media'
$labBytes=8225329152L
$labExpected='bc3f24086ebadc94489066b5ad78089e2cf5c3491e90e790bb81a2b199c10e38'
$labUrl='https://software-static.download.prss.microsoft.com/dbazure/26300.9457.260913-1737.26h2_ge_release_svc_refresh_CLIENTENTERPRISEEVAL_OEMRET_x64FRE_en-us.iso'
$labFolder=if($ResumeFolder){[IO.Path]::GetFullPath($ResumeFolder).TrimEnd('\')}else{Join-Path $labRoot ('client-clean-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))}
$labCandidate=Join-Path $labFolder 'client-clean.iso.part'
$labFinal=Join-Path $labMedia 'windows-11-enterprise-26h2-eval-en-us.iso'
$labOldPartial=$labFinal+'.part'
$labStatusPath=Join-Path $labRoot 'client-clean.json'
$labCurl=(Get-Command curl.exe).Source
$labJobs=New-Object 'System.Collections.Generic.List[object]'
$labMutex=New-Object Threading.Mutex($false,'Local\SupportLab-Clean-Client-Download')
$labOwnsMutex=$false
$labStatus=[ordered]@{kind='supportlab-clean-download';workerPid=$PID;status='starting';sourceUrl=$labUrl;expectedBytes=$labBytes;downloadedBytes=0;percent=0;updatedAt=[DateTime]::UtcNow.ToString('o');folder=$labFolder;sha256=$null;message='Original checksum-mismatched file retained. No VM configured or started.'}
function Save-LabStatus {
    $labStatus.updatedAt=[DateTime]::UtcNow.ToString('o')
    $labStatus | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $labStatusPath -Encoding UTF8
}
function Get-LabFileLength {
    param([string]$Path)
    if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){return 0L}
    $labStream=[IO.File]::Open($Path,'Open','Read',([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try{return $labStream.Length}finally{$labStream.Dispose()}
}
function Test-LabRangeHeader {
    param([string]$Path,[long]$Start,[long]$End)
    if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){return $false}
    $labText=Get-Content -LiteralPath $Path -Raw
    $labResponses=[regex]::Matches($labText,'(?im)^HTTP/\S+\s+(\d+)')
    $labPattern='(?im)^Content-Range:\s*bytes '+$Start+'-'+$End+'/'+$labBytes+'\s*$'
    return ($labResponses.Count -gt 0 -and $labResponses[$labResponses.Count-1].Groups[1].Value -eq '206' -and $labText -match $labPattern)
}
function Start-LabChunk {
    param($Chunk)
    if($Chunk.Attempts -ge 8){throw ('Chunk exhausted eight resumable attempts: '+[IO.Path]::GetFileName($Chunk.File))}
    $Chunk.AppendAt=Get-LabFileLength $Chunk.File
    if($Chunk.AppendAt -ge $Chunk.Expected){throw 'A complete/oversized chunk was incorrectly scheduled.'}
    $Chunk.Attempts++
    $Chunk.RequestStart=$Chunk.Start+$Chunk.AppendAt
    $labAttemptPrefix=$Chunk.File+'.segment-'+[guid]::NewGuid().ToString('N')
    $Chunk.Segment=$labAttemptPrefix+'.part'
    $Chunk.SegmentHeader=$labAttemptPrefix+'.headers.txt'
    $labArgs=@('--location','--fail','--silent','--show-error','--connect-timeout','30','--max-time','1800','--speed-limit','1024','--speed-time','120','--range',($Chunk.RequestStart.ToString()+'-'+$Chunk.End.ToString()),'--dump-header',$Chunk.SegmentHeader,'--output',$Chunk.Segment,$labUrl)
    $Chunk.Process=Start-Process -FilePath $labCurl -ArgumentList $labArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput ($labAttemptPrefix+'.stdout.log') -RedirectStandardError ($labAttemptPrefix+'.stderr.log')
    # Cache a real process handle now; without this, ExitCode can be null for
    # some Start-Process/PowerShell combinations after the child has exited.
    $Chunk.NativeHandle=$Chunk.Process.Handle
}
function Complete-LabChunkAttempt {
    param($Chunk)
    $Chunk.Process.WaitForExit()
    $Chunk.Process.Refresh()
    $labExit=$Chunk.Process.ExitCode
    $labSegmentBytes=Get-LabFileLength $Chunk.Segment
    $labRemaining=$Chunk.Expected-$Chunk.AppendAt
    $labValidHeader=Test-LabRangeHeader -Path $Chunk.SegmentHeader -Start $Chunk.RequestStart -End $Chunk.End
    if($labSegmentBytes -gt $labRemaining){throw 'A segment exceeds the exact requested range; refusing append.'}
    # A reset/timeout may leave a valid PREFIX of an HTTP206 body. Keep it if
    # its range is exact; a successful short response is not accepted.
    $labAppendAllowed=$labValidHeader -and $labSegmentBytes -gt 0 -and ($labExit -ne 0 -or $labSegmentBytes -eq $labRemaining)
    if($labAppendAllowed){
        if((Get-LabFileLength $Chunk.File) -ne $Chunk.AppendAt){throw 'Chunk changed while a segment was downloading; refusing append.'}
        $labInput=[IO.File]::OpenRead($Chunk.Segment)
        try{
            $labOutput=[IO.File]::Open($Chunk.File,'Append','Write','None')
            try{$labInput.CopyTo($labOutput);$labOutput.Flush()}finally{$labOutput.Dispose()}
        }finally{$labInput.Dispose()}
        if((Get-LabFileLength $Chunk.File) -ne ($Chunk.AppendAt+$labSegmentBytes)){throw 'Appended chunk length differs from the validated segment.'}
        if($Chunk.AppendAt -eq 0){Copy-Item -LiteralPath $Chunk.SegmentHeader -Destination $Chunk.Header}
        # Segment files are retained for diagnosis; do not count them twice.
    }
    $Chunk.Done=(Get-LabFileLength $Chunk.File) -eq $Chunk.Expected
    $labAttemptRecord=[ordered]@{finishedAt=[DateTime]::UtcNow.ToString('o');chunk=[IO.Path]::GetFileName($Chunk.File);attempt=$Chunk.Attempts;rangeStart=$Chunk.RequestStart;rangeEnd=$Chunk.End;exitCode=$labExit;headerAccepted=$labValidHeader;segmentBytes=$labSegmentBytes;appended=$labAppendAllowed;retainedChunkBytes=(Get-LabFileLength $Chunk.File)}
    $labAttemptRecord | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $labFolder 'attempts.jsonl') -Encoding UTF8
    $Chunk.Process.Dispose();$Chunk.Process=$null;$Chunk.NativeHandle=$null
    if(-not $Chunk.Done -and $Chunk.Attempts -ge 8){throw ('Chunk failed eight resumable attempts; partial bytes retained: '+[IO.Path]::GetFileName($Chunk.File))}
}
try {
    try {$labOwnsMutex=$labMutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$labOwnsMutex=$true}
    if(-not $labOwnsMutex){throw 'Another clean download worker is already running.'}
    if(Test-Path -LiteralPath $labFinal){throw 'Complete client ISO already exists; refusing replacement.'}
    if(@(Get-CimInstance Win32_Process -Filter "Name='curl.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains('windows-11-enterprise-26h2-eval-en-us.iso.part')}).Count){throw 'Original partial ISO is still being downloaded.'}
    if([IO.Path]::GetDirectoryName($labFolder) -ine [IO.Path]::GetFullPath($labRoot) -or [IO.Path]::GetFileName($labFolder) -notmatch '^client-clean-\d{8}T\d{9}Z$'){throw 'ResumeFolder must be a direct client-clean timestamp folder under the dedicated lab root.'}
    if($ResumeFolder){
        if(-not(Test-Path -LiteralPath $labFolder -PathType Container)){throw 'ResumeFolder does not exist.'}
        $labCheck=Get-Item -LiteralPath $labFolder
        while($null -ne $labCheck){if($labCheck.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'ResumeFolder must not pass through a junction or symbolic link.'};$labCheck=$labCheck.Parent}
    }else{[void](New-Item -ItemType Directory -Path $labFolder)}
    if(Test-Path -LiteralPath $labCandidate){throw 'An assembled ISO candidate already exists; inspect its hash instead of overwriting.'}
    for($labStart=0L;$labStart -lt $labBytes;$labStart+=536870912L){
        $labEnd=[math]::Min($labStart+536870912L-1,$labBytes-1)
        $labId='{0:D2}' -f $labJobs.Count
        $labJob=[pscustomobject]@{Start=$labStart;End=$labEnd;Expected=$labEnd-$labStart+1;File=(Join-Path $labFolder ('chunk-'+$labId+'.bin'));Header=(Join-Path $labFolder ('chunk-'+$labId+'.headers.txt'));Attempts=0;Process=$null;NativeHandle=$null;Done=$false;AppendAt=0L;RequestStart=0L;Segment=$null;SegmentHeader=$null}
        $labExisting=Get-LabFileLength $labJob.File
        if($labExisting -gt $labJob.Expected){throw 'Existing chunk exceeds its expected range.'}
        if($labExisting -gt 0 -and -not(Test-LabRangeHeader -Path $labJob.Header -Start $labStart -End $labEnd)){throw ('Existing chunk lacks its exact initial HTTP206 range header: '+$labId)}
        $labJob.Done=$labExisting -eq $labJob.Expected
        $labJobs.Add($labJob)
    }
    $labStatus.status='downloading';Save-LabStatus
    while(@($labJobs | Where-Object {-not $_.Done}).Count){
        foreach($labJob in $labJobs){
            if($labJob.Done){continue}
            if($null -ne $labJob.Process -and $labJob.Process.HasExited){
                Complete-LabChunkAttempt $labJob
            }
        }
        $labActive=@($labJobs | Where-Object {$null -ne $_.Process -and -not $_.Process.HasExited}).Count
        foreach($labJob in $labJobs){if($labActive -ge 4){break};if(-not $labJob.Done -and $null -eq $labJob.Process){Start-LabChunk $labJob;$labActive++}}
        $labDownloaded=0L
        foreach($labJob in $labJobs){
            $labRetained=Get-LabFileLength $labJob.File
            $labInFlight=if($null -ne $labJob.Process -and $labJob.Segment){Get-LabFileLength $labJob.Segment}else{0L}
            $labDownloaded+=[math]::Min($labRetained+$labInFlight,$labJob.Expected)
        }
        $labStatus.downloadedBytes=$labDownloaded;$labStatus.percent=[math]::Round(100*$labDownloaded/$labBytes,1);Save-LabStatus
        if(@($labJobs | Where-Object {-not $_.Done}).Count){Start-Sleep -Seconds 5}
    }
    $labStatus.status='assembling';Save-LabStatus
    $labOutput=[IO.File]::Open($labCandidate,'CreateNew','Write','None')
    try{foreach($labJob in $labJobs){$labInput=[IO.File]::OpenRead($labJob.File);try{$labInput.CopyTo($labOutput)}finally{$labInput.Dispose()}}}finally{$labOutput.Dispose()}
    $labStatus.status='verifying';Save-LabStatus
    if((Get-Item -LiteralPath $labCandidate).Length -ne $labBytes){throw 'Assembled length differs.'}
    $labHash=(Get-FileHash -LiteralPath $labCandidate -Algorithm SHA256).Hash.ToLowerInvariant();$labStatus.sha256=$labHash
    if($labHash -ne $labExpected){throw 'Independent download still differs from Microsoft-published SHA-256. Retained for investigation, no ISO promoted.'}
    if(Test-Path -LiteralPath $labOldPartial){Move-Item -LiteralPath $labOldPartial -Destination (Join-Path $labMedia ('client-checksum-mismatch-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'.bin'))}
    Move-Item -LiteralPath $labCandidate -Destination $labFinal
    $labStatus.status='downloaded';$labStatus.percent=100;$labStatus.message='Clean ISO matches Microsoft-published SHA-256. Original mismatched file retained; no VM started.';Save-LabStatus
    Write-Output $labStatus.message
}catch{
    if($labOwnsMutex){$labStatus.status='blocked';$labStatus.message=$_.Exception.Message;Save-LabStatus}
    throw
}finally{
    foreach($labJob in $labJobs){if($null -ne $labJob.Process){if(-not $labJob.Process.HasExited){$labJob.Process.Kill();$labJob.Process.WaitForExit()};$labJob.Process.Dispose()}}
    if($labOwnsMutex){$labMutex.ReleaseMutex()};$labMutex.Dispose()
}
