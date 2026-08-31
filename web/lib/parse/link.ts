/**
 * 링크에서 읽어오기 (작업 순서 7번)
 *
 * **폴백이 핵심이다.** 링크가 항상 성공한다고 가정하면 안 된다 (지시서 4장).
 * 못 읽으면 "캡처를 올려주세요"로 안내하는 게 이 기능의 절반이다.
 *
 * 하지 않는 것 (지시서 4장 "하지 말 것" — 우회하지 마라)
 *   - 로그인이 필요한 페이지를 우회하지 않는다
 *   - 인스타 비공개 API, 유튜브 자막 비공식 엔드포인트를 쓰지 않는다
 *   - 검색 결과를 크롤링하지 않는다
 *   - 영상을 내려받지 않는다
 *   - **robots.txt 가 막은 곳은 본문을 읽지 않는다**
 *
 * 공개된 페이지를 한 번 GET 해서 메타태그와 본문 글자만 본다.
 * 그 이상은 안 한다.
 */

/**
 * 누가 읽고 있는지 밝힌다. 사이트 주인이 막고 싶으면 막을 수 있어야 한다.
 *
 * **아스키만 쓴다.** HTTP 헤더 값에 한글을 넣으면 fetch 가 통째로
 * 던져서, 링크 읽기가 "이 사이트가 읽지 말라고 해둔 주소" 로 둔갑한다.
 */
const UA =
  "OneulMwoMeokji/1.0 (personal recipe organizer; single fetch of a public page; " +
  "+https://github.com/data2102/recipe)";

const TIMEOUT_MS = 8000;
/** 본문이 이보다 크면 레시피 페이지가 아니다. 통째로 읽지 않는다 */
const MAX_BYTES = 2 * 1024 * 1024;
/** 이 정도는 나와야 파서에 넘길 만하다 */
const MIN_BODY_CHARS = 200;

export type LinkKind = "INSTAGRAM" | "YOUTUBE" | "NAVER" | "NOTION" | "BLOG";

export type LinkRead =
  | { ok: true; kind: LinkKind; title: string | null; text: string }
  /** 못 읽었다. why 는 사용자에게 그대로 보여주는 문장이다 */
  | { ok: false; kind: LinkKind; title: string | null; why: string };

export function normalizeUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function kindOf(u: URL): LinkKind {
  const h = u.hostname.toLowerCase();
  if (/(^|\.)instagram\.com$/.test(h)) return "INSTAGRAM";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return "YOUTUBE";
  if (/(^|\.)(naver\.com|naver\.me)$/.test(h)) return "NAVER";
  if (/(^|\.)notion\.(so|site)$/.test(h)) return "NOTION";
  return "BLOG";
}

async function get(url: string, accept: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res;
  } catch {
    return null;
  }
}

/**
 * robots.txt 를 보고 이 경로를 읽어도 되는지 판단한다.
 *
 * 지시서 4장이 네이버 블로그에 대해 "robots.txt 확인 필요"라고 못 박았다.
 * 확인은 이 함수가 한다 — 막혀 있으면 본문을 안 읽고 캡처로 안내한다.
 *
 * 규칙 (RFC 9309)
 *   4xx  robots.txt 가 없다 -> 전부 허용
 *   5xx  서버가 답을 못 한다 -> 전부 금지 (모르면 안 읽는다)
 *   그 외 가장 길게 일치하는 규칙이 이긴다. 같으면 Allow 가 이긴다
 */
