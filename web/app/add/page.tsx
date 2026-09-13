import Link from "next/link";
import Add from "./Add";
import { youtubeRecipe } from "@/lib/youtube-search";
import { dbUrl } from "@/lib/db";
import { hasKey } from "@/lib/parse/claude";
import styles from "./add.module.css";

export const dynamic = "force-dynamic";

/**
 * 캡처 여러 장을 한 번에 읽으면 그만큼 오래 걸린다 (10장이면 1분 가까이).
 * 이 화면의 서버 액션이 이 값을 물려받는다 — 기본값으로 두면 중간에
 * 잘려서 "레시피를 읽다가 막혔어요" 만 나온다.
 */
export const maxDuration = 60;

export const metadata = { title: "레시피 추가" };

/** 공유 시트에서 넘어온 것 (/share 가 붙여준다) */
export type Shared = {
  assetIds: number[];
  url: string | null;
  text: string | null;
  problem: string | null;
  youtube?: boolean;
};

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || null;
}

export default async function AddPage({ searchParams }: PageProps<"/add">) {
  const ready = dbUrl() && hasKey();
  const params = await searchParams;

  let shared: Shared | null = one(params.shared)
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

  let youtubeError: string | null = null;
  const videoId = one(params.youtube);
  if (videoId) {
    try {
      const video = await youtubeRecipe(videoId);
      shared = { assetIds: [], url: `https://www.youtube.com/watch?v=${video.id}`, text: `${video.title}\n${video.description}`, problem: null, youtube: true };
    } catch (error) { youtubeError = error instanceof Error ? error.message : "영상을 확인하지 못했어요."; }
  }

  return (
    <main className="shell">
      <header className={styles.head}>
        <Link href="/" className={styles.back}>
          ← 목록
        </Link>
        <h1 className={styles.title}>레시피 추가</h1>
      </header>

      {!shared && <Link href="/youtube" className="ds-btn ds-btn-secondary ds-btn-block">유튜브에서 레시피 찾기</Link>}
      {youtubeError && <p role="alert">{youtubeError} <Link href="/youtube">다시 검색하기</Link></p>}
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
