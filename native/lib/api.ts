/**
 * 서버에 묻는 자리 — `web/app/api/` 의 반대편
 *
 * 폰은 Postgres 에 직접 못 붙는다 (접속 문자열이 기기에 실린다).
 * `db/policy.sql` 이 RLS 를 켜고 정책을 0개로 둬서 Supabase REST 도
 * 닫혀 있다. 그래서 앱이 DB 를 만지는 길은 이 파일 하나뿐이다.
 *
 * 토큰이 앱 안에 들어간다는 것
 * ----------------------------
 * `EXPO_PUBLIC_` 값은 **번들에 박힌다.** 앱 파일을 뜯으면 토큰이 보인다는
 * 뜻이고, 그건 로그인이 아니다 — 주소를 우연히 아는 사람을 막을 뿐이다.
 * 지금은 그게 맞는 값이다: 쓰는 사람이 둘이고, 이 문을 내기 전에는
 * 보호가 "아무도 주소를 모른다" 하나였다. **v2 에서 로그인이 생기면
 * 여기와 `lib/api/guard.ts` 가 같이 바뀐다.**
 *
 * 그래서 이 토큰은 비밀이 아니라 자물쇠다 — 잃어버리면 서버에서 바꾸고
 * 앱을 다시 올린다. 진짜 비밀(DB 접속 문자열·API 키)은 절대 안 싣는다.
 */

import type {
  Bucket,
  Have,
  PickDay,
  PickedRecipe,
  Placement,
  Planned,
  RecipeGroup,
  ShoppingItem,
  Which,
} from "./pure";

/** 웹 앱이 도는 주소. 개발 중에는 `http://<내 PC IP>:3000` */
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/**
 * 사진 주소를 만들 때 쓴다 (`${API_BASE}/photo/<조리기록 id>`).
 *
 * `/photo` 는 토큰 문이 아니다 — `<Image>` 가 헤더를 못 붙이기 때문이다.
 * 대신 **저장 경로가 주소에 안 실린다**: 조리 기록 id 만 받고 경로는
 * 서버가 DB 에서 찾는다. 버킷은 여전히 비공개다.
 */
export const API_BASE = BASE;
const TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? "";

/**
 * 무엇이 잘못됐는지 들고 다니는 오류.
 *
 * 화면이 "그냥 안 됐어요" 말고 다음 걸음을 말할 수 있어야 한다 (원칙 ③).
 * 상태 코드로 **설정이 안 된 것**과 **인터넷이 없는 것**을 가른다 —
 * 사람이 할 일이 다르다.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 마트에서는 신호가 나쁘다. 영영 기다리게 두지 않는다 */
const TIMEOUT_MS = 12_000;

async function call<T>(
  path: string,
  init?: { method?: string; json?: unknown },
): Promise<T> {
  if (!BASE) {
    throw new ApiError(
      "서버 주소가 아직 안 적혀 있어요 (EXPO_PUBLIC_API_URL)",
      0,
    );
  }

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init?.method ?? (init?.json === undefined ? "GET" : "POST"),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(init?.json === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body: init?.json === undefined ? undefined : JSON.stringify(init.json),
      signal: stop.signal,
    });
  } catch (e) {
    // 끊긴 것과 느린 것을 가른다. 마트 지하에서는 둘 다 흔하다.
    const why =
      e instanceof Error && e.name === "AbortError"
        ? "서버가 너무 느려요. 신호가 약한 곳인지 봐주세요"
        : "서버에 못 닿았어요. 인터넷을 확인해주세요";
    throw new ApiError(why, 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    /*
      서버가 사람 말로 적어 보낸다 (`{ error }`). 그걸 그대로 쓴다 —
      여기서 다시 지어내면 서버가 고쳐도 앱은 옛말을 한다.
    */
    let said = "";
    try {
      said = ((await response.json()) as { error?: string }).error ?? "";
    } catch {
      /* 몸통이 JSON 이 아닐 수도 있다 (프록시·게이트웨이) */
    }
    throw new ApiError(said || `서버가 거절했어요 (${response.status})`, response.status);
  }

  return (await response.json()) as T;
}

/* ---------------------------------------------------------------- */
/*  화면이 부르는 것                                                  */
/*                                                                    */
/*  모양은 `web/app/api/` 의 각 route.ts 가 돌려주는 것과 같다.      */
/* ---------------------------------------------------------------- */

export type ShoppingScreen = {
  week: Which;
  dates: string[];
  closed: string | null;
  left: number;
  items: ShoppingItem[];
  groups: RecipeGroup[];
  picked: PickedRecipe[];
};

