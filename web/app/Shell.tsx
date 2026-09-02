/**
 * 화면이 안 뜰 때 — 셋업 안 됨 / DB 안 붙음
 *
 * 세 화면이 다 쓴다. 사과만 하지 않고 **다음에 할 일**을 적는다 (원칙 ③).
 */

import styles from "./page.module.css";

export function Setup() {
  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>오늘 뭐 먹지</h1>
        <p className={styles.sub}>셋업 확인</p>
      </header>
      <section className="ds-card">
        <h2 className={styles.cardTitle}>아직 DB 를 안 붙였어요</h2>
        <p className={styles.body}>
          <code>web/.env.local</code> 에 접속 주소를 넣어주세요.
          <code className={styles.code}>DATABASE_URL=postgresql://...</code>
        </p>
        <p className={styles.note}>
          Supabase 대시보드 &gt; Project Settings &gt; Database 에서 가져옵니다.
          로컬 PostgreSQL 로 돌려도 됩니다.
        </p>
      </section>
    </main>
  );
}

export function Broken({ message }: { message: string }) {
  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>오늘 뭐 먹지</h1>
      </header>
      <section className="ds-card">
        <h2 className={styles.cardTitle}>DB 에 못 붙었어요</h2>
        <p className={styles.body}>{message}</p>
        <p className={styles.note}>
          테이블이 없다고 하면 마이그레이션이 아직 안 올라간 거예요.
          <code className={styles.code}>python tools/verify_migration.py</code>
        </p>
      </section>
    </main>
  );
}
