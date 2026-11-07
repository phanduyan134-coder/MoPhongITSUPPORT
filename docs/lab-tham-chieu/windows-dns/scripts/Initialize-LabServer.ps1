# Run as Administrator INSIDE SRV-01 only, after Windows Server installation.
# Refuses host/other-guest configuration, existing foreign DNS zones/sites, and
# unrelated network settings. No AD/domain, gateway, DHCP or host settings.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Assert-LabGuest.ps1')
$context = Assert-LabGuest -Role server -AllowUnconfiguredNetwork
$features = @(Get-WindowsFeature -Name DNS, Web-Server)
if ($features.Count -ne 2) { throw 'The expected Windows Server DNS/IIS features are unavailable.' }

# Read existing services before any configuration change. A stopped existing
# DNS server is not silently reset by this initializer.
$dnsFeature = $features | Where-Object { $_.Name -eq 'DNS' }
if ($dnsFeature.Installed) {
    if ((Get-Service -Name DNS).Status -ne 'Running') {
        throw 'Existing DNS service is stopped. Inspect it inside SRV-01 before re-running setup; this initializer is not a repair script.'
    }
    $zones = @(Get-DnsServerZone)
    $foreignZones = @($zones | Where-Object { -not $_.IsAutoCreated -and $_.ZoneName -notin @('lab.test', 'TrustAnchors') })
    if ($foreignZones.Count -gt 0) { throw 'Refusing: unrelated DNS zones already exist in this guest.' }
    $labZone = @($zones | Where-Object { $_.ZoneName -eq 'lab.test' })
    if ($labZone.Count -gt 0) {
        if ($labZone[0].ZoneType -ne 'Primary' -or $labZone[0].IsDsIntegrated -or $labZone[0].IsReverseLookupZone) {
            throw 'Existing lab.test must be a standalone forward primary zone.'
        }
        $portalRecords = @(Get-DnsServerResourceRecord -ZoneName 'lab.test' | Where-Object { $_.HostName -eq 'portal' })
        if (@($portalRecords | Where-Object { $_.RecordType -ne 'A' -or [string]$_.RecordData.IPv4Address -ne '192.168.10.10' }).Count -gt 0 -or $portalRecords.Count -gt 1) {
            throw 'Existing portal record differs from the lab baseline. Inspect it; this script will not overwrite it.'
        }
    }
}

$webFeature = $features | Where-Object { $_.Name -eq 'Web-Server' }
if ($webFeature.Installed) {
    Import-Module WebAdministration
    $sites = @(Get-Website)
    if ($sites.Count -ne 1 -or $sites[0].Name -ne 'Default Web Site') {
        throw 'Refusing: existing IIS sites differ from the fresh default site.'
    }
    $bindings = @($sites[0].Bindings.Collection)
    if ($bindings.Count -ne 1 -or $bindings[0].protocol -ne 'http' -or $bindings[0].bindingInformation -ne '*:80:') {
        throw 'Refusing: existing IIS binding differs from the default HTTP port 80 baseline.'
    }
    $expectedWebPath = [IO.Path]::GetFullPath((Join-Path $env:SystemDrive 'inetpub\wwwroot'))
    $actualWebPath = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables([string]$sites[0].physicalPath))
    if ($sites[0].applicationPool -ne 'DefaultAppPool' -or $actualWebPath -ne $expectedWebPath) {
        throw 'Refusing: the default website uses a custom application pool or content path.'
    }
}

$firewallSpecs = @(
    @{Name='SupportLab-DNS-ICMPv4'; Protocol='ICMPv4'; IcmpType=8},
    @{Name='SupportLab-DNS-HTTP'; Protocol='TCP'; LocalPort=80},
    @{Name='SupportLab-DNS-UDP'; Protocol='UDP'; LocalPort=53},
    @{Name='SupportLab-DNS-TCP'; Protocol='TCP'; LocalPort=53}
)
$firewallMarker = 'SupportLab isolated guest DNS reference lab.'
foreach ($spec in $firewallSpecs) {
    $rules = @(Get-NetFirewallRule -Name $spec.Name -ErrorAction SilentlyContinue)
    if ($rules.Count -gt 1 -or ($rules.Count -eq 1 -and $rules[0].Description -ne $firewallMarker)) {
        throw ('Refusing to replace an unrelated firewall rule: ' + $spec.Name)
    }
}

