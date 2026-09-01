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

export function daysSince(isoDate: string | null, today = new Date()): number | null {
  if (!isoDate) return null;
  const then = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return null;
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((now - then.getTime()) / 86_400_000);
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

/** <input type="date"> 에 넣을 오늘 날짜 (로컬 기준) */
export function todayInput(today = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
