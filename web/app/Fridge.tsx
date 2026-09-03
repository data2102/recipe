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

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { atHome, type Chip, type Have } from "@/lib/fridge.types";
import styles from "./Fridge.module.css";

export default function Fridge({
  chips,
  have,
}: {
  chips: Chip[];
  have: Have;
}) {
  const router = useRouter();
  /*
    **지금 있는 화면에 머문다.** 예전에는 "/" 로 못박혀 있어서, 장보기에서
    칩을 하나 누르면 식단 탭으로 튕겨 나갔다. 칩은 장보기에만 있지만
    (거기가 답을 쓰는 자리다) 주소는 그 화면 것이어야 한다.
  */
  const here = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  /**
   * 사전에 붙은 재료는 id 로, 안 붙은 재료는 레시피에 적힌 표기로 담는다.
   * 사전에 없는 재료가 더 많아서, id 만 쓰면 대부분을 못 누른다.
   */
  function toggle(chip: Chip) {
    const ids = new Set(have.ids);
    const names = new Set(have.names);

    if (chip.id !== null) {
      if (ids.has(chip.id)) ids.delete(chip.id);
      else ids.add(chip.id);
    } else if (names.has(chip.name)) {
      names.delete(chip.name);
    } else {
      names.add(chip.name);
    }

    const q = new URLSearchParams(params.toString());
    if (ids.size > 0) q.set("have", [...ids].join(","));
    else q.delete("have");
    if (names.size > 0) q.set("haveRaw", [...names].join(","));
    else q.delete("haveRaw");
    startTransition(() => router.replace(`${here}?${q}`, { scroll: false }));
  }

  function clear() {
    const q = new URLSearchParams(params.toString());
    q.delete("have");
    q.delete("haveRaw");
    startTransition(() => router.replace(`${here}?${q}`, { scroll: false }));
  }

  // 담은 게 없으면 물어볼 재료도 없다. 사과 말고 다음 할 일을 알려준다.
  if (chips.length === 0) {
    return (
      <section className="ds-card">
        <p className={styles.lead}>
          <span className={styles.quiet}>
            이번 주에 담으면 그 요리에 필요한 재료가 여기 나와요.
          </span>
        </p>
      </section>
    );
  }

  return (
    <section className="ds-card">
      {/*
        설명은 한 줄이다. 매번 읽을 글이 아닌데 세 줄을 차지하고 있었다 —
        칩이 곧 설명이라 눌러보면 안다.
      */}
      <p className={styles.lead}>
        집에 있는 걸 눌러두면 장보기에서 빼드려요.
      </p>

      <div className={styles.chips}>
        {chips.map((c) => {
          const on = atHome(have, c.id, c.name);
          return (
            <button
              key={c.id === null ? `raw:${c.name}` : `id:${c.id}`}
              type="button"
              className={`ds-chip ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(c)}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {have.ids.length + have.names.length > 0 && (
        <button type="button" className={styles.clear} onClick={clear}>
          다 지울게요
        </button>
      )}
    </section>
  );
}
