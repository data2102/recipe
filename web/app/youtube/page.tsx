import Link from "next/link";
import { searchYoutube } from "@/lib/youtube-search";
import styles from "./youtube.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "유튜브 레시피 찾기" };
export default async function YoutubePage({ searchParams }: PageProps<"/youtube">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const token = typeof params.cursor === "string" ? params.cursor.slice(0, 250) : "";
  const result = q ? await searchYoutube(q, token).catch((e: Error) => ({ error: e.message })) : null;
  return <main className="shell compact-page">
    <Link href="/add">← 레시피 추가</Link>
    <h1>유튜브에서 찾기</h1>
    <p>설명란에 재료와 수량이 적힌 영상을 찾아드려요.</p>
    <form action="/youtube" role="search" className={styles.search}>
      <label htmlFor="youtube-query">먹고 싶은 요리</label>
      <div className="ds-search"><input id="youtube-query" className="ds-input" name="q" type="search" maxLength={80} defaultValue={q} placeholder="예: 두부조림" required /></div>
      <button className="ds-btn ds-btn-primary">검색</button>
    </form>
    {result && "error" in result && <p role="alert" className="ds-banner ds-banner-warning">{result.error}</p>}
    {result && !("error" in result) && <>
      <p role="status">영상 {result.checked}개의 설명란 확인 · 후보 {result.videos.length}개</p>
      <p>아래 재료는 설명란 원문이에요. 저장 전에 재료·수량을 확인해주세요.</p>
      {!result.videos.length && <div className="ds-empty"><h2>가져올 재료가 있는 영상을 찾지 못했어요</h2><p>다른 검색어를 입력하거나 다음 결과를 확인해주세요.</p></div>}
      {result.videos.map(video => <article key={video.id} className={`ds-card ${styles.card}`}>
        <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer" aria-label={`${video.title} YouTube에서 보기`}>
          {/* YouTube-hosted thumbnail; no copied video media. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" width="320" height="180" loading="lazy" />
        </a>
        <div><h2>{video.title}</h2><p>{video.channel} · YouTube</p>
          <p className={styles.evidence}>{video.evidence.slice(0, 3).join(" · ")}</p>
          <Link className="ds-btn ds-btn-secondary" href={`/add?youtube=${video.id}`}>재료 확인하고 저장</Link>
        </div>
      </article>)}
      {result.next && <Link className="ds-btn ds-btn-secondary" href={`/youtube?${new URLSearchParams({ q, cursor: result.next })}`}>다음 영상에서 찾기</Link>}
    </>}
    {!q && <p>검색 결과를 먼저 확인하고 마음에 드는 요리만 레시피로 저장해요.</p>}
  </main>;
}
