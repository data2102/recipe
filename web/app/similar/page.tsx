/**
 * 닮은 것끼리 — 이미 쌓인 중복을 훑어 정리한다 (지시서 9장)
 *
 * **탭이 아니다.** 화면은 셋이고 (레시피·식단·장보기) 중복 정리는 매일
 * 하는 일이 아니라, 레시피 화면에 딸린 화면으로 둔다 — `/weeks` 와 같은
 * 자리다.
 *
 * 이 화면은 두 가지를 같이 한다.
 *   ① 이미 쌓인 중복을 지운다
 *   ② **문턱을 재는 자리다.** 실제로 몇 쌍이 걸리는지 눈으로 보고 나서
 *      저장 확인 화면에 붙일 값을 정한다. 실측 없이 문턱을 지어내면
 *      그게 다시 틀린 판정이 된다 (lib/similar.ts 머리말)
 *
 * **언젠가 지울 화면이다.** 저장할 때 막기 시작하면 새로 안 쌓인다 —
 * `/import` 와 같은 성격이라 크게 만들지 않는다.
 */

import Link from "next/link";
import Groups from "./Groups";
import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import { FLOOR, MAX_GROUPS, groups, type Group } from "@/lib/similar";
import styles from "../page.module.css";
import weekStyles from "../weeks/weeks.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "닮은 것끼리" };

type Loaded =
  | { kind: "error"; message: string }
  | { kind: "ok"; list: Group[]; recipes: number; found: number };

/** 읽기만 한다. 화면 만들기는 아래에서 — 섞으면 오류를 못 잡는다 */
async function load(): Promise<Loaded> {
  try {
    const { list, recipes, found } = await groups();
    return { kind: "ok", list, recipes, found };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export default async function SimilarPage() {
  if (!dbUrl()) return <Setup />;
  const data = await load();
  if (data.kind === "error") return <Broken message={data.message} />;

  return (
    <main className="shell">
      <header className={styles.head}>
        <Link href="/recipes" className={weekStyles.back}>
          ← 레시피
        </Link>
        <h1 className={styles.title}>닮은 것끼리</h1>
        <p className={styles.sub}>
          레시피 {data.recipes}개에서{" "}
          {data.found === 0 ? "닮은 게 없어요" : `${data.found}묶음 찾았어요`}
        </p>
      </header>

      {data.list.length === 0 ? (
        <div className={`ds-empty ${styles.empty}`}>
          <p>겹치는 게 없어요. 그대로 두면 돼요.</p>
        </div>
      ) : (
        <>
          {/*
            판정이 아니라는 걸 목록 앞에서 말한다. 문턱을 낮게 잡아서
            아닌 것도 섞여 있는데, 그걸 안 적으면 앱이 틀린 것으로 읽힌다.
          */}
          <p className={styles.note}>
            서로 닮은 것끼리 묶어서 닮은 순으로 늘어놨어요.{" "}
            <strong>중복이라는 뜻은 아니에요</strong> — 일부러 넉넉하게 걸러서
            아닌 것도 섞여 있어요. 남길 걸 열어서 고치고 나머지를 지우면 돼요.
          </p>

          <Groups list={data.list} />

          {data.found > MAX_GROUPS && (
            <p className={styles.note}>
              가장 닮은 {MAX_GROUPS}묶음만 보여드렸어요. 이만큼 정리하고 다시
              열면 다음 것이 나와요.
            </p>
          )}

          <p className={styles.note}>
            닮은 정도가 {Math.round(FLOOR * 100)}% 를 넘으면 묶어요. 대파·양파처럼
            어디에나 들어가는 재료는 근거로 약하게 셉니다.
          </p>
        </>
      )}
    </main>
  );
}
