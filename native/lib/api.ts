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

/**
 * **유튜브는 12초로 부족하다.**
 *
 * 서버가 구글에 **두 번** 간다 (검색 한 번, 영상 상세 한 번) — 각각
 * 12초를 쓸 수 있고 (`lib/youtube-search.ts`), 앞에 Vercel 콜드 스타트가
 * 붙을 수도 있다. 서버 쪽은 30초를 허용해뒀는데(`maxDuration`) 폰이
 * **12초에 먼저 포기**하고 있었다 — 서버는 아직 일하는 중인데 앱은
 * 실패라고 적는다. 기다리는 쪽을 서버에 맞춘다.
 */
const SLOW_MS = 30_000;

/** 사진 한 장은 몇 백 KB 다. 마트 신호에서도 30초로는 모자랄 때가 있다 */
const PHOTO_MS = 60_000;

/** 캡처 읽기는 30초 넘게 걸리는 **유일한** 요청이다 */
const READ_MS = 90_000;

/**
 * 멀티파트를 보내다 못 닿은 것. `sendForm` 안에서만 산다.
 *
 * 몇 초 만인지와 안드로이드가 한 말을 같이 들고 나온다 — 부르는 쪽이
 * 화면에 맞는 문장으로 바꿔 적는다 (캡처와 사진은 할 말이 다르다).
 */
class SentFail extends Error {
  constructor(
    readonly secs: number,
    readonly said: string,
    readonly timedOut: boolean,
  ) {
    super(said);
    this.name = "SentFail";
  }
}

/**
 * **멀티파트는 `fetch` 로 못 보낸다 — XHR 로 보낸다.**
 *
 * Expo 가 `globalThis.fetch` 를 자기 것으로 바꿔놨는데
 * (`expo/src/winter/fetch`), 그쪽은 몸통을 **JS 에서 직접 조립한다**:
 * 조각이 문자열이거나 진짜 `Blob` 이어야 하고, 리액트 네이티브의
 * `{ uri, name, type }` 은 모른다. `convertFormData.ts` 가 거기서
 * `Unsupported FormDataPart implementation` 을 던진다 — 그래서 캡처를
 * 붙이면 **0초 만에** 실패했다. 신호 문제가 아니라 **네트워크에 나가지도
 * 못한 것**이다 (그 0초가 진단이었다).
 *
 * XHR 은 RN 의 네이티브 통로라 `{ uri }` 를 그대로 안다
 * (`Libraries/Network/FormData.js` 의 `getParts`). 파일을 JS 메모리로
 * 읽지도 않는다 — 안드로이드가 디스크에서 바로 흘려보낸다.
 *
 * **`content-type` 을 손으로 붙이지 마라**: 경계 문자열(boundary)은
 * 네이티브가 만든다.
 *
 * **JSON 은 `call()` 그대로 둔다.** 거기는 조각이 전부 문자열이라
 * Expo 의 fetch 가 멀쩡히 보낸다 — 고장 난 자리만 고친다.
 */
