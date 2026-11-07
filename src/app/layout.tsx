import type { Metadata } from "next";
import "./globals.css";
import "./system-lab.css";
import "./simulation-home.css";
import "./device-desktop.css";
export const metadata: Metadata = { title: "SupportLab | Mô phỏng hệ thống CNTT", description: "Phòng mô phỏng Windows Server, DNS, DHCP, IIS và chẩn đoán sự cố hệ thống trên Web." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
