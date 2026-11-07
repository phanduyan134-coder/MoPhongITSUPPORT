# Host-side preparation only: never boots a VM or changes host networking.
# Generated answer files contain a NEW guest-only password and stay in output/.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('server','client')][string]$Role,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$EditionName
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$labProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path
$labRoot = Join-Path $labProjectRoot 'output\labs\windows-dns'
$labVBox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$labProfiles = @{
    server=@{Name='SupportLab-SRV-01';HostName='srv-01.lab.test';Uuid='4e8381f2-bfdc-4c70-928b-d526e5df3c6e';File='windows-server-2022-eval-en-us.iso';Bytes=5044094976L;Sha256=$null;DiskUuid='d304c8f7-7723-4b0a-9a47-0d5ba83fdcc1';DiskMB=61440}
    client=@{Name='SupportLab-CLIENT-01';HostName='client-01.lab.test';Uuid='92b2f409-bff1-475d-a864-9d0daa2b996a';File='windows-11-enterprise-26h2-eval-en-us.iso';Bytes=8225329152L;Sha256='bc3f24086ebadc94489066b5ad78089e2cf5c3491e90e790bb81a2b199c10e38';DiskUuid='7baa67e8-67cd-441c-acc4-15c3829d41d8';DiskMB=65536}
}
$labProfile=$labProfiles[$Role]
$labVmDir=Join-Path (Join-Path $labRoot 'vms') $labProfile.Name
$labDiskPath=Join-Path $labVmDir ($labProfile.Name+'.vdi')
$labIsoPath=Join-Path (Join-Path $labRoot 'media') $labProfile.File
$labPrivatePath=Join-Path (Join-Path $labRoot 'private') $Role
$labPasswordPath=Join-Path $labPrivatePath 'guest-password.txt'
$labTemplatePath=Join-Path $PSScriptRoot 'templates\windows-uefi.xml'
$labPostPath=Join-Path $PSScriptRoot 'templates\vboxpost.cmd'
$labAdditionsIso='C:\Program Files\Oracle\VirtualBox\VBoxGuestAdditions.iso'
$labMutex=New-Object Threading.Mutex($false,('Local\SupportLab-Unattended-'+$labProfile.Uuid))
$labOwnsMutex=$false

