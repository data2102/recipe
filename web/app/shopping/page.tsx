import Link from "next/link";

import Shopping from "../Shopping";
import ShoppingByRecipe from "../ShoppingByRecipe";
import { Empty } from "../RecipeList";
import { Broken, Setup } from "../Shell";
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
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>
          {next ? "다음 주 장보기" : "이번 주 장보기"}
        </h1>
        <p className={styles.sub}>
          {dateRange(data.dates[0], data.dates[6])} ·{" "}
          {data.cart.length === 0
            ? "담은 요리가 없어요"
            : data.closed
              ? "장 다 봤어요"
              : buy === 0
                ? "더 살 것이 없어요"
                : `살 것 ${buy}개`}
        </p>
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

      <nav className={`ds-tabs ${styles.tabs}`}>
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

      <p className={styles.note}>
        집에 있는 재료만 목록에서 빼면 돼요. 아무것도 선택하지 않아도 장볼 수
        있어요.
      </p>

      {data.cart.length > 0 && (
        <nav className={`ds-tabs ${styles.tabs}`}>
          <Link
            href={`/shopping?${byRecipe}`}
            className={`ds-tab ${merged ? "" : "on"}`}
            aria-current={merged ? undefined : "page"}
          >
            요리별
          </Link>
          <Link
            href={`/shopping?${flat}`}
            className={`ds-tab ${merged ? "on" : ""}`}
            aria-current={merged ? "page" : undefined}
          >
            합쳐서
          </Link>
        </nav>
      )}

      {data.cart.length > 0 ? (
        merged ? (
          <Shopping
            items={data.cart}
            week={which}
            groups={data.groups}
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
        <Empty>
          {data.basket.length > 0
            ? "담은 요리에 재료가 아직 안 붙어 있어요."
            : next
              ? "식단에서 다음 주에 담으면 살 것을 합쳐서 보여드려요."
              : "식단에서 요리를 담으면 살 것을 합쳐서 보여드려요."}
        </Empty>
      )}
    </main>
  );
}
