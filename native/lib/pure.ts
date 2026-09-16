/**
 * 웹과 **같은 파일**을 읽는 자리 — 여기 한 군데다
 *
 * `web/lib/` 의 순수 층은 DB 도 화면도 안 본다. 그래서 네이티브로 그대로
 * 옮겨진다 (`tools/verify_layers.py` 가 매 푸시마다 그걸 잰다).
 * **복사해 오지 않는다** — 복사하면 검사는 통과하면서 두 벌이 되고,
 * 날짜 규칙 하나가 웹과 앱에서 다르게 동작하기 시작한다.
 *
 * 앱의 다른 파일은 `web/lib/` 를 직접 import 하지 않고 여기를 거친다.
 * 이유는 하나다: **`db.ts` 처럼 서버 전용인 것이 딸려 들어오면 접속
 * 문자열이 기기에 실린다.** 어느 파일이 순수인지 아는 곳을 한 군데로
 * 모아두면, 실수로 서버 파일을 끌어오는 일이 이 파일을 고칠 때만 생긴다.
 *
 * 새로 쓸 게 있으면 여기에 한 줄 더 적는다. 적기 전에
 * `verify_layers.py` 의 PURE 목록에 있는지 본다 — 거기 없으면 순수가
 * 아니고, 순수가 아닌 건 API 뒤에 있어야 한다.
 */

export {
  SUGGEST_AFTER_DAYS,
  OLD_DAYS,
  TZ,
  addDays,
  cookedAgo,
  dateFull,
  dateRange,
  dateSay,
  dateTiny,
  dayIndex,
  daysFrom,
  daysSince,
  ingredientSummary,
  mondayOf,
  monthWeek,
  todayInput,
  whenShort,
} from "../../web/lib/say";

export { sortRecipes } from "../../web/lib/recipe-sort";
export type { RecipeOrder } from "../../web/lib/recipe-sort";

export { DAYS } from "../../web/lib/week.types";
export type { Planned, PlannedItem } from "../../web/lib/week.types";

export { BUCKET_TITLE, NO_AISLE, remaining } from "../../web/lib/shopping.types";
export type {
  Bucket,
  PickedRecipe,
  RecipeGroup,
  ShoppingItem,
} from "../../web/lib/shopping.types";

export { NOTE_MAX } from "../../web/lib/notes.types";
export type { DayNote } from "../../web/lib/notes.types";

export type { PickDay, Placement, Which } from "../../web/lib/plan.types";

/**
 * "집에 있어요" 를 읽는 규칙. **세 화면이 같은 것을 봐야 한다** —
 * 답을 쓰는 자리는 장보기 하나고, 식단은 읽기만 한다.
 */
export { atHome, nameKey, NO_HAVE } from "../../web/lib/fridge.types";
export type { Have } from "../../web/lib/fridge.types";
