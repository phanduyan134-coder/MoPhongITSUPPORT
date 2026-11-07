# Run as Administrator INSIDE CLIENT-01 only, after Windows installation.
# This does not rename the guest or connect it to the Internet.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Assert-LabGuest.ps1')
$context = Assert-LabGuest -Role client -AllowUnconfiguredNetwork

# All read-only identity/network checks above must succeed before mutations.
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
Clear-DnsClientCache
$verified = Assert-LabGuest -Role client

[pscustomobject]@{
    Stage = 'guest-network-initialized'
    ComputerName = $verified.ComputerName
    IPv4 = $verified.ExpectedIp
    PrefixLength = 24
    Dns = $verified.ExpectedDns
    Gateway = $null
    ReferenceExperiment = 'not-run'
}
