#Requires -Version 5.1
<#
Read-only viewer for already captured observations INSIDE the matching guest.
Does not run probes, change services/networking, write evidence, or infer results.
Only the visible excerpts are shortened; original stdout/stderr remain intact.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('server','client')][string]$Role,
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9_-]{1,60}$')][string]$RunLabel,
    [Parameter(Mandatory)][ValidateSet('healthy','dns-stopped','restored')][string]$Phase
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
. (Join-Path $PSScriptRoot 'Assert-LabGuest.ps1')
$labGuest=Assert-LabGuest -Role $Role
$labRunRoot=Join-Path 'C:\SupportLab\evidence' $RunLabel
if (-not (Test-Path -LiteralPath $labRunRoot -PathType Container)) { throw 'Recorded run was not found in this guest.' }
if ((Get-Item -LiteralPath $labRunRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse evidence folders are not supported.' }

$labMatches=@(foreach ($labFolder in Get-ChildItem -LiteralPath $labRunRoot -Directory) {
    if ($labFolder.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse capture folders are not supported.' }
    $labJsonPath=Join-Path $labFolder.FullName 'observation.json'
    if (Test-Path -LiteralPath $labJsonPath -PathType Leaf) {
        $labRecord=Get-Content -LiteralPath $labJsonPath -Raw | ConvertFrom-Json
        if ($labRecord.role -eq $Role -and $labRecord.phaseLabel -eq $Phase -and $labRecord.runLabel -eq $RunLabel) {
            [pscustomobject]@{Folder=$labFolder.FullName;Record=$labRecord}
        }
    }
})
if ($labMatches.Count -ne 1) { throw 'Expected exactly one recorded observation for this role and phase; refusing an ambiguous selection.' }
$labCapture=$labMatches[0]
$labRecord=$labCapture.Record
if ($labRecord.kind -ne 'windows-reference-observation' -or $labRecord.machine.computerUuid -ne $labGuest.ComputerUuid) {
    throw 'Recorded observation does not belong to this guest.'
}

function ConvertTo-LabStderrDisplayText {
    param([AllowEmptyString()][string]$Text)
    # These changes affect presentation only, after the original file hash was
    # verified. Preserve ordinary error text around serialized progress blocks.
    $labWithoutBlocks=[regex]::Replace($Text,'(?s)<Objs(?:\s[^>]*)?>.*?</Objs\s*>',[Text.RegularExpressions.MatchEvaluator]{
        param($labMatch)
        try {
            $labSettings=New-Object Xml.XmlReaderSettings
            $labSettings.DtdProcessing=[Xml.DtdProcessing]::Prohibit
            $labSettings.XmlResolver=$null
            $labStringReader=New-Object IO.StringReader($labMatch.Value)
            $labReader=[Xml.XmlReader]::Create($labStringReader,$labSettings)
            try {
                $labDocument=New-Object Xml.XmlDocument
                $labDocument.XmlResolver=$null
                $labDocument.Load($labReader)
            } finally { $labReader.Dispose(); $labStringReader.Dispose() }
            $labObjects=@($labDocument.DocumentElement.ChildNodes | Where-Object {$_.NodeType -eq [Xml.XmlNodeType]::Element})
            if ($labObjects.Count -gt 0 -and @($labObjects | Where-Object {$_.LocalName -ne 'Obj' -or $_.GetAttribute('S') -cne 'progress'}).Count -eq 0) {
                return ''
            }
        } catch { }
        # A serialized error, warning or unrecognized block is never silently
        # classified as progress, and its intact source remains available.
        return '[CLIXML stderr: see full raw file]'
    })
    return [regex]::Replace($labWithoutBlocks,'(?m)^[ \t]*#< CLIXML[ \t]*\r?\n?','')
}

$labContent=@{}
foreach ($labProbe in $labRecord.commands) {
    if ($labContent.ContainsKey([string]$labProbe.id)) { throw 'Duplicate recorded command ID.' }
    $labStreams=@{}
    foreach ($labStreamName in @('stdout','stderr')) {
        $labName=[string]$labProbe.($labStreamName+'File')
        if ([string]::IsNullOrWhiteSpace($labName) -or [IO.Path]::GetFileName($labName) -ne $labName -or $labName -in @('.','..')) {
            throw 'Raw output filename must be a plain filename within the capture.'
        }
        $labPath=Join-Path $labCapture.Folder $labName
        if ((Get-Item -LiteralPath $labPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse raw files are not supported.' }
        if ((Get-FileHash -LiteralPath $labPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$labProbe.($labStreamName+'Sha256')) {
            throw ('Raw output checksum differs: '+$labName)
        }
        $labBytes=[IO.File]::ReadAllBytes($labPath)
        try {
            $labStrictUtf8=New-Object Text.UTF8Encoding($false,$true)
            $labText=$labStrictUtf8.GetString($labBytes)
        } catch [Text.DecoderFallbackException] {
            $labText=[Text.Encoding]::GetEncoding((Get-Culture).TextInfo.OEMCodePage).GetString($labBytes)
        }
        if ($labStreamName -eq 'stderr') { $labText=ConvertTo-LabStderrDisplayText -Text $labText }
        $labStreams[$labStreamName]=@($labText -split '\r?\n' | Where-Object { $_.Trim().Length -gt 0 })
    }
    $labContent[[string]$labProbe.id]=[pscustomobject]@{Probe=$labProbe;Streams=$labStreams}
}

function Show-LabProbeExcerpt {
    param([string]$Id,[string]$Title,[int]$StdoutLines=5,[int]$StderrLines=2)
    if (-not $labContent.ContainsKey($Id)) { throw ('Required recorded command is missing: '+$Id) }
    $labItem=$labContent[$Id]
    $labExit=if ($null -eq $labItem.Probe.exitCode) {'null'} else {[string]$labItem.Probe.exitCode}
    Write-Host ('[{0}] exit={1}; process-timeout={2}' -f $Title,$labExit,$labItem.Probe.timedOut) -ForegroundColor Cyan
    $labOut=@($labItem.Streams.stdout | Select-Object -First $StdoutLines)
    $labErr=@($labItem.Streams.stderr | Select-Object -Last $StderrLines)
    foreach ($labLine in $labOut) { Write-Host $labLine }
    foreach ($labLine in $labErr) { Write-Host ('stderr: '+$labLine) }
    if ($labOut.Count -eq 0 -and $labErr.Count -eq 0) { Write-Host '(no recorded output)' }
}

Clear-Host
Write-Host 'RECORDED OBSERVATION - not a live service check' -ForegroundColor Yellow
Write-Host ('Run: '+$RunLabel+' | role: '+$Role+' | phase label: '+$Phase)
Write-Host ('Captured UTC: '+[string]$labRecord.startedAt)
Write-Host ('Guest UUID: '+$labGuest.ComputerUuid)
Write-Host 'Raw hashes verified; progress XML omitted from display; raw files intact.'
if ($Role -eq 'server') {
    Show-LabProbeExcerpt '02-dns-service' 'DNS service' 4 3
    Show-LabProbeExcerpt '03-dns-record' 'Recorded A record' 5 3
    Show-LabProbeExcerpt '04-iis-site' 'Recorded IIS site/binding' 9 3
} else {
    Show-LabProbeExcerpt '02-ping-server' 'Ping by IP' 4 1
    Show-LabProbeExcerpt '03-dns-default' 'Default DNS query' 7 1
    Show-LabProbeExcerpt '04-dns-explicit' 'Explicit DNS query' 7 1
    Show-LabProbeExcerpt '06-http-by-name' 'HTTP by name' 4 2
    Show-LabProbeExcerpt '07-http-by-ip' 'HTTP by IP' 4 1
}
Write-Host 'Phase labels are recorded labels; inspect full raw files for interpretation.' -ForegroundColor Yellow
Write-Host ('Evidence: '+$labCapture.Folder)
