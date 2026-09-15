/**
 * 그날의 메모가 쓰는 모양만. **DB 를 끌고 오지 않는다.**
 * (lib/shopping.types.ts 와 같은 이유 — 서버 전용 코드가 번들에 실리면 안 된다)
 */

/** 한 줄이 길어지면 화면이 무너진다. 메모지 한 줄만큼만 받는다 */
export const NOTE_MAX = 120;

export type DayNote = { on_date: string; note: string };
