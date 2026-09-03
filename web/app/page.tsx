/**
 * 식단 — 이번 주에 뭘 먹을지 (세 축 중 가운데)
 *
 * 예전에는 이 화면 하나에 레시피 목록·추천·식단·장보기가 다 있었다.
 * 폰에서 2,200px 짜리 한 장이라 마트에서 쓰는 장보기까지 여섯 번을
 * 밀어야 했다. 아래 탭바로 셋으로 갈랐다 (app/TabBar.tsx).
 *
 * 이 화면이 하는 일은 하나다 — **다음에 먹을 것을 정한다.**
 *   ① 한 줄로 그 주 전체를 본다 (WeekStrip)
 *   ② 담은 것을 날짜에 놓고, 지난 날짜는 만들었는지 물어본다 (Week)
 *   ③ 아래에서 담는다 (오랜만에 / 아직 안 만들어본 것)
 *
 * **열면 다음 주가 보인다.** 이번 주 먹을 건 지난 주말에 이미 장을 봐서
 * 정해져 있다. 지금 정할 게 남은 건 다음 주고, 그래야 이번 주말에 장을
 * 본다 — 장보기가 뒤에 있으니 식단이 먼저다.
 *
 * 정렬이 곧 추천이다. 별도 추천 로직 없이 순서만으로 작동한다.
 */

import Link from "next/link";
import List from "./RecipeList";
import Week from "./Week";
import WeekStrip from "./WeekStrip";
import PickDayProvider from "./PickDay";
import { Broken, Setup } from "./Shell";
import { dbUrl } from "@/lib/db";
import { suggest, type RecipeRow as Row } from "@/lib/recipes";
import {
  addDays,
  dateRange,
  dateTiny,
  daysFrom,
  todayInput,
} from "@/lib/say";
import { haveParams, parseHave } from "@/lib/fridge";
import type { Have } from "@/lib/fridge.types";
import {
  openList,
  picked as pickedRecipes,
  weekStart,
  type Which,
} from "@/lib/shopping";
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
      /** 보고 있는 주가 며칠부터인가 (`YYYY-MM-DD`) */
      start: string;
    };

