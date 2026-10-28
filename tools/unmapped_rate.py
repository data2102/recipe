#!/usr/bin/env python3
"""미분류율을 잰다 — 지시서 8장 5번의 판정 기준.

    python tools/unmapped_rate.py                 # $DATABASE_URL
    python tools/unmapped_rate.py --url "postgresql://..."

**왜 재는가.** 사전에 못 붙은 재료는 장보기에 개별 항목으로 나간다.
같은 것을 다르게 적은 두 표기가 둘 다 미분류면 **두 줄이 되고 두 번 산다.**
지시서는 미분류 10% 안쪽을 통과 기준으로 잡았고, 절반을 넘으면 다음
단계로 가지 말라고 한다. 지금까지 한 번도 안 쟀다.

**무엇을 미분류로 세는가.** `pipeline/normalize.py` 의 `summary()` 와
같은 정의다 — 사전 조회표에 **아예 없는** 표기(UNMAPPED)만 센다.
사전에 있지만 종류가 여럿인 것(AMBIGUOUS)은 `ingredient_id` 가 비어도
미분류가 아니다. 사람에게 물어보기로 한 것이지 모르는 게 아니다.
조회 키는 양쪽과 같은 규칙으로 **공백만 지운다** (`_key` · `key`).

**`hit_count` 를 믿지 마라.** 저장할 때마다 더해지는데 레시피를 고치면
사전 대조를 다시 하므로 같은 표기가 두 번 쌓인다. 그래서 "어디부터
사전에 넣을까" 는 `recipe_ingredient` 에서 **지금 실제로 몇 번 나오는지**
를 세서 정한다. `hit_count` 는 참고로만 같이 낸다.

표준 라이브러리만 쓴다. PostgreSQL 은 `psql` 로 붙는다 (CLAUDE.md).
"""

import argparse
import os
import signal
import subprocess
import sys

# `| head` 로 잘라도 죽지 않게 한다 — 훑어보는 도구다
signal.signal(signal.SIGPIPE, signal.SIG_DFL)

# 사전 조회표. 표준명과 별칭을 다 모으고 공백을 지운다 — 양쪽 코드와 같은 규칙.
DICT = """
    SELECT regexp_replace(canonical_name, '\\s+', '', 'g') AS k,
           NULL::text AS kind
      FROM ingredient
     UNION ALL
    SELECT regexp_replace(a.alias, '\\s+', '', 'g'), a.kind
      FROM ingredient_alias a
"""

# 재료 한 줄 + 사전에 붙었는지. `shopping` 은 BODY 미확인 줄을 안 쓰므로
# 장보기 기준 분모를 따로 낼 수 있게 origin·confirmed 도 들고 온다.
ROWS = f"""
    WITH dict AS ({DICT}),
    ri AS (
      SELECT r.id,
             r.recipe_id,
             r.raw_name,
             r.ingredient_id,
             (r.origin <> 'BODY' OR r.confirmed) AS in_cart,
             regexp_replace(r.raw_name, '\\s+', '', 'g') AS k
        FROM recipe_ingredient r
        JOIN recipe rc ON rc.id = r.recipe_id
       WHERE rc.status <> 'BAD'
    )
    SELECT ri.*,
           (NOT EXISTS (SELECT 1 FROM dict d WHERE d.k = ri.k)) AS unmapped
      FROM ri
"""

QUERIES = {
    # ① 전체 · 장보기 기준 미분류율
    "rate": f"""
        WITH x AS ({ROWS})
        SELECT COUNT(*) FILTER (WHERE TRUE),
               COUNT(*) FILTER (WHERE unmapped),
               COUNT(*) FILTER (WHERE in_cart),
               COUNT(*) FILTER (WHERE in_cart AND unmapped),
               COUNT(*) FILTER (WHERE ingredient_id IS NULL AND NOT unmapped),
               COUNT(DISTINCT recipe_id),
               COUNT(DISTINCT k) FILTER (WHERE unmapped)
          FROM x
    """,
    # ② 레시피 쪽 수치.
    #
    #    **레시피 수는 `recipe` 에서 센다.** 재료 줄에서 세면 재료가 0줄인
    #    레시피가 통째로 빠진다 — 링크에서 제목만 건진 "이름만 저장" 이
    #    그렇다. 그건 분모에서 사라질 게 아니라 **따로 보여줘야 하는 수**다
    #    (장보기에 아무것도 못 내보내는 레시피니까).
    "recipes": f"""
        WITH x AS ({ROWS})
        SELECT (SELECT COUNT(*) FROM recipe WHERE status <> 'BAD'),
               (SELECT COUNT(DISTINCT recipe_id) FROM x),
               (SELECT COUNT(*) FROM (
                  SELECT recipe_id FROM x GROUP BY recipe_id
                   HAVING COUNT(*) FILTER (WHERE unmapped) = 0) t)
    """,
    # ③ **사전에 이미 있는데 안 붙어 있는 줄.**
    #
    #    두 가지가 섞여 있다: 사전이 "종류가 여럿" 이라 일부러 안 붙인 것
    #    (`모호`/AMBIGUOUS — 사람이 고르라고 비워둔 자리)과, **저장한 뒤에
    #    사전이 자란 것.** 뒤쪽은 다시 저장하기만 하면 붙는다.
    #
    #    `unmapped_term.resolved_ingredient_id` 주석이 "배치로 재매핑" 이라고
    #    적어뒀는데 **그 배치는 아직 없다** — 사전을 키워도 이미 저장된
    #    레시피는 그대로다. 이 숫자가 그 빚의 크기다.
    "stale": f"""
        WITH x AS ({ROWS})
        SELECT COUNT(*) FILTER (WHERE d.kind = 'AMBIGUOUS'),
               COUNT(*) FILTER (WHERE d.kind IS DISTINCT FROM 'AMBIGUOUS')
          FROM x
          JOIN LATERAL (
            SELECT kind FROM ({DICT}) dd WHERE dd.k = x.k
             ORDER BY (kind IS NOT NULL) LIMIT 1
          ) d ON TRUE
         WHERE x.ingredient_id IS NULL AND NOT x.unmapped
    """,

    # ④ 사전에 넣을 순서 — 실제 등장 횟수가 기준이다
    "top": f"""
        WITH x AS ({ROWS})
        SELECT ri.raw_name,
               COUNT(*) AS times,
               COUNT(DISTINCT ri.recipe_id) AS recipes,
               COALESCE(u.hit_count, 0) AS logged
          FROM x ri
          LEFT JOIN unmapped_term u ON u.raw_name = ri.raw_name
         WHERE ri.unmapped
         GROUP BY ri.raw_name, u.hit_count
         ORDER BY recipes DESC, times DESC, ri.raw_name
         LIMIT 25
    """,
}


