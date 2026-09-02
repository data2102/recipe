/**
 * 식단 — 이번 주에 뭘 먹을지 (세 축 중 가운데)
 *
 * 예전에는 이 화면 하나에 레시피 목록·추천·식단·장보기가 다 있었다.
 * 폰에서 2,200px 짜리 한 장이라 마트에서 쓰는 장보기까지 여섯 번을
 * 밀어야 했다. 아래 탭바로 셋으로 갈랐다 (app/TabBar.tsx).
 *
 * 이 화면이 하는 일은 하나다 — **이번 주에 먹을 것을 정한다.**
 *   ① 한 줄로 이번 주 전체를 본다 (WeekStrip)
 *   ② 담은 것을 요일에 놓고, 지난 요일은 만들었는지 물어본다 (Week)
 *   ③ 아래에서 담는다 (오랜만에 / 아직 안 만들어본 것 / 집에 있는 걸로)
 *
 * 정렬이 곧 추천이다. 별도 추천 로직 없이 순서만으로 작동한다.
 */

import List from "./RecipeList";
import Week from "./Week";
import WeekStrip from "./WeekStrip";
import PickDayProvider from "./PickDay";
import { Broken, Setup } from "./Shell";
import { dbUrl } from "@/lib/db";
import { suggest, type RecipeRow as Row } from "@/lib/recipes";
import { todayInput } from "@/lib/say";
import { parseHave, weighted } from "@/lib/fridge";
import type { Have } from "@/lib/fridge.types";
import { openList, picked as pickedRecipes } from "@/lib/shopping";
import { plan as weekPlan } from "@/lib/week";
import type { Planned } from "@/lib/week.types";
import type { PickedRecipe } from "@/lib/shopping.types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Loaded =
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      old: Row[];
      fresh: Row[];
      basket: PickedRecipe[];
      plan: Planned[];
      /** 냉장고 재료를 넣었을 때만. 필터가 아니라 가중치다 */
      byFridge: Row[] | null;
    };

/** 읽기만 한다. 화면 만들기는 아래에서 — 섞으면 오류를 못 잡는다 */
async function load(have: Have): Promise<Loaded> {
  try {
    const { old, fresh } = await suggest();
    // 담은 것과 장보기는 같은 목록에서 나온다. 목록이 없으면 만들지 않는다 —
    // 담기 전까지 빈 목록이 쌓이면 "이번 주" 가 뭔지 흐려진다.
    const listId = await openList();
    const [basket, plan, byFridge] = await Promise.all([
      pickedRecipes(listId),
      weekPlan(listId),
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
      kind: "ok",
      old,
      fresh,
      basket,
      plan,
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

/** 오늘이 무슨 요일인가 (0=월 … 6=일). 한국 기준 (lib/say.ts TZ) */
function todayIndex(iso: string): number {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=일
  return (dow + 6) % 7;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const today = todayInput();
  if (!dbUrl()) return <Setup />;

  const params = await searchParams;
  const have = parseHave(params.have, params.haveRaw);
  const data = await load(have);
  if (data.kind === "error") return <Broken message={data.message} />;

  const inBasket = new Set(data.basket.map((r) => r.id));

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>이번 주 식단</h1>
        <p className={styles.sub}>
          {data.basket.length > 0
            ? `${data.basket.length}개 담았어요`
            : "아직 안 담았어요"}
        </p>
      </header>

      {/*
        담기 버튼이 요일 막대를 띄우고 끌기를 따라간다. provider 는 이
        화면에만 있다 — 레시피 화면에는 이번 주라는 게 없어서 요일을
        물을 자리가 아니다 (RecipeRow 가 provider 없으면 그냥 담는다).
      */}
      <PickDayProvider>
        <WeekStrip plan={data.plan} todayIndex={todayIndex(today)} />

        <Week plan={data.plan} have={have} />

        {/*
          담을 곳이 바로 위에 있으니 목록은 그 아래다.
          셋을 **같이** 낸다 — 재료를 넣는 건 보기를 좁히자는 게 아니라
          하나 더 얹자는 것이다. 소제목은 작게 둔다. 셋 다 "담을 것" 이라
          섹션을 세 개로 세우면 화면이 다시 길어진다.
        */}
        <h2 className={styles.section}>담을 것</h2>

        {data.byFridge && data.byFridge.length > 0 && (
          <>
            <p className={styles.group}>집에 있는 걸로 만들 수 있어요</p>
            <List
              list={data.byFridge}
              today={today}
              mode="wish"
              empty="레시피가 아직 없어요."
              pick="add"
              inBasket={inBasket}
            />
          </>
        )}

        <p className={styles.group}>오랜만에 어때요</p>
        <List
          list={data.old}
          today={today}
          mode="cooked"
          empty="만든 지 30일 지난 요리가 여기 나와요."
          pick="add"
          inBasket={inBasket}
        />

        <p className={styles.group}>아직 안 만들어본 것</p>
        <List
          list={data.fresh}
          today={today}
          mode="wish"
          empty="아직 안 만들어본 게 없어요."
          pick="add"
          inBasket={inBasket}
        />
      </PickDayProvider>
    </main>
  );
}
