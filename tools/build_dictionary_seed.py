#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
재료 정규화 사전 시드 생성기  (개발 순서 1번)

data/ingredient-dictionary.csv  ->  db/seed_dictionary.sql
                                    (ingredient · ingredient_alias INSERT)

사용법
------
    python tools/build_dictionary_seed.py            # SQL 생성 + 리포트
    python tools/build_dictionary_seed.py --check    # 검증만 (파일 안 씀)
    python tools/build_dictionary_seed.py --sqlite   # SQLite 방언으로 생성

완료 판단 (README 개발 순서 1번)
    "CSV 47개 표기 반영" — 표기 47개가 표준 40종으로 빠짐없이 들어가면 통과.
    --check 가 이 숫자를 세어서 확인한다.


이 스크립트가 지키는 규칙
------------------------
CSV 한 줄은 "이 표기를 봤다"는 실측 기록이지 재료 마스터가 아니다.
그래서 두 갈래로 나눠 넣는다.

    표기 원문 == 표준명  ->  ingredient 만
    표기 원문 != 표준명  ->  ingredient(표준명) + ingredient_alias(표기 원문)

`대체가능군` 컬럼은 두 가지가 섞여 있다.

    상위어 관계   삼겹살 -> 돼지고기      -> ingredient.parent_id 에 넣는다
    대체 가능군   설탕 <-> 올리고당       -> v1 스키마에 넣을 곳이 없다

후자는 버리지 않고 리포트로만 뽑는다. 스펙에 없는 테이블을 여기서
만들면 schema.sql 과 어긋나기 때문이다 (docs/v1-spec.md 5장).
"""

import argparse
import csv
import pathlib
import sys
import unicodedata
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "ingredient-dictionary.csv"
OUT_PATH = ROOT / "db" / "seed_dictionary.sql"

PARSER_NOTE = "ingredient-dictionary.csv (실측 47개 표기)"


# ---------------------------------------------------------------------
#  CSV `유형` -> ingredient_alias.kind
#
#  schema.sql 이 적어둔 어휘: TYPO / SPACING / SYNONYM / BRAND / DIALECT
#  여기에 AMBIGUOUS 를 하나 더 쓴다. 이유는 아래 AMBIGUOUS_NOTE 참조.
# ---------------------------------------------------------------------
KIND = {
    "오탈자":   "TYPO",
    "띄어쓰기": "SPACING",
    "별칭":     "SYNONYM",
    "브랜드명": "BRAND",
    "하위어":   "SYNONYM",
    "정상":     "SYNONYM",   # 깨소금 -> 깨 처럼 '정상'인데 이름이 다른 경우
    "모호":     "AMBIGUOUS",  # 간장 -> 진간장 : 어떤 간장인지 불명
    "상위어":   "AMBIGUOUS",  # 액젓 -> 멸치액젓 : 종류 미지정
}

AMBIGUOUS_NOTE = """\
AMBIGUOUS 는 "사전에 후보는 있지만 단정하면 안 되는 표기"다.
'간장'을 말없이 진간장으로 확정하면 국간장 있는 집이 진간장을 사러 간다
(docs/v1-spec.md 2장 원칙 ④, 7장 "대체 불가 주의").