# Mutations start only after every identity and existing-config preflight.
$missing = @($features | Where-Object { -not $_.Installed } | ForEach-Object { $_.Name })
if ($missing.Count -gt 0) {
    $installation = Install-WindowsFeature -Name $missing -IncludeManagementTools
    if (-not $installation.Success) { throw 'DNS/IIS feature installation did not succeed.' }
    if ([string]$installation.RestartNeeded -eq 'Yes') {
        throw 'Guest reboot required after feature installation. Reboot SRV-01 only, then run this script again.'
    }
}

$adapterIndex = $context.Adapter.ifIndex
Set-NetIPInterface -InterfaceIndex $adapterIndex -AddressFamily IPv4 -Dhcp Disabled
$apipaAddresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceIndex -eq $adapterIndex -and $_.IPAddress -match '^169\.254\.' })
foreach ($address in $apipaAddresses) {
    Remove-NetIPAddress -InputObject $address -Confirm:$false
}
$existingAddress = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceIndex -eq $adapterIndex -and $_.IPAddress -eq $context.ExpectedIp })
if ($existingAddress.Count -eq 0) {
    New-NetIPAddress -InterfaceIndex $adapterIndex -AddressFamily IPv4 -IPAddress $context.ExpectedIp -PrefixLength 24 | Out-Null
}
Set-DnsClientServerAddress -InterfaceIndex $adapterIndex -ServerAddresses $context.ExpectedDns
Start-Service -Name DNS
if (-not @(Get-DnsServerZone | Where-Object { $_.ZoneName -eq 'lab.test' }).Count) {
    Add-DnsServerPrimaryZone -Name 'lab.test' -ZoneFile 'lab.test.dns' -DynamicUpdate None
}
if (-not @(Get-DnsServerResourceRecord -ZoneName 'lab.test' | Where-Object { $_.HostName -eq 'portal' }).Count) {
    Add-DnsServerResourceRecordA -ZoneName 'lab.test' -Name 'portal' -IPv4Address $context.ExpectedIp
}

Import-Module WebAdministration
Start-Service -Name W3SVC
if ((Get-WebAppPoolState -Name 'DefaultAppPool').Value -ne 'Started') {
    Start-WebAppPool -Name 'DefaultAppPool'
}
if ((Get-Website -Name 'Default Web Site').State -ne 'Started') {
    Start-Website -Name 'Default Web Site'
}

foreach ($spec in $firewallSpecs) {
    $ruleArguments = @{
        Name = $spec.Name
        DisplayName = $spec.Name
        Description = $firewallMarker
        Direction = 'Inbound'
        Action = 'Allow'
        Profile = 'Any'
        Enabled = 'True'
        RemoteAddress = '192.168.10.0/24'
        LocalAddress = $context.ExpectedIp
        Protocol = $spec.Protocol
    }
    if ($spec.ContainsKey('LocalPort')) { $ruleArguments.LocalPort = $spec.LocalPort }
    if ($spec.ContainsKey('IcmpType')) { $ruleArguments.IcmpType = $spec.IcmpType }
    # Only rules carrying the exact lab marker may be restored. Role-created
    # Windows rules and every other firewall setting are left as installed.
    if (@(Get-NetFirewallRule -Name $spec.Name -ErrorAction SilentlyContinue).Count -eq 0) {
        New-NetFirewallRule @ruleArguments | Out-Null
    } else {
        $ruleArguments.Remove('DisplayName')
        Set-NetFirewallRule @ruleArguments | Out-Null
    }
}
Clear-DnsClientCache
$verified = Assert-LabGuest -Role server

[pscustomobject]@{
    Stage = 'guest-dns-iis-initialized'
    ComputerName = $verified.ComputerName
    IPv4 = $verified.ExpectedIp
    PrefixLength = 24
    Dns = $verified.ExpectedDns
    Gateway = $null
    Zone = 'lab.test'
    ARecord = 'portal.lab.test -> 192.168.10.10'
    DnsService = [string](Get-Service -Name DNS).Status
    ReferenceExperiment = 'not-run'
}
