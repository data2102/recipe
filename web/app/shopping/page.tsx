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

import Fridge from "../Fridge";
import Shopping from "../Shopping";
import { Empty } from "../RecipeList";
import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import { chips as fridgeChips, parseHave } from "@/lib/fridge";
import {
  items as shoppingItems,
  openList,
  picked as pickedRecipes,
} from "@/lib/shopping";
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
    };

/** 읽기만 한다. 화면 만들기는 아래에서 — 섞으면 오류를 못 잡는다 */
async function load(have: ReturnType<typeof parseHave>): Promise<Loaded> {
  try {
    const listId = await openList();
    const [basket, cart] = await Promise.all([
      pickedRecipes(listId),
      // 집에 있다고 눌러둔 재료는 "집에 있을 거예요" 로 내려간다.
      shoppingItems(listId, have),
    ]);
    /*
      칩은 **이번 주에 담은 요리들이 쓰는 재료**다. 담은 것 기준이면
      장보기 목록의 범위와 정확히 같아진다 — 칩은 "살 것 중에 뭐가 이미
      집에 있나" 를 묻는 것이니 그게 맞다. 담거나 빼면 칩도 따라 바뀐다.
    */
    const chips = await fridgeChips(basket.map((r) => r.id));
    return { kind: "ok", chips, cart, basket };
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
  const data = await load(have);
  if (data.kind === "error") return <Broken message={data.message} />;

  const buy = data.cart.filter((i) => !i.checked).length;

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>장보기</h1>
        <p className={styles.sub}>
          {data.cart.length === 0
            ? "담은 요리가 없어요"
            : buy === 0
              ? "다 담았어요"
              : `살 것 ${buy}개`}
        </p>
      </header>

      <h2 className={styles.section}>집에 있는 재료 (선택)</h2>
      <Fridge chips={data.chips} have={have} />

      {/* 섹션 제목을 따로 두지 않는다 — 바로 아래 "사야 해요 / 있는지
          봐주세요 / 집에 있을 거예요" 가 그 자리를 한다 */}
      {data.cart.length > 0 ? (
        <Shopping items={data.cart} />
      ) : (
        <Empty>
          {data.basket.length > 0
            ? "담은 요리에 재료가 아직 안 붙어 있어요."
            : "식단에서 요리를 담으면 살 것을 합쳐서 보여드려요."}
        </Empty>
      )}
    </main>
  );
}
