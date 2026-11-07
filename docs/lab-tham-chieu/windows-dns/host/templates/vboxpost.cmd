@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem SupportLab guest-only first-logon steps. Never log the environment/password.
rem Read-only identity guard prevents accidental execution on the physical laptop.
powershell.exe -NoLogo -NoProfile -Command "$c=Get-CimInstance Win32_ComputerSystem; $p=Get-CimInstance Win32_ComputerSystemProduct; $ok=($c.Model -eq 'VirtualBox') -and (-not $c.PartOfDomain) -and ((($p.UUID -eq '4e8381f2-bfdc-4c70-928b-d526e5df3c6e') -and ($c.Name -eq 'SRV-01')) -or (($p.UUID -eq '92b2f409-bff1-475d-a864-9d0daa2b996a') -and ($c.Name -eq 'CLIENT-01'))); if(-not $ok){exit 1}" >nul 2>&1
if errorlevel 1 exit /b 9
rem Disable autologon BEFORE any optional work, including Guest Additions.
reg.exe add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v AutoAdminLogon /t REG_SZ /d 0 /f >nul 2>&1
if errorlevel 1 exit /b 10
for %%V in (DefaultPassword AutoLogonCount ForceAutoLogon) do reg.exe delete "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v %%V /f >nul 2>&1
if not exist C:\SupportLab\setup mkdir C:\SupportLab\setup
set "LAB_LOG=C:\SupportLab\setup\postinstall.log"
echo SupportLab postinstall started; autologon disabled.>"%LAB_LOG%"
set "LAB_GA="
for %%D in (D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
  if exist %%D:\VBoxWindowsAdditions.exe set "LAB_GA=%%D:"
  if exist %%D:\vboxadditions\VBoxWindowsAdditions.exe set "LAB_GA=%%D:\vboxadditions"
)
if not defined LAB_GA (
  echo Guest Additions media not found.>>"%LAB_LOG%"
  exit /b 20
)
if not exist "%LAB_GA%\cert\VBoxCertUtil.exe" (
  echo Guest Additions certificate utility not found.>>"%LAB_LOG%"
  exit /b 21
)
"%LAB_GA%\cert\VBoxCertUtil.exe" add-trusted-publisher "%LAB_GA%\cert\vbox*.cer" --root "%LAB_GA%\cert\vbox*.cer" >>"%LAB_LOG%" 2>&1
if errorlevel 1 (
  echo Guest Additions certificate preparation failed.>>"%LAB_LOG%"
  exit /b 22
)
start "" /wait "%LAB_GA%\VBoxWindowsAdditions.exe" /S
set "LAB_GA_EXIT=%ERRORLEVEL%"
echo Guest Additions installer exit code: %LAB_GA_EXIT%>>"%LAB_LOG%"
if not "%LAB_GA_EXIT%"=="0" if not "%LAB_GA_EXIT%"=="3010" exit /b 23
sc.exe query VBoxService >nul 2>&1
if errorlevel 1 (
  echo Guest Additions Windows service not found.>>"%LAB_LOG%"
  exit /b 24
)
sc.exe start VBoxService >>"%LAB_LOG%" 2>&1
echo Guest Additions installed. Reboot the guest before lab configuration.>C:\SupportLab\setup\guest-additions-installed.txt
echo SupportLab postinstall finished.>>"%LAB_LOG%"
exit /b 0
