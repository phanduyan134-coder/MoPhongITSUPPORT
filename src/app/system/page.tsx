import { Suspense } from "react";
import { SystemLauncher } from "@/components/system-launcher";

export default function SystemPage() { return <Suspense fallback={<main className="sh-page" />}><SystemLauncher /></Suspense>; }