/** 읽기만 한다. 화면 만들기는 아래에서 — 섞으면 오류를 못 잡는다 */
async function load(have: Have, which: Which): Promise<Loaded> {
  try {
    const { old, fresh } = await suggest();
    // 그 주가 며칠부터인지 (lib/shopping.ts weekStart). 요일을 날짜로
    // 바꿔 적는 데 쓰고, 담아둔 요리의 날짜도 여기서 계산된다.
    const start = await weekStart(which);
    // 담은 것과 장보기는 같은 목록에서 나온다. 목록이 없으면 만들지 않는다 —
    // 담기 전까지 빈 목록이 쌓이면 "이번 주" 가 뭔지 흐려진다.
    const listId = await openList(false, which);
    const [basket, plan] = await Promise.all([
      pickedRecipes(listId),
      weekPlan(listId, start),
    ]);

    return {
      kind: "ok",
      old,
      fresh,
      basket,
      plan,
      start,
    };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const today = todayInput();
  if (!dbUrl()) return <Setup />;

  const params = await searchParams;
  const have = parseHave(params.have, params.haveRaw);

  /*
    이번 주 / 다음 주. 주소에 둔다 — 새로고침해도, 링크를 눌러도 같은
    주를 본다. 담기·요일 옮기기는 **지금 보고 있는 주**에 걸린다.

    **기본은 다음 주다.** 이번 주 먹을 건 이미 지난 주말에 장을 봐서
    정해져 있고, 지금 정할 게 남은 건 다음 주다 — 그걸 이번 주에 정해야
    주말에 장을 본다. 장보기 화면도 같은 기본값이라 두 화면이 늘 같은
    주를 본다 (app/shopping/page.tsx).
  */
  const raw = Array.isArray(params.week) ? params.week[0] : params.week;
  const which: Which = raw === "this" ? "this" : "next";
  const next = which === "next";

  const data = await load(have, which);
  if (data.kind === "error") return <Broken message={data.message} />;

  /*
    "이번 주 / 다음 주" 만으로는 며칠 건지 알 수가 없다. 화요일에 담아둔
    게 이번 주 화요일인지 다음 주 화요일인지 화면에 없었다 — 그래서
    이 화면의 요일은 전부 날짜를 달고 나온다.

    다음 주는 이번 주에서 정확히 7일 뒤다 (lib/shopping.ts weekStart).
    그래서 어느 쪽을 보고 있든 나머지 한 쪽을 셈으로 알 수 있다.
  */
  const dates = daysFrom(data.start);
  const thisStart = next ? addDays(data.start, -7) : data.start;
  const nextStart = addDays(thisStart, 7);

  const inBasket = new Set(data.basket.map((r) => r.id));
  /*
    주 바꾸기 링크. **기본이 다음 주라 `?week=` 가 없으면 다음 주다** —
    그래서 "이번 주" 는 반드시 `?week=this` 를 붙여야 한다. 예전에는
    기본이 이번 주였어서 여기가 그냥 "/" 였고, 기본을 뒤집은 뒤로는
    눌러도 같은 화면으로 돌아와 **아무 일도 안 일어났다.**
  */
  const keep = haveParams(have);
  const weekLink = (to: Which) => {
    const u = new URLSearchParams(keep);
    if (to === "this") u.set("week", "this");
    else u.delete("week");
    return u.toString() ? `/?${u}` : "/";
  };

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>{next ? "다음 주 식단" : "이번 주 식단"}</h1>
        <p className={styles.sub}>
          {dateRange(dates[0], dates[6])} ·{" "}
          {data.basket.length > 0
            ? `${data.basket.length}개 담았어요`
            : "아직 안 담았어요"}
        </p>
      </header>

      {/*
        다음 주를 미리 짠다. 일요일에 다음 주를 정해두는 일이 실제로 있다.
        **장보기는 이번 주 것만 나온다** — 다음 주 장은 다음 주에 본다.
        장보기를 끝내면 다음 주가 이번 주가 된다 (lib/shopping.ts finish).
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

      {/*
        담기 버튼이 요일 막대를 띄우고 끌기를 따라간다. provider 는 이
        화면에만 있다 — 레시피 화면에는 이번 주라는 게 없어서 요일을
        물을 자리가 아니다 (RecipeRow 가 provider 없으면 그냥 담는다).
      */}
      <PickDayProvider week={which} dates={dates}>
        {/*
          PC 에서는 두 칸으로 나눈다 — 왼쪽에 짜둔 주, 오른쪽에 담을 것.
          담으면서 이번 주가 어떻게 차는지 같이 보인다 (폰에서는 그냥
          세로로 쌓인다). globals.css 의 .board 참조.
        */}
        <div className="board">
          {/* 다음 주에는 보통 "오늘" 이 없다 — 그러면 아무 칸도 안 짚는다 */}
          <div className="wide">
            <WeekStrip plan={data.plan} dates={dates} today={today} />
          </div>

          <div>
            <Week
              plan={data.plan}
              have={have}
              dates={dates}
              today={today}
              week={which}
            />
          </div>

          <div>
        {/*
          담을 곳이 바로 위에 있으니 목록은 그 아래다.
          셋을 **같이** 낸다 — 재료를 넣는 건 보기를 좁히자는 게 아니라
          하나 더 얹자는 것이다. 소제목은 작게 둔다. 셋 다 "담을 것" 이라
          섹션을 세 개로 세우면 화면이 다시 길어진다.
        */}
        <h2 className={styles.section}>담을 것</h2>

        <p className={styles.group}>오랜만에 어때요</p>
        <List
          list={data.old}
          today={today}
          mode="cooked"
          empty="만든 지 30일 지난 요리가 여기 나와요."
          pick="add"
          inBasket={inBasket}
          week={which}
        />

        <p className={styles.group}>아직 안 만들어본 것</p>
        <List
          list={data.fresh}
          today={today}
          mode="wish"
          empty="아직 안 만들어본 게 없어요."
          pick="add"
          inBasket={inBasket}
          week={which}
        />

        {/*
          여기 나오는 건 추천이라 몇 개뿐이다. 오늘 먹고 싶은 게 그 안에
          없을 때 갈 데가 없으면 식단 짜기가 거기서 막힌다 — 모아둔 것
          전부에서 고르는 길을 낸다. 거기서도 담기가 된다.
        */}
        <Link href="/recipes?tab=done" className={styles.more}>
          모아둔 레시피에서 고르기 →
        </Link>

        {/* 끝낸 주는 지워지지 않는다. 되짚어 보고 되돌릴 수도 있다 */}
        <Link href="/weeks" className={styles.more}>
          지난 주 보기 →
        </Link>
          </div>
        </div>
      </PickDayProvider>
    </main>
  );
}
