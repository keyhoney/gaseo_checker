import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "가서 체커 - 1단계",
  description: "플랫폼/URL 입력 및 검증 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
