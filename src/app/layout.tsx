import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SupportLab | IT Support Simulator", description: "Mô phỏng máy tính, cài đặt hệ thống và cấu hình mạng trên Web." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
