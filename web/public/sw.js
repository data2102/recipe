// 서비스 워커 — 설치되기 위한 최소한 (작업 순서 9번)
//
// 안드로이드 크롬이 "홈 화면에 추가"를 띄우려면 manifest 말고도 fetch 를
// 듣는 서비스 워커가 있어야 한다. 그리고 **설치돼야 공유 시트에 뜬다.**
// 그게 이 파일이 있는 유일한 이유다.
//
// 캐싱은 하지 않는다. 이 앱의 화면은 전부 서버에서 그때그때 그린다
// (레시피 목록, 장보기 상태). 캐시해두면 마트에서 어제 목록을 본다.
// 오프라인 대응이 필요해지면 그때 따로 설계한다.

const VERSION = "v1";

self.addEventListener("install", () => {
  // 새 워커가 바로 일하게 한다. 버전이 갈려서 옛 화면이 남지 않게.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 이전에 캐시를 쓴 적이 있다면 정리한다.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== VERSION).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// 그냥 통과시킨다. 이 핸들러가 있어야 설치 가능으로 쳐준다.
self.addEventListener("fetch", (event) => {
  // 공유 시트에서 오는 POST /share 는 절대 건드리지 않는다.
  // 여기서 잡으면 multipart 본문이 서버까지 안 간다.
  if (event.request.method !== "GET") return;
  return;
});
