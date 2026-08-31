"use client";

/**
 * 서비스 워커 등록 (작업 순서 9번)
 *
 * 워커 자체는 아무것도 캐시하지 않는다. 등록해두는 이유는 하나 —
 * **설치돼야 공유 시트에 뜨기 때문이다.** 안드로이드 크롬은 manifest 와
 * fetch 를 듣는 워커가 둘 다 있어야 설치를 권한다 (public/sw.js).
 */

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 화면 그리기를 방해하지 않게 로드가 끝난 뒤에 붙인다.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록이 안 돼도 앱은 그대로 돌아간다. 공유 시트만 못 쓴다.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
