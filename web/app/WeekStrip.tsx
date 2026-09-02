"use client";

/**
 * 그 주 한눈에 — 날짜 일곱 칸
 *
 * 세로로 늘어놓은 목록은 "이번 주가 어떻게 채워졌나" 를 못 보여준다.
 * 스크롤을 해야 알 수 있는 건 한눈에 본 게 아니다. 여기서 한 줄로 본다.
 *
 * **요일이 아니라 날짜를 적는다.** "이번 주 화요일" 이 며칠인지는 화면에
 * 없었다. 사용자 말 그대로 — "이번주 다음주로 하니까 실제로 몇일껀지 더
 * 헷갈려". 날짜가 앞이고 요일이 뒤다.
 *
 * 날짜를 다 적으면 폰 폭에 일곱 칸이 안 들어간다. 그래서 옆으로 밀린다 —
 * 양끝의 화살표가 두 칸씩 밀어준다. 손가락으로 쓸어도 된다. PC 에서는
 * 일곱 칸이 다 들어가서 화살표를 감춘다 (WeekStrip.module.css).
 *
 * 누르는 게 아니다 — 요약이다. 담기·옮기기는 아래 목록에서 한다.
 * (한 가지 일을 두 군데서 하게 만들면 어긋난다)
 */

import { useCallback, useRef } from "react";
import { dateSay, dayIndex } from "@/lib/say";
import { DAYS, type Planned } from "@/lib/week.types";
import styles from "./WeekStrip.module.css";

/** 화살표 한 번에 몇 칸. 한 칸은 너무 잘고 한 주는 너무 크다 */
const NUDGE = 2;

export default function WeekStrip({
  plan,
  dates,
  today,
}: {
  plan: Planned[];
  /** 그 주의 날짜 일곱 개 (`YYYY-MM-DD`). **날짜 순서다** */
  dates: string[];
  /** 오늘 (한국 기준). 이 주에 없으면 아무 칸도 표시되지 않는다 */
  today: string;
}) {
  const box = useRef<HTMLOListElement>(null);

  /**
   * 오늘 칸을 가운데로. 폰에서는 처음에 왼쪽 서너 칸만 보이는데,
   * 주 중간에 열면 정작 오늘이 화면 밖이다.
   *
   * effect 가 아니라 ref 로 한다 — 그려진 다음 딱 한 번이면 되고,
   * 여기서 상태를 만들면 화면이 한 번 번쩍인다.
   *
   * **칸이 아니라 막대에 단다.** 자식의 ref 가 부모보다 **먼저** 붙어서,
   * 오늘 칸 쪽에 달면 그때 막대는 아직 null 이다 (그래서 안 움직였다).
   */
  const mount = useCallback((strip: HTMLOListElement | null) => {
    box.current = strip;
    const cell = strip?.querySelector<HTMLElement>("[data-today]");
    if (!strip || !cell) return;
    // 이 막대만 움직인다. scrollIntoView 는 페이지까지 같이 끌고 간다.
    strip.scrollLeft =
      cell.offsetLeft - (strip.clientWidth - cell.clientWidth) / 2;
  }, []);

  const nudge = useCallback((dir: -1 | 1) => {
    const strip = box.current;
    if (!strip) return;
    const cell = strip.querySelector("li");
    const step = (cell?.clientWidth ?? 72) * NUDGE;
    strip.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.arrow}
        aria-label="앞 날짜 보기"
        onClick={() => nudge(-1)}
      >
        ‹
      </button>

      <ol className={styles.strip} ref={mount} aria-label="날짜별로 담은 것">
        {dates.map((iso) => {
          const d = dayIndex(iso);
          const count = plan.filter((p) => p.day === d).length;
          const isToday = iso === today;
          return (
            <li
              key={iso}
              data-today={isToday ? "1" : undefined}
              className={`${styles.cell} ${isToday ? styles.today : ""}`}
            >
              <span className={styles.date}>{dateSay(iso)}</span>
              <span className={styles.name}>
                {DAYS[d]}
                {isToday ? " · 오늘" : ""}
              </span>
              <span className={styles.mark} aria-hidden="true">
                {count > 0 ? (count > 1 ? count : "•") : ""}
              </span>
              <span className={styles.sr}>
                {count > 0 ? `${count}개 담음` : "안 담음"}
              </span>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className={styles.arrow}
        aria-label="뒤 날짜 보기"
        onClick={() => nudge(1)}
      >
        ›
      </button>
    </div>
  );
}
