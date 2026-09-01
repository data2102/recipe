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
import Fridge from "./Fridge";
import RecipeRow from "./RecipeRow";
import Shopping from "./Shopping";
import Week from "./Week";
import PickDayProvider from "./PickDay";
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
import {
  chips as fridgeChips,
  haveParams,
  parseHave,
  weighted,
} from "@/lib/fridge";
import type { Chip, Have } from "@/lib/fridge.types";
import {
  items as shoppingItems,
  openList,
  picked as pickedRecipes,
} from "@/lib/shopping";
import { plan as weekPlan } from "@/lib/week";
import type { Planned } from "@/lib/week.types";
import type { PickedRecipe, ShoppingItem } from "@/lib/shopping.types";
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
  | {
      kind: "week";
      total: number;
      old: Row[];
      fresh: Row[];
      basket: PickedRecipe[];
      plan: Planned[];
      cart: ShoppingItem[];
      chips: Chip[];
      have: Have;
      /** 냉장고 재료를 넣었을 때만. 필터가 아니라 가중치다 */
      byFridge: Row[] | null;
    };

/** 읽기만 한다. 화면 만들기는 아래에서 — 섞으면 오류를 못 잡는다 */
async function load(tab: TabKey, have: Have): Promise<Loaded> {
  try {
    const n = await counts();
    const total = n.wish + n.good;
    if (tab === "want") return { kind: "want", total, list: await listWish() };
    if (tab === "done")
      return { kind: "done", total, list: await listCooked() };
    const { old, fresh } = await suggest();
    // 담은 것과 장보기는 같은 목록에서 나온다. 목록이 없으면 만들지 않는다 —
    // 담기 전까지 빈 목록이 쌓이면 "이번 주" 가 뭔지 흐려진다.
    const listId = await openList();
    const [basket, plan, cart] = await Promise.all([
      pickedRecipes(listId),
      weekPlan(listId),
      // 집에 있다고 눌러둔 재료는 "집에 있을 거예요" 로 내려간다.
      // 저장하지 않는다 — 주소에만 산다 (지시서 6장).
      shoppingItems(listId, have),
    ]);
    /*
      칩은 **이번 주에 담은 요리들이 쓰는 재료**다. 추천 목록에 있는 것까지
      넣으면 (아직 먹기로 정하지도 않은 요리의 재료까지) 칩이 수십 개가 돼서
      뭘 눌러야 할지 알 수 없다.

      담은 것 기준이면 장보기 목록의 범위와 정확히 같아진다 — 칩은
      "살 것 중에 뭐가 이미 집에 있나" 를 묻는 것이니 그게 맞다.
      담거나 빼면 칩도 그 자리에서 따라 바뀐다.
    */
    const [chips, byFridge] = await Promise.all([
      fridgeChips(basket.map((r) => r.id)),
      have.ids.length + have.names.length > 0
        ? weighted(have, 12)
        : Promise.resolve(null),
    ]);

    /*
      "집에 있는 걸로 만들 수 있는 것" 은 아래 두 목록에 **얹는** 것이다.
      그래서 겹치는 것과 하나도 안 맞는 것은 뺀다.

      - 아래 둘에 이미 있는 요리는 뺀다. 같은 요리가 한 화면에 두 번
        나오면 왜 두 번인지 설명할 길이 없다. 거기서 담으면 된다.
      - hit=0 은 뺀다. 눌러둔 재료가 하나도 안 들어가는데 "집에 있는
        걸로 만들 수 있는 것" 에 넣으면 그건 거짓말이다.

      가중치 쿼리 자체는 여전히 0건이 안 된다 (지시서 8번). 아래 두 목록이
      항상 나오니 화면이 빌 일도 없다 — 그래서 여기서는 걸러도 된다.
    */
    const shownBelow = new Set([
      ...old.map((r) => r.id),
      ...fresh.map((r) => r.id),
    ]);
    return {
      kind: "week",
      total,
      old,
      fresh,
      basket,
      plan,
      cart,
      chips,
      have,
      byFridge: byFridge
        ? byFridge
            .filter((r) => r.hit > 0 && !shownBelow.has(r.id))
            .slice(0, 6)
            .map((r) => ({
              id: r.id,
              title: r.title,
              status: r.status as Row["status"],
              source_url: null,
              last_cooked_on: r.last_cooked_on,
              cook_count: 0,
              ingredients: r.ingredients,
            }))
        : null,
    };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

function rows(
  list: Row[],
  today: string,
  mode: "wish" | "cooked",
  pick?: "add" | "in",
  inBasket?: Set<number>,
) {
  return list.map((r) => {
    const days = daysSince(r.last_cooked_on);
    return (
      <RecipeRow
        key={r.id}
        id={r.id}
        title={r.title}
        sourceUrl={r.source_url}
        today={today}
        pick={pick === "add" && inBasket?.has(r.id) ? "in" : pick}
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

/** 빈 화면. 사과 말고 초대다 (design-system.md 7장 마이크로카피) */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ds-empty ${styles.empty}`}>
      <p>{children}</p>
    </div>
  );
}

function List({
  list,
  today,
  mode,
  empty,
  pick,
  inBasket,
}: {
  list: Row[];
  today: string;
  mode: "wish" | "cooked";
  empty: string;
  pick?: "add" | "in";
  inBasket?: Set<number>;
}) {
  if (list.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className={styles.list}>{rows(list, today, mode, pick, inBasket)}</ul>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const today = todayInput();
  if (!dbUrl()) return <Setup />;

  const params = await searchParams;
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: TabKey = TABS.some((t) => t.key === raw)
    ? (raw as TabKey)
    : "week";

  const have = parseHave(params.have, params.haveRaw);
  const data = await load(tab, have);
  if (data.kind === "error") return <Broken message={data.message} />;

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>오늘 뭐 먹지</h1>
        <p className={styles.sub}>레시피 {data.total}개</p>
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
            href={t.key === "week" ? `/?${haveParams(have)}` : `/?tab=${t.key}`}
            className={`ds-tab ${t.key === tab ? "on" : ""}`}
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
        /*
          담기 버튼이 요일 막대를 띄우고 끌기를 따라간다. provider 는 이
          탭에만 있다 — 탭 1·2 에는 이번 주라는 게 없어서 요일을 물을
          자리가 아니다 (RecipeRow 가 provider 없으면 그냥 담는다).
        */
        <PickDayProvider>
          {/* 집에 있는 재료 — 전부 선택 사항. 안 해도 아래는 그대로 나온다 */}
          <h2 className={styles.section}>집에 있는 재료 (선택)</h2>
          <Fridge chips={data.chips} have={data.have} />

          {/*
            셋을 **같이** 낸다. 예전에는 재료를 누르면 앞의 둘이 사라지고
            "집에 있는 걸로 만들 수 있는 것" 이 그 자리를 차지했는데,
            고르던 목록이 통째로 없어지면 고를 데가 줄어든다. 재료를 넣는
            건 보기를 좁히자는 게 아니라 하나 더 얹자는 것이다.

            같은 요리가 두 군데 나오지 않게, 겹치는 건 아래 둘에 양보하고
            여기서는 뺀다 (load 에서 걸러 온다) — 어차피 아래에서 담을 수 있다.
          */}
          {data.byFridge && data.byFridge.length > 0 && (
            <>
              <h2 className={styles.section}>집에 있는 걸로 만들 수 있는 것</h2>
              <List
                list={data.byFridge}
                today={today}
                mode="wish"
                empty="레시피가 아직 없어요."
                pick="add"
                inBasket={new Set(data.basket.map((r) => r.id))}
              />
              <p className={styles.note}>
                눌러둔 재료가 많이 들어가는 순서예요.
              </p>
            </>
          )}

          {/* 이미 담은 건 또 담을 게 없다 */}
          <h2 className={styles.section}>오랜만에 어때요</h2>
          <List
            list={data.old}
            today={today}
            mode="cooked"
            empty="만든 지 30일 지난 요리가 여기 나와요."
            pick="add"
            inBasket={new Set(data.basket.map((r) => r.id))}
          />

          <h2 className={styles.section}>아직 안 만들어본 것</h2>
          <List
            list={data.fresh}
            today={today}
            mode="wish"
            empty="아직 안 만들어본 게 없어요."
            pick="add"
            inBasket={new Set(data.basket.map((r) => r.id))}
          />

          {/*
            담은 요리를 요일에 배정한다. 요리를 누르면 그 요리에 필요한
            재료가 펼쳐지고, 집에 있다고 눌러둔 건 체크된 채로 나온다 —
            마트에서 두 번 사지 않으려고.
          */}
          <h2 className={styles.section}>이번 주 식단</h2>
          <Week plan={data.plan} have={data.have} />

          <h2 className={styles.section}>장보기</h2>
          {data.cart.length > 0 ? (
            <Shopping items={data.cart} />
          ) : (
            <Empty>
              {data.basket.length > 0
                ? "담은 요리에 재료가 아직 안 붙어 있어요."
                : "요리를 담으면 살 것을 합쳐서 보여드려요."}
            </Empty>
          )}
        </PickDayProvider>
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

function Broken({ message }: { message: string }) {
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
