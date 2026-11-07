# Host-side preparation only: copies reviewed guest scripts into a data ISO.
# Does not run guest scripts, configure host networking, or start a VM.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$labPlanRoot = Split-Path $PSScriptRoot -Parent
$labProjectRoot = (Resolve-Path -LiteralPath (Join-Path $labPlanRoot '..\..\..')).Path
$labSourceRoot = Join-Path $labPlanRoot 'scripts'
$labStamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$labBuildRoot = Join-Path $labProjectRoot ('output\labs\windows-dns\tools-' + $labStamp)
$labStageRoot = Join-Path $labBuildRoot 'contents'
$labIsoPart = Join-Path $labBuildRoot 'supportlab-guest-tools.iso.part'
$labIsoPath = Join-Path $labBuildRoot 'supportlab-guest-tools.iso'
$labScriptNames = @('Assert-LabGuest.ps1','Initialize-LabServer.ps1','Initialize-LabClient.ps1','Capture-LabObservation.ps1')

foreach ($labScriptName in $labScriptNames) {
    $labSourcePath = Join-Path $labSourceRoot $labScriptName
    if (-not (Test-Path -LiteralPath $labSourcePath -PathType Leaf)) { throw ('Guest script not ready: ' + $labScriptName) }
    $labParseTokens = $null
    $labParseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($labSourcePath,[ref]$labParseTokens,[ref]$labParseErrors)
    if ($labParseErrors.Count -gt 0) { throw ('Guest script syntax error: ' + $labScriptName) }
}

New-Item -ItemType Directory -Path $labStageRoot | Out-Null
$labScriptManifest = foreach ($labScriptName in $labScriptNames) {
    $labSourcePath = Join-Path $labSourceRoot $labScriptName
    $labTargetPath = Join-Path $labStageRoot $labScriptName
    Copy-Item -LiteralPath $labSourcePath -Destination $labTargetPath
    $labSourceHash = (Get-FileHash -LiteralPath $labSourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ((Get-FileHash -LiteralPath $labTargetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $labSourceHash) {
        throw ('Copied script hash mismatch: ' + $labScriptName)
    }
    [pscustomobject]@{name=$labScriptName;sha256=$labSourceHash}
}
$labManifest = [ordered]@{
    schemaVersion=1
    kind='supportlab-guest-tools'
    preparedAt=[DateTime]::UtcNow.ToString('o')
    guestExecution='not-run'
    files=@($labScriptManifest)
    expectedGuests=@(
        @{role='server';name='SRV-01';uuid='4e8381f2-bfdc-4c70-928b-d526e5df3c6e'},
        @{role='client';name='CLIENT-01';uuid='92b2f409-bff1-475d-a864-9d0daa2b996a'}
    )
}
$labManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $labStageRoot 'manifest.json') -Encoding UTF8

if (-not ('SupportLab.IsoWriter' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
namespace SupportLab {
    public static class IsoWriter {
        public static void Save(object imageStream, string destination) {
            IStream source = (IStream)imageStream;
            byte[] buffer = new byte[65536];
            IntPtr bytesRead = Marshal.AllocHGlobal(sizeof(int));
            try {
                using (FileStream target = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                    for (;;) {
                        Marshal.WriteInt32(bytesRead, 0);
                        source.Read(buffer, buffer.Length, bytesRead);
                        int count = Marshal.ReadInt32(bytesRead);
                        if (count == 0) break;
                        target.Write(buffer, 0, count);
                    }
                    target.Flush(true);
                }
            } finally { Marshal.FreeHGlobal(bytesRead); }
        }
    }
}
'@
}

$labImage = $null
$labResult = $null
$labImageStream = $null
try {
    $labImage = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
    $labImage.FileSystemsToCreate = 3
    $labImage.VolumeName = 'SUPPORTLAB_TOOLS'
    $labImage.Root.AddTree($labStageRoot,$false)
    $labResult = $labImage.CreateResultImage()
    $labImageStream = $labResult.ImageStream
    [SupportLab.IsoWriter]::Save($labImageStream,$labIsoPart)
} finally {
    foreach ($labComObject in @($labImageStream,$labResult,$labImage)) {
        if ($null -ne $labComObject -and [Runtime.InteropServices.Marshal]::IsComObject($labComObject)) {
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($labComObject)
        }
    }
}

$labIsoRead = [IO.File]::OpenRead($labIsoPart)
try {
    [void]$labIsoRead.Seek(32769,[IO.SeekOrigin]::Begin)
    $labSignature = New-Object byte[] 5
    if ($labIsoRead.Read($labSignature,0,5) -ne 5 -or [Text.Encoding]::ASCII.GetString($labSignature) -ne 'CD001') {
        throw 'The generated file does not have an ISO9660 volume descriptor.'
    }
} finally { $labIsoRead.Dispose() }

Move-Item -LiteralPath $labIsoPart -Destination $labIsoPath
$labBuildRecord = [ordered]@{
    schemaVersion=1
    kind='supportlab-guest-tools-build'
    isoPath=$labIsoPath
    isoBytes=(Get-Item -LiteralPath $labIsoPath).Length
    isoSha256=(Get-FileHash -LiteralPath $labIsoPath -Algorithm SHA256).Hash.ToLowerInvariant()
    guestExecution='not-run'
    files=@($labScriptManifest)
}
$labBuildRecord | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $labBuildRoot 'build.json') -Encoding UTF8
$labBuildRecord | ConvertTo-Json -Depth 5
