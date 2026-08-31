/**
 * 탭 3개짜리 단일 화면 (지시서 3장)
 *
 *   ① 아직 만들기 전   저장만 해둔 것.        최근 저장 순
 *   ② 최근 만든 것     만들어보고 괜찮았던 것. **오래된 순**
 *   ③ 이번 주 추천     오래된 것 + 안 만든 것을 섞어 제시
 *
 * 정렬이 곧 추천이다. 별도 추천 로직 없이 순서만으로 작동한다.
 * 탭은 링크다 — 서버에서 그려서 보내면 클라이언트 상태가 필요 없다.
 *
 * 담기·장보기(6번), 냉장고(8번)는 아직 없다. 한 화면 한 가지 일.
 */

import Link from "next/link";
import RecipeRow from "./RecipeRow";
import { dbUrl } from "@/lib/db";
import {
  counts,
  listCooked,
  listWish,
  suggest,
  type RecipeRow as Row,
} from "@/lib/recipes";
import {
  OLD_DAYS,
  cookedAgo,
  daysSince,
  ingredientSummary,
  todayInput,
} from "@/lib/say";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "want", label: "아직 만들기 전" },
  { key: "done", label: "최근 만든 것" },
  { key: "week", label: "이번 주 추천" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type Loaded =
  | { kind: "error"; message: string }
  | { kind: "want"; total: number; list: Row[] }
  | { kind: "done"; total: number; list: Row[] }
  | { kind: "week"; total: number; old: Row[]; fresh: Row[] };

/** 읽기만 한다. 화면 만들기는 아래에서 — 섞으면 오류를 못 잡는다 */
async function load(tab: TabKey): Promise<Loaded> {
  try {
    const n = await counts();
    const total = n.wish + n.good;
    if (tab === "want") return { kind: "want", total, list: await listWish() };
    if (tab === "done") return { kind: "done", total, list: await listCooked() };
    const { old, fresh } = await suggest();
    return { kind: "week", total, old, fresh };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

function rows(list: Row[], today: string, mode: "wish" | "cooked") {
  return list.map((r) => {
    const days = daysSince(r.last_cooked_on);
    return (
      <RecipeRow
        key={r.id}
        id={r.id}
        title={r.title}
        sourceUrl={r.source_url}
        today={today}
        warm={mode === "cooked" && days !== null && days >= OLD_DAYS}
        meta={
          mode === "cooked"
            ? cookedAgo(r.last_cooked_on)
            : ingredientSummary(r.ingredients, Boolean(r.source_url))
        }
      />
    );
  });
}

function List({
  list,
  today,
  mode,
  empty,
}: {
  list: Row[];
  today: string;
  mode: "wish" | "cooked";
  empty: string;
}) {
  if (list.length === 0) return <p className={styles.empty}>{empty}</p>;
  return <ul className={styles.list}>{rows(list, today, mode)}</ul>;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const today = todayInput();
  if (!dbUrl()) return <Setup />;

  const params = await searchParams;
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "week";

  const data = await load(tab);
  if (data.kind === "error") return <Broken message={data.message} />;

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>오늘 뭐 먹지</h1>
        <p className={styles.sub}>레시피 {data.total}개</p>
      </header>

      <Link href="/add" className={styles.add}>
        레시피 추가
      </Link>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "week" ? "/" : `/?tab=${t.key}`}
            className={styles.tab}
            aria-current={t.key === tab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {data.kind === "want" && (
        <List
          list={data.list}
          today={today}
          mode="wish"
          empty="해보고 싶은 요리를 아직 안 담았어요."
        />
      )}

      {data.kind === "done" && (
        <List
          list={data.list}
          today={today}
          mode="cooked"
          empty="만들어본 게 아직 없어요. 하나 만들고 체크해보세요."
        />
      )}

      {data.kind === "week" && (
        <>
          <h2 className={styles.section}>오랜만에 어때요</h2>
          <List
            list={data.old}
            today={today}
            mode="cooked"
            empty="만든 이력이 쌓이면 여기에 나와요."
          />

          <h2 className={styles.section}>아직 안 만들어본 것</h2>
          <List
            list={data.fresh}
            today={today}
            mode="wish"
            empty="담아둔 게 없어요."
          />

          <p className={styles.note}>
            담기와 장보기 목록은 작업 순서 6번에서 붙습니다.
          </p>
        </>
      )}
    </main>
  );
}

/* --------------------------------------------------------------- */

function Setup() {
  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>오늘 뭐 먹지</h1>
        <p className={styles.sub}>셋업 확인</p>
      </header>
      <section className={styles.card}>
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

function Broken({ message }: { message: string }) {
  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>오늘 뭐 먹지</h1>
      </header>
      <section className={styles.card}>
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
