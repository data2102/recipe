/**
 * PWA 설치 정보 + 공유 대상 (작업 순서 9번)
 *
 * 완료 판단은 "인스타 공유 시트에 앱이 뜬다". 그게 이 제품의 핵심 유입
 * 경로다 — 인스타·유튜브를 보다가 공유 버튼으로 바로 넘길 수 있어야
 * 레시피가 쌓인다 (지시서 7장).
 *
 * 안드로이드 PWA 는 Web Share Target 을 지원해서 네이티브 앱 없이도
 * 공유 시트에 뜬다. **설치된 뒤에만 뜬다** — 브라우저 탭으로 열어둔
 * 상태로는 안 나온다. 홈 화면에 추가해야 한다.
 * iOS 는 공유 대상을 지원하지 않는다. v1 타겟이 아니다.
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "오늘 뭐 먹지",
    short_name: "오늘뭐먹지",
    description:
      "모아둔 레시피에서 이번 주 먹을 걸 정하고 장보기 목록을 뽑는다.",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // 여백 디자인 시스템 토큰과 같은 값 (--bg 의 밝은 쪽).
    // 매니페스트는 **설치할 때 한 번** 읽히는 값이라 한 색만 쓸 수 있다 —
    // 어두운 모드까지 따라가는 건 layout.tsx 의 viewport.themeColor 다
    // (거기서 prefers-color-scheme 으로 갈라 준다). 여기 값은 실행 중에
    // 덮인다. 밝은 쪽 값을 적어둔다.
    background_color: "#f2f4f6",
    theme_color: "#f2f4f6",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // 런처가 동그랗게든 각지게든 잘라도 안 깨지게 안전영역을 둔 판
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    /**
     * 공유 시트에서 받은 것을 /share 로 POST 한다.
     *
     * multipart 로 받는 이유: 캡처(파일)까지 받아야 하기 때문이다.
     * 인스타는 링크로 본문을 못 읽으니 캡처 경로가 본진이다 (지시서 4장).
     * 링크만 공유해도 title/text/url 로 들어온다.
     */
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "images",
            accept: ["image/png", "image/jpeg", "image/webp"],
          },
        ],
      },
    },
  };
}
