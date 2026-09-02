/**
 * 말하듯 쓰기 (지시서 5장)
 *
 * "68일" 이 아니라 "68일 전에 만들었어요". 숫자만 던지고 해석을 사용자에게
 * 넘기지 않는다. 판정("오래됨")도 하지 않는다 — 근거만 말한다 (원칙 ③).
 */

import { DAYS } from "./week.types";

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

/*
 * 날짜를 날짜로 말하기
 *
 * "이번 주 / 다음 주" 는 **며칠인지를 안 알려준다.** 화요일에 담아둔 게
 * 이번 주 화요일인지 다음 주 화요일인지 화면만 봐서는 알 수가 없어서,
 * 사용자가 "실제로 몇일껀지 더 헷갈려" 라고 했다. 그래서 요일 옆에
 * 날짜를 같이 적는다.
 *
 * **날짜는 전부 `YYYY-MM-DD` 문자열로 들고 다닌다.** Date 로 바꿔 넘기면
 * 시간대가 따라붙어서 서버(UTC)와 폰(한국) 사이에서 하루씩 밀린다.
 * 문자열로 세고 문자열로 돌려준다 — 아래 셈은 전부 정오가 아니라 UTC
 * 자정 기준이라 여름시간 같은 것도 안 탄다.
 */

/** n 일 뒤 (음수면 앞). `YYYY-MM-DD` 그대로 */
export function addDays(isoDate: string, n: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(t)) return isoDate;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0=월 … 6=일. `DAYS` 와 같은 순서다 (lib/week.types.ts) */
export function dayIndex(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0=일
  return Number.isNaN(d) ? 0 : (d + 6) % 7;
}

/**
 * 시작일부터 n 일치 날짜.
 *
 * **요일 순서가 아니라 날짜 순서다.** 목록이 수요일에 열렸으면 그 주는
 * 수·목·금·토·일·월·화다 — 이 앱의 한 주는 달력 주가 아니라 목록이
 * 열린 날부터 이레이기 때문이다 (lib/shopping.ts finish).
 */
export function daysFrom(startIso: string, n = 7): string[] {
  return Array.from({ length: n }, (_, i) => addDays(startIso, i));
}

/** "8/31" — 칸이 좁을 때 */
export function dateTiny(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return m && d ? `${m}/${d}` : "";
}

/** "8월 31일" */
export function dateSay(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return m && d ? `${m}월 ${d}일` : "";
}

/** "8월 31일(월)" — 사용자가 부르는 이름 */
export function dateFull(isoDate: string): string {
  const say = dateSay(isoDate);
  return say ? `${say}(${DAYS[dayIndex(isoDate)]})` : "";
}

/** "8월 31일 ~ 9월 6일" */
export function dateRange(from: string, to: string): string {
  if (!dateSay(from)) return "";
  return from === to ? dateSay(from) : `${dateSay(from)} ~ ${dateSay(to)}`;
}