매핑 코드(개발 순서 3번)는 이 kind 를 보고 확정이 아니라
확인 필요로 보내야 한다. 그래서 버리지 않고 kind 로 남긴다."""

# 구매 대상이 아닌 유형 -> purchasable = FALSE
NOT_PURCHASABLE = {"조리부산물", "비구매"}


# ---------------------------------------------------------------------
#  카테고리별 기본값
#
#  CSV 에는 유통기한·매대 정보가 없다. 그렇다고 전부 NULL 로 두면
#  장보기 판정이 COALESCE(shelf_life_days, 7) 로 떨어져서 소금도
#  일주일이면 "사야 함"이 된다 (schema.sql 핵심 쿼리 3).
#
#  그래서 카테고리 단위 대략치를 깐다. 값은 짧은 쪽으로 굽혔다 —
#  원칙 ②(오류 비용의 비대칭)에서 틀리는 방향을 고른 결과다.
#
#      길게 잡아 틀림  = 없는데 있다고 함 -> 저녁 계획 붕괴  (치명적)
#      짧게 잡아 틀림  = 있는데 없다고 함 -> 대파 한 단 더   (회복 가능)
#
#  개별 재료 값은 여기서 손으로 넣지 않는다. 두부 14일이 실제로
#  거슬리면 그때 ingredient 를 UPDATE 하면 된다. 지금 47개를 눈대중으로
#  채우는 건 실측이 아니라 추측이다.
# ---------------------------------------------------------------------
CATEGORY_DEFAULTS = {
    #  카테고리      aisle        shelf_life_days
    "양념":       ("양념",       120),
    "육류":       ("정육",         3),
    "수산물":     ("수산",         2),
    "채소":       ("청과",         5),
    "가공식품":   ("가공식품",     14),
    "저장식품":   ("가공식품",     60),
    "기타":       (None,        None),
}


# ---------------------------------------------------------------------
#  읽기
# ---------------------------------------------------------------------

def load_rows():
    if not CSV_PATH.exists():
        sys.exit(f"{CSV_PATH} 가 없습니다.")
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = [
            {k: (v or "").strip() for k, v in r.items()}
            for r in csv.DictReader(f)
        ]
    if not rows:
        sys.exit("CSV 가 비어 있습니다.")
    need = {"표기 원문", "표준명", "카테고리", "대체가능군", "유형", "비고"}
    missing = need - set(rows[0])
    if missing:
        sys.exit(f"CSV 컬럼 부족: {', '.join(sorted(missing))}")
    return rows


def split_group(value):
    """'설탕/알룰로스' -> ['설탕', '알룰로스'],  '-' -> []"""
    if not value or value == "-":
        return []
    return [p.strip() for p in value.split("/") if p.strip()]


# ---------------------------------------------------------------------
#  변환
# ---------------------------------------------------------------------

def build(rows):
    """CSV 행 -> (ingredients, aliases, parents, report)"""
    ingredients = {}          # canonical_name -> dict
    aliases = []              # [{alias, canonical, kind, note}]
    parents = {}              # child canonical -> parent canonical
    report = defaultdict(list)

    # 1) 재료 마스터 — 표준명 기준으로 접는다.
    #    표기 원문 == 표준명 인 행이 그 재료의 속성 출처다.
    for r in rows:
        canon = r["표준명"]
        is_self = r["표기 원문"] == canon
        cat = r["카테고리"]

        if cat not in CATEGORY_DEFAULTS:
            report["미지원 카테고리"].append(f"{canon} — '{cat}'")

        aisle, shelf = CATEGORY_DEFAULTS.get(cat, (None, None))
        purchasable = r["유형"] not in NOT_PURCHASABLE

        if canon not in ingredients:
            ingredients[canon] = {
                "canonical_name": canon,
                "category": cat,
                "aisle": aisle,
                "shelf_life_days": shelf,
                "purchasable": purchasable,
                "from_self_row": is_self,
            }
        elif is_self:
            # 자기 행이 나중에 나왔으면 그쪽 속성이 정본이다.
            ingredients[canon].update(
                category=cat, aisle=aisle, shelf_life_days=shelf,
                purchasable=purchasable, from_self_row=True,
            )

    # 2) 별칭 + 상위어
    for r in rows:
        raw, canon = r["표기 원문"], r["표준명"]
        kind_kr = r["유형"]

        if raw != canon:
            kind = KIND.get(kind_kr)
            if kind is None:
                report["미지원 유형"].append(f"{raw} -> {canon} — '{kind_kr}'")
                kind = "SYNONYM"
            aliases.append({
                "alias": raw, "canonical": canon,
                "kind": kind, "note": r["비고"],
            })

        # 상위어 관계만 parent_id 로 올린다.
        # 하위어 행이면서, 대체가능군이 자기 자신이 아니고,
        # 그 이름이 표준명으로 실재할 때만.
        if kind_kr == "하위어":
            for cand in split_group(r["대체가능군"]):
                if cand != canon and cand in ingredients:
                    parents[canon] = cand
                    break

    # 3) 스키마에 넣을 곳이 없는 대체가능군 — 버리지 말고 보고만
    unplaced = set()
    for r in rows:
        if r["유형"] == "하위어" and parents.get(r["표준명"]):
            continue
        for cand in split_group(r["대체가능군"]):
            if cand not in ingredients:
                unplaced.add(cand)
    for name in sorted(unplaced):
        report["미반영 대체가능군"].append(name)

    # 4) 사람이 봐야 하는 행 — CSV 가 스스로 표시해둔 것만 옮긴다
    for r in rows:
        note = r["비고"]
        if "불일치" in note or "확인 필요" in note:
            raw, canon = r["표기 원문"], r["표준명"]
            where = raw if raw == canon else f"{raw} -> {canon}"
            report["사람 확인 필요"].append(f"{where} — {note}")

    return ingredients, aliases, parents, report


# ---------------------------------------------------------------------
#  검증
# ---------------------------------------------------------------------

def verify(rows, ingredients, aliases):
    """치명적인 것만 errors. 나머지는 warnings."""
    errors, warnings = [], []

    # ingredient_alias 는 UNIQUE (alias) — 한 표기가 두 재료로 가면 안 된다
    by_alias = defaultdict(set)
    for a in aliases:
        by_alias[a["alias"]].add(a["canonical"])
    for alias, targets in sorted(by_alias.items()):
        if len(targets) > 1:
            errors.append(f"표기 '{alias}' 가 {len(targets)}개 재료로 매핑: "
                          f"{', '.join(sorted(targets))}")

    dup = [a for a, c in Counter(x["alias"] for x in aliases).items() if c > 1]
    for a in sorted(dup):
        errors.append(f"별칭 중복: '{a}' — UNIQUE (alias) 위반")

    # 별칭이 다른 재료의 표준명과 겹치면 매핑이 어느 쪽인지 모호해진다
    for a in aliases:
        if a["alias"] in ingredients:
            errors.append(f"'{a['alias']}' 가 표준명이면서 "
                          f"'{a['canonical']}' 의 별칭이다")

    # 자기 행이 없는 재료 — 속성이 별칭 행에서 유추된 것이라 확인이 필요
    for name, ing in sorted(ingredients.items()):
        if not ing["from_self_row"]:
            warnings.append(f"자기 행 없음: '{name}' "
                            f"— 별칭 행의 표준명으로만 등장. 속성 확인 권장")

    # 완료 판단: CSV 한 행도 빠뜨리지 않았는가.
    #
    #   표기 원문 == 표준명  ->  ingredient 한 줄  (자기 행)
    #   표기 원문 != 표준명  ->  ingredient_alias 한 줄
    #
    # 재료 종수(40)로 세면 안 된다. 자기 행 없이 별칭 행의 표준명으로만
    # 생긴 재료(깨·닭·런천미트·소금)가 섞여 있어 행 수와 안 맞는다.
    self_rows = sum(1 for i in ingredients.values() if i["from_self_row"])
    covered = self_rows + len(aliases)
    if covered != len(rows):
        errors.append(f"표기 누락: CSV {len(rows)}행 -> "
                      f"자기 행 {self_rows} + 별칭 {len(aliases)} = {covered}")

    # 모든 표준명이 재료로 올라왔는가
    for r in rows:
        if r["표준명"] not in ingredients:
            errors.append(f"표준명 '{r['표준명']}' 이 재료로 안 만들어졌다")

    # 모든 별칭이 실재하는 재료를 가리키는가 (JOIN 이 조용히 버리는 걸 방지)
    for a in aliases:
        if a["canonical"] not in ingredients:
            errors.append(f"별칭 '{a['alias']}' 의 표준명 "
                          f"'{a['canonical']}' 이 재료에 없다")

    return errors, warnings


# ---------------------------------------------------------------------
#  SQL 출력
# ---------------------------------------------------------------------

def pad(s, width):
    """터미널 칸 기준 좌측 정렬. 한글은 두 칸을 먹는다."""
    s = str(s)
    cells = sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)
    return s + " " * max(0, width - cells)


def q(s):
    """SQL 문자열 리터럴. 작은따옴표만 이스케이프하면 된다."""
    return "'" + str(s).replace("'", "''") + "'"


def lit(v, sqlite=False):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return ("1" if v else "0") if sqlite else ("TRUE" if v else "FALSE")
    if isinstance(v, int):
        return str(v)
    return q(v)


def emit_sql(ingredients, aliases, parents, n_rows, sqlite=False):
    dialect = "SQLite" if sqlite else "PostgreSQL"
    ignore = ("OR IGNORE " if sqlite else "")
    tail = "" if sqlite else "\nON CONFLICT DO NOTHING"

    L = []
    add = L.append

    add("-- " + "=" * 66)
    add("--  재료 정규화 사전 시드  (개발 순서 1번)")
    add("--")
    add("--  자동 생성 파일 — 직접 고치지 말 것.")
    add("--  원본: data/ingredient-dictionary.csv")
    add("--  생성: python tools/build_dictionary_seed.py"
        + (" --sqlite" if sqlite else ""))
    add("--")
    add(f"--  방언: {dialect}")
    add(f"--  전제: db/schema.sql 을 먼저 실행해 테이블이 있어야 한다.")
    add("--  성질: 여러 번 돌려도 안전하다 (중복은 무시).")
    add("--")
    add(f"--  CSV 표기 {n_rows}개"
        f" -> 표준 {len(ingredients)}종 + 별칭 {len(aliases)}개")
    add("--")
    add("--  shelf_life_days · aisle 은 CSV 에 없다. 카테고리 단위 대략치이고")
    add("--  일부러 짧게 잡았다 — 있는데 없다고 하는 쪽이 회복 가능한 오류다")
    add("--  (docs/v1-spec.md 2장 원칙 ②). 실사용하며 UPDATE 로 조정한다.")
    add("-- " + "=" * 66)
    add("")

    # --- 1. ingredient -------------------------------------------------
    add("-- " + "-" * 66)
    add("--  1. 재료 마스터")
    add("-- " + "-" * 66)
    add("")
    add(f"INSERT {ignore}INTO ingredient")
    add("    (canonical_name, category, purchasable, shelf_life_days, aisle)")
    add("VALUES")
    rows_sql = []
    for name in sorted(ingredients):
        i = ingredients[name]
        rows_sql.append(
            "    ({} {} {} {:>6}, {})".format(
                pad(q(i["canonical_name"]) + ",", 14),
                pad(q(i["category"]) + ",", 12),
                pad(lit(i["purchasable"], sqlite) + ",", 7),
                lit(i["shelf_life_days"], sqlite),
                lit(i["aisle"], sqlite),
            ))
    add(",\n".join(rows_sql) + tail + ";")
    add("")

    # --- 2. parent_id --------------------------------------------------
    add("-- " + "-" * 66)
    add("--  2. 상위어 (parent_id)")
    add("--")
    add("--  매칭을 넓게 할 때만 쓴다. 장보기 합산에는 쓰지 않는다.")
    add("--  '삼겹살 500g' 과 '돼지고기 300g' 은 따로 산다.")
    add("-- " + "-" * 66)
    add("")
    if parents:
        for child in sorted(parents):
            add(f"UPDATE ingredient SET parent_id ="
                f" (SELECT id FROM ingredient"
                f" WHERE canonical_name = {q(parents[child])})")
            add(f" WHERE canonical_name = {q(child)};")
    else:
        add("-- 없음")
    add("")

    # --- 3. ingredient_alias -------------------------------------------
    add("-- " + "-" * 66)
    add("--  3. 별칭")
    add("--")
    for line in AMBIGUOUS_NOTE.splitlines():
        add(("--  " + line).rstrip())
    add("-- " + "-" * 66)
    add("")
    # 파생 테이블에 컬럼명을 다는 `(VALUES ...) AS v(a,b,c)` 는 SQLite 가
    # 못 받는다. CTE 로 쓰면 PostgreSQL·SQLite 둘 다 통한다.
    add("WITH v(alias, canonical, kind) AS (VALUES")
    # 주석은 반드시 행 구분 쉼표 *뒤에* 붙인다.
    # 쉼표가 '--' 뒤로 넘어가면 통째로 주석이 되어 VALUES 가 깨진다.
    ordered = sorted(aliases, key=lambda x: (x["kind"], x["alias"]))
    vals = []
    for n, a in enumerate(ordered):
        line = "    ({} {} {})".format(
            pad(q(a["alias"]) + ",", 12),
            pad(q(a["canonical"]) + ",", 14),
            q(a["kind"]))
        if n < len(ordered) - 1:
            line += ","
        if a["note"]:
            line = pad(line, 46) + f"  -- {a['note']}"
        vals.append(line)
    add("\n".join(vals))
    add(")")
    add(f"INSERT {ignore}INTO ingredient_alias (ingredient_id, alias, kind)")
    add("SELECT i.id, v.alias, v.kind")
    add("  FROM v")
    add("  JOIN ingredient i ON i.canonical_name = v.canonical" + tail + ";")
    add("")

    # --- 4. 확인 쿼리 --------------------------------------------------
    add("-- " + "=" * 66)
    add("--  투입 확인 — 개발 순서 1번의 완료 판단")
    add("-- " + "=" * 66)
    add("--")
    add(f"--   SELECT COUNT(*) FROM ingredient;        -- {len(ingredients)}")
    add(f"--   SELECT COUNT(*) FROM ingredient_alias;  -- {len(aliases)}")
    add("--")
    add("--   -- 별칭이 표준명으로 제대로 걸리는지")
    add("--   SELECT a.alias, i.canonical_name, a.kind")
    add("--     FROM ingredient_alias a")
    add("--     JOIN ingredient i ON i.id = a.ingredient_id")
    add("--    ORDER BY a.kind, a.alias;")
    add("--")
    add("--   -- 확정하면 안 되는 표기")
    add("--   SELECT alias FROM ingredient_alias WHERE kind = 'AMBIGUOUS';")

    return "\n".join(L) + "\n"


# ---------------------------------------------------------------------
#  리포트
# ---------------------------------------------------------------------

def print_report(rows, ingredients, aliases, parents, report,
                 errors, warnings):
    W = 62
    print("=" * W)
    print("재료 정규화 사전 시드")
    print("=" * W)
    print(f"CSV 표기        {len(rows)}개")
    print(f"  -> 재료       {len(ingredients)}종")
    print(f"  -> 별칭       {len(aliases)}개")
    print(f"  -> 상위어     {len(parents)}건")

    kinds = Counter(a["kind"] for a in aliases)
    print("\n별칭 유형")
    for k, n in sorted(kinds.items()):
        mark = "   <-- 확정 금지" if k == "AMBIGUOUS" else ""
        print(f"  {k:<10} {n:>2}{mark}")

    amb = [a for a in aliases if a["kind"] == "AMBIGUOUS"]
    if amb:
        print("\nAMBIGUOUS — 매핑 코드가 '확인 필요'로 보내야 하는 표기")
        for a in amb:
            print(f"  {a['alias']} -> {a['canonical']}  ({a['note']})")

    if parents:
        print("\n상위어")
        for c in sorted(parents):
            print(f"  {c} -> {parents[c]}")

    cats = Counter(i["category"] for i in ingredients.values())
    print("\n카테고리별 재료 수 / 기본 유통기한")
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        aisle, shelf = CATEGORY_DEFAULTS.get(c, (None, None))
        s = f"{shelf}일" if shelf else "미설정"
        print(f"  {pad(c, 10)}{n:>2}종   매대 {pad(aisle or '-', 10)}{s}")

    npur = [n for n, i in ingredients.items() if not i["purchasable"]]
    if npur:
        print(f"\n장보기 제외 (purchasable=FALSE): {', '.join(sorted(npur))}")

    for title in ("사람 확인 필요", "미반영 대체가능군",
                  "미지원 유형", "미지원 카테고리"):
        items = report.get(title)
        if not items:
            continue
        print(f"\n{title}")
        if title == "미반영 대체가능군":
            print("  (v1 스키마에 대체군 테이블이 없다. 기록만 해둔다)")
            print("  " + ", ".join(items))
        else:
            for x in items:
                print(f"  {x}")

    if warnings:
        print("\n경고")
        for w in warnings:
            print(f"  {w}")

    print("\n" + "-" * W)
    if errors:
        print("실패 — 아래를 고치기 전에는 시드를 쓰지 마라")
        for e in errors:
            print(f"  {e}")
    else:
        print(f"통과 — 표기 {len(rows)}개가 표준 {len(ingredients)}종에"
              f" 빠짐없이 반영됨")
    print("-" * W)


# ---------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="재료 사전 CSV -> 시드 SQL")
    ap.add_argument("--check", action="store_true",
                    help="검증과 리포트만. 파일을 쓰지 않는다")
    ap.add_argument("--sqlite", action="store_true",
                    help="SQLite 방언으로 생성")
    ap.add_argument("-o", "--out", type=pathlib.Path, default=OUT_PATH,
                    help=f"출력 경로 (기본 {OUT_PATH.relative_to(ROOT)})")
    args = ap.parse_args()

    rows = load_rows()
    ingredients, aliases, parents, report = build(rows)
    errors, warnings = verify(rows, ingredients, aliases)

    print_report(rows, ingredients, aliases, parents, report,
                 errors, warnings)

    if errors:
        return 1
    if args.check:
        print("\n--check — 파일을 쓰지 않았다.")
        return 0

    sql = emit_sql(ingredients, aliases, parents, len(rows),
                   sqlite=args.sqlite)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(sql, encoding="utf-8")
    try:
        shown = args.out.relative_to(ROOT)
    except ValueError:      # 저장소 밖으로 -o 를 준 경우
        shown = args.out
    print(f"\n생성: {shown}  ({len(sql.splitlines())}줄)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
