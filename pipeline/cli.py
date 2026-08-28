# -*- coding: utf-8 -*-
"""수집 -> 파싱 -> 정규화 -> 저장 한 바퀴 (개발 순서 2번).

    python -m pipeline ingest 캡처.png
    python -m pipeline ingest --text "$(cat 레시피.txt)"
    python -m pipeline show 1
    python -m pipeline unmapped

완료 판단은 "캡처 1장이 레시피로 저장됨" 하나다.
화면은 아직 없다 — 여기서 나오는 3분류가 화면 ③의 내용물이다.
"""

import argparse
import pathlib
import sys
import unicodedata

from . import db, normalize, parser as P, store

DEFAULT_DB = ".local/recipe.db"
DEFAULT_STORE = ".local/originals"

BUCKET_TITLE = {
    normalize.MAPPED:   "확정",
    normalize.CHECK:    "확인 필요",
    normalize.UNMAPPED: "미분류",
}


def pad(s, width):
    s = str(s)
    cells = sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)
    return s + " " * max(0, width - cells)


def _report(parsed, rows):
    """화면 ③ 이 보여줄 것을 글자로. 확정은 접고 확인 필요를 펼친다."""
    counts, unmapped_rate = normalize.summary(rows)

    print(f"\n  {parsed['title']}")
    print(f"  재료 {len(rows)} · 단계 {len(parsed['steps'])}")

    for bucket in (normalize.MAPPED, normalize.CHECK, normalize.UNMAPPED):
        picked = [r for r in rows if r["bucket"] == bucket]
        if not picked:
            continue
        print(f"\n  [{BUCKET_TITLE[bucket]}] {len(picked)}")
        if bucket == normalize.MAPPED:
            # 확정은 뭉쳐서 넘긴다 (스펙 10장 "한 화면, 한 가지 일")
            print("    " + ", ".join(r["label"] for r in picked))
            continue
        for r in picked:
            qty = f"  {r['raw_qty']}" if r["raw_qty"] else ""
            print(f"    {pad(r['label'], 18)}{qty}")
            if r["evidence"]:
                print(f"      {r['evidence']}")
    return counts, unmapped_rate


def cmd_ingest(args):
    if args.text:
        source = P.text_source(args.text)
    elif args.image:
        source = P.image_source(args.image)
    else:
        print("이미지 경로나 --text 중 하나가 필요하다.", file=sys.stderr)
        return 2

    conn = db.open_db(args.db)
    ask = P.make_anthropic_ask(model=args.model)

    try:
        parsed = P.parse(source, ask)
    except P.ParseError as e:
        # 원본은 남긴다. 나중에 직접 편집하거나 파서를 고쳐 재파싱한다.
        asset_id = store.save_failed(conn, source, args.store,
                                     e.raw_text, P.PARSER_VERSION)
        print(f"파싱 실패: {e}", file=sys.stderr)
        print(f"원본은 남겼다 (source_asset #{asset_id}). "
              f"파서를 고치면 재파싱할 수 있다.", file=sys.stderr)
        return 1

    table = normalize.load_dictionary(conn)
    rows = normalize.normalize(parsed["items"], parsed["choice_groups"], table)

    recipe_id = store.save(conn, parsed, rows, source, args.store,
                           source_url=args.source_url)

    counts, unmapped_rate = _report(parsed, rows)
    tin, tout = parsed["usage"]
    print(f"\n  저장됨 — recipe #{recipe_id} (status=WISH)")
    print(f"  토큰 입력 {tin:,} / 출력 {tout:,}")
    if counts[normalize.UNMAPPED]:
        print(f"  미분류 {unmapped_rate:.0%} — "
              f"python -m pipeline unmapped 로 확인")
    return 0


def cmd_show(args):
    conn = db.open_db(args.db)
    r = conn.execute("SELECT * FROM recipe WHERE id = ?",
                     (args.recipe_id,)).fetchone()
    if r is None:
        print(f"recipe #{args.recipe_id} 없음", file=sys.stderr)
        return 1

    print(f"\n  {r['title']}   [{r['status']}]")
    rows = conn.execute(
        "SELECT ri.*, i.canonical_name"
        "  FROM recipe_ingredient ri"
        "  LEFT JOIN ingredient i ON i.id = ri.ingredient_id"
        " WHERE ri.recipe_id = ? ORDER BY ri.id", (args.recipe_id,)).fetchall()
    print(f"\n  재료 {len(rows)}")
    for x in rows:
        mark = "  " if x["ingredient_id"] else "? "
        qty = f"  {x['raw_qty']}" if x["raw_qty"] else ""
        print(f"    {mark}{pad(normalize.label(x['raw_name'], x['canonical_name']), 18)}{qty}")
        if x["evidence"]:
            print(f"        {x['evidence']}")

    steps = conn.execute(
        "SELECT seq, body FROM recipe_step WHERE recipe_id = ? ORDER BY seq",
        (args.recipe_id,)).fetchall()
    if steps:
        print(f"\n  조리 단계 {len(steps)}")
        for s in steps:
            print(f"    {s['seq']}. {s['body']}")

    a = conn.execute(
        "SELECT kind, storage_key, parser_version, parsed_at FROM source_asset"
        " WHERE recipe_id = ?", (args.recipe_id,)).fetchone()
    if a:
        print(f"\n  원본 {a['kind']} · 파서 {a['parser_version']} · {a['parsed_at']}")
        if a["storage_key"]:
            print(f"       {a['storage_key']}")
    return 0


def cmd_unmapped(args):
    conn = db.open_db(args.db)
    rows = conn.execute(
        "SELECT raw_name, hit_count FROM unmapped_term"
        " WHERE resolved_ingredient_id IS NULL"
        " ORDER BY hit_count DESC, raw_name").fetchall()
    if not rows:
        print("미분류 표기 없음.")
        return 0
    print(f"미분류 표기 {len(rows)}개 — 자주 나오는 것부터 사전에 넣는다\n")
    for r in rows:
        print(f"  {pad(r['raw_name'], 20)}{r['hit_count']}회")
    print("\ndata/ingredient-dictionary.csv 에 넣고 "
          "python tools/build_dictionary_seed.py 를 다시 돌린다.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pipeline",
                                 description="레시피 수집 -> 파싱 -> 저장")
    ap.add_argument("--db", default=DEFAULT_DB, help=f"기본 {DEFAULT_DB}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("ingest", help="레시피 한 건 넣기")
    p.add_argument("image", nargs="?", help="캡처 이미지 경로")
    p.add_argument("--text", help="붙여넣기 원문")
    p.add_argument("--source-url", help="원본 링크. 저작권상 항상 같이 보관한다")
    p.add_argument("--model", default=P.DEFAULT_MODEL,
                   help=f"기본 {P.DEFAULT_MODEL}")
    p.add_argument("--store", default=DEFAULT_STORE,
                   help=f"원본 보관 위치. 기본 {DEFAULT_STORE}")
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("show", help="저장된 레시피 보기")
    p.add_argument("recipe_id", type=int)
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("unmapped", help="사전에 없어서 못 붙인 표기")
    p.set_defaults(func=cmd_unmapped)

    args = ap.parse_args(argv)
    return args.func(args)
