/**
 * GET /api/youtube?q=… — 유튜브에서 레시피 찾기
 *
 * `?id=` 를 주면 그 영상 하나의 설명란을 읽어 재료 후보를 돌려준다.
 *
 * **키는 서버에만 있다** (`YOUTUBE_API_KEY`). 앱에 실으면 번들을 뜯는
 * 누구나 우리 할당량을 쓴다 — 그래서 앱이 이 문을 거친다. 이게 "화면은
 * 쉬운데 API 경로가 없다" 던 자리다 (CLAUDE.md).
 *
 * **자막은 안 건드린다.** 공식 경로는 영상 주인만 되고 비공식 경로는
 * 지시서 4장이 금지한 것이다 — 설명란까지다.
 *
 * 웹 화면(`app/youtube/page.tsx`)과 **같은 함수**를 부른다. 화면만 다르고
 * 찾는 규칙은 하나다.
 */

import { NextResponse } from "next/server";
import { allow, bad } from "@/lib/api/guard";
import { searchYoutube, youtubeRecipe } from "@/lib/youtube-search";

export const dynamic = "force-dynamic";

/** 유튜브가 느릴 때가 있다 (검색 + 상세로 두 번 간다) */
export const maxDuration = 30;

export async function GET(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();

  try {
    if (id) {
      if (!/^[\w-]{11}$/.test(id)) return bad("영상을 못 찾겠어요");
      return NextResponse.json({ ok: true, video: await youtubeRecipe(id) });
    }
    if (!q) return bad("무엇을 찾을지 적어주세요");
    return NextResponse.json({
      ok: true,
      ...(await searchYoutube(q, url.searchParams.get("page") ?? "")),
    });
  } catch (e) {
    /*
      **실패도 값으로 돌려준다** — `/api/ingest` 와 같은 규칙이다.
      `lib/youtube-search.ts` 가 던지는 건 전부 **사람한테 할 말**이다
      ("한도를 확인해주세요", "설명란에서 재료를 못 찾았어요"). 그건
      고장이 아니라 답이라서, 500 으로 감싸면 앱이 그 말을 버리고
      "막혔어요" 만 내게 된다.

      키가 없는 것도 여기로 온다 — 그 문장도 사람한테 할 말이다.
    */
    return NextResponse.json({
      ok: false,
      message:
        e instanceof Error ? e.message : "유튜브를 찾다가 막혔어요.",
    });
  }
}
