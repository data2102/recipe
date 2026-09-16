import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import RegisterSW from "./RegisterSW";
import TabBar from "./TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘 뭐 먹지",
  description: "모아둔 레시피에서 이번 주 먹을 걸 정하고 장보기 목록을 뽑는다.",
  // 홈 화면에 추가했을 때 브라우저 껍데기 없이 뜨게 한다
  appleWebApp: {
    capable: true,
    title: "오늘뭐먹지",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  /*
   * 밝은 쪽이 기본이고, 폰이 어둡게 쓰고 있으면 따라간다
   * (globals.css 의 ⑥). **앱 안에 스위치는 없다** — 폰 설정이 스위치다.
   */
  colorScheme: "light dark",
  /*
   * 안드로이드 주소창·상태표시줄 색. `--bg` 와 같은 값이라야 화면 위쪽에
   * 띠가 안 생긴다. 어두울 때 값을 안 주면 밝은 회색 띠가 그대로 남는다.
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1117" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        {children}
        {/* 아래 탭바. 주소를 읽으니 Suspense 안에 둔다 */}
        <Suspense fallback={null}>
          <TabBar />
        </Suspense>
        <RegisterSW />
      </body>
    </html>
  );
}
