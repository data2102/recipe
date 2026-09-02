/**
 * 이번 주 한눈에 — 월~일 일곱 칸
 *
 * 세로로 늘어놓은 목록은 "이번 주가 어떻게 채워졌나" 를 못 보여준다.
 * 스크롤을 해야 알 수 있는 건 한눈에 본 게 아니다. 여기서 한 줄로 본다.
 *
 * 누르는 게 아니다 — 요약이다. 담기·옮기기는 아래 목록에서 한다.
 * (한 가지 일을 두 군데서 하게 만들면 어긋난다)
 */

import { DAYS, type Planned } from "@/lib/week.types";
import styles from "./WeekStrip.module.css";

export default function WeekStrip({
  plan,
  todayIndex,
}: {
  plan: Planned[];
  /** 0=월 … 6=일. 오늘이 어디인지 표시한다 */
  todayIndex: number;
}) {
  const counts = DAYS.map((_, d) => plan.filter((p) => p.day === d).length);

  return (
    <ol className={styles.strip} aria-label="이번 주">
      {DAYS.map((label, d) => (
        <li
          key={label}
          className={`${styles.cell} ${d === todayIndex ? styles.today : ""}`}
        >
          <span className={styles.name}>{label}</span>
          <span className={styles.mark} aria-hidden="true">
            {counts[d] > 0 ? (counts[d] > 1 ? counts[d] : "•") : ""}
          </span>
          <span className={styles.sr}>
            {counts[d] > 0 ? `${counts[d]}개 담음` : "안 담음"}
          </span>
        </li>
      ))}
    </ol>
  );
}
