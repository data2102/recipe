/**
 * 화면이 안 뜰 때 — 셋업 안 됨 / DB 안 붙음
 *
 * 세 화면이 다 쓴다. 사과만 하지 않고 **다음에 할 일**을 적는다 (원칙 ③).
 */

import styles from "./page.module.css";

/**
 * 빈 화면. 사과 말고 초대다 (design-system.md 7장 마이크로카피)
 *
 * **문장만 두지 마라.** 비어 있다는 말은 "그래서 뭘 하지" 를 남기는데,
 * 답이 화면에 없으면 탭바를 더듬게 된다 (docs/ui-references.md 11장 A5).
 * 식단·메뉴 고르기의 빈 화면에는 이미 버튼이 있다 — 여기만 없었다.
 *
 * `action` 은 **하나만** 받는다. 빈 화면에 고를 것이 둘이면 그건 빈
 * 화면이 아니라 또 하나의 갈림길이다.
 */
export function Empty({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`ds-empty ${styles.empty}`}>
      <p>{children}</p>
      {action}
    </div>
  );
}

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
