/**
 * GET /api/recipes — 메뉴 고르기 화면
 *
 * 목록을 통째로 준다. 정렬도 검색도 **폰에서 한다** — 그게 웹 화면이
 * 이미 하는 일이고 (`app/recipes/page.tsx` 가 `recipeCatalog()` 한 번으로
 * 받아 `lib/recipe-sort.ts` 로 가른다), 그 정렬 코드는 순수 층이라
 * 네이티브로 **그대로 옮겨진다.** 서버에 `?sort=` 를 만들면 같은 규칙이
 * 두 벌이 된다.
 *
 * 레시피가 수천 개가 되면 그때 나눈다. 지금은 쓰는 사람이 둘이다.
 *
 * `days` · `placed` 는 담을 때 뜨는 날짜 고르기 창이 쓴다 (`pickable`).
 * 열나흘과 그날 이미 담긴 메뉴를 같이 준다 — **빈 날을 찾으려고 여는
 * 창이라** 날짜만 늘어놓으면 소용이 없다.
 */

import { NextResponse } from "next/server";
import { allow } from "@/lib/api/guard";
import { counts, recipeCatalog } from "@/lib/recipes";
import { pickable } from "@/lib/week";
import { todayInput } from "@/lib/say";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  try {
    const [recipes, pick, n] = await Promise.all([
      recipeCatalog(),
      pickable(),
      counts(),
    ]);

    return NextResponse.json({
      today: todayInput(),
      recipes,
      /** 몇 개나 있나 — 빈 화면 문구가 쓴다 */
      counts: n,
      /** 날짜 고르기 창: 열나흘 + 그날의 메모 + 그날 담긴 메뉴 */
      days: pick.days,
      /** 레시피 id -> 이미 담긴 날짜들. 줄에 "화요일에 담김" 을 적는다 */
      placed: pick.placed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "레시피를 못 읽었어요" },
      { status: 500 },
    );
  }
}
