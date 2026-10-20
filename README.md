# SupportLab

Web simulator for exploring PC configuration, Windows installation and IT Support troubleshooting. Next.js App Router, TypeScript, Tailwind, Lucide and Zustand.

## Run

```sh
npm install
npm run dev
```

Open the Local URL printed in the terminal, normally http://127.0.0.1:3000. Next.js uses another available port if 3000 is occupied. Requires Node.js 20.9 or newer.

Development uses `.next-dev`, production builds use `.next`, and browser tests use `.next-e2e` so their generated files do not overwrite each other.

## Simulator

- Start with a healthy Windows installation, or create a blank PC that is powered off with an empty SSD and no installation USB attached.
- Switch between the desktop, BIOS, Windows installer, network configuration and simulated CMD views.
- Attach or detach the Windows installation USB, power the PC on or off, and restart it.
- Select a device from the one-time boot menu without changing the BIOS boot order.
- Change Secure Boot, TPM, UEFI/Legacy, VMD and storage-driver settings, prepare GPT partitions and install Windows on the simulated SSD.
- Prepare a simulated driver package through download, extraction and USB copy, then browse the virtual USB and select a compatible storage controller in Windows Setup.
- Change the client's IP address, gateway and DNS, or the router's DHCP service, then observe the effects through simulated CMD commands.

The simulator is open ended: you choose the configuration and operations, and the shared state determines the resulting behavior. The Zustand store contains firmware, disk, network, USB and power state together with session data and an action log. Network behavior and boot results are derived in `src/lib/engine.ts`. Starting a new session clears the simulated PC, action history and chat after confirmation. Refreshing clears session data.

## Guided Windows installation

Choose "Huong dan" ("Hướng dẫn làm cùng") in the simulator header for optional, state-aware guidance through the current Windows installation simulation. The guide observes the PC rather than advancing through manually checked tasks: USB, UEFI/Secure Boot/TPM, one-time USB boot, driver preparation and selection when VMD hides the SSD, GPT preparation, installation, SSD boot and USB removal. Changing an earlier setting or restarting Setup updates the recommendation accordingly.

"Chỉ vị trí thao tác" opens the appropriate view or boot menu and focuses the relevant control, but does not operate the PC. You perform each action yourself and can close the guide at any point. "Vì sao cần bước này?" explains the technical reason and real-device caveats. The guide works locally without an AI key; it is separate from the optional technical assistant.

An existing Windows installation is not treated as a completed guided installation. Choose to reinstall on the current PC, or create a blank PC through the existing new-session confirmation. Enabling guidance never formats or resets the PC. Disk preparation still requires explicit confirmation. A new session resets installation intent while preserving whether guidance is enabled. The separate handbook remains the reference for procedures beyond what is simulated; guidance does not add real Windows setup, OOBE or model-specific firmware.

## Storage driver preparation

Open "Chuẩn bị driver" in the simulator controls. The dialog contains a real-device reference procedure and a separate simulated support-PC workspace. The reference explains how to identify the exact model or Service Tag/Product Number, CPU, storage controller, Windows version and architecture; find the official package; extract it as the manufacturer directs; and copy the matching `.inf`, `.sys` and `.cat` files with their folder structure. If the target PC has no working OS or Internet, use another working online PC. Create the bootable Windows USB before copying the driver folder to `Drivers/Storage`, or use a second readable USB. Creating or formatting the USB again erases the copied files. The USB stores files for Setup to read; a driver is not installed onto the USB.

The ASUS, Dell, HP and motherboard choices open existing official support portals. They do not find a package automatically, validate a model or change the simulated hardware. Section names such as chipset, storage, SATA, RAID or IRST vary by vendor. A matching storage-controller driver may be needed when firmware sees the SSD but Windows Setup cannot; it is not required for every SSD, ASUS device or Intel platform. AMD and ARM devices require their own supported packages and procedures. An EXE package needs the manufacturer's documented extraction method, not an invented universal command or execution from the Load driver screen.

For the simulated Intel VMD x64 PC:

1. Select "Gói Intel VMD x64" and choose "Tải gói mô phỏng", then "Giải nén gói".
2. Connect the simulated installation USB and choose "Chép vào USB". An unextracted package cannot be copied through this workflow.
3. With Windows Setup running and the SSD hidden, choose "Nạp driver Intel VMD", then "Browse". Select `E:\Drivers\Storage`, confirm the folder and select "Intel VMD Controller (x64)".
4. Choose "Nạp driver" to make the simulated SSD visible, then continue disk preparation and installation. Loading the driver does not format the SSD.

The Ethernet sample is incompatible with the storage controller; revealing incompatible entries does not allow loading it. The virtual browser only searches the selected folder and does not recurse into subfolders. Its drive letter `E:` and all filenames, including `vmd-controller.inf`, are illustrative rather than verified vendor filenames or a required path on a real PC. The simulator uses fixed package identifiers for compatibility, not INF parsing, hardware IDs or digital-signature checks. Downloads, extraction and USB copy update local state only: no real package is fetched, archive unpacked, USB accessed or driver executed. Opening an official support link is a separate browser action.

Copied packages remain on the virtual USB when it is disconnected. A driver loaded into Setup is temporary and must be loaded again after restarting Setup; a storage driver included by a successful simulated Windows installation is tracked separately. A new session or page refresh clears the simulated packages and support workspace. Wi-Fi/LAN drivers for Windows or its initial setup are separate from storage drivers and are not installed by this feature. These instructions and portals do not establish model-specific verification; check the exact device documentation before applying them to hardware.

## Network troubleshooting guidance