export const shopping = {
  read: (week: Which) =>
    call<ShoppingScreen>(`/api/shopping?week=${week}`),

  /** 샀어요 — **구매 기록이 여기서 생긴다** */
  check: (label: string, checked: boolean, week: Which) =>
    call<{ label: string; checked: boolean }>("/api/shopping/check", {
      json: { label, checked, week },
    }),

  /** 집에 있어요 — 이번 목록에서만 뺀다. 구매 기록은 안 생긴다 */
  have: (label: string, excluded: boolean, week: Which) =>
    call<{ label: string; excluded: boolean }>("/api/shopping/have", {
      json: { label, excluded, week },
    }),

  /** 장보기 끝 / 되돌리기. **주를 옮기지 않는다** */
  finish: (week: Which, done = true) =>
    call<{ week: Which; closed: string | null }>("/api/shopping/finish", {
      json: { week, done },
    }),
};

/** 담긴 요리 한 건 — 어느 주 목록에서 왔는지까지 (옮길 때 저쪽에서 뗀다) */
export type PlanDish = Pick<
  Planned,
  "title" | "past" | "cooked" | "items"
> & {
  recipeId: number;
  week: Which;
  /** 그 요일이 실제로 며칠인가. 요일을 안 정했으면 null */
  date: string | null;
};

export type PlanScreen = {
  /** 오늘 — **서버가 말해준다.** 폰 시계가 틀어져 있어도 앱의 시계는 하나다 */
  today: string;
  days: { date: string; week: Which; note: string }[];
  dishes: PlanDish[];
  /** 주별 "집에 있어요". 식단은 **읽기만** 한다 — 쓰는 자리는 장보기다 */
  excluded: Record<Which, Have>;
};

export const plan = {
  read: () => call<PlanScreen>("/api/plan"),

  /** 담기와 옮기기는 한 가지 일이다. **어느 주인지는 서버가 정한다** */
  onDate: (recipeId: number, date: string | null, week: Which, from?: Which) =>
    call<{ recipeId: number; date: string | null; week: Which }>(
      "/api/plan/date",
      { json: { recipeId, date: date ?? "", week, from } },
    ),

  remove: (recipeId: number, week: Which) =>
    call<{ recipeId: number }>("/api/plan/remove", { json: { recipeId, week } }),

  /** 그날의 메모. 비우면 지운다 */
  note: (date: string, note: string) =>
    call<{ date: string; note: string }>("/api/plan/note", {
      json: { date, note },
    }),
};

export const cooked = (recipeId: number, date?: string) =>
  call<{ recipeId: number }>("/api/cooked", { json: { recipeId, date } });

/* ---------------------------------------------------------------- */
/*  메뉴 고르기 · 레시피                                              */
/* ---------------------------------------------------------------- */

/** 목록 카드 한 장. `ingredients` 는 **원문 표기**다 (원칙 ①) */
export type RecipeCard = {
  id: number;
  title: string;
  status: "WISH" | "GOOD" | "BAD";
  source_url: string | null;
  last_cooked_on: string | null;
  cook_count: number;
  ingredients: string[];
  created_at: string;
  /** 있으면 `/photo/<이 값>` 이 표지 사진이다 */
  photoId: number | null;
};

export type RecipesScreen = {
  today: string;
  recipes: RecipeCard[];
  counts: { wish: number; good: number; bad: number; ingredients: number };
  /** 날짜 고르기 판이 쓸 것 — 열나흘 + 그날 메모 + 그날 담긴 메뉴 */
  days: PickDay[];
  /** 레시피 id -> 이미 담긴 자리 */
  placed: Record<number, Placement[]>;
};

export type DetailItem = {
  raw_name: string;
  raw_qty: string | null;
  section: string | null;
  /** 장보기에 넣기로 한 것인가. 뺀 것도 레시피에는 그대로 남는다 */
  confirmed: boolean;
  choice_group: string | null;
  origin: string;
};

export type RecipeDetail = RecipeCard & {
  items: DetailItem[];
  steps: string[];
  photos: { id: number; cooked_on: string }[];
  /** 사진을 올리면 이 날짜에 붙는다. null 이면 오늘 기록이 새로 생긴다 */
  attachesTo: string | null;
  days: PickDay[];
  placed: Placement[];
};

export const recipes = {
  read: () => call<RecipesScreen>("/api/recipes"),
  one: (id: number) => call<RecipeDetail>(`/api/recipes/${id}`),
  /** **되돌릴 수 없다.** 화면이 한 번 더 물어야 한다 */
  remove: (id: number) =>
    call<{ id: number }>(`/api/recipes/${id}`, { method: "DELETE" }),
};

/* ---------------------------------------------------------------- */
/*  지난 주                                                           */
/* ---------------------------------------------------------------- */

