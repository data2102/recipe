/**
 * 레시피 — 모아둔 것 전부 (세 축 중 하나)
 *
 *   만들기 전   저장만 해둔 것.        최근 저장 순
 *   만든 것     만들어보고 괜찮았던 것. **오래된 순 — 뒤집지 마라**
 *
 * 오래된 순 정렬이 곧 추천이다 (지시서 3장). 여기서 오래된 것이
 * 식단 화면의 "오랜만에 어때요" 로 올라간다.
 *
 * **여기서도 담는다.** 식단 화면의 "담을 것" 은 추천이라 몇 개만 낸다
 * (오랜만에 3 · 아직 안 만들어본 것 2). 그런데 월요일에 뭘 먹을지
 * 고르다 보면 추천에 없는, 예전에 만들어본 것 중에서 생각나는 게 있다.
 * 그때 갈 데가 없으면 이 화면은 구경만 하는 자리가 된다.
 *
 * 담기를 누르면 요일 막대가 뜬다 (PickDayProvider). "이번 주" 가 이
 * 화면에 안 보여도, 담는 사람 머릿속에는 이미 무슨 요일인지 있다.
 */

import Link from "next/link";
import List from "../RecipeList";
import PickDayProvider from "../PickDay";
import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import { counts, listCooked, listWish, type RecipeRow as Row } from "@/lib/recipes";
import { todayInput } from "@/lib/say";
import { openList, picked as pickedRecipes } from "@/lib/shopping";
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
  | { kind: "ok"; total: number; list: Row[]; inBasket: Set<number> };

async function load(tab: TabKey): Promise<Loaded> {
  try {
    const n = await counts();
    // 이미 담은 것은 또 담을 게 없다 — 배지로 알린다
    const listId = await openList();
    const [list, basket] = await Promise.all([
      tab === "want" ? listWish() : listCooked(),
      pickedRecipes(listId),
    ]);
    return {
      kind: "ok",
      total: n.wish + n.good,
      list,
      inBasket: new Set(basket.map((r) => r.id)),
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

      <PickDayProvider>
        <List
          list={data.list}
          today={today}
          mode={tab === "want" ? "wish" : "cooked"}
          pick="add"
          inBasket={data.inBasket}
          empty={
            tab === "want"
              ? "해보고 싶은 요리를 아직 안 담았어요."
              : "만들어본 게 아직 없어요. 하나 만들고 체크해보세요."
          }
        />
      </PickDayProvider>
    </main>
  );
}
