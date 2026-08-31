/**
 * DB 접속 — 서버 전용
 *
 * PostgreSQL 에 직접 붙는다. Supabase 는 호스팅된 Postgres 로 쓴다.
 * REST(PostgREST)를 안 쓰는 이유: db/schema.sql 이 적어둔 핵심 쿼리 3개 중
 * 장보기 3단 분류가 CTE + LATERAL 이라 REST 로는 표현이 안 된다. 쿼리를
 * 쪼개서 앱에서 합치면 schema.sql 에 적힌 것과 다른 코드가 두 벌 생긴다.
 *
 * 브라우저는 DB 에 붙지 않는다. 모든 조회·변경은 Server Component 와
 * Server Action 안에서만 일어난다.
 */

import { Pool, type QueryResultRow } from "pg";

declare global {
  // 개발 중 Fast Refresh 가 모듈을 다시 불러도 풀을 새로 만들지 않게.
  var __recipePool: Pool | undefined;
}

export function dbUrl(): string | null {
  return process.env.DATABASE_URL || null;
}

function pool(): Pool {
  if (typeof window !== "undefined") {
    throw new Error(
      "lib/db 는 서버 전용이다. Client Component 에서 부르면 DB 접속 " +
        "문자열이 브라우저 번들에 실린다.",
    );
  }
  const url = dbUrl();
  if (!url) throw new Error("DATABASE_URL 이 없다");

  if (!globalThis.__recipePool) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    globalThis.__recipePool = new Pool({
      connectionString: url,
      // 무료 요금제에서 접속 수가 제일 먼저 바닥난다. 서버리스는 인스턴스가
      // 여러 개 뜨는데 각자 풀을 들고 있어서, 인스턴스당 1개만 잡는다.
      // 사용자가 둘뿐이라 이걸로 충분하다 (README "무료로 굴리기").
      max: Number(process.env.DB_POOL_MAX || (local ? 5 : 1)),
      // 놀고 있는 접속을 오래 붙들지 않는다 — 위와 같은 이유다.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Supabase 는 TLS 를 쓰지만 인증서 체인을 따로 받지 않는다.
      // 로컬에는 TLS 가 없으므로 끈다.
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalThis.__recipePool;
}

/**
 * 생 SQL 한 방. 값은 항상 $1, $2 로 넘긴다 — 문자열에 이어붙이지 마라.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

export async function one<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** 트랜잭션 안에서 쓰는 질의. query() 와 같은 모양이다. */
export type Tx = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

/**
 * 여러 문장을 한 트랜잭션으로. 캐시 컬럼을 갱신하거나 레시피 한 건을
 * 통째로 넣을 때 쓴다 — 중간에 실패하면 반쪽짜리 레시피가 남으면 안 된다.
 */
export async function tx<T>(run: (q: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const q: Tx = async (text, params = []) =>
      (await client.query(text, params)).rows;
    const out = await run(q);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
