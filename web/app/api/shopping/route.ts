/**
 * GET /api/shopping?week=this|next — 마트에서 여는 화면이 필요한 것 한 번에
 *
 * 네이티브로 제일 먼저 옮길 화면이다. 마트에서는 신호가 나쁘고 손이
 * 하나라, 왕복이 적을수록 좋다 — **합친 목록과 요리별 보기를 같이 준다.**
 * 둘은 같은 항목을 다르게 늘어놓을 뿐이라 따로 물으면 두 번 세게 된다.
 *
 * 웹 화면(app/shopping/page.tsx)과 **같은 함수를 부른다.** SQL 은 한 벌이다.
 *
 * `week` 는 여기서만 앱이 정한다 — 장보기는 주 단위로 보는 화면이라
 * "다음 주 것도 미리 볼래요" 가 있어야 한다. **담을 때와 다르다:**
 * 담기는 날짜가 주를 정하니 앱이 보낸 주를 안 믿는다 (api/plan/date).
 */

import { NextResponse } from "next/server";
import { allow } from "@/lib/api/guard";
import {
  groups as recipeGroups,
  items as shoppingItems,
  openList,
  picked as pickedRecipes,
  weekStart,
  type Which,
} from "@/lib/shopping";
import { daysFrom } from "@/lib/say";
import { week as weekOf } from "@/lib/weeks";
import { remaining } from "@/lib/shopping.types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const asked = new URL(request.url).searchParams.get("week");
  const which: Which = asked === "next" ? "next" : "this";

  try {
    const listId = await openList(false, which);
    const dates = daysFrom(weekStart(which));

    const [basket, cart, groups, seen] = await Promise.all([
      pickedRecipes(listId),
      shoppingItems(listId),
      recipeGroups(listId),
      weekOf(listId),
    ]);

    return NextResponse.json({
      week: which,
      /** 그 주 월요일 ~ 일요일. 요리별 보기가 요일을 날짜로 바꿀 때 쓴다 */
      dates,
      /** 장을 다 봤나. 끝냈어도 담은 요리와 요일은 그대로 남는다 */
      closed: seen?.closed_on ?? null,
      /** 아직 살 것 몇 개 — 화면 머리말이 쓰는 값. 세는 규칙은 한 군데 */
      left: remaining(cart),
      items: cart,
      groups,
      /** 담긴 요리. 재료가 아직 안 붙었을 때 빈 화면 문구를 가른다 */
      picked: basket,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "장보기를 못 읽었어요" },
      { status: 500 },
    );
  }
}
