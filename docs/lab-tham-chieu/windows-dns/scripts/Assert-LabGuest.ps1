# Read-only preflight for these two specific VirtualBox guests.
# Dot-sourcing this file only defines the function; it changes no settings.
function Assert-LabGuest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('server', 'client')]
        [string]$Role,
        [switch]$AllowUnconfiguredNetwork
    )

    $ErrorActionPreference = 'Stop'
    $computer = Get-CimInstance -ClassName Win32_ComputerSystem
    $product = Get-CimInstance -ClassName Win32_ComputerSystemProduct
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    if ($computer.Model -ne 'VirtualBox' -or $computer.Manufacturer -notmatch '^(?:innotek GmbH|Oracle(?: Corporation)?)$') {
        throw 'Refusing: this is not an Oracle VirtualBox guest. No lab configuration was changed.'
    }
    if ($computer.PartOfDomain) {
        throw 'Refusing: this lab requires a standalone Workgroup guest, not a domain member.'
    }

    $profiles = @{
        server = @{Name = 'SRV-01'; Uuid = '4e8381f2-bfdc-4c70-928b-d526e5df3c6e'; Ip = '192.168.10.10'}
        client = @{Name = 'CLIENT-01'; Uuid = '92b2f409-bff1-475d-a864-9d0daa2b996a'; Ip = '192.168.10.100'}
    }
    $profile = $profiles[$Role]
    if ([string]$product.UUID -ne $profile.Uuid) {
        throw ('Refusing: guest UUID does not match ' + $Role + '. Verify VBoxManage showvminfo on the host and the guest UUID before updating this lab profile; never bypass this check on the laptop.')
    }
    if ($computer.Name -ne $profile.Name) {
        throw ('Refusing: expected guest hostname ' + $profile.Name + '. Set the intended name INSIDE the correct VM and reboot the guest first. This script does not rename computers.')
    }
    if ($Role -eq 'server' -and ([int]$os.ProductType -eq 1 -or [int]$os.BuildNumber -ne 20348)) {
        throw 'Refusing: the server profile expects Windows Server 2022 (build 20348).'
    }
    if ($Role -eq 'client' -and ([int]$os.ProductType -ne 1 -or [int]$os.BuildNumber -lt 22000)) {
        throw 'Refusing: the client profile expects Windows 11.'
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Open PowerShell as Administrator INSIDE the intended lab VM. Do not run this on the laptop.'
    }

    $adapters = @(Get-NetAdapter -Physical -IncludeHidden)
    if ($adapters.Count -ne 1 -or [int]$adapters[0].InterfaceType -ne 6 -or $adapters[0].Status -ne 'Up') {
        throw 'Refusing: exactly one connected Ethernet adapter is required. Remove extra/NAT adapters from the VM and keep only Internal Network SupportLab-DNS.'
    }
    $adapter = $adapters[0]
    $defaultRoutes = @(Get-NetRoute -AddressFamily IPv4 | Where-Object { $_.DestinationPrefix -eq '0.0.0.0/0' })
    if ($defaultRoutes.Count -gt 0) {
        throw 'Refusing: an IPv4 default route exists. Disconnect temporary guest NAT and remove guest gateways before the isolated DNS lab.'
    }
    # A guest cannot prove the host-side adapter mode. Check Internal Network
    # SupportLab-DNS in VirtualBox separately; no gateway alone is not proof.
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceIndex -eq $adapter.ifIndex })
    foreach ($address in $addresses) {
        $isExpected = $address.IPAddress -eq $profile.Ip -and $address.PrefixLength -eq 24
        $isApipa = $AllowUnconfiguredNetwork -and $address.IPAddress -match '^169\.254\.'
        if (-not $isExpected -and -not $isApipa) {
            throw ('Refusing unrelated IPv4 configuration on the guest Ethernet adapter: ' + $address.IPAddress + '/' + $address.PrefixLength)
        }
    }
    $dnsConfig = Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4
    $dnsServers = @($dnsConfig.ServerAddresses)
    if (@($dnsServers | Where-Object { $_ -ne '192.168.10.10' -and -not ($AllowUnconfiguredNetwork -and $_ -eq '127.0.0.1') }).Count -gt 0) {
        throw 'Refusing unrelated guest DNS settings. Only the lab DNS address (or pre-setup local loopback) is accepted.'
    }
    if (-not $AllowUnconfiguredNetwork) {
        $ipInterface = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4
        if ($addresses.Count -ne 1 -or $addresses[0].IPAddress -ne $profile.Ip -or $addresses[0].PrefixLength -ne 24 -or
            [string]$ipInterface.Dhcp -ne 'Disabled' -or $dnsServers.Count -ne 1 -or $dnsServers[0] -ne '192.168.10.10') {
            throw 'Guest lab network is not initialized: require the expected static IPv4/24, DHCP disabled, one DNS server 192.168.10.10 and no gateway.'
        }
    }

    [pscustomobject]@{
        Role = $Role
        ComputerName = [string]$computer.Name
        ComputerUuid = [string]$product.UUID
        ExpectedIp = [string]$profile.Ip
        ExpectedDns = '192.168.10.10'
        SubnetPrefix = 24
        Adapter = $adapter
        OperatingSystem = $os
    }
}
