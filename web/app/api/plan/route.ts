/**
 * GET /api/plan — 식단 화면이 필요한 것 한 번에
 *
 * 네이티브 앱이 쓰는 문이다 (lib/api/guard.ts). 웹 화면은 이 문을 안 쓴다 —
 * 서버가 직접 그린다 (app/page.tsx). **그래서 로직을 두 벌로 쓰지 않는다:**
 * 둘 다 `lib/week.ts` 의 같은 함수를 부른다. 화면만 다르고 SQL 은 하나다.
 *
 * 열나흘을 한 번에 준다. 폰에서 날짜마다 따로 물으면 왕복이 열넷이다.
 */

import { NextResponse } from "next/server";
import { allow } from "@/lib/api/guard";
import { notes } from "@/lib/notes";
import { exclusions } from "@/lib/shopping";
import { horizon } from "@/lib/week";
import { todayInput } from "@/lib/say";
import { NO_HAVE } from "@/lib/fridge.types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  try {
    const weeks = await horizon();
    const dates = weeks.flatMap((w) => w.dates);
    const [note, ...have] = await Promise.all([
      notes(dates[0], dates[dates.length - 1]),
      ...weeks.map((w) => exclusions(w.listId)),
    ]);

    return NextResponse.json({
      // 오늘을 서버가 말해준다. 폰 시계가 틀어져 있어도 앱의 시계는
      // 한국 기준 하나다 (lib/say.ts TZ).
      today: todayInput(),
      days: dates.map((iso, i) => ({
        date: iso,
        week: i < 7 ? "this" : "next",
        note: note[iso] ?? "",
      })),
      dishes: weeks.flatMap((w) =>
        w.plan.map((p) => ({
          recipeId: p.recipe_id,
          title: p.title,
          week: w.which,
          date: p.plannedOn,
          past: p.past,
          cooked: p.cooked,
          items: p.items,
        })),
      ),
      excluded: { this: have[0] ?? NO_HAVE, next: have[1] ?? NO_HAVE },
    });
  } catch (e) {
    // 무엇이 잘못됐는지 적는다 — "그냥 안 됐어요" 로는 못 고친다
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "식단을 못 읽었어요" },
      { status: 500 },
    );
  }
}
