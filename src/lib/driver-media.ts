export const driverPackageIds = ["intel-vmd-x64", "ethernet-x64"] as const;
export type DriverPackageId = (typeof driverPackageIds)[number];
export type DriverWorkspace = { packageId: DriverPackageId | null; stage: "empty" | "downloaded" | "extracted" };

export const driverPackages: Record<DriverPackageId, {
  id: DriverPackageId; name: string; controller: string; architecture: "x64"; files: string[];
}> = {
  "intel-vmd-x64": {
    id: "intel-vmd-x64", name: "Gói Intel VMD x64", controller: "Intel VMD Controller (x64)", architecture: "x64",
    files: ["vmd-controller.inf", "vmd-controller.sys", "vmd-controller.cat"],
  },
  "ethernet-x64": {
    id: "ethernet-x64", name: "Gói Ethernet x64", controller: "Ethernet Adapter (x64)", architecture: "x64",
    files: ["ethernet.inf", "ethernet.sys", "ethernet.cat"],
  },
};