export async function robotsAllows(u: URL): Promise<boolean> {
  const res = await get(new URL("/robots.txt", u).toString(), "text/plain");
  if (!res) return false; // 못 물어봤으면 안 읽는다
  if (res.status >= 400 && res.status < 500) return true;
  if (!res.ok) return false;

  const text = (await res.text()).slice(0, 512 * 1024);
  const path = u.pathname + u.search;

  // 우리에게 해당하는 그룹만 모은다. 이름을 밝힌 규칙이 * 보다 우선한다.
  const groups = new Map<string, { allow: string[]; deny: string[] }>();
  let current: string[] = [];
  let sawRule = false;

  for (const line of text.split(/\r?\n/)) {
    const clean = line.split("#")[0].trim();
    if (!clean) continue;
    const at = clean.indexOf(":");
    if (at < 0) continue;
    const field = clean.slice(0, at).trim().toLowerCase();
    const value = clean.slice(at + 1).trim();

    if (field === "user-agent") {
      if (sawRule) {
        current = [];
        sawRule = false;
      }
      const name = value.toLowerCase();
      current.push(name);
      if (!groups.has(name)) groups.set(name, { allow: [], deny: [] });
      continue;
    }
    if (field !== "allow" && field !== "disallow") continue;
    sawRule = true;
    for (const name of current) {
      const g = groups.get(name)!;
      if (field === "allow") g.allow.push(value);
      else g.deny.push(value);
    }
  }

  const mine = groups.get("oneulmwomeokji") ?? groups.get("*");
  if (!mine) return true;

  const match = (rule: string): number => {
    if (rule === "") return -1; // 빈 Disallow 는 "다 허용"
    // robots.txt 의 * 와 $ 만 본다.
    const re = new RegExp(
      "^" +
        rule
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\\\$$/, "$"),
    );
    return re.test(path) ? rule.length : -1;
  };

  const deny = Math.max(-1, ...mine.deny.map(match));
  const allow = Math.max(-1, ...mine.allow.map(match));
  return allow >= deny;
}

function meta(html: string, ...names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`,
      "i",
    );
    const tag = html.match(re)?.[0];
    const value = tag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (value) return decode(value.trim());
  }
  return null;
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** 본문 글자만 남긴다. 파서는 원문을 옮기기만 하므로 정리는 여기서. */
function textOf(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/**
 * 링크 하나를 읽어본다. 못 읽으면 왜 못 읽었는지를 말로 돌려준다.
 */
export async function readLink(u: URL): Promise<LinkRead> {
  const kind = kindOf(u);

  // 인스타는 로그인 벽이라 본문을 못 읽는다. 될 리 없는 걸 시도하게
  // 만들지 않는다 — 처음부터 캡처로 안내하는 게 맞다 (지시서 4장).
  if (kind === "INSTAGRAM") {
    return {
      ok: false,
      kind,
      title: null,
      why: "인스타는 링크로 본문을 못 읽어요. 캡처를 올려주세요.",
    };
  }

  if (!(await robotsAllows(u))) {
    return {
      ok: false,
      kind,
      title: null,
      why: "이 사이트가 읽지 말라고 해둔 주소예요. 캡처를 올려주세요.",
    };
  }

  const res = await get(u.toString(), "text/html,application/xhtml+xml");
  if (!res) {
    return { ok: false, kind, title: null, why: "링크를 여는 데 실패했어요." };
  }
  if (res.status === 401 || res.status === 403) {
    // 로그인 벽. 우회하지 않는다.
    return {
      ok: false,
      kind,
      title: null,
      why: "로그인해야 볼 수 있는 페이지예요. 캡처를 올려주세요.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      kind,
      title: null,
      why: `링크를 못 읽었어요 (${res.status}). 캡처를 올려주세요.`,
    };
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return {
      ok: false,
      kind,
      title: null,
      why: "페이지가 너무 커요. 캡처를 올려주세요.",
    };
  }
  const html = new TextDecoder("utf-8").decode(buf);

  const tagTitle = decode(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "",
  );
  const title = meta(html, "og:title", "twitter:title") ?? (tagTitle || null);

  // 유튜브는 제목·썸네일뿐이다. 재료는 영상 안에 있어서 글로는 못 얻는다.
  // 자막을 비공식 경로로 긁지 않는다 (지시서 4장).
  if (kind === "YOUTUBE") {
    return {
      ok: false,
      kind,
      title,
      why: "유튜브는 제목만 가져올 수 있어요. 재료는 캡처를 올려주세요.",
    };
  }

  const text = textOf(html);
  if (text.length < MIN_BODY_CHARS) {
    return {
      ok: false,
      kind,
      title,
      why:
        kind === "NAVER"
          ? "네이버 블로그는 본문이 안 열릴 때가 많아요. 캡처를 올려주세요."
          : "본문을 못 찾았어요. 캡처를 올려주세요.",
    };
  }

  // 너무 길면 앞부분만. 레시피는 보통 페이지 위쪽에 있다.
  return { ok: true, kind, title, text: text.slice(0, 20000) };
}
