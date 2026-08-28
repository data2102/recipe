# -*- coding: utf-8 -*-
"""DB 연결과 스키마 적재.

운영 대상은 PostgreSQL 이고 db/schema.sql 이 정본이다. 로컬 CLI 는
SQLite 로 돌린다 — 설치가 없어야 "캡처 한 장 넣어보기"가 가벼워진다.

스키마를 따로 관리하지 않는다. db/schema.sql 을 읽어서 그 파일 머리말이
적어둔 치환 규칙을 적용할 뿐이다. 스키마가 두 벌이 되면 반드시 갈라진다.
"""

import pathlib
import re
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "db" / "schema.sql"
SEED = ROOT / "db" / "seed_dictionary.sql"


# db/schema.sql 머리말의 "방언" 표 그대로다.
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
    """PostgreSQL DDL -> SQLite. 치환 규칙은 schema.sql 이 정한다."""
    for pat, rep in SUBS:
        sql = re.sub(pat, rep, sql, flags=re.I)
    return sql


def connect(path=":memory:"):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init(conn, seed=True):
    """테이블 생성 + 사전 시드. 빈 DB 에만 쓴다."""
    conn.executescript(to_sqlite(SCHEMA.read_text(encoding="utf-8")))
    if seed:
        if not SEED.exists():
            raise FileNotFoundError(
                f"{SEED} 가 없다. python tools/build_dictionary_seed.py 먼저.")
        # 시드는 PostgreSQL 판으로 커밋돼 있다. ON CONFLICT 를 SQLite 가
        # 받아들이는 형태로 바꾼다 — 어차피 빈 DB 라 중복은 없다.
        sql = SEED.read_text(encoding="utf-8").replace(
            "\nON CONFLICT DO NOTHING;", ";")
        conn.executescript(sql)
    conn.commit()


def open_db(path, seed=True):
    """없으면 만들어서 초기화하고, 있으면 그대로 연다."""
    p = pathlib.Path(path)
    fresh = str(p) == ":memory:" or not p.exists()
    if not fresh and p.stat().st_size == 0:
        fresh = True
    if str(p) != ":memory:":
        p.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(str(p))
    if fresh:
        init(conn, seed=seed)
    return conn
