import Link from "next/link";
import Add from "./Add";
import { dbUrl } from "@/lib/db";
import { hasKey } from "@/lib/parse/claude";
import styles from "./add.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "레시피 추가" };

/** 공유 시트에서 넘어온 것 (/share 가 붙여준다) */
export type Shared = {
  assetIds: number[];
  url: string | null;
  text: string | null;
  problem: string | null;
};

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || null;
}

export default async function AddPage({ searchParams }: PageProps<"/add">) {
  const ready = dbUrl() && hasKey();
  const params = await searchParams;

  const shared: Shared | null = one(params.shared)
    ? {
        assetIds: (one(params.assets) ?? "")
          .split(",")
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0),
        url: one(params.url),
        text: one(params.text),
        problem: one(params.problem),
      }
    : null;

  return (
    <main className="shell">
      <header className={styles.head}>
        <Link href="/" className={styles.back}>
          ← 목록
        </Link>
        <h1 className={styles.title}>레시피 추가</h1>
      </header>

      {ready ? (
        <Add shared={shared} />
      ) : (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>아직 준비가 안 됐어요</h2>
          <p className={styles.body}>
            <code>web/.env.local</code> 에 아래 두 값이 필요해요.
          </p>
          <ul className={styles.missing}>
            <li>{dbUrl() ? "DATABASE_URL ✓" : "DATABASE_URL — DB 접속 주소"}</li>
            <li>
              {hasKey()
                ? "ANTHROPIC_API_KEY ✓"
                : "ANTHROPIC_API_KEY — 캡처를 읽는 데 써요"}
            </li>
          </ul>
        </section>
      )}
    </main>
  );
}
