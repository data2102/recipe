import Link from "next/link";

import Shopping from "../Shopping";
import ShoppingByRecipe from "../ShoppingByRecipe";
import { Broken, Empty, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";

import {
  groups as recipeGroups,
  items as shoppingItems,
  openList,
  picked as pickedRecipes,
  weekStart,
  type Which,
} from "@/lib/shopping";
import { addDays, dateRange, dateTiny, daysFrom, whenShort } from "@/lib/say";
import { week as weekOf, type PastWeek } from "@/lib/weeks";
import { reopenWeek } from "../actions";
import styles from "../page.module.css";
import { remaining } from "@/lib/shopping.types";

export const dynamic = "force-dynamic";

export const metadata = { title: "장보기" };

type Loaded =
  | { kind: "error"; message: string }
  | {
      kind: "ok";

      cart: Awaited<ReturnType<typeof shoppingItems>>;
      basket: Awaited<ReturnType<typeof pickedRecipes>>;
      groups: Awaited<ReturnType<typeof recipeGroups>>;

      closed: PastWeek | null;

      dates: string[];
    };

async function load(which: Which): Promise<Loaded> {
  try {
    const listId = await openList(false, which);
    const start = weekStart(which);

    // items() 가 shopping_item 을 다시 쓴다. groups() 는 그 결과를 읽는
    // 게 아니라 같은 이름을 따로 만들 뿐이라 순서는 상관없다.
    const [basket, cart, groups] = await Promise.all([
      pickedRecipes(listId),
      // 집에 있다고 눌러둔 재료는 "집에 있어요" 로 내려간다.
      shoppingItems(listId),
      recipeGroups(listId),
    ]);

    const seen = await weekOf(listId);
    return {
      kind: "ok",
      cart,
      basket,
      groups,
      dates: daysFrom(start),
      closed: seen?.closed_on ? seen : null,
    };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export default async function ShoppingPage({
  searchParams,
}: PageProps<"/shopping">) {
  if (!dbUrl()) return <Setup />;

  const params = await searchParams;

  const raw = Array.isArray(params.view) ? params.view[0] : params.view;
  const merged = raw !== "recipe";

  const rawWeek = Array.isArray(params.week) ? params.week[0] : params.week;
  const which: Which = rawWeek === "next" ? "next" : "this";
  const next = which === "next";

  const q = new URLSearchParams();
  q.set("week", which);

  const data = await load(which);
  if (data.kind === "error") return <Broken message={data.message} />;

  const buy = remaining(data.cart);
  /*
    이번 주에 이미 만든 메뉴. 그 재료는 목록에서 빠져 있다
    (`lib/shopping.ts` NEED_SQL) — 화면이 그걸 한 줄로 말해준다.
  */
  const made = data.basket.filter((b) => b.cooked).length;
  const allMade = made > 0 && made === data.basket.length;
  const byRecipe = new URLSearchParams(q);
  byRecipe.set("view", "recipe");
  const flat = new URLSearchParams(q);
  flat.set("view", "merged");

  const weekLink = (to: Which) => {
    const u = new URLSearchParams(q);
    u.set("week", to);
    u.set("view", merged ? "merged" : "recipe");
    return u.toString() ? `/shopping?${u}` : "/shopping";
  };
  const thisStart = next ? addDays(data.dates[0], -7) : data.dates[0];
  const nextStart = addDays(thisStart, 7);

  return (
    <main className="shell compact-page">
      <header className={styles.head}>
        <h1 className={styles.title}>
          {next ? "다음 주 장보기" : "이번 주 장보기"}
        </h1>
        {/*
          부제와 보기 전환을 **한 줄에** 둔다. 따로 두면 머리말이 한 줄
          더 길어지는데, 요리별/합쳐서는 매일 누르는 게 아니다
          (docs/ui-references.md 9장 — 마트에서 여는 화면이다).
        */}
        <div className={styles.subRow}>
          <p className={styles.sub}>
            {dateRange(data.dates[0], data.dates[6])} ·{" "}
            {data.cart.length === 0
              ? allMade
                ? "담은 메뉴를 다 만들었어요"
                : "담은 요리가 없어요"
              : data.closed
                ? "장 다 봤어요"
                : buy === 0
                  ? "더 살 것이 없어요"
                  : `살 것 ${buy}개`}
          </p>
          {data.cart.length > 0 && (
            <nav className={styles.viewSwitch} aria-label="장보기 보기 방식">
              <Link
                href={`/shopping?${byRecipe}`}
                className={`ds-chip ${merged ? "" : "on"}`}
                aria-current={merged ? undefined : "page"}
              >
                요리별
              </Link>
              <Link
                href={`/shopping?${flat}`}
                className={`ds-chip ${merged ? "on" : ""}`}
                aria-current={merged ? "page" : undefined}
              >
                합쳐서
              </Link>
            </nav>
          )}
        </div>
      </header>

      {data.closed && (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>이 주 장보기는 끝냈어요</h2>
          <p className={styles.body}>
            {whenShort(data.closed.closed_on!)} {data.closed.bought}개 샀어요.
            담았던 요리는 그대로 남아 있어요 — 잘못 눌렀으면 다시 열 수 있어요.
          </p>
          <form action={reopenWeek} className={styles.undo}>
            <input type="hidden" name="listId" value={data.closed.id} />
            <button
              type="submit"
              className="ds-btn ds-btn-secondary ds-btn-block"
            >
              다시 열게요
            </button>
          </form>
        </section>
      )}

      <nav className={`ds-tabs ${styles.tabs}`} aria-label="장보기 기간">
        <Link
          href={weekLink("this")}
          className={`ds-tab ${next ? "" : "on"}`}
          aria-current={next ? undefined : "page"}
        >
          이번 주 {dateTiny(thisStart)}~{dateTiny(addDays(thisStart, 6))}
        </Link>
        <Link
          href={weekLink("next")}
          className={`ds-tab ${next ? "on" : ""}`}
          aria-current={next ? "page" : undefined}
        >
          다음 주 {dateTiny(nextStart)}~{dateTiny(addDays(nextStart, 6))}
        </Link>
      </nav>

      {/*
        예전에는 여기 "집에 있는 재료는 '집에 있어요'를 눌러 빼주세요" 가
        늘 떠 있었다. 줄마다 그 버튼이 붙어 있어서 **버튼이 스스로 하는
        말**이고, 마트에서 여는 화면의 머리말을 한 줄 늘릴 값은 아니었다
        (docs/ui-references.md 9장 — 머리말이 화면의 54% 였다).
      */}

      {data.cart.length > 0 ? (
        merged ? (
          <Shopping
            items={data.cart}
            week={which}
            groups={data.groups}
            made={made}
            closed={!!data.closed}
          />
        ) : (
          <ShoppingByRecipe
            groups={data.groups}
            items={data.cart}
            dates={data.dates}
            week={which}
            closed={!!data.closed}
          />
        )
      ) : (
        <Empty
          /*
            **비어 있다는 말만 두지 마라.** 세 경우가 다 "그래서 뭘 하지" 를
            남긴다 (docs/ui-references.md 11장 A5). 다 만들었으면 다음 주를
            보러, 재료가 없으면 레시피를 고치러, 아무것도 안 담았으면
            담으러 — 갈 데는 경우마다 하나씩이다.
          */
          action={
            allMade && !next ? (
              <Link
                href="/shopping?week=next&view=merged"
                className="ds-btn ds-btn-secondary"
              >
                다음 주 장보기 보기
              </Link>
            ) : data.basket.length > 0 ? (
              <Link href="/" className="ds-btn ds-btn-secondary">
                식단에서 확인하기
              </Link>
            ) : (
              <Link href="/recipes" className="ds-btn ds-btn-primary">
                메뉴 고르러 가기
              </Link>
            )
          }
        >
          {/*
            **다 만든 주를 "재료가 없어요" 라고 말하면 안 된다.** 그때그때
            정해서 담고 바로 만들면 목록이 통째로 빈다 — 그건 고장이 아니라
            다 먹었다는 뜻이다.
          */}
          {allMade
            ? "담은 메뉴를 다 만들었어요. 살 것이 없어요."
            : data.basket.length > 0
              ? "담은 요리에 재료가 아직 안 붙어 있어요."
              : "메뉴 고르기에서 담으면 살 것을 합쳐서 보여드려요."}
        </Empty>
      )}
    </main>
  );
}
