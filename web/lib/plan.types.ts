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
