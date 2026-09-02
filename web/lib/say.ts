/**
 * 말하듯 쓰기 (지시서 5장)
 *
 * "68일" 이 아니라 "68일 전에 만들었어요". 숫자만 던지고 해석을 사용자에게
 * 넘기지 않는다. 판정("오래됨")도 하지 않는다 — 근거만 말한다 (원칙 ③).
 */

/**
 * 이만큼 지나야 "오랜만에 어때요" 에 나온다.
 * 그 전에는 아직 질리지 않았고, 넘으면 슬슬 생각날 때다.
 */
export const SUGGEST_AFTER_DAYS = 30;

/**
 * 60일 넘게 안 만든 것은 글자색을 warm 으로. 배지는 쓰지 않는다 (지시서 5장).
 *
 * 나오는 기준(30일)과 눈에 띄는 기준(60일)은 다르다 — 30일에 목록에
 * 올라오고, 60일을 넘기면 "이건 진짜 오래됐다" 로 한 번 더 표시된다.
 */
export const OLD_DAYS = 60;

/**
 * 이 앱의 시계는 한국이다.
 *
 * 서버는 UTC 로 돈다 (Vercel·Supabase 둘 다). 그냥 두면 한국 새벽 0~9시에
 * "오늘" 이 어제가 돼서, 밤에 만들고 체크한 게 **어제 만든 것으로 기록된다.**
 *
 * **날짜를 만들어 적는 곳만** 이 기준을 쓴다. "며칠 지났나" 같은 비교는
 * 몇 시간 어긋나도 30일·60일 문턱이 바뀌지 않아서 CURRENT_DATE 로 둔다 —
 * 쓸 때 틀리는 것과 셀 때 몇 시간 이른 것은 무게가 다르다.
 */
export const TZ = "Asia/Seoul";

export function daysSince(isoDate: string | null, today = new Date()): number | null {
  if (!isoDate) return null;
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = Date.parse(`${todayInput(today)}T00:00:00Z`);
  return Math.round((now - then) / 86_400_000);
}

export function cookedAgo(isoDate: string | null, today = new Date()): string {
  const days = daysSince(isoDate, today);
  if (days === null) return "아직 안 만들어봤어요";
  if (days <= 0) return "오늘 만들었어요";
  if (days === 1) return "어제 만들었어요";
  return `${days}일 전에 만들었어요`;
}

/** 재료 요약. 없으면 링크를 보라고 안내한다 (지시서 3장 탭 1) */
export function ingredientSummary(
  names: string[],
  hasLink: boolean,
): string {
  if (names.length > 0) return names.join(" · ");
  return hasLink ? "재료는 링크에서 확인해요" : "재료는 아직 안 넣었어요";
}

/**
 * `<input type="date">` 에 넣을 오늘 날짜 — **한국 기준**.
 *
 * 서버에서 그려지는 값이라 서버 시계(UTC)를 그대로 쓰면 안 된다.
 * sv-SE 로케일이 `YYYY-MM-DD` 를 준다.
 */
export function todayInput(today = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(today);
}