function sendForm(
  path: string,
  form: FormData,
  ms: number,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const began = Date.now();
    const secs = () => Math.round((Date.now() - began) / 1000);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`);
    xhr.timeout = ms;
    xhr.setRequestHeader("authorization", `Bearer ${TOKEN}`);

    xhr.onload = () =>
      resolve({ status: xhr.status, text: xhr.responseText ?? "" });
    /*
      못 닿았을 때 안드로이드가 한 말이 `responseText` 로 온다
      ("Unable to resolve host" 는 주소, "Software caused connection
      abort" 는 가다 끊긴 것) — 지어내지 말고 그대로 싣는다.
    */
    xhr.onerror = () =>
      reject(
        new SentFail(secs(), xhr.responseText || "연결이 끊겼어요", false),
      );
    xhr.ontimeout = () =>
      reject(new SentFail(secs(), "시간이 다 됐어요", true));
    xhr.onabort = () => reject(new SentFail(secs(), "중단됐어요", false));

    xhr.send(form);
  });
}

/** 멀티파트의 답을 값으로. 거절은 서버가 적어 보낸 말을 그대로 쓴다 */
function answered<T>(got: { status: number; text: string }): T {
  if (got.status < 200 || got.status >= 300) {
    let said = "";
    try {
      said = (JSON.parse(got.text) as { error?: string }).error ?? "";
    } catch {
      /* 몸통이 JSON 이 아닐 수도 있다 (프록시·게이트웨이) */
    }
    throw new ApiError(said || `서버가 거절했어요 (${got.status})`, got.status);
  }
  return JSON.parse(got.text) as T;
}

async function call<T>(
  path: string,
  init?: { method?: string; json?: unknown; slow?: boolean },
): Promise<T> {
  if (!BASE) {
    throw new ApiError(
      "서버 주소가 아직 안 적혀 있어요 (EXPO_PUBLIC_API_URL)",
      0,
    );
  }

  const stop = new AbortController();
  const timer = setTimeout(
    () => stop.abort(),
    init?.slow ? SLOW_MS : TIMEOUT_MS,
  );
  const began = Date.now();

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
    /*
      **끊긴 것과 느린 것을 가르고, 몇 초 만인지까지 적는다** (원칙 ③).

      예전에는 "서버에 못 닿았어요. 인터넷을 확인해주세요" 한 문장이
      전부였다. 그런데 다른 화면은 멀쩡한데 이 화면만 그러면 인터넷을
      봐도 아무 단서가 없다 — 실제로 그 문장 하나로 원인을 못 좁혔다.
      캡처(`ingestCall`)에만 넣어뒀던 것을 **모든 경로**에 맞춘다.

      3초면 못 닿은 것이고 25초면 가다가 끊긴 것이다. 안드로이드가 한
      말("Unable to resolve host" 는 주소, "Software caused connection
      abort" 는 중간에 끊김)도 그대로 싣는다.
    */
    const secs = Math.round((Date.now() - began) / 1000);
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError(
        `서버가 너무 느려요 (${secs}초). 신호가 약한 곳인지 봐주세요`,
        0,
      );
    }
    const said = e instanceof Error ? e.message : String(e);
    throw new ApiError(
      `서버에 못 닿았어요 · ${secs}초 만에 끊겼어요 (${said})`,
      0,
    );
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
    throw new ApiError(
      said || `서버가 거절했어요 (${response.status})`,
      response.status,
    );
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
  read: (week: Which) => call<ShoppingScreen>(`/api/shopping?week=${week}`),

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
export type PlanDish = Pick<Planned, "title" | "past" | "cooked" | "items"> & {
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

  /**
   * 그 날짜에 **더한다.** **어느 주인지는 서버가 정한다.**
   *
   * 옮기는 게 아니다 (2026-09-19) — 한 주에 같은 요리를 여러 날짜에
   * 담을 수 있다. 빼는 건 `remove` 가 날짜를 받아서 한다.
   */
  onDate: (recipeId: number, date: string | null, week: Which) =>
    call<{ recipeId: number; date: string | null; week: Which }>(
      "/api/plan/date",
      { json: { recipeId, date: date ?? "", week } },
    ),

  /** `date` 를 주면 그 날짜 하나만, 안 주면 그 주에서 통째로 */
  remove: (recipeId: number, week: Which, date?: string | null) =>
    call<{ recipeId: number }>("/api/plan/remove", {
      json: { recipeId, week, date: date ?? "" },
    }),

  /**
   * **안 먹었어요** — 그 날짜에서만 떼고 그 주에는 남긴다.
   *
   * `remove` 와 다르다: 저쪽은 그 주에서 없애는 문이다. 못 먹었을
   * 뿐이지 이번 주에서 빼는 게 아니라, 장보기에는 계속 들어간다.
   */
  skip: (recipeId: number, date: string) =>
    call<{ recipeId: number; date: string; week: Which }>("/api/plan/skip", {
      json: { recipeId, date },
    }),

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

/** 고칠 때 보내는 재료 한 줄. **ingredient_id 는 안 보낸다** (아래 edit) */
export type EditItem = {
  raw_name: string;
  raw_qty: string | null;
  section: string | null;
  origin: string;
  choice_group: string | null;
  confirmed: boolean;
};

export const recipes = {
  read: () => call<RecipesScreen>("/api/recipes"),
  one: (id: number) => call<RecipeDetail>(`/api/recipes/${id}`),

  /**
   * 고친다. **사전 대조는 서버가 다시 한다** — 그래서 `ingredient_id` 를
   * 보내지 않는다. 이름을 고치면 붙는 재료가 달라지고 장보기 합산도
   * 달라져야 하는데, 앱이 들고 있던 id 를 그대로 보내면 어긋난다.
   *
   * 재료 행은 통째로 갈아끼운다. 조리 기록·사진·원본은 안 건드린다.
   */
  edit: (
    id: number,
    input: { title: string; items: EditItem[]; steps: string[] },
  ) =>
    call<{ id: number; saved: boolean }>(`/api/recipes/${id}`, {
      method: "PATCH",
      json: input,
    }),

  /** **되돌릴 수 없다.** 화면이 한 번 더 물어야 한다 */
  remove: (id: number) =>
    call<{ id: number }>(`/api/recipes/${id}`, { method: "DELETE" }),
};

/* ---------------------------------------------------------------- */
/*  만든 사진                                                         */
/* ---------------------------------------------------------------- */

/**
 * 사진은 **조리 기록에 붙는다.** 올리면 만든 기록이 생긴다(없을 때) —
 * 화면의 버튼 글자가 그렇게 될 거라고 미리 말해야 한다.
 *
 * 캡처와 같은 이유로 멀티파트다 (base64 는 몸통이 1.33배).
 */
export const photos = {
  add: async (recipeId: number, uri: string) => {
    if (!BASE) {
      throw new ApiError(
        "서버 주소가 아직 안 적혀 있어요 (EXPO_PUBLIC_API_URL)",
        0,
      );
    }
    const form = new FormData();
    form.append("recipeId", String(recipeId));
    form.append("photo", {
      uri,
      name: "photo.jpg",
      type: "image/jpeg",
    } as unknown as Blob);

    try {
      return answered<{ recipeId: number }>(
        await sendForm("/api/photos", form, PHOTO_MS),
      );
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // 왜 못 닿았는지를 적는다 (캡처와 같은 이유)
      if (e instanceof SentFail) {
        throw new ApiError(
          e.timedOut
            ? `사진을 올리는 데 너무 오래 걸려요 (${e.secs}초)`
            : `사진을 못 보냈어요 · ${e.secs}초 만에 끊겼어요 (${e.said})`,
          0,
        );
      }
      throw new ApiError(
        `사진을 못 보냈어요 (${e instanceof Error ? e.message : String(e)})`,
        0,
      );
    }
  },

  /** 사진만 뗀다. **그날 만든 기록은 남는다** */
  remove: (cookId: number) =>
    call<{ cookId: number }>("/api/photos", {
      method: "DELETE",
      json: { cookId },
    }),
};

/* ---------------------------------------------------------------- */
/*  유튜브에서 찾기                                                   */
/* ---------------------------------------------------------------- */

/** 설명란에서 재료를 건진 영상 하나 */
export type VideoRecipe = {
  id: string;
  title: string;
  channel: string;
  description: string;
  /** 왜 레시피라고 봤는지 — **화면이 지어내지 말고 이걸 적는다** */
  evidence: string[];
};

/**
 * 유튜브에서 찾는다. **키는 서버에만 있다** — 앱에 실으면 번들을 뜯는
 * 누구나 우리 할당량을 쓴다.
 *
 * 실패도 값으로 온다 (`{ ok: false, message }`). 한도를 넘었다거나
 * 설명란에 재료가 없다는 건 **고장이 아니라 답**이라, 화면이 그 말을
 * 그대로 낸다 (원칙 ③).
 */
export const youtube = {
  /** 영상 하나의 설명란에서 재료를 건진다. `/add` 가 이걸로 시작한다 */
  one: (id: string) =>
    call<{ ok: true; video: VideoRecipe } | { ok: false; message: string }>(
      `/api/youtube?id=${encodeURIComponent(id)}`,
      { slow: true },
    ),

  search: (q: string, page = "") =>
    call<
      | { ok: true; videos: VideoRecipe[]; next?: string; checked: number }
      | { ok: false; message: string }
    >(
      `/api/youtube?q=${encodeURIComponent(q)}${
        page ? `&page=${encodeURIComponent(page)}` : ""
      }`,
      { slow: true },
    ),
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
 * `FormData` 에 `{ uri, name, type }` 을 넣는 건 RN 의 방식이다. **그걸
 * 아는 건 XHR 뿐이라** 여기만 `sendForm` 을 탄다 — Expo 의 `fetch` 는
 * 그 모양을 모르고 0초 만에 던진다 (위 `sendForm` 의 설명).
 *
 * 파싱은 30초쯤 걸린다 — 평소의 12초 시계로는 못 기다린다.
 */
async function ingestCall(
  shots: string[],
  text: string,
  sourceUrl?: string | null,
): Promise<IngestResult> {
  if (!BASE) {
    throw new ApiError(
      "서버 주소가 아직 안 적혀 있어요 (EXPO_PUBLIC_API_URL)",
      0,
    );
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
  /*
    **주소는 계속 들고 간다** (지시서 4장 저작권). 유튜브에서 온 경우
    화면에는 안 보여도 `source_url` 로 저장돼야 한다 — 웹이 그렇게 하고
    있는데 앱은 이 줄이 없어서 출처가 통째로 빠지고 있었다.
  */
  if (sourceUrl) form.append("sourceUrl", sourceUrl);

  try {
    return answered<IngestResult>(await sendForm("/api/ingest", form, READ_MS));
  } catch (e) {
    if (e instanceof ApiError) throw e;

    /*
      **왜 못 닿았는지를 적는다** (원칙 ③).

      두 가지를 같이 적는다:
        · 안드로이드가 한 말 ("Unable to resolve host" 는 주소 문제,
          "Software caused connection abort" 는 중간에 끊긴 것이다)
        · **몇 초 만에** 끊겼는지 (3초면 못 닿은 것이고, 40초면 읽다가
          끊긴 것이다 — 둘은 완전히 다른 고장이다)

      이 0초가 이번 버그를 잡았다: 신호가 아니라 **나가지도 못한 것**
      이라는 뜻이었다.
    */
    if (e instanceof SentFail) {
      throw new ApiError(
        e.timedOut
          ? `읽는 데 너무 오래 걸려요 (${e.secs}초). 캡처를 줄여서 다시 해보세요`
          : `서버에 못 닿았어요 · ${e.secs}초 만에 끊겼어요 (${e.said})`,
        0,
      );
    }
    throw new ApiError(
      `서버에 못 닿았어요 (${e instanceof Error ? e.message : String(e)})`,
      0,
    );
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
