# -*- coding: utf-8 -*-
"""저장 — 원본을 절대 버리지 않는다 (원칙 ⑤).

파서가 좋아지면 source_asset.parser_version 으로 재파싱 대상을 뽑아
과거 레시피를 전부 다시 돌린다. 원본을 안 남기면 그 시점의 파싱 품질이
영구히 박제된다.

파싱이 실패해도 원본은 남긴다. save_failed() 가 그 경로다.
"""

import datetime
import hashlib
import pathlib
import shutil


def _now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def keep_original(source, store_dir):
    """이미지 원본을 보관소로 복사하고 storage_key 를 돌려준다.

    내용 해시로 이름을 짓는다. 같은 캡처를 두 번 넣어도 사본이 안 늘고,
    파일명이 바뀌어도 같은 원본임을 알 수 있다.
    """
    if source["kind"] != "IMAGE":
        return None
    src = pathlib.Path(source["path"])
    digest = hashlib.sha256(src.read_bytes()).hexdigest()[:16]
    dest_dir = pathlib.Path(store_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{digest}{src.suffix.lower()}"
    if not dest.exists():
        shutil.copy2(src, dest)
    return str(dest)


def save_failed(conn, source, store_dir, raw_text, parser_version):
    """파싱은 실패했지만 원본은 남긴다. recipe_id 없이 asset 만 쌓인다."""
    key = keep_original(source, store_dir)
    cur = conn.execute(
        "INSERT INTO source_asset"
        " (recipe_id, kind, storage_key, raw_text, parser_version, parsed_at)"
        " VALUES (NULL, ?, ?, ?, ?, ?)",
        (source["kind"], key,
         raw_text if raw_text is not None else source.get("text"),
         parser_version, _now()))
    conn.commit()
    return cur.lastrowid


def save(conn, parsed, rows, source, store_dir,
         source_url=None, source_kind=None):
    """레시피 한 건을 저장한다. 원문 층과 표준 층을 함께 넣는다."""
    cur = conn.execute(
        "INSERT INTO recipe (title, status, source_url, source_kind)"
        " VALUES (?, 'WISH', ?, ?)",
        (parsed["title"], source_url, source_kind or source["kind"]))
    recipe_id = cur.lastrowid

    for seq, body in enumerate(parsed["steps"], 1):
        conn.execute(
            "INSERT INTO recipe_step (recipe_id, seq, body) VALUES (?, ?, ?)",
            (recipe_id, seq, body))

    for r in rows:
        conn.execute(
            "INSERT INTO recipe_ingredient"
            " (recipe_id, raw_name, raw_qty, section, ingredient_id,"
            "  origin, evidence, confirmed, choice_group)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
            (recipe_id, r["raw_name"], r["raw_qty"], r["section"],
             r["ingredient_id"], r["origin"], r["evidence"],
             r["choice_group"]))

        # 사전에 없어서 못 붙인 표기만 쌓는다. 사람이 주기적으로 정리한다.
        if r["record_unmapped"]:
            conn.execute(
                "INSERT INTO unmapped_term (raw_name) VALUES (?)"
                " ON CONFLICT(raw_name) DO UPDATE SET"
                " hit_count = hit_count + 1",
                (r["raw_name"],))

    conn.execute(
        "INSERT INTO source_asset"
        " (recipe_id, kind, storage_key, raw_text, parser_version, parsed_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (recipe_id, source["kind"], keep_original(source, store_dir),
         parsed.get("raw_text") or source.get("text"),
         parsed["parser_version"], _now()))

    conn.commit()
    return recipe_id
