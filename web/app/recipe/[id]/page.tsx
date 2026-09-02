/**
 * 레시피 한 건 (재료 + 만드는 법)
 *
 * 저장해둔 걸 **읽는 화면**이다. 목록은 제목과 재료 몇 개만 보여줘서,
 * 캡처로 넣은 레시피는 만드는 법을 다시 볼 데가 없었다 — 원본 링크가
 * 없으면(인스타 캡처가 그렇다) 저장해두고도 못 읽는다.
 *
 * 여기서 하지 않는 것: 타이머, 단계 넘기기, 화면 켜두기 같은 **요리 중
 * UX**. 그건 아직 안 정한 것이다 (지시서 9장) — 지금 정하면 근거 없이
 * 정하게 된다. 이 화면은 적어둔 걸 그대로 보여주기만 한다.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import Edit from "./Edit";
import Photos from "./Photos";
import { attachTarget, list as listPhotos } from "@/lib/photos";
import { detail } from "@/lib/recipes";
import { cookedAgo } from "@/lib/say";
import styles from "./recipe.module.css";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
  searchParams,
}: PageProps<"/recipe/[id]">) {
  const { id } = await params;
  const q = await searchParams;
  const editing = (Array.isArray(q.edit) ? q.edit[0] : q.edit) === "1";
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();

  const [r, photos, attach] = await Promise.all([
    detail(n),
    listPhotos(n),
    attachTarget(n),
  ]);
  if (!r) notFound();

  /*
    사진이 어느 날짜에 붙을지 미리 보여준다. 액션이 같은 규칙으로 다시
    찾는다 (recipe/[id]/actions.ts) — 화면이 보낸 값을 믿지 않는다.
  */
  const attachesTo = attach?.cooked_on ?? null;

  // 섹션이 여럿이면 소제목으로 나눈다. 하나뿐이면 굳이 붙이지 않는다.
  const sections = [...new Set(r.items.map((i) => i.section ?? ""))];
  const grouped = sections.map((s) => ({
    name: s,
    items: r.items.filter((i) => (i.section ?? "") === s),
  }));

  /*
    고치는 화면은 읽는 화면을 **대신한다.** 같이 두면 어느 쪽이 지금 값인지
    알 수 없다. 주소(`?edit=1`)로 가른다 — 새로고침해도 그 자리다.
  */
  if (editing) {
    return (
      <main className="shell">
        <header className={styles.head}>
          <Link href={`/recipe/${r.id}`} className={styles.back}>
            ← 그만두기
          </Link>
          <h1 className={styles.title}>고치기</h1>
          <p className={styles.sub}>
            조리 기록과 사진, 보관해둔 원본은 그대로예요.
          </p>
        </header>
        <Edit id={r.id} title={r.title} items={r.items} steps={r.steps} />
      </main>
    );
  }

  return (
    <main className="shell">
      <header className={styles.head}>
        <Link href="/" className={styles.back}>
          ← 목록
        </Link>
        <h1 className={styles.title}>{r.title}</h1>
        <p className={styles.sub}>
          {r.cook_count > 0
            ? `${r.cook_count}번 만들었어요 · ${cookedAgo(r.last_cooked_on)}`
            : "아직 안 만들어봤어요"}
        </p>
      </header>

      {/*
        만든 사진이 먼저다. 재료·만드는 법보다 이게 이 요리를 기억하게
        한다 — "저번에 이렇게 나왔지" 가 다시 만들 이유가 된다.
      */}
      <Photos recipeId={r.id} photos={photos} attachesTo={attachesTo} />

      <section className="ds-card">
        <h2 className={styles.cardTitle}>재료</h2>
        {grouped.map((g) => (
          <div key={g.name}>
            {sections.length > 1 && g.name && (
              <p className={styles.section}>{g.name}</p>
            )}
            <ul className={styles.items}>
              {g.items.map((it, i) => (
                <li key={i} className={styles.item}>
                  <span className={it.confirmed ? "" : styles.dropped}>
                    {it.raw_name}
                  </span>
                  <span className={styles.qty}>
                    {it.raw_qty}
                    {/* 흐린 글씨만 두면 왜 흐린지 알 수 없다 */}
                    {!it.confirmed && (
                      <span className={styles.note}>장보기에서 뺐어요</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="ds-card">
        <h2 className={styles.cardTitle}>만드는 법</h2>
        {r.steps.length > 0 ? (
          <ol className={styles.steps}>
            {r.steps.map((s, i) => (
              <li key={i} className={styles.step}>
                {s}
              </li>
            ))}
          </ol>
        ) : (
          /* 없으면 없다고 말한다. 빈 자리를 그냥 두면 저장이 덜 된 건지
             원래 없는 건지 알 수 없다 (원칙 ③) */
          <p className={styles.body}>
            만드는 법은 저장돼 있지 않아요. 캡처에 안 보였거나 못 읽은
            거예요 — 만드는 법이 보이는 화면을 캡처해서 새로 올리면 같이
            저장돼요.
          </p>
        )}
      </section>

      <Link
        href={`/recipe/${r.id}?edit=1`}
        className="ds-btn ds-btn-secondary ds-btn-block"
      >
        고칠게요
      </Link>

      {r.source_url && (
        <a
          className="ds-btn ds-btn-secondary ds-btn-block"
          href={r.source_url}
          target="_blank"
          rel="noreferrer noopener"
        >
          원본 열기
        </a>
      )}
    </main>
  );
}