In "Hướng dẫn làm cùng", choose "Kiểm tra và xử lý mạng". The guide first asks for `ipconfig /all`, then explains IP, gateway, DNS or DHCP problems in the current virtual PC. With valid settings, it walks through router reachability (`ping 192.168.1.1`), the internal server (`ping 192.168.1.10`), an external IP (`ping 8.8.8.8`) and name resolution (`nslookup example.com`). These are local simulated commands, not real probes.

"Chỉ vị trí thao tác" focuses CMD, the affected network setting or the router DHCP switch without executing a command or applying a configuration. Editing a network field is only a draft until "Áp dụng cấu hình" is selected. Old observations are discarded when network settings, DHCP availability or power changes, after a reboot, or when a new session starts. The terminal retains its prior results as history, but they do not validate the new configuration. Switching guide content preserves the PC and the Windows guide's installation intent.

DHCP recovery distinguishes a stopped server, an unusable client address and an existing lease that still works. Restarting DHCP does not silently renew the client; `ipconfig /renew` is a separate user action. A PC without Windows offers a switch to installation guidance rather than fabricating network checks. No fault injection, assignments, scoring or automatic repair is added. The fixed network model and its limits still apply; this does not simulate physical cabling or Wi-Fi.

## AI support

Local technical explanations work without credentials. To enable the OpenAI read-only tool loop, create `.env.local` using `.env.example` as the template, set `SUPPORTLAB_AI_ENABLED=true`, supply `OPENAI_API_KEY` and an accessible Responses-compatible `OPENAI_MODEL`, then restart the server. `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`. No model is selected automatically.

The technical assistant explains the current configuration, the effects of operations and possible causes of problems. The server validates snapshots with Zod. Its two tools inspect the virtual PC and recent actions/CMD results. The model cannot mutate the PC or execute shell commands. Calls are capped at four model requests and 30 seconds per answer, with a process-wide limit of 30 requests per minute. Provider errors are shown explicitly. Keys stay server-side. Local explanations and OpenAI responses are labeled separately. See the [official Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create/).

## Verification

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E tests use port 3100 with an isolated `.next-e2e` output directory and local technical explanations. Screenshots are generated in `output/screenshots`.

## Windows installation handbook

Open `/handbook` or choose "Sổ tay cài Windows" in the sidebar. Select Dell, ASUS laptop, HP, or a custom PC motherboard vendor. The guide branches between a clean USB installation and reinstalling from running Windows while retaining files/apps. It covers device identification, backup and BitLocker, USB media, one-time boot, storage drivers, partitions, driver installation and handover checks. The print button prints the entire selected procedure. Checkmarks are personal notes, not automated validation, and reset on device/mode changes or refresh. Entering a model does not fetch or verify its manual.

Profiles are general vendor guidance, not model-specific BIOS replicas. ASUS F2 entry and Microsoft's Windows 11 download page were consulted on 2026-10-19. Dell's article returned HTTP 403 and HP's article timed out; their key sequences and motherboard shortcuts are common conventions, not newly verified model-level claims. Follow the linked official support portals to verify the exact model/revision/firmware. The simulator remains generic and simplified; adding this handbook does not make its firmware or partition behavior hardware-accurate.

## ASUS profiles

Choose ASUS in the handbook to search initial records for X515EA, FA506NC, X1504VA, UX3405MA, D500ME and PRIME B760M-A WIFI D4. Laptop, prebuilt desktop and retail motherboard guidance is separate. Exact, case-insensitive model matching preserves suffixes; unknown models fall back to the selected device group without claiming model-specific validation. CPU platform is selected manually and resets when the model changes. Intel guidance is conditional on the controller and OS, AMD excludes Intel drivers, and ARM uses an ARM64-specific USB preparation path.

`src/lib/asus-profiles.ts` contains the catalog, reference provenance and procedure verification levels (`general`, `documented`, `tested`). All six initial records are currently `general`. The X515EA and FA506NC manual landing pages were opened on 2026-10-19 to confirm their identities only; their manuals, firmware, driver configurations and installations have not been validated. Other model links are explicitly marked unchecked. No physical ASUS device has been tested. Source-page availability never promotes a procedure to verified. To record a documented/tested procedure, supply precise firmware, Windows version, date and scope in `procedureEvidence`, and attach the relevant sources before changing its level.

ASUS FAQ 1044458 was consulted on 2026-10-19 for general storage-driver applicability. It distinguishes Intel platforms and Windows versions; the application does not infer IRST requirements from a model string or require Intel drivers on every device. ASUS boot-menu FAQ 1030858 returned 404, so no new verified boot-menu claim was added. This catalog is extensible, not an exhaustive ASUS model database. All data remains local to the session; no automatic model lookup or hardware detection is performed.

## Simulator limitations

This is a research prototype, not an emulator, hypervisor, Windows distribution or real installer. Installation is an immediate state transition, not an actual file copy. The virtual network is fixed to `192.168.1.0/24`; router `.1`, internal server `.10`, DHCP lease `.50`. Known DNS resolvers are `.1`, `1.1.1.1`, `8.8.8.8`; domains are `example.com` and `uit.edu.vn` with fixed illustrative records. No real network traffic or system commands are performed by CMD. `help` lists supported commands. IPv4 connectivity and DNS resolution are separate checks.

The requested partition schema permits only FAT32/NTFS. MSR therefore stores an NTFS placeholder but is displayed without a filesystem; a real MSR is unformatted. Automatic GPT preparation resets all simulated partitions. No arbitrary partition editor, Office setup, hardware repair or camera configuration is included.

Agent state comes from browser-provided snapshots. This local prototype has a process-wide rate budget but no accounts, durable sessions or distributed rate limiting. Public deployment requires appropriate access controls and resource limits. External AI is optional and has not been used by the automated tests.
