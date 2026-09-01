/**
 * 냉장고 칩이 쓰는 모양만. **DB 를 끌고 오지 않는다.**
 * (lib/shopping.types.ts 와 같은 이유 — 서버 전용 코드가 번들에 실리면 안 된다)
 */

/**
 * 칩 하나 = 재료 하나.
 *
 * `id` 는 사전이 붙였을 때만 있다. 사전에 없거나('멸치액젓') 종류가
 * 여러 가지라 단정하지 않은 것('간장')은 `id` 가 없다 — 그래도 칩은 나온다.
 *
 * 사전은 40종인데 실제 레시피 표기는 그보다 훨씬 많다. 사전에 붙은 것만
 * 칩으로 내면 대부분의 재료를 "집에 있어요" 라고 말할 수가 없고, 그러면
 * 전부 사야 할 것으로 남는다. 사전이 자라기를 기다릴 일이 아니다.
 *
 * `name` 은 **레시피에 적힌 그 표기**다 (원칙 ①). 사전이 '진간장' 으로
 * 붙였어도 내 레시피가 '간장' 이면 칩도 '간장' 이다 — 내가 쓴 적 없는
 * 이름을 보여주면 내 냉장고 이야기로 안 읽힌다.
 */
export type Chip = {
  id: number | null;
  name: string;
};

/**
 * 집에 있다고 눌러둔 것. 주소에만 산다 (지시서 6장).
 *
 *   ?have=3,10        사전에 붙은 재료 (id)
 *   ?haveRaw=간장     사전에 안 붙은 재료 (레시피에 적힌 표기)
 *
 * 둘로 나눈 이유: id 가 있으면 표기가 달라도('고추가루' vs '고춧가루')
 * 같은 재료로 합쳐지는데, 그 이점을 버릴 필요는 없다. id 가 없는 것만
 * 표기로 맞춘다.
 */
export type Have = {
  ids: number[];
  names: string[];
};

export const NO_HAVE: Have = { ids: [], names: [] };

/**
 * 표기 비교용. 공백만 없앤다.
 *
 * `lib/parse/normalize.ts` 의 `key()` 와 **같은 규칙이어야 한다.**
 * 거기가 원본이다 — 한쪽만 고치면 사전이 붙인 것과 칩이 어긋난다.
 * (여기 두는 이유는 그 파일이 DB 를 끌고 와서 화면에서 못 부르기 때문이다)
 */
export function nameKey(s: string): string {
  return (s || "").replace(/\s+/g, "");
}

/** 이 재료가 집에 있다고 했는가. 세 화면이 같은 규칙을 봐야 한다 */
export function atHome(
  have: Have,
  ingredientId: number | null,
  rawName: string,
): boolean {
  if (ingredientId !== null && have.ids.includes(ingredientId)) return true;
  const k = nameKey(rawName);
  return have.names.some((n) => nameKey(n) === k);
}
