/**
 * 노션 `DB_레시피 목록` 에서 옮겨온 본문.
 *
 * `recipes.json` 은 손으로 받아 적은 게 아니라 노션 페이지 본문을 그대로
 * 옮긴 것이다. 재료·양념·만드는 법을 나눠 적어두지 않고 **글 한 덩어리로**
 * 둔다 — 나누는 건 파서가 할 일이고, 여기서 미리 나누면 파서를 안 거친
 * 결과가 DB 에 들어간다.
 *
 * 본문이 캡처뿐인 레시피는 `text` 가 null 이다. 그건 캡처로 올려야 한다.
 *
 * `"use server"` 파일에서는 함수 말고 다른 걸 내보낼 수 없어서 여기 둔다.
 */

import recipes from "./recipes.json";

export type Source = {
  title: string;
  notionUrl: string;
  /** 노션의 "상태". 괜찮았다 -> GOOD. 나머지는 저장 기본값(WISH) */
  status: string | null;
  /** 노션 본문. 캡처뿐이면 null */
  text: string | null;
  note?: string;
};

export type ImportResult =
  | { ok: true; title: string; recipeId: number; skipped: boolean; items: number }
  | { ok: false; title: string; message: string };

export const SOURCES = recipes as Source[];