export type PastWeek = {
  id: number;
  opened_on: string;
  closed_on: string | null;
  bought: number;
};

export type PastDish = {
  list_id: number;
  recipe_id: number;
  title: string;
  /** 0=월 … 6=일. 안 정했으면 null */
  day: number | null;
  cooked: boolean;
};

export const weeks = {
  read: () =>
    call<{
      weeks: PastWeek[];
      dishes: PastDish[];
      notes: Record<string, string>;
    }>("/api/weeks"),

  /**
   * 끝낸 주를 다시 연다. **장보기의 되돌리기와 다른 문이다** — 저기는
   * 이번 주뿐이라 날짜로 찾고, 여기는 지난 아무 주나라 목록 id 로 말한다.
   */
  reopen: (listId: number) =>
    call<{ listId: number; closed: string | null }>("/api/weeks/reopen", {
      json: { listId },
    }),
};

/* ---------------------------------------------------------------- */
/*  레시피 넣기 (캡처 → 파싱 → 확인 → 저장)                           */
/* ---------------------------------------------------------------- */

export type DraftItem = {
  raw_name: string;
  raw_qty: string | null;
  section: string | null;
  origin: "LIST" | "BODY" | "USER";
  /** 왜 물어보는지의 근거. 화면에 그대로 적는다 (원칙 ③) */
  evidence: string | null;
  choice_group: string | null;
  bucket: string;
  label: string;
  /** 장보기에 넣을 것인가. 아래 `answered` 와 같이 읽어야 한다 */
  confirmed: boolean;
  /**
   * 사용자가 답했는가. 아직이면 화면에서 **어느 쪽도 고른 것처럼 보이면
   * 안 된다** — 안 물어본 걸 답한 척하는 셈이다.
   */
  answered: boolean;
};

export type Draft = {
  title: string;
  items: DraftItem[];
  steps: string[];
  choiceGroups: string[][];
  /** 보관해둔 원본. 저장할 때 이 레시피에 붙는다 */
  assetIds: number[];
  sourceUrl: string | null;
  sourceKind: string | null;
  usage: { input: number; output: number };
};

export type IngestResult =
  | { ok: true; draft: Draft }
  | { ok: false; message: string; hint?: string };

/**
 * 캡처를 보내 초안을 받는다. **저장하지는 않는다.**
 *
 * `FormData` 에 `{ uri, name, type }` 을 넣는 건 RN 의 방식이다 — 브라우저의
 * `File` 이 없는 대신 런타임이 그 uri 를 읽어 멀티파트로 실어 보낸다.
 * **`content-type` 을 손으로 붙이지 마라**: 경계 문자열(boundary)은
 * 런타임이 만든다.
 *
 * 파싱은 30초쯤 걸린다 — 평소의 12초 시계로는 못 기다린다.
 */
async function ingestCall(
  shots: string[],
  text: string,
): Promise<IngestResult> {
  if (!BASE) {
    throw new ApiError("서버 주소가 아직 안 적혀 있어요 (EXPO_PUBLIC_API_URL)", 0);
  }

  const form = new FormData();
  shots.forEach((uri, i) => {
    form.append("images", {
      uri,
      name: `캡처-${i + 1}.jpg`,
      type: "image/jpeg",
    } as unknown as Blob);
  });
  if (text.trim()) form.append("text", text);

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 90_000);
  try {
    const response = await fetch(`${BASE}/api/ingest`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: form,
      signal: stop.signal,
    });
    if (!response.ok) {
      let said = "";
      try {
        said = ((await response.json()) as { error?: string }).error ?? "";
      } catch {
        /* JSON 이 아닐 수도 있다 */
      }
      throw new ApiError(
        said || `서버가 거절했어요 (${response.status})`,
        response.status,
      );
    }
    return (await response.json()) as IngestResult;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      e instanceof Error && e.name === "AbortError"
        ? "읽는 데 너무 오래 걸려요. 캡처를 줄여서 다시 해보세요"
        : "서버에 못 닿았어요. 인터넷을 확인해주세요",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `ingest(shots, text)` 로 읽고 `ingest.commit(draft)` 로 저장한다.
 *
 * **같은 초안을 두 번 저장해도 한 건이다** — 서버가 원본을 `FOR UPDATE`
 * 로 잡고 이미 붙어 있으면 그 id 를 돌려준다. 폰이 잠겨 응답만 사라지면
 * 사용자 눈에는 실패라 다시 누르는데, 화면에서 버튼을 막는 것만으로는
 * 못 막는다 (실제로 두 건이 생겼다).
 */
export const ingest = Object.assign(ingestCall, {
  commit: (draft: Draft) =>
    call<{ recipeId: number }>("/api/ingest/commit", { json: { draft } }),
});

export type { Bucket };
