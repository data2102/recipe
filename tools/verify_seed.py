#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
사전 시드 실행 검증  (개발 순서 1번의 완료 판단)

db/schema.sql + db/seed_dictionary.sql 을 실제 DB 에 올려보고,
올라간 결과를 쿼리로 확인한다. 파일이 문법적으로 맞는지가 아니라
**정말 실행되는지**를 본다.

    python tools/verify_seed.py

DB 는 메모리 SQLite 다. 설치가 필요 없고, 덤으로 schema.sql 이 스스로
적어둔 SQLite 치환 규칙이 실제로 맞는지도 같이 검증된다.
운영 대상은 PostgreSQL 이므로 여기서 통과했다고 PG 검증이 끝난 건 아니다.

마지막에 예시 정답지(tools/truth.example.json)의 재료를 사전에 넣어보고
얼마나 걸리는지 본다. 조회가 실제로 되는지 보려는 것이지 사전 크기를
판정하려는 게 아니다 — 레시피 한 건짜리 예시라 표본이 못 된다.
사전을 늘릴 근거는 개발 순서 3번에서 unmapped_term 이 준다.
"""

import json
import pathlib
import re
import sqlite3
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_dictionary_seed import (  # noqa: E402
    ROOT, build, emit_sql, load_rows, pad, verify,
)

SCHEMA = ROOT / "db" / "schema.sql"
TRUTH = ROOT / "tools" / "truth.example.json"



# ---------------------------------------------------------------------
#  PostgreSQL -> SQLite
#
#  schema.sql 머리말이 적어둔 치환 규칙 그대로다. 규칙이 실제로
#  통하는지 확인하는 것도 이 스크립트의 일이다.
# ---------------------------------------------------------------------

SUBS = [
    (r"\bBIGSERIAL\s+PRIMARY\s+KEY\b", "INTEGER PRIMARY KEY AUTOINCREMENT"),
    (r"\bTIMESTAMPTZ\b",               "TEXT"),
    (r"\bBOOLEAN\b",                   "INTEGER"),
    (r"\bBIGINT\b",                    "INTEGER"),
    (r"\bnow\(\)",                     "CURRENT_TIMESTAMP"),
    (r"\bDEFAULT\s+TRUE\b",            "DEFAULT 1"),
    (r"\bDEFAULT\s+FALSE\b",           "DEFAULT 0"),
]


def to_sqlite(sql):
    for pat, rep in SUBS:
        sql = re.sub(pat, rep, sql, flags=re.I)
    return sql


# ---------------------------------------------------------------------

def norm(s):
    """사전 조회용 완화 정규화. 공백만 없앤다.

    '다진 마늘' -> '다진마늘' 처럼 띄어쓰기만 다른 경우를 잡는다.
    이것 말고 다른 추측은 하지 않는다 (원칙 ④).
    """
    return re.sub(r"\s+", "", s)


def main():
    W = 62
    print("=" * W)
    print("사전 시드 실행 검증")
    print("=" * W)

    # --- 1. 생성물이 CSV 와 일치하는지 --------------------------------
    rows = load_rows()
    ingredients, aliases, parents, _ = build(rows)
    errors, _ = verify(rows, ingredients, aliases)
    if errors:
        print("생성 단계에서 실패:")
        for e in errors:
            print(f"  {e}")
        return 1

    seed_sql = emit_sql(ingredients, aliases, parents, len(rows), sqlite=True)

    on_disk = (ROOT / "db" / "seed_dictionary.sql")
    if not on_disk.exists():
        print("db/seed_dictionary.sql 이 없다. "
              "먼저 python tools/build_dictionary_seed.py 를 돌려라.")
        return 1

    # 커밋된 SQL 이 CSV 보다 낡았는지 확인 (PostgreSQL 판으로 비교)
    fresh_pg = emit_sql(ingredients, aliases, parents, len(rows), sqlite=False)
    if on_disk.read_text(encoding="utf-8") != fresh_pg:
        print("\n[경고] db/seed_dictionary.sql 이 CSV 와 어긋난다.")
        print("       python tools/build_dictionary_seed.py 를 다시 돌려라.")
        return 1
    print("\n1. db/seed_dictionary.sql 이 CSV 와 일치            OK")

    # --- 2. 스키마 + 시드을 실제로 올린다 -----------------------------
    db = sqlite3.connect(":memory:")
    db.executescript(to_sqlite(SCHEMA.read_text(encoding="utf-8")))
    print("2. db/schema.sql 적재 (SQLite 치환)                 OK")

    db.executescript(seed_sql)
    print("3. db/seed_dictionary.sql 적재                      OK")

    # 두 번 돌려도 안전한지
    db.executescript(seed_sql)
    print("4. 재실행 안전 (중복 무시)                          OK")

    # --- 3. 올라간 내용 확인 ------------------------------------------
    n_ing = db.execute("SELECT COUNT(*) FROM ingredient").fetchone()[0]
    n_ali = db.execute("SELECT COUNT(*) FROM ingredient_alias").fetchone()[0]
    n_par = db.execute(
        "SELECT COUNT(*) FROM ingredient WHERE parent_id IS NOT NULL"
    ).fetchone()[0]
    n_npur = db.execute(
        "SELECT COUNT(*) FROM ingredient WHERE purchasable = 0"
    ).fetchone()[0]

    print()
    print("-" * W)
    print(f"재료          {n_ing:>3}종   (기대 {len(ingredients)})")
    print(f"별칭          {n_ali:>3}개   (기대 {len(aliases)})")
    print(f"상위어        {n_par:>3}건   (기대 {len(parents)})")
    print(f"장보기 제외   {n_npur:>3}종")
    print("-" * W)

    bad = []
    if n_ing != len(ingredients):
        bad.append("재료 수 불일치")
    if n_ali != len(aliases):
        bad.append("별칭 수 불일치 — JOIN 이 조용히 버렸을 수 있다")
    if n_par != len(parents):
        bad.append("상위어 수 불일치")

    # 고아 별칭 (JOIN 실패로 안 들어간 것)
    orphan = db.execute(
        "SELECT COUNT(*) FROM ingredient_alias a"
        " LEFT JOIN ingredient i ON i.id = a.ingredient_id"
        " WHERE i.id IS NULL").fetchone()[0]
    if orphan:
        bad.append(f"재료 없는 별칭 {orphan}건")

    # 별칭이 표준명과 겹치면 조회가 모호해진다
    clash = db.execute(
        "SELECT a.alias FROM ingredient_alias a"
        " JOIN ingredient i ON i.canonical_name = a.alias").fetchall()
    if clash:
        bad.append(f"표준명과 겹치는 별칭: {', '.join(r[0] for r in clash)}")

    # --- 4. 조회 한 바퀴 ----------------------------------------------
    print("\n조회 확인 — 별칭이 표준명으로 걸리는가")
    for raw in ("고추가루", "간마늘", "다진 마늘", "조선간장", "리챔", "간장"):
        row = db.execute(
            "SELECT i.canonical_name, a.kind"
            "  FROM ingredient_alias a"
            "  JOIN ingredient i ON i.id = a.ingredient_id"
            " WHERE a.alias = ?", (raw,)).fetchone()
        if row:
            flag = "  <-- 확정 금지" if row[1] == "AMBIGUOUS" else ""
            print(f"  {pad(raw, 12)}-> {pad(row[0], 12)}{row[1]}{flag}")
        else:
            print(f"  {pad(raw, 12)}-> (사전에 없음)")

    # --- 5. 예시 정답지로 사전 적중률 보기 ----------------------------
    if TRUTH.exists():
        truth = json.loads(TRUTH.read_text(encoding="utf-8"))
        lookup = {}
        for name, in db.execute("SELECT canonical_name FROM ingredient"):
            lookup[norm(name)] = name
        for alias, canon in db.execute(
                "SELECT a.alias, i.canonical_name FROM ingredient_alias a"
                " JOIN ingredient i ON i.id = a.ingredient_id"):
            lookup.setdefault(norm(alias), canon)

        total = unmapped = 0
        misses = []
        for fname, rec in truth.items():
            if fname.startswith("_") or not rec.get("요리명"):
                continue
            for item in rec.get("재료", []):
                nm = (item.get("이름") or "").strip()
                if not nm:
                    continue
                total += 1
                if norm(nm) not in lookup:
                    unmapped += 1
                    misses.append(nm)

        if total:
            rate = unmapped / total
            print(f"\n예시 정답지 재료 {total}개 중 미분류 {unmapped}개"
                  f" = {rate:.0%}")
            if misses:
                print(f"  미분류: {', '.join(misses)}")
            print("  참고용이다. 레시피 한 건짜리 예시 파일이라 이 수치로")
            print("  사전을 늘릴지 판단하지 않는다 — 개발 순서 3번에서")
            print("  실제 저장한 레시피의 unmapped_term 을 보고 정한다.")

    db.close()

    print("\n" + "-" * W)
    if bad:
        print("실패")
        for b in bad:
            print(f"  {b}")
        return 1
    print("통과 — 스키마와 시드가 실제 DB 에서 돌아간다")
    print("-" * W)
    return 0


if __name__ == "__main__":
    sys.exit(main())
