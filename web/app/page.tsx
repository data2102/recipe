/**
 * 셋업 확인 화면 (작업 순서 1번)
 *
 * 아직 앱 화면이 아니다. 3탭은 작업 순서 3번에서 만든다
 * (docs/claude-code-brief.md 8장). 여기서는 하나만 답한다 —
 * **DB 가 붙었고 마이그레이션이 올라갔는가.**
 */

import { db, readConfig } from "@/lib/supabase";
import styles from "./page.module.css";

// 붙었는지 지금 물어야 하는 화면이라 캐시하지 않는다.
export const dynamic = "force-dynamic";

type Status =
  | { kind: "no-config"; missing: string[] }
  | { kind: "error"; message: string }
  | { kind: "ready"; ingredients: number; aliases: number; recipes: number };

async function check(): Promise<Status> {
  const config = readConfig();
  if (!config.ok) return { kind: "no-config", missing: config.missing };

  const client = db()!;
  const counted = async (table: string) => {
    const { count, error } = await client
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    return count ?? 0;
  };

  try {
    const [ingredients, aliases, recipes] = await Promise.all([
      counted("ingredient"),
      counted("ingredient_alias"),
      counted("recipe"),
    ]);
    return { kind: "ready", ingredients, aliases, recipes };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

const ENV_TEMPLATE = `SUPABASE_URL=https://<프로젝트>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role 키>`;

export default async function Home() {
  const status = await check();

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>오늘 뭐 먹지</h1>
        <p className={styles.sub}>셋업 확인 · 작업 순서 1번</p>
      </header>

      {status.kind === "no-config" && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>아직 DB 를 안 붙였어요</h2>
          <p className={styles.body}>
            <code>web/.env.local</code> 에 아래 두 줄을 넣어주세요.
            <code className={styles.code}>{ENV_TEMPLATE}</code>
          </p>
          <p className={`${styles.note} ${styles.warn}`}>
            없는 값: {status.missing.join(", ")}
          </p>
          <p className={styles.note}>
            service_role 키는 서버에서만 씁니다. <code>NEXT_PUBLIC_</code> 을
            붙이면 브라우저로 새어 나가요.
          </p>
        </section>
      )}

      {status.kind === "error" && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>DB 에 못 붙었어요</h2>
          <p className={styles.body}>{status.message}</p>
          <p className={styles.note}>
            테이블이 없다고 하면 마이그레이션이 아직 안 올라간 거예요.
            <code className={styles.code}>
              supabase db push{"\n"}python tools/verify_migration.py
            </code>
          </p>
        </section>
      )}

      {status.kind === "ready" && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>DB 가 붙었어요</h2>
          <p className={styles.body}>마이그레이션이 올라가 있고, 사전도 들어와 있어요.</p>
          <ul className={styles.facts}>
            <li className={styles.fact}>
              <span className={styles.factLabel}>재료 사전</span>
              <span className={styles.factValue}>{status.ingredients}종</span>
            </li>
            <li className={styles.fact}>
              <span className={styles.factLabel}>다른 표기 (별칭)</span>
              <span className={styles.factValue}>{status.aliases}개</span>
            </li>
            <li className={styles.fact}>
              <span className={styles.factLabel}>저장된 레시피</span>
              <span className={styles.factValue}>{status.recipes}개</span>
            </li>
          </ul>
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>다음</h2>
        <ol className={styles.steps}>
          <li className={styles.done}>1. 프로젝트 셋업 + DB 스키마 반영</li>
          <li className={styles.done}>2. 재료 사전 시드 투입</li>
          <li>3. 레시피 목록 3탭 + 만들었어요(날짜 선택)</li>
        </ol>
        <p className={styles.note}>docs/claude-code-brief.md 8장</p>
      </section>
    </main>
  );
}
