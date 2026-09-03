/**
 * 장보기 — 마트에서 여는 화면 (세 축 중 하나)
 *
 * 이 화면은 **마트에서 한 손으로** 본다. 그래서 여기 있는 건 둘뿐이다.
 *   ① 집에 있는 재료를 눌러서 목록에서 뺀다
 *   ② 살 것을 체크한다
 *
 * 냉장고 칩이 여기 있는 이유: 칩이 묻는 건 "살 것 중에 뭐가 이미 집에
 * 있나" 라서, 답을 쓰는 자리가 장보기다. 눌러둔 값은 주소(`?have=`)에만
 * 살고 (지시서 6장) 탭바가 화면을 옮길 때 들고 다닌다 — 식단 화면도
 * 같은 값을 읽어서 "다 있어요" 를 낸다.
 */

import Link from "next/link";
import Fridge from "../Fridge";
import Shopping from "../Shopping";
import ShoppingByRecipe from "../ShoppingByRecipe";
import { Empty } from "../RecipeList";
import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import { chips as fridgeChips, parseHave } from "@/lib/fridge";
import {
  groups as recipeGroups,
  items as shoppingItems,
  openList,
  picked as pickedRecipes,
  weekStart,
  type Which,
} from "@/lib/shopping";
import { addDays, dateRange, dateTiny, daysFrom } from "@/lib/say";
import { JUST_HOURS, justClosed, type PastWeek } from "@/lib/weeks";
import { reopenWeek } from "../actions";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "장보기" };

type Loaded =
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      chips: Awaited<ReturnType<typeof fridgeChips>>;
      cart: Awaited<ReturnType<typeof shoppingItems>>;
      basket: Awaited<ReturnType<typeof pickedRecipes>>;
      groups: Awaited<ReturnType<typeof recipeGroups>>;
      /** 방금 끝낸 장보기. 되돌릴 수 있게 눈앞에 낸다 */
      closed: PastWeek | null;
      /** 그 주 날짜 일곱 개. 요리에 적힌 요일을 날짜로 바꿔 적는다 */
      dates: string[];
    };

/** 읽기만 한다. 화면 만들기는 아래에서 — 섞으면 오류를 못 잡는다 */
async function load(
  have: ReturnType<typeof parseHave>,
  which: Which,
): Promise<Loaded> {
  try {
    const listId = await openList(false, which);
    const start = await weekStart(which);
    // items() 가 shopping_item 을 다시 쓴다. groups() 는 그 결과를 읽는
    // 게 아니라 같은 이름을 따로 만들 뿐이라 순서는 상관없다.
    const [basket, cart, groups] = await Promise.all([
      pickedRecipes(listId),
      // 집에 있다고 눌러둔 재료는 "집에 있을 거예요" 로 내려간다.
      shoppingItems(listId, have),
      recipeGroups(listId),
    ]);
    /*
      칩은 **이번 주에 담은 요리들이 쓰는 재료**다. 담은 것 기준이면
      장보기 목록의 범위와 정확히 같아진다 — 칩은 "살 것 중에 뭐가 이미
      집에 있나" 를 묻는 것이니 그게 맞다. 담거나 빼면 칩도 따라 바뀐다.
    */
    const chips = await fridgeChips(basket.map((r) => r.id));
    /*
      "장보기 끝" 은 이번 주를 통째로 닫는 일인데 되돌릴 길이 없었다.
      끝낸 직후 이 화면은 빈 목록만 보여줘서, 잘못 눌렀는지조차 알 수
      없었다. 방금 끝낸 게 있으면 그렇다고 말하고 되돌릴 길을 낸다.
    */
    const recent = await justClosed();
    return {
      kind: "ok",
      chips,
      cart,
      basket,
      groups,
      dates: daysFrom(start),
      closed:
        recent && (recent.hours_ago ?? Infinity) < JUST_HOURS ? recent : null,
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
  const have = parseHave(params.have, params.haveRaw);
  /*
    보는 방식은 주소에 둔다. 요리별이 기본이다 — 왜 사는지가 같이
    보이는 쪽이 고르기 쉽다. 합친 목록은 한 번 눌러 갈 수 있게 남긴다:
    진열대를 돌 때는 합친 게 낫고, **두 번 사지 않으려면 그 화면이 답이다.**
  */
  const raw = Array.isArray(params.view) ? params.view[0] : params.view;
  const merged = raw === "merged";

  /*
    어느 주의 장을 보는가. **기본은 다음 주다** — 식단 화면과 같은
    기본값이라야 두 화면이 같은 주를 본다 (app/page.tsx). 이번 주에
    다음 주 먹을 걸 정하고 주말에 그 장을 본다.

    "장보기 끝" 은 어느 쪽을 보고 있든 하는 일이 같다: 이번 주를 닫고
    다음 주를 이번 주로 올린다 (lib/shopping.ts finish). 다음 주 장을
    보고 끝냈다면, 방금 산 그 주가 이번 주가 된다.
  */
  const rawWeek = Array.isArray(params.week) ? params.week[0] : params.week;
  const which: Which = rawWeek === "this" ? "this" : "next";
  const next = which === "next";

  const q = new URLSearchParams();
  if (params.have) q.set("have", String(params.have));
  if (params.haveRaw) q.set("haveRaw", String(params.haveRaw));
  if (next) q.set("week", "next");

  const data = await load(have, which);
  if (data.kind === "error") return <Broken message={data.message} />;

  const buy = data.cart.filter((i) => !i.checked).length;
  const byRecipe = new URLSearchParams(q);
  const flat = new URLSearchParams(q);
  flat.set("view", "merged");

  // 주 바꾸기는 보기(요리별/합쳐서)를 그대로 들고 간다
  const weekLink = (to: Which) => {
    const u = new URLSearchParams(q);
    if (to === "next") u.set("week", "next");
    else u.delete("week");
    if (merged) u.set("view", "merged");
    return u.toString() ? `/shopping?${u}` : "/shopping";
  };
  const thisStart = next ? addDays(data.dates[0], -7) : data.dates[0];
  const nextStart = addDays(thisStart, 7);

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>{next ? "다음 주 장보기" : "이번 주 장보기"}</h1>
        <p className={styles.sub}>
          {dateRange(data.dates[0], data.dates[6])} ·{" "}
          {data.cart.length === 0
            ? "담은 요리가 없어요"
            : buy === 0
              ? "다 담았어요"
              : `살 것 ${buy}개`}
        </p>
      </header>

      {data.closed && (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>방금 장보기를 끝냈어요</h2>
          <p className={styles.body}>
            {data.closed.bought}개 샀고, 담았던 요리는 그대로 남아 있어요.
            잘못 눌렀으면 다시 열 수 있어요.
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

      {/*
        어느 주의 장인가. 식단 화면과 같은 자리, 같은 이름이다.
      */}
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

      <h2 className={styles.section}>집에 있는 재료 (선택)</h2>
      <Fridge chips={data.chips} have={have} />

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

      {/* 섹션 제목을 따로 두지 않는다 — 칸 이름이 그 자리를 한다.
          PC 에서는 목록이 두 칸으로 벌어진다 (globals.css 의 .board) */}
      {data.cart.length > 0 ? (
        merged ? (
          <Shopping items={data.cart} week={which} />
        ) : (
          <ShoppingByRecipe
            groups={data.groups}
            items={data.cart}
            dates={data.dates}
            week={which}
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