def ask(url, sql):
    """psql 한 번. 탭으로 갈라서 돌려준다."""
    out = subprocess.run(
        ["psql", url, "-X", "-q", "-t", "-A", "-F", "\t", "-v",
         "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        # 접속 문자열이 섞여 나오지 않게 stderr 만 보여준다
        sys.exit(f"DB 를 못 읽었어요:\n{out.stderr.strip()}")
    return [ln.split("\t") for ln in out.stdout.strip().splitlines() if ln]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default=os.environ.get("DATABASE_URL", ""))
    args = p.parse_args()
    if not args.url:
        sys.exit("DATABASE_URL 이 없어요. --url 로 주셔도 됩니다.")

    (total, un, cart, cart_un, _unbound, _r, distinct) = [
        int(v) for v in ask(args.url, QUERIES["rate"])[0]
    ]
    if total == 0:
        sys.exit("재료 행이 하나도 없어요. 레시피부터 넣어주세요.")
    all_recipes, with_items, clean = [
        int(v) for v in ask(args.url, QUERIES["recipes"])[0]
    ]
    amb, stale = [int(v) for v in ask(args.url, QUERIES["stale"])[0]]

    rate = un / total
    cart_rate = cart_un / cart if cart else 0.0
    empty = all_recipes - with_items

    print(f"레시피 {all_recipes}개 · 재료 {total}줄 "
          f"(장보기에 나가는 줄 {cart})\n")
    print(f"  미분류율          {rate:.1%}   ({un}/{total})")
    print(f"  장보기 기준       {cart_rate:.1%}   ({cart_un}/{cart})")
    print(f"  서로 다른 표기    {distinct}개")
    print(f"  미분류 없는 레시피 {clean}/{with_items}")
    if empty:
        print(f"  재료가 0줄인 레시피 {empty} — 이름만 저장된 것이라 "
              f"장보기에 아무것도 못 냅니다")
    if amb:
        print(f"  종류가 여럿이라 일부러 안 붙인 줄 {amb} "
              f"(사전의 '모호' — 미분류가 아닙니다)")
    if stale:
        print(f"  ** 사전에 이미 있는데 안 붙은 줄 {stale} — "
              f"다시 저장하면 붙습니다 **")

    # 지시서 8장 5번
    print()
    if rate < 0.10:
        print("→ 통과 (10% 안쪽). 사전이 실제 레시피를 따라가고 있어요.")
    elif rate <= 0.50:
        print("→ 10% 를 넘었어요. 아래 표기를 CSV 에 넣고 다시 재보세요.")
    else:
        print("→ 절반을 넘었어요. 지시서는 여기서 다음 단계로 가지 말라고 합니다 "
              "— 사전을 먼저 키우세요.")

    top = ask(args.url, QUERIES["top"])
    if top:
        print("\n사전에 넣으면 값이 큰 순서 "
              "(data/ingredient-dictionary.csv):\n")
        print(f"  {'표기':<16} {'줄':>4} {'레시피':>6} {'기록':>6}")
        for name, times, recs, logged in top:
            print(f"  {name:<16} {times:>4} {recs:>6} {logged:>6}")
        print("\n  '레시피' 가 2 이상인 것부터 넣으세요 — 여러 요리에 걸친 "
              "표기라야\n  장보기에서 줄이 합쳐집니다. '기록' 은 "
              "unmapped_term 의 hit_count 인데\n  고칠 때마다 더해져 부풀 수 "
              "있어서 참고로만 봅니다.")


if __name__ == "__main__":
    main()
