/**
 * API 문지기 — **토큰 없이는 안 연다**
 *
 * 왜 이게 필요한가
 * ----------------
 * 이 앱에는 로그인이 없다 (지시서 7장). 그게 안전했던 이유는 **서버만 DB 에
 * 붙기 때문**이다 — 브라우저는 Server Component 가 그려준 화면만 받고,
 * Supabase REST 는 `db/policy.sql` 이 RLS 를 켜고 정책을 0개로 둬서 닫혀
 * 있다. 밖에서 들어올 문이 아예 없었다.
 *
 * 네이티브 앱은 그 전제를 깬다. 폰은 Postgres 에 직접 못 붙으니 (접속
 * 문자열이 기기에 실린다) HTTP 문을 내야 하는데, **그 문을 그냥 열면
 * 주소만 아는 누구나 남의 레시피를 읽고 지운다.**
 *
 * 그래서 최소한을 둔다: 공유 비밀 하나. 로그인을 만드는 게 아니라
 * **지금 있는 보호를 잃지 않으려는** 것이다.
 *
 * 닫힌 채로 실패한다 (fail closed)
 * --------------------------------
 * `APP_API_TOKEN` 이 없으면 **API 전체가 거부한다.** 설정을 깜빡한 배포가
 * 조용히 열려 있는 것보다, 시끄럽게 막히는 쪽이 낫다. 웹 화면은 이 문을
 * 안 쓰므로 (서버가 직접 그린다) 토큰이 없어도 앱은 멀쩡히 돈다.
 *
 * v2 에서 로그인이 생기면 여기가 그 자리다.
 */

import { NextResponse } from "next/server";

/** 몇 글자는 돼야 한다. 짧은 비밀은 없는 것과 같다 */
const MIN_TOKEN = 24;

export type Denied = { ok: false; response: NextResponse };
export type Allowed = { ok: true };

function no(status: number, message: string): Denied {
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status }),
  };
}

/**
 * 길이가 같든 다르든 **같은 시간**을 쓴다.
 *
 * `a === b` 는 첫 글자가 다르면 바로 끝난다. 그 시간 차이를 재면 한 글자씩
 * 맞춰볼 수 있다. 쓰는 사람이 둘뿐인 앱에 과한 걱정 같지만, 맞게 쓰는
 * 비용이 몇 줄이라 그냥 맞게 쓴다.
 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 이 요청을 받아도 되나.
 *
 * ```ts
 * const gate = allow(request);
 * if (!gate.ok) return gate.response;
 * ```
 */
export function allow(request: Request): Allowed | Denied {
  const secret = process.env.APP_API_TOKEN ?? "";

  if (secret.length < MIN_TOKEN) {
    // 설정이 안 된 것이지 요청이 잘못된 게 아니다. 그렇게 말해준다.
    return no(503, "API 가 아직 안 열렸어요 (APP_API_TOKEN 이 필요해요)");
  }

  const sent = request.headers.get("authorization") ?? "";
  const [scheme, ...rest] = sent.split(" ");
  if (scheme.toLowerCase() !== "bearer" || rest.length === 0) {
    return no(401, "토큰이 필요해요");
  }

  return sameSecret(rest.join(" "), secret)
    ? { ok: true }
    : no(401, "토큰이 안 맞아요");
}

/**
 * 몸통을 JSON 으로 읽는다. 아니면 거절한다.
 *
 * 화면이 보낸 걸 그대로 믿지 않는다 — 여기서 걸러도 각 경로가 값을 다시
 * 확인한다 (날짜가 어느 주인지는 서버가 정한다 같은 규칙, actions.ts).
 */
export async function body(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 잘못된 요청 — 무엇이 잘못됐는지 적는다 (원칙 ③) */
export function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
