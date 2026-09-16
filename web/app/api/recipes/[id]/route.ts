/**
 * GET    /api/recipes/:id — 만드는 법까지 (레시피 상세)
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
import { allow, bad } from "@/lib/api/guard";
import { detail, remove } from "@/lib/recipes";

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
    const found = await detail(id);
    if (!found) {
      return NextResponse.json(
        { error: "없는 레시피예요. 지웠을 수도 있어요" },
        { status: 404 },
      );
    }
    return NextResponse.json(found);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "레시피를 못 읽었어요" },
      { status: 500 },
    );
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "지우지 못했어요" },
      { status: 500 },
    );
  }
}
