/**
 * Supabase 접속 — 서버 전용
 *
 * 브라우저에서 DB 를 직접 부르지 않는다. v1 에는 로그인이 없어서 anon 키로
 * 열어두면 링크를 아는 누구나 레시피를 읽고 지울 수 있다. 그래서 모든
 * 테이블에 RLS 를 켜두고(db/policy.sql) 서버에서 service_role 키로만 붙는다.
 *
 * 이 파일을 Client Component 에서 import 하면 키가 번들에 실린다.
 * 아래 가드가 그걸 막는다 — 가드를 지우지 마라.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** 환경변수가 없을 때 화면이 무엇을 안내해야 하는지까지 담는다. */
export type DbConfig =
  | { ok: true; url: string; key: string }
  | { ok: false; missing: string[] };

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function readConfig(): DbConfig {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

let cached: SupabaseClient | null = null;

/**
 * 서버에서 쓰는 Supabase 클라이언트.
 * 환경변수가 없으면 null 을 준다 — 던지지 않는다. 붙기 전에도 화면은
 * 떠야 하고, 무엇이 없는지 말해줄 수 있어야 한다.
 */
export function db(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error(
      "lib/supabase 는 서버 전용이다. Client Component 에서 부르면 " +
        "service_role 키가 브라우저 번들에 실린다.",
    );
  }
  if (cached) return cached;

  const config = readConfig();
  if (!config.ok) return null;

  cached = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
