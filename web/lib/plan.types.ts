/**
 * 담기 화면이 쓰는 모양만. **DB 를 끌고 오지 않는다.**
 * (lib/shopping.types.ts 와 같은 이유 — 서버 전용 코드가 번들에 실리면 안 된다)
 */

/** 이번 주 / 다음 주. lib/shopping.ts 의 Which 와 같은 값이다 */
export type Which = "this" | "next";

/** 날짜를 고르는 자리에 늘어놓을 하루 */
export type PickDay = {
  iso: string;
  which: Which;
  /** 그날 적어둔 말 ("저녁 약속"). 없으면 빈 문자열 */
  note: string;
  /** 그날 이미 담긴 메뉴 이름 */
  titles: string[];
};

/** 요리 하나가 담겨 있는 자리. `date` 가 null 이면 날짜 미정 */
export type Placement = { date: string | null; which: Which };

/**
 * 담긴 자리 여럿 중 **화면에 적을 하나** — 마지막 날짜다.
 *
 * 한 주에 같은 요리를 여러 날짜에 담을 수 있게 되면서 (2026-09-19)
 * 자리가 여럿일 수 있는데, 카드 한 줄에 다 적으면 요리 이름보다 길어진다.
 * 쓰는 사람이 정한 것이다: "표시는 마지막 날짜만".
 *
 * **`placed[0]` 을 쓰지 마라.** 순서는 어느 화면이 만들었느냐에 따라
 * 달라서, 9/16 과 9/21 에 담긴 요리가 화면마다 다른 날짜를 말하게 된다.
 * 날짜 없는 자리(미정)만 있으면 그중 첫 줄이다 — 미정은 주마다 하나뿐이다.
 */
export function lastPlaced(placed: Placement[]): Placement | null {
  if (placed.length === 0) return null;
  const dated = placed.filter((p) => p.date);
  if (!dated.length) return placed[0];
  return dated.reduce((a, b) => (a.date! > b.date! ? a : b));
}
