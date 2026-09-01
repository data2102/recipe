import Link from "next/link";
import Importer from "./Importer";
import { alreadyImported } from "./actions";
import { SOURCES } from "./sources";
import { dbUrl } from "@/lib/db";
import { hasKey } from "@/lib/parse/claude";
import styles from "../add/add.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "노션에서 옮기기" };

export default async function ImportPage() {
  const ready = dbUrl() && hasKey();
  const done = ready ? await alreadyImported() : [];

  const items = SOURCES.map((s, i) => ({
    index: i,
    title: s.title,
    notionUrl: s.notionUrl,
    hasText: Boolean(s.text),
    note: s.note ?? null,
    done: done.includes(s.notionUrl),
  }));

  return (
    <main className="shell">
      <header className={styles.head}>
        <Link href="/" className={styles.back}>
          ← 목록
        </Link>
        <h1 className={styles.title}>노션에서 옮기기</h1>
      </header>

      {ready ? (
        <Importer items={items} />
      ) : (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>아직 준비가 안 됐어요</h2>
          <p className={styles.body}>
            DATABASE_URL 과 ANTHROPIC_API_KEY 가 있어야 옮길 수 있어요.
          </p>
        </section>
      )}
    </main>
  );
}
