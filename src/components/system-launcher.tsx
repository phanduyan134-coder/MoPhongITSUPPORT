"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SystemLab } from "./system-lab";

let entrySequence = 0;

function SimulationEntry({ preset, guide, desktop }: { preset: string; guide: string; desktop: boolean }) {
  const [launchId] = useState(() => `entry-${Date.now()}-${++entrySequence}`);
  return <SystemLab initialPreset={preset} initialGuide={guide} initialDesktop={desktop} initialLaunchId={launchId} />;
}

export function SystemLauncher() {
  const params = useSearchParams();
  const preset = params.get("preset") || "healthy";
  const guide = params.get("guide") || "";
  const desktop = params.get("workspace") !== "classic";
  return <SimulationEntry key={`${preset}:${guide}:${desktop}`} preset={preset} guide={guide} desktop={desktop} />;
}
