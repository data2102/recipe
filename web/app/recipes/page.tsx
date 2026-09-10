import Link from "next/link";
import List from "../RecipeList";

import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import {
  counts,
  searchRecipes,
  listCooked,
  listWish,
  type RecipeRow as Row,
  type Sort,
} from "@/lib/recipes";
import { daysFrom, todayInput } from "@/lib/say";
import { openList, picked as pickedRecipes, weekStart } from "@/lib/shopping";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "레시피" };

const TABS = [
  { key: "want", label: "만들기 전" },
  { key: "done", label: "만든 것" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const SORTS: Record<TabKey, { key: Sort; label: string }[]> = {
  want: [
    { key: "default", label: "최근 추가순" },
    { key: "name", label: "가나다순" },
  ],
  done: [
    { key: "default", label: "만든 지 오래된 순" },
    { key: "name", label: "가나다순" },
  ],
};

type Loaded =
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      total: number;
      list: Row[];
      inBasket: Set<number>;

      dates: string[];
    };

async function load(
  tab: TabKey,
  sort: Sort,
  which: "this" | "next",
  term: string,
  page: number,
): Promise<Loaded> {
  try {
    const n = await counts();
    // 이미 담은 것은 또 담을 게 없다 — 배지로 알린다
    const listId = await openList(false, which);
    const start = weekStart(which);
    const [list, basket] = await Promise.all([
      term
        ? searchRecipes(term, page * 100)
        : tab === "want"
          ? listWish(101, sort, page * 100)
          : listCooked(101, sort, page * 100),
      pickedRecipes(listId),
    ]);
    return {
      kind: "ok",
      total: n.wish + n.good,
      list,
      inBasket: new Set(basket.map((r) => r.id)),
      dates: daysFrom(start),
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

  // 정렬은 주소에만 산다. 다음에 열면 다시 그 탭의 추천 순서다.
  const rawSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort: Sort = rawSort === "name" ? "name" : "default";

  const which = params.week === "next" ? "next" : "this";
  const term = (typeof params.q === "string" ? params.q : "")
    .trim()
    .slice(0, 100);
  const page = Math.max(
    0,
    Math.min(10000, Math.floor(Number(params.page) || 0)),
  );
  const data = await load(tab, sort, which, term, page);
  if (data.kind === "error") return <Broken message={data.message} />;

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>레시피</h1>
        <p className={styles.sub}>
          {data.total}개 · {which === "next" ? "다음 주" : "이번 주"} 식단에
          담아요
        </p>
      </header>

      <form action="/recipes" className="ds-card" role="search">
        <input type="hidden" name="week" value={which} />
        <label className="ds-label" htmlFor="recipe-search">
          요리명이나 재료로 찾기
        </label>
        <input
          id="recipe-search"
          type="search"
          name="q"
          defaultValue={term}
          maxLength={100}
          className="ds-input"
          placeholder="예: 김치, 제육볶음"
        />
        <button type="submit" className="ds-btn ds-btn-secondary">
          검색
        </button>
        {term && <Link href={`/recipes?week=${which}`}>검색 지우기</Link>}
      </form>
      {term && <p>전체 레시피에서 ‘{term}’ 검색</p>}
      <Link
        href="/add"
        className={`ds-btn ds-btn-primary ds-btn-block ${styles.add}`}
      >
        레시피 추가
      </Link>

      {!term && (
        <nav className={`ds-tabs ${styles.tabs}`}>
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/recipes?week=${which}&tab=${t.key}${sort === "name" ? "&sort=name" : ""}`}
              className={`ds-tab ${t.key === tab ? "on" : ""}`}
              aria-current={t.key === tab ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {!term && (
        <div className={styles.sorts}>
          {SORTS[tab].map((o) => (
            <Link
              key={o.key}
              href={`/recipes?week=${which}&tab=${tab}${o.key === "name" ? "&sort=name" : ""}`}
              className={`ds-chip ${o.key === sort ? "on" : ""}`}
              aria-current={o.key === sort ? "true" : undefined}
            >
              {o.label}
            </Link>
          ))}
        </div>
      )}

      <>
        <List
          list={data.list.slice(0, 100)}
          week={which}
          today={today}
          mode={tab === "want" || term ? "wish" : "cooked"}
          pick="add"
          inBasket={data.inBasket}
          empty={
            term
              ? "찾는 레시피가 없어요. 다른 이름이나 재료로 검색해보세요."
              : tab === "want"
                ? "해보고 싶은 요리를 아직 안 담았어요."
                : "만들어본 게 아직 없어요. 하나 만들고 체크해보세요."
          }
        />
      </>

      <nav aria-label="레시피 페이지" className={styles.sorts}>
        {page > 0 && (
          <Link
            href={`/recipes?${new URLSearchParams({ week: which, tab, sort, q: term, page: String(page - 1) })}`}
          >
            이전
          </Link>
        )}
        {data.list.length > 100 && (
          <Link
            href={`/recipes?${new URLSearchParams({ week: which, tab, sort, q: term, page: String(page + 1) })}`}
          >
            다음
          </Link>
        )}
      </nav>
      <Link href={`/?week=${which}`} className={styles.more}>
        담은 식단 확인하기 →
      </Link>

      <Link href="/similar" className={styles.more}>
        닮은 것끼리 훑어보기 →
      </Link>
    </main>
  );
}
