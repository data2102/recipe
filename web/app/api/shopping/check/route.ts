/**
 * POST /api/shopping/check — 샀어요 / 잘못 눌렀어요
 *
 * `{ label, checked, week? }`
 *
 * **구매 기록이 생기는 자리는 앱 전체에서 이 체크 하나다** (CLAUDE.md).
 * 그 규칙을 API 에서도 깨지 않으려고 `shopping.toggle` 을 그대로 부른다 —
 * 여기서 `purchase` 에 직접 INSERT 하면 기록이 생기는 자리가 둘이 되고,
 * "N일 전에 샀어요" 가 틀렸을 때 어디를 봐야 할지 알 수 없게 된다.
 *
 * 날짜는 한국 기준으로 적힌다 (toggle 안의 `Asia/Seoul`). 폰 시계를 안 쓴다.
 *
 * 되돌리면 **이 목록의 기록만** 지운다 (`CHECKOFF:<목록>:<재료>`).
 * 영수증이나 다른 주의 기록은 살아남는다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { toggle, type Which } from "@/lib/shopping";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label) return bad("어느 재료인지 알려주세요");
  if (typeof input.checked !== "boolean") {
    return bad("샀는지 아닌지 알려주세요 (checked)");
  }
  const week: Which = input.week === "next" ? "next" : "this";

  try {
    await toggle(label, input.checked, week);
    /*
      앱이 뭘 그려야 하는지 그대로 돌려준다. 마트에서는 연달아 집으니
      응답으로 목록을 통째로 주면 그 사이 누른 다른 줄을 덮어쓴다 —
      **누른 줄 하나만** 말한다 (Shopping.tsx 의 줄 단위 잠금과 같은 이유).
    */
    return NextResponse.json({ label, checked: input.checked, week });
  } catch (e) {
    return oops(e, "체크를 저장 못 했어요");
  }
}
