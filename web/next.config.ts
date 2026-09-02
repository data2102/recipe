import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * 서버 액션 본문 제한. 기본값은 1MB 인데 **캡처 한 장이 그걸 넘는다** —
     * 넘으면 파싱 실패가 아니라 413 으로 화면이 통째로 죽는다.
     *
     * 진짜 해결은 폰에서 줄여 보내는 것이고 (web/lib/frames.ts), 이건
     * 안전망이다. 무한정 올리지 않는다 — 서버리스 요청 본문에도 한도가
     * 있어서 (Vercel 4.5MB) 여기만 키워봐야 그 앞에서 막힌다.
     */
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
