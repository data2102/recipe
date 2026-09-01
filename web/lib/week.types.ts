/**
 * 이번 주 식단이 쓰는 모양만. **DB 를 끌고 오지 않는다.**
 * (lib/shopping.types.ts 와 같은 이유 — 서버 전용 코드가 번들에 실리면 안 된다)
 */

/** 0=월 … 6=일. NULL 은 "아직 안 정함" */
export const DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export type PlannedItem = {
  /** recipe_ingredient.id */
  id: number;
  /** 사용자가 올린 그 표기 그대로 (원칙 ①) */
  raw_name: string;
  raw_qty: string | null;
  ingredient_id: number | null;
  /** 'A 또는 B' 중 하나. 같은 값끼리 한 묶음이다 */
  choice_group: string | null;
};

export type Planned = {
  recipe_id: number;
  title: string;
  status: string;
  /** 0~6, 아직 안 정했으면 null */
  day: number | null;
  items: PlannedItem[];
};
