"use client";

/**
 * 레시피 고치기
 *
 * 저장하고 나면 손댈 방법이 없었다. 파서가 재료 이름을 조금 다르게
 * 옮겼거나, 확인 화면에서 잘못 눌렀거나, 나중에 "이건 빼자" 가 생겨도
 * 그대로 살아야 했다.
 *
 * **고치는 건 레시피 내용뿐이다** — 조리 기록도, 사진도, 보관해둔 원본도
 * 건드리지 않는다. 원문 캡처는 그대로 남아서 나중에 다시 읽을 수 있다
 * (원칙 ⑤).
 *
 * 폼 하나로 보낸다. 줄마다 name·qty 를 같은 순서로 보내고, 지운 줄은
 * 이름을 비워서 서버가 걸러낸다 — 행 id 를 주고받지 않는다.
 */

import Link from "next/link";
import { useState } from "react";
import { saveEdits } from "./actions";
import type { DetailItem } from "@/lib/recipes";
import styles from "./edit.module.css";

type Row = DetailItem & { origin: string };

export default function Edit({
  id,
  title: initialTitle,
  items,
  steps,
}: {
  id: number;
  title: string;
  items: Row[];
  steps: string[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [rows, setRows] = useState<Row[]>(items);

  function set(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }

  return (
    <form action={saveEdits}>
      <input type="hidden" name="id" value={id} />

      <section className="ds-card">
        <div className={`ds-field ${styles.last}`}>
          <label className="ds-label" htmlFor="title">
            요리 이름
          </label>
          <input
            id="title"
            className="ds-input"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </section>

      <section className="ds-card">
        <h2 className={styles.cardTitle}>재료</h2>
        <p className={styles.help}>
          이름을 비우면 지워져요. 체크를 풀면 장보기에서 빠지고 레시피에는
          남아요.
        </p>

        <ul className={styles.list}>
          {rows.map((r, i) => (
            <li key={i} className={styles.row}>
              {/* 순서를 맞춰 보낸다. 서버가 같은 순번끼리 묶는다 */}
              <input type="hidden" name="section" value={r.section ?? ""} />
              <input type="hidden" name="origin" value={r.origin} />
              <input type="hidden" name="group" value={r.choice_group ?? ""} />

              <label className={`ds-check ${styles.keep}`}>
                <input
                  type="checkbox"
                  name="keep"
                  value={i}
                  checked={r.confirmed}
                  onChange={(e) => set(i, { confirmed: e.target.checked })}
                />
                <span className="box" />
                <span className={styles.sr}>장보기에 넣기</span>
              </label>

              <input
                className={`ds-input ${styles.name}`}
                name="name"
                value={r.raw_name}
                aria-label="재료 이름"
                onChange={(e) => set(i, { raw_name: e.target.value })}
              />
              <input
                className={`ds-input ${styles.qty}`}
                name="qty"
                value={r.raw_qty ?? ""}
                aria-label="수량"
                placeholder="수량"
                onChange={(e) => set(i, { raw_qty: e.target.value })}
              />
              <button
                type="button"
                className={styles.drop}
                aria-label={`${r.raw_name} 지우기`}
                onClick={() => set(i, { raw_name: "" })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className={`ds-btn ds-btn-secondary ds-btn-block ${styles.add}`}
          onClick={() =>
            setRows([
              ...rows,
              {
                raw_name: "",
                raw_qty: null,
                section: null,
                confirmed: true,
                choice_group: null,
                origin: "USER",
              },
            ])
          }
        >
          재료 한 줄 더
        </button>
      </section>

      <section className="ds-card">
        <h2 className={styles.cardTitle}>만드는 법</h2>
        <p className={styles.help}>한 줄이 한 단계예요.</p>
        <textarea
          className={`ds-textarea ${styles.steps}`}
          name="steps"
          rows={Math.max(6, steps.length + 2)}
          defaultValue={steps.join("\n")}
        />
      </section>

      <button type="submit" className="ds-btn ds-btn-primary ds-btn-block">
        고친 걸 저장할게요
      </button>
      <Link
        href={`/recipe/${id}`}
        className="ds-btn ds-btn-secondary ds-btn-block"
      >
        그만둘래요
      </Link>
    </form>
  );
}
