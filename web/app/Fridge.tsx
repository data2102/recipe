"use client";

/**
 * 집에 있는 재료 — 전부 선택 사항 (지시서 3장 탭 3)
 *
 * 칩을 눌러두면 그게 있는 요리가 위로 온다. **필터가 아니라 가중치라서
 * 하나도 안 맞아도 목록이 비지 않는다.**
 *
 * 저장하지 않는다. 주소(`?have=`)에만 실려 있다가 화면을 떠나면 사라진다
 * (지시서 6장). 그래서 갱신을 안 해서 어긋날 일이 없다.
 *
 * 수량은 묻지 않는다. 있냐 없냐만.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Chip } from "@/lib/fridge.types";
import styles from "./Fridge.module.css";

export default function Fridge({
  chips,
  have,
}: {
  chips: Chip[];
  have: number[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const picked = new Set(have);

  function toggle(id: number) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    const q = new URLSearchParams(params.toString());
    if (next.size > 0) q.set("have", [...next].join(","));
    else q.delete("have");
    startTransition(() => router.replace(`/?${q}`, { scroll: false }));
  }

  function clear() {
    const q = new URLSearchParams(params.toString());
    q.delete("have");
    startTransition(() => router.replace(`/?${q}`, { scroll: false }));
  }

  if (chips.length === 0) return null;

  return (
    <section className="ds-card">
      <p className={styles.lead}>
        집에 있는 걸 눌러두면 그게 들어간 요리를 위로 올려드려요.
        <br />
        <span className={styles.quiet}>안 해도 추천은 그대로 나와요.</span>
      </p>

      <div className={styles.chips}>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`ds-chip ${picked.has(c.id) ? "on" : ""}`}
            aria-pressed={picked.has(c.id)}
            onClick={() => toggle(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {have.length > 0 && (
        <button type="button" className={styles.clear} onClick={clear}>
          다 지울게요
        </button>
      )}
    </section>
  );
}
