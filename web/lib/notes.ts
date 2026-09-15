/**
 * 그날의 메모 — "저녁 약속 있어요"
 *
 * 식단을 짜다 보면 **못 먹는 날**이 생긴다. 미리 잡힌 약속이거나 갑자기
 * 생긴 일이거나. 그 날짜에 한 줄 적어두면, 메뉴를 담지 않은 빈칸이
 * "아직 안 정했다" 가 아니라 "여기는 안 정해도 된다" 가 된다.
 *
 * **주가 아니라 날짜에 붙는다** (db/schema.sql 7번 절). 주가 넘어가도
 * "9월 16일에 회식이었다" 는 그대로 남는다.
 *
 * 저장은 사람이 적은 그대로다 (원칙 ①). 앱이 해석하지 않는다 — "약속"
 * 이라는 단어가 들어갔는지 세지 않고, 그날 추천을 막지도 않는다.
 * 사람이 보고 사람이 정한다.
 */

import { query } from "./db";
import { NOTE_MAX, type DayNote } from "./notes.types";

export type { DayNote };

/** `from`~`to`(포함) 사이의 메모. 날짜 -> 적어둔 말 */
export async function notes(
  from: string,
  to: string,
): Promise<Record<string, string>> {
  const rows = await query<DayNote>(
    `SELECT on_date::text AS on_date, note
       FROM day_note
      WHERE on_date BETWEEN $1::date AND $2::date
      ORDER BY on_date`,
    [from, to],
  );
  return Object.fromEntries(rows.map((r) => [r.on_date, r.note]));
}

/**
 * 메모를 적는다. **빈 값이면 지운다** — 빈 메모를 남겨두면 "약속이
 * 없다" 와 "아직 안 적었다" 가 같은 행으로 남아 구별할 수가 없다.
 */
export async function setNote(onDate: string, note: string): Promise<void> {
  const text = note.trim().slice(0, NOTE_MAX);
  if (!text) {
    await query(`DELETE FROM day_note WHERE on_date = $1::date`, [onDate]);
    return;
  }
  await query(
    `INSERT INTO day_note (on_date, note) VALUES ($1::date, $2)
     ON CONFLICT (on_date)
     DO UPDATE SET note = EXCLUDED.note, updated_at = now()`,
    [onDate, text],
  );
}
