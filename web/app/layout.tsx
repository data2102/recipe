import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘 뭐 먹지",
  description: "모아둔 레시피에서 이번 주 먹을 걸 정하고 장보기 목록을 뽑는다.",
};

export const viewport: Viewport = {
  // 라이트가 기본이다 (지시서 5장). 다크는 모니터링 도구용이라 안 쓴다.
  colorScheme: "light",
  themeColor: "#f2f4f6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