function Get-LabVmInfo {
    $labLines=@(& $labVBox showvminfo $labProfile.Uuid --machinereadable 2>&1)
    if($LASTEXITCODE -ne 0){throw 'Cannot inspect the expected VM.'}
    $labInfo=@{}
    foreach($labLine in $labLines){
        if([string]$labLine -match '^"?([^"=]+)"?="(.*)"$'){$labInfo[$Matches[1]]=$Matches[2].Replace('\\','\')}
        elseif([string]$labLine -match '^([^=]+)=(.*)$'){$labInfo[$Matches[1]]=$Matches[2]}
    }
    return $labInfo
}
function Assert-LabVmIsolation {
    $labInfo=Get-LabVmInfo
    if($labInfo['name'] -ne $labProfile.Name -or $labInfo['hardwareuuid'] -ne $labProfile.Uuid -or $labInfo['UUID'] -ne $labProfile.Uuid){throw 'VM identity differs from the dedicated lab profile.'}
    if($labInfo['VMState'] -ne 'poweroff'){throw 'VM is not powered off. No VM was stopped.'}
    if($labInfo['firmware'] -ne 'EFI' -or $labInfo['SecureBoot'] -ne 'on'){throw 'UEFI Secure Boot is required; hardware checks will not be bypassed.'}
    if($labInfo['nic1'] -ne 'intnet' -or $labInfo['intnet1'] -ne 'SupportLab-DNS'){throw 'The expected isolated Internal Network is not configured.'}
    foreach($labNic in 2..8){if($labInfo['nic'+$labNic] -ne 'none'){throw 'Additional network adapters are forbidden for unattended lab preparation.'}}
    if($labInfo['SATA-ImageUUID-0-0'] -ne $labProfile.DiskUuid -or $labInfo['SATA-0-0'] -ne $labDiskPath){throw 'Dedicated lab disk identity/path changed.'}
    if(@($labInfo.Keys | Where-Object {$_ -match '(?i)SharedFolder|SnapshotUUID'}).Count -gt 0){throw 'Existing shared folders or snapshots are not supported by this fresh-install preparation.'}
    if($labInfo['clipboard'] -ne 'disabled' -or $labInfo['draganddrop'] -ne 'disabled'){throw 'Clipboard and drag-and-drop must remain disabled.'}
    [xml]$labVmXml=Get-Content -LiteralPath (Join-Path $labVmDir ($labProfile.Name+'.vbox')) -Raw
    if($labVmXml.SelectNodes('//*[local-name()="SharedFolder"]').Count -gt 0){throw 'Host shared folders are forbidden.'}
    if($labVmXml.SelectNodes('//*[local-name()="Snapshot"]').Count -gt 0){throw 'Existing VM snapshots are forbidden for a fresh unattended installation.'}
    return $labInfo
}
function Invoke-LabVBoxPrivate {
    param([string[]]$Arguments,[string]$LogName)
    # Native errors/output remain in the private folder, never in the terminal.
    $labPreviousPreference=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        $labOutput=@(& $labVBox @Arguments 2>&1)
        $labExit=$LASTEXITCODE
    } finally {$ErrorActionPreference=$labPreviousPreference}
    [IO.File]::WriteAllLines((Join-Path $labPrivatePath $LogName),[string[]]@($labOutput | ForEach-Object {[string]$_}),(New-Object Text.UTF8Encoding($false)))
    if($labExit -ne 0){throw ('VirtualBox preparation command failed; details are private in '+$LogName+'. No VM was booted.')}
    return [string[]]@($labOutput | ForEach-Object {[string]$_})
}

try {
    try{$labOwnsMutex=$labMutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$labOwnsMutex=$true}
    if(-not $labOwnsMutex){throw 'Another unattended preparation worker already owns this VM.'}
    if(Test-Path -LiteralPath $labPrivatePath){throw 'Private preparation folder already exists; refusing to overwrite credentials or install media.'}
    if(-not(Test-Path -LiteralPath $labVBox -PathType Leaf)){throw 'VirtualBox is not installed.'}
    foreach($labSource in @($labIsoPath,$labTemplatePath,$labPostPath,$labDiskPath,$labAdditionsIso)){if(-not(Test-Path -LiteralPath $labSource -PathType Leaf)){throw ('Required lab input is unavailable: '+$labSource)}}
    if((Get-Item -LiteralPath $labIsoPath).Length -ne $labProfile.Bytes){throw 'ISO size differs from the verified download profile.'}
    $labIsoHash=(Get-FileHash -LiteralPath $labIsoPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if($labProfile.Sha256 -and $labIsoHash -ne $labProfile.Sha256){throw 'Client ISO does not match the Microsoft-published SHA-256.'}
    if($Role -eq 'server' -and $EditionName -notmatch '(?i)^Windows Server 2022 .*\(Desktop Experience\)(?: \([^)]*\))?$'){throw 'Select an exact detected Windows Server 2022 Desktop Experience edition name, never Core.'}
    if($Role -eq 'client' -and $EditionName -notmatch '(?i)^Windows 11 Enterprise'){throw 'Select an exact detected Windows 11 Enterprise edition name.'}
    $labInfo=Assert-LabVmIsolation
    if($labInfo['SATA-1-0'] -notin @('emptydrive',$labIsoPath)){throw 'Unexpected DVD is attached; refusing to replace it.'}
    if((Get-Item -LiteralPath $labDiskPath).Length -gt 4MB){throw 'VDI is no longer an empty new disk; refusing an unattended wipe.'}
    $labMedium=@(& $labVBox showmediuminfo disk $labProfile.DiskUuid 2>&1)
    if($LASTEXITCODE -ne 0){throw 'Cannot inspect the dedicated VDI.'}
    $labMediumText=$labMedium -join "`n"
    if($labMediumText -notmatch '(?m)^Storage format:\s+VDI\s*$' -or $labMediumText -notmatch '(?m)^Format variant:\s+dynamic default\s*$' -or $labMediumText -notmatch '(?m)^Parent UUID:\s+base\s*$' -or $labMediumText -notmatch ('(?m)^Capacity:\s+'+$labProfile.DiskMB+' MBytes\s*$')){throw 'Only the original empty dynamic base VDI is allowed; no raw disks/differencing images.'}
    $labUnexpectedDisks=@($labInfo.Keys | Where-Object {$_ -match '-ImageUUID-\d+-\d+$' -and $_ -notin @('SATA-ImageUUID-0-0','SATA-ImageUUID-1-0')})
    if($labUnexpectedDisks.Count -gt 0){throw 'Unexpected additional attached media detected; inspect before unattended installation.'}

    # Protect the new folder BEFORE writing credentials or generated answer files.
    [void](New-Item -ItemType Directory -Path $labPrivatePath)
    $labSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $labAcl=New-Object Security.AccessControl.DirectorySecurity
    $labAcl.SetAccessRuleProtection($true,$false)
    $labAcl.SetOwner($labSid)
    foreach($labPrincipal in @($labSid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){
        $labRule=New-Object Security.AccessControl.FileSystemAccessRule($labPrincipal,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        [void]$labAcl.AddAccessRule($labRule)
    }
    Set-Acl -LiteralPath $labPrivatePath -AclObject $labAcl
    $labDetectLines=Invoke-LabVBoxPrivate -Arguments @('unattended','detect',('--iso='+$labIsoPath),'--machine-readable') -LogName 'iso-detect.log'
    $labImages=@(foreach($labLine in $labDetectLines){
        if($labLine -match '^ImageIndex(\d+)="(.*)"$'){[pscustomobject]@{Index=[int]$Matches[1];Name=$Matches[2].Replace('\"','"')}}
    })
    $labSelected=@($labImages | Where-Object {$_.Name -ceq $EditionName})
    if($labSelected.Count -ne 1){throw 'The required exact edition was not detected uniquely. See private iso-detect.log; no unattended install was prepared.'}
    $labImageIndex=$labSelected[0].Index
    if($labImageIndex -lt 1){throw 'Detected image index is invalid.'}
    $labRandom=New-Object byte[] 24
    $labRng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$labRng.GetBytes($labRandom)}finally{$labRng.Dispose()}
    $labGuestPassword='Aa9!'+([BitConverter]::ToString($labRandom).Replace('-',''))
    [IO.File]::WriteAllText($labPasswordPath,$labGuestPassword,(New-Object Text.UTF8Encoding($false)))
    $labGuestPassword=$null
    $labAuxPrefix=Join-Path $labPrivatePath 'Unattended-'
    $labArguments=@('unattended','install',$labProfile.Uuid,('--iso='+$labIsoPath),'--user=Administrator',('--user-password-file='+$labPasswordPath),('--admin-password-file='+$labPasswordPath),('--hostname='+$labProfile.HostName),'--locale=en_US','--language=en-US','--time-zone=Asia/Bangkok',('--image-index='+$labImageIndex),('--script-template='+$labTemplatePath),('--post-install-template='+$labPostPath),('--auxiliary-base-path='+$labAuxPrefix),'--install-additions',('--additions-iso='+$labAdditionsIso),'--no-install-txs','--start-vm=none')
    [void](Invoke-LabVBoxPrivate -Arguments $labArguments -LogName 'unattended-prepare.log')
    $labAnswerFiles=@(Get-ChildItem -LiteralPath $labPrivatePath -File -Filter '*.xml')
    if($labAnswerFiles.Count -ne 1){throw 'Expected exactly one generated answer XML; inspect privately before boot.'}
    $labAnswerText=Get-Content -LiteralPath $labAnswerFiles[0].FullName -Raw
    if($labAnswerText -match '@@VBOX_|LabConfig|Bypass(?:CPU|RAM|SecureBoot|Storage|TPM)Check'){throw 'Unresolved tokens or hardware-check bypass detected; do not boot.'}
    [xml]$labAnswerXml=$labAnswerText
    $labNs=New-Object Xml.XmlNamespaceManager($labAnswerXml.NameTable)
    $labNs.AddNamespace('u','urn:schemas-microsoft-com:unattend')
    $labAutoLogons=$labAnswerXml.SelectNodes('//u:AutoLogon',$labNs)
    if($labAutoLogons.Count -ne 1 -or $labAutoLogons[0].LogonCount -ne '1' -or $labAutoLogons[0].Username -ne 'Administrator'){throw 'Generated answer file must have one counted Administrator autologon.'}
    if($labAnswerXml.SelectSingleNode('//u:ComputerName',$labNs).InnerText -ine ($labProfile.HostName.Split('.')[0])){throw 'Generated guest hostname differs from the lab profile.'}
    $labGeneratedPost=@(Get-ChildItem -LiteralPath $labPrivatePath -File | Where-Object {$_.Name -match '(?i)vboxpost.*\.cmd$'})
    if($labGeneratedPost.Count -ne 1){throw 'Expected generated postinstall script was not found; do not boot.'}
    $labGeneratedPostText=Get-Content -LiteralPath $labGeneratedPost[0].FullName -Raw
    if($labGeneratedPostText -match '@@VBOX_' -or $labGeneratedPostText -notmatch 'AutoAdminLogon /t REG_SZ /d 0' -or $labGeneratedPostText -notmatch 'DefaultPassword AutoLogonCount ForceAutoLogon'){throw 'Postinstall autologon cleanup was not preserved; do not boot.'}
    [void](Assert-LabVmIsolation)
    $labSummary=[ordered]@{schemaVersion=1;kind='supportlab-unattended-preparation';createdAt=[DateTime]::UtcNow.ToString('o');role=$Role;vm=$labProfile.Name;uuid=$labProfile.Uuid;edition=$labSelected[0].Name;imageIndex=$labImageIndex;isoSha256=$labIsoHash;independentHashComparison=$(if($labProfile.Sha256){'match'}else{'not-available-server-source-is-microsoft-https'});status='prepared-not-booted';vmStarted=$false;windowsInstalled=$false;guestLabConfigured=$false;warning='Preparation is not proof of successful Windows installation or Guest Additions execution.'}
    $labSummary | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $labPrivatePath 'preparation.json') -Encoding UTF8
    Write-Output ('Prepared '+$labProfile.Name+' image #'+$labImageIndex+' ('+$labSelected[0].Name+'). VM remains off; private credentials/media are not printed. Review before boot.')
} catch {
    # Do not include native output or generated answer content in a public error.
    throw ('Lab unattended preparation stopped: '+$_.Exception.Message)
} finally {
    if($labOwnsMutex){$labMutex.ReleaseMutex()}
    $labMutex.Dispose()
}
