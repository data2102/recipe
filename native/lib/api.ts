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
  PickedRecipe,
  RecipeGroup,
  ShoppingItem,
  Which,
} from "./pure";

/** 웹 앱이 도는 주소. 개발 중에는 `http://<내 PC IP>:3000` */
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
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

export type PlanScreen = {
  today: string;
  days: { date: string; week: Which; note: string }[];
  dishes: {
    recipeId: number;
    title: string;
    week: Which;
    date: string | null;
    past: boolean;
    cooked: boolean;
    items: { label: string; have: boolean }[];
  }[];
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

export type { Bucket };
