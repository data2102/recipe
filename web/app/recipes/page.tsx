/**
 * 레시피 — 모아둔 것 전부 (세 축 중 하나)
 *
 *   만들기 전   저장만 해둔 것.        최근 저장 순
 *   만든 것     만들어보고 괜찮았던 것. **오래된 순 — 뒤집지 마라**
 *
 * 오래된 순 정렬이 곧 추천이다 (지시서 3장). 여기서 오래된 것이
 * 식단 화면의 "오랜만에 어때요" 로 올라간다.
 *
 * 담기 버튼이 없다. 이번 주에 담는 건 식단 화면에서 한다 — 여기는
 * "뭘 갖고 있나" 를 보는 자리다.
 */

import Link from "next/link";
import List from "../RecipeList";
import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import { counts, listCooked, listWish, type RecipeRow as Row } from "@/lib/recipes";
import { todayInput } from "@/lib/say";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "레시피" };

const TABS = [
  { key: "want", label: "만들기 전" },
  { key: "done", label: "만든 것" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type Loaded =
  | { kind: "error"; message: string }
  | { kind: "ok"; total: number; list: Row[] };

async function load(tab: TabKey): Promise<Loaded> {
  try {
    const n = await counts();
    return {
      kind: "ok",
      total: n.wish + n.good,
      list: tab === "want" ? await listWish() : await listCooked(),
    };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export default async function RecipesPage({
  searchParams,
}: PageProps<"/recipes">) {
  const today = todayInput();
  if (!dbUrl()) return <Setup />;

  const params = await searchParams;
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: TabKey = raw === "done" ? "done" : "want";

  const data = await load(tab);
  if (data.kind === "error") return <Broken message={data.message} />;

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>레시피</h1>
        <p className={styles.sub}>{data.total}개</p>
      </header>

      <Link
        href="/add"
        className={`ds-btn ds-btn-primary ds-btn-block ${styles.add}`}
      >
        레시피 추가
      </Link>

      <nav className={`ds-tabs ${styles.tabs}`}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/recipes?tab=${t.key}`}
            className={`ds-tab ${t.key === tab ? "on" : ""}`}
            aria-current={t.key === tab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <List
        list={data.list}
        today={today}
        mode={tab === "want" ? "wish" : "cooked"}
        empty={
          tab === "want"
            ? "해보고 싶은 요리를 아직 안 담았어요."
            : "만들어본 게 아직 없어요. 하나 만들고 체크해보세요."
        }
      />
    </main>
  );
}
