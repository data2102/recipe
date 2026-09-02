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

/**
 * 문장이 아니라 **때만** 말할 때. "어제 만든 것으로 붙여요" 처럼
 * 다른 말 안에 들어가는 자리다 — cookedAgo 는 그 자체로 문장이라
 * 안에 넣으면 "어제 만들었어요 에 만든 것" 이 된다.
 */
export function whenShort(isoDate: string, today = new Date()): string {
  const days = daysSince(isoDate, today);
  if (days === null) return "";
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

/**
 * "9월 1주차" — 지난 주를 부르는 이름.
 *
 * ISO 주차(연 기준 38주차)는 사람이 못 알아본다. 달 안에서 몇 번째
 * 주인지가 "언제였더라" 에 답한다.
 */
export function monthWeek(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  if (!m || !d) return "";
  return `${m}월 ${Math.floor((d - 1) / 7) + 1}주차`;
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
