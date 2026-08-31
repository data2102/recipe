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
  HAVE: "집에 있을 거예요",
};
