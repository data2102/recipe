/**
 * 뼈대 — 서버가 그릴 때까지 뭐라도 보여준다
 *
 * 우리 화면은 전부 `force-dynamic` 이라 DB 를 다녀와야 그려진다. 그동안
 * Next 는 **이전 화면을 그대로 세워둔다** — 탭을 눌렀는데 아무 일도 안
 * 일어나는 것처럼 보이고, 그러면 한 번 더 누른다 (장보기 체크에서 이미
 * 겪은 것과 같은 병이다).
 *
 * 여기서 하는 건 "곧 뭐가 올지" 를 자리로 알려주는 것뿐이다. 진짜 내용을
 * 흉내 내지 않는다 — 가짜 요리 이름을 띄우면 그게 잠깐 진짜로 보인다.
 */

import styles from "./Skeleton.module.css";

/** 화면 머리말 (제목 + 한 줄 요약) */
export function HeadBones() {
  return (
    <header className={styles.head}>
      <div className={`ds-skeleton ${styles.title}`} />
      <div className={`ds-skeleton ${styles.sub}`} />
    </header>
  );
}

/** 줄 몇 개. 날짜 목록·장보기처럼 세로로 쌓이는 자리 */
export function RowBones({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.row}>
          <div className={`ds-skeleton ${styles.line}`} />
          <div className={`ds-skeleton ${styles.lineShort}`} />
        </div>
      ))}
    </div>
  );
}

/** 카드 격자 (메뉴 고르기) */
export function CardBones({ cards = 6 }: { cards?: number }) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className={styles.card}>
          <div className={`ds-skeleton ${styles.cover}`} />
          <div className={`ds-skeleton ${styles.line}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * 읽는 사람에게는 "불러오는 중" 이라고 말해준다. 뼈대는 눈으로 보는
 * 것이라 화면 낭독기에는 아무 말도 안 된다.
 */
export function Loading({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell" aria-busy="true">
      <p role="status" className={styles.sr}>
        불러오는 중이에요
      </p>
      {children}
    </main>
  );
}
