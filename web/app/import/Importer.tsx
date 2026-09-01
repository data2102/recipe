"use client";

/**
 * 옮기기 진행 화면.
 *
 * 한 건씩 순서대로 부른다. 한 요청에 몰아넣으면 서버리스 함수 제한 시간에
 * 걸려서 중간에 끊긴다 — 그러면 어디까지 갔는지도 모른다.
 *
 * 끊겨도 괜찮다. 다시 누르면 이미 옮긴 건 건너뛴다 (노션 주소가 열쇠다).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importOne } from "./actions";
import type { ImportResult } from "./sources";
import styles from "./importer.module.css";

export type Item = {
  index: number;
  title: string;
  notionUrl: string;
  hasText: boolean;
  note: string | null;
  done: boolean;
};

type State = "wait" | "doing" | "ok" | "skip" | "fail";

export default function Importer({ items }: { items: Item[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<Record<number, State>>(
    Object.fromEntries(items.map((i) => [i.index, i.done ? "skip" : "wait"])),
  );
  const [why, setWhy] = useState<Record<number, string>>({});

  const todo = items.filter((i) => i.hasText);
  const capture = items.filter((i) => !i.hasText);
  const left = todo.filter((i) => state[i.index] === "wait").length;

  async function run() {
    setRunning(true);
    for (const item of todo) {
      if (state[item.index] !== "wait") continue;
      setState((s) => ({ ...s, [item.index]: "doing" }));
      let r: ImportResult;
      try {
        r = await importOne(item.index);
      } catch (e) {
        r = {
          ok: false,
          title: item.title,
          message: e instanceof Error ? e.message : "연결이 끊겼어요.",
        };
      }
      if (r.ok) {
        setState((s) => ({ ...s, [item.index]: r.skipped ? "skip" : "ok" }));
      } else {
        setState((s) => ({ ...s, [item.index]: "fail" }));
        setWhy((w) => ({ ...w, [item.index]: r.message }));
      }
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <>
      <section className="ds-card">
        <h2 className={styles.cardTitle}>글로 적어둔 것 {todo.length}개</h2>
        <p className={styles.body}>
          노션 본문을 그대로 파서에 넣어요. 캡처를 올릴 때와 같은 길이라
          사전에 없는 재료도 똑같이 쌓입니다.
        </p>
        <p className={styles.hint}>
          한 건에 10~30초쯤 걸려요. 도중에 끊겨도 다시 누르면 이어서 해요.
        </p>
        <button
          type="button"
          className="ds-btn ds-btn-primary ds-btn-block"
          disabled={running || left === 0}
          onClick={run}
        >
          {running
            ? "옮기는 중이에요"
            : left === 0
              ? "다 옮겼어요"
              : `${left}개 옮길게요`}
        </button>
      </section>

      <ul className={styles.list}>
        {todo.map((i) => (
          <li key={i.index} className={styles.row}>
            <span className={styles.name}>{i.title}</span>
            <span className={`${styles.mark} ${styles[state[i.index]]}`}>
              {LABEL[state[i.index]]}
            </span>
            {why[i.index] && <p className={styles.why}>{why[i.index]}</p>}
            {i.note && <p className={styles.why}>{i.note}</p>}
          </li>
        ))}
      </ul>

      {/*
        본문이 캡처뿐인 것들. 글이 없어서 자동으로는 못 넣는다.
        이건 오히려 파서를 실제 캡처로 재보는 기회다 (아직 못 재봤다).
      */}
      <h2 className={styles.section}>캡처로 올려야 하는 것 {capture.length}개</h2>
      <p className={styles.body}>
        노션에 재료가 이미지로만 있어요. 노션에서 그 이미지를 열어 앱으로
        공유하거나, <Link href="/add">레시피 추가</Link> 에서 올려주세요.
      </p>
      <ul className={styles.list}>
        {capture.map((i) => (
          <li key={i.index} className={styles.row}>
            <a
              className={styles.link}
              href={i.notionUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {i.title}
            </a>
            <span className={`${styles.mark} ${i.done ? styles.ok : ""}`}>
              {i.done ? "넣었어요" : "노션에서 열기"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

const LABEL: Record<State, string> = {
  wait: "기다리는 중",
  doing: "옮기는 중",
  ok: "넣었어요",
  skip: "이미 있어요",
  fail: "실패",
};
