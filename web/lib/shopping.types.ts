/**
 * 장보기 화면이 쓰는 모양만. **DB 를 끌고 오지 않는다.**
 *
 * `lib/shopping.ts` 는 서버 전용이다 (pg 를 쓴다). 화면(Client Component)이
 * 거기서 타입을 가져오면 접속 코드가 브라우저 번들로 딸려 들어간다.
 * 그래서 화면과 서버가 같이 보는 것만 여기 둔다.
 */

export type Bucket = "BUY" | "CHECK" | "HAVE";

export type ShoppingItem = {
  ingredient_id: number | null;
  label: string;
  bucket: Bucket;
  reason: string | null;
  checked: boolean;
  /**
   * 마트 동선 (`청과`·`정육`·`양념`…). 사전에 못 붙인 표기는 null 이다.
   *
   * 칸(bucket)과 다른 축이다 — 칸은 "살지 말지", 매대는 "어디로 갈지".
   * 저장하지 않는다. 사전에서 볼 때마다 따라온다.
   */
  aisle: string | null;
};

/** 매대를 모르는 것들. 지어내지 않고 그렇게 적는다 */
export const NO_AISLE = "그 밖에";

/**
 * 요리 하나와 그 요리가 쓰는 재료 이름들.
 *
 * `labels` 는 **합친 목록(ShoppingItem)의 label 과 같은 값**이다.
 * 화면은 이 이름으로 합친 목록의 상태를 읽는다 — 항목은 한 벌뿐이라
 * 대파가 세 요리에 들어가도 한 번만 사고, 한 군데서 체크하면 다 체크된다.
 */
export type RecipeGroup = {
  recipe_id: number;
  title: string;
  /** 0=월 … 6=일. 안 정했으면 null */
  day: number | null;
  labels: string[];
  quantities: { label: string; qty: string | null }[];
};

export type PickedRecipe = {
  id: number;
  title: string;
  status: string;
};

/** 판정하지 말고 근거를 보여준다 — "없음" 이 아니라 "있는지 봐주세요" */
export const BUCKET_TITLE: Record<Bucket, string> = {
  BUY: "사야 해요",
  CHECK: "있는지 봐주세요",
  HAVE: "집에 있어요 · 이번 목록에서 제외",
};

export function remaining(items: ShoppingItem[]) {
  return items.filter((i) => !i.checked && i.bucket !== "HAVE").length;
}
