/**
 * GET    /api/recipes/:id — 만드는 법까지 (레시피 상세)
 * PATCH  /api/recipes/:id — 고친다
 * DELETE /api/recipes/:id — 지운다
 *
 * 캡처로 넣은 레시피는 원본 링크가 없다. 이 화면이 없으면 만드는 법을
 * 저장해두고도 못 읽는다.
 *
 * 지우는 일은 `recipes.remove` 한 군데다 — "별로였어요" 도 "지울게요" 도
 * 거기로 간다. CASCADE 가 안 걸린 `shopping_list_recipe` 를 먼저 떼는
 * 순서까지 그 안에 있다. **되돌릴 수 없으니 화면이 한 번 더 물어야 한다** —
 * 그건 앱이 할 일이고, 여기서는 막지 않는다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { detail, edit, remove, type EditItem } from "@/lib/recipes";
import { attachTarget, list as listPhotos } from "@/lib/photos";
import { pickable } from "@/lib/week";

export const dynamic = "force-dynamic";

function idOf(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const id = idOf((await ctx.params).id);
  if (id === null) return bad("레시피를 못 찾겠어요");

  try {
    /*
      **한 화면에 한 번 왕복.** 상세 화면은 레시피만으로 안 그려진다 —
      담긴 날짜(담기 버튼), 사진, 사진이 붙을 조리 기록까지 있어야
      한 장이 완성된다. 폰에서 넷을 따로 물으면 화면이 네 번 덜컹인다.
      웹 화면도 같은 넷을 한 번에 가져온다 (app/recipe/[id]/page.tsx).
    */
    const [found, photos, attach, dates] = await Promise.all([
      detail(id),
      listPhotos(id),
      attachTarget(id),
      pickable(),
    ]);
    if (!found) {
      return NextResponse.json(
        { error: "없는 레시피예요. 지웠을 수도 있어요" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ...found,
      /** 사진은 `/photo/<조리기록 id>` 로 받는다 — 저장 경로는 안 나간다 */
      photos,
      /**
       * 사진을 올리면 **이 날짜에 붙는다.** 미리 말해줘야 한다 —
       * 버튼을 누르고 나서 "어제 만든 걸로 기록됐어요" 는 늦다.
       * null 이면 오늘 기록이 새로 생긴다.
       */
      attachesTo: attach?.cooked_on ?? null,
      /** 담기 버튼이 쓸 것 — 열나흘과 이 레시피가 이미 잡힌 자리 */
      days: dates.days,
      placed: dates.placed[id] ?? [],
    });
  } catch (e) {
    return oops(e, "레시피를 못 읽었어요");
  }
}

/**
 * 고친다. `{ title, items[], steps[] }`
 *
 * **사전 대조는 서버가 다시 한다** (`recipes.edit`). 그래서 `ingredient_id`
 * 는 받지도 않는다 — 앱이 보낸 걸 믿으면 이름을 고쳤을 때 붙는 재료가
 * 어긋나고 장보기 합산이 틀어진다. 웹 화면도 같은 함수를 부른다.
 *
 * 재료 행은 통째로 갈아끼운다. 조리 기록·사진·원본은 안 건드린다.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const id = idOf((await ctx.params).id);
  if (id === null) return bad("레시피를 못 찾겠어요");

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const raw = Array.isArray(input.items) ? input.items : null;
  if (!raw) return bad("재료를 보내주세요");

  const ORIGINS = ["LIST", "BODY", "USER"];
  const items: EditItem[] = raw.map((r) => {
    const it = (r ?? {}) as Record<string, unknown>;
    const origin = String(it.origin ?? "USER");
    return {
      raw_name: String(it.raw_name ?? ""),
      raw_qty: it.raw_qty ? String(it.raw_qty) : null,
      section: it.section ? String(it.section) : null,
      origin: (ORIGINS.includes(origin)
        ? origin
        : "USER") as EditItem["origin"],
      choice_group: it.choice_group ? String(it.choice_group) : null,
      confirmed: it.confirmed !== false,
    };
  });

  try {
    await edit(id, {
      title: String(input.title ?? ""),
      items,
      steps: Array.isArray(input.steps) ? input.steps.map((x) => String(x)) : [],
    });
    return NextResponse.json({ id, saved: true });
  } catch (e) {
    /*
      "재료가 하나도 없어요" 처럼 **요청이 틀린 것**은 400 이다.
      날것의 DB 오류를 흘리지 않는다 (제약 이름은 스키마만 샌다).
    */
    const why = e instanceof Error ? e.message : "";
    if (/재료가 하나도 없어요|레시피를 못 찾았어요/.test(why)) return bad(why);
    return oops(e, "고치지 못했어요");
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const id = idOf((await ctx.params).id);
  if (id === null) return bad("레시피를 못 찾겠어요");

  try {
    await remove(id);
    // 없는 것을 지워도 결과는 같다 — 없다. 폰이 두 번 보내도 탈이 없게.
    return NextResponse.json({ id, removed: true });
  } catch (e) {
    return oops(e, "지우지 못했어요");
  }
}
