#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
마이그레이션 실행 검증  (작업 순서 1번의 완료 판단 — "마이그레이션 통과")

supabase/migrations/*.sql 을 **진짜 PostgreSQL 에** 파일명 순서대로 올려보고,
올라간 결과를 쿼리로 확인한다. 문법이 맞는지가 아니라 정말 실행되는지를 본다.

    python tools/verify_migration.py

DB 는 일회용이다. `recipe_verify_<pid>` 를 만들어 쓰고 끝나면 지운다.
접속 정보는 DATABASE_URL 환경변수, 없으면 로컬 기본값을 쓴다.

    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres

tools/verify_seed.py 와 무엇이 다른가
------------------------------------
verify_seed.py 는 SQLite 에 올린다 — 설치 없이 어디서나 돌아가는 게 목적이고,
덤으로 schema.sql 의 SQLite 치환 규칙을 검증한다. 하지만 운영은 PostgreSQL 이라
BIGSERIAL·FILTER·LATERAL·`ON CONFLICT` 같은 PG 문법은 거기서 안 걸린다.
이 스크립트가 그 구멍을 메운다. 둘 다 돌려야 한다.

표준 라이브러리만 쓴다. psql 로 붙는다 (psycopg 를 받지 않는다).
"""

import os
import pathlib
import re
import subprocess
import sys
import unicodedata
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_dictionary_seed import (  # noqa: E402
    ROOT, build, load_rows,
)

MIG_DIR = ROOT / "supabase" / "migrations"
SCHEMA = ROOT / "db" / "schema.sql"
SEED_MIGRATION = "20260831000001_seed_dictionary.sql"

DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"


# ---------------------------------------------------------------------
#  psql 얇은 래퍼
# ---------------------------------------------------------------------

def psql(url, *args, sql=None, path=None):
    """psql 한 번 실행. 실패하면 (returncode, stderr) 를 그대로 돌려준다."""
    cmd = ["psql", url, "-v", "ON_ERROR_STOP=1", "-X", "-q",
           "--no-psqlrc", *args]
    if path is not None:
        cmd += ["-f", str(path)]
    if sql is not None:
        cmd += ["-c", sql]
    return subprocess.run(cmd, capture_output=True, text=True)


def scalar(url, sql):
    r = psql(url, "-t", "-A", sql=sql)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()


def row(label, ok):
    """label ....... OK  형태로 한 줄. 결과 열이 세로로 맞아야 훑어진다."""
    cells = sum(2 if unicodedata.east_asian_width(c) in "WF" else 1
                for c in label)
    print(f"{label}{' ' * max(1, 52 - cells)}{'OK' if ok else 'FAIL'}")


def with_db(url, dbname):
    """URL 의 데이터베이스 이름만 바꾼다."""
    u = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(
        (u.scheme, u.netloc, "/" + dbname, u.query, u.fragment))


# ---------------------------------------------------------------------
#  schema.sql 이 스스로 적어둔 것을 그대로 기대값으로 쓴다
# ---------------------------------------------------------------------

COLUMNS_SQL = """
SELECT table_name || '.' || column_name || ' :: ' || data_type
       || ' null=' || is_nullable
       || ' default=' || COALESCE(column_default, '-')
  FROM information_schema.columns
 WHERE table_schema = 'public'
 ORDER BY table_name, column_name
"""


def columns_of(url):
    """실제로 만들어진 컬럼 목록. 글자가 아니라 결과를 본다."""
    out = psql(url, "-t", "-A", sql=COLUMNS_SQL)
    if out.returncode != 0:
        return None
    return [l.strip() for l in out.stdout.splitlines() if l.strip()]


def tables_in_schema():
    text = SCHEMA.read_text(encoding="utf-8")
    return re.findall(r"^CREATE TABLE (\w+)", text, flags=re.M)


def core_queries():
    """schema.sql 끝의 '핵심 쿼리 3개' 를 주석에서 꺼낸다.

    문서에만 적힌 쿼리는 조용히 썩는다. 컬럼 이름이 바뀌어도 아무도 모른다.
    여기서 실제 스키마에 대고 파싱시켜서 썩지 않게 만든다.
    """
    text = SCHEMA.read_text(encoding="utf-8")
    start = text.find("핵심 쿼리 3개")
    end = text.find("일부러 뺀 것")
    if start < 0:
        return []
    region = text[start:end if end > start else len(text)]

    queries, buf = [], []
    for line in region.splitlines():
        if not line.startswith("--"):
            continue
        body = line[2:].lstrip()
        if not buf and not re.match(r"^(SELECT|WITH)\b", body):
            continue
        if not buf and re.match(r"^(SELECT|WITH)\b", body):
            buf = [body]
        else:
            buf.append(body)
        if body.rstrip().endswith(";"):
            queries.append("\n".join(buf).rstrip().rstrip(";"))
            buf = []
    return queries


# ---------------------------------------------------------------------

def main():
    W = 62
    print("=" * W)
    print("마이그레이션 실행 검증 (PostgreSQL)")
    print("=" * W)

    if subprocess.run(["which", "psql"], capture_output=True).returncode != 0:
        print("\npsql 이 없다. PostgreSQL 클라이언트를 설치해라.")
        print("  Ubuntu: sudo apt-get install -y postgresql-client")
        return 1

    base = os.environ.get("DATABASE_URL", DEFAULT_URL)
    shown = re.sub(r"//[^@/]*@", "//***@", base)
    print(f"\n접속: {shown}")

    probe = psql(base, sql="SELECT 1")
    if probe.returncode != 0:
        print("\nPostgreSQL 에 못 붙었다.")
        print(f"  {probe.stderr.strip().splitlines()[-1] if probe.stderr.strip() else ''}")
        print("\nDATABASE_URL 을 주거나 로컬 PostgreSQL 을 띄워라.")
        return 1

    migrations = sorted(MIG_DIR.glob("*.sql"))
    if not migrations:
        print("\nsupabase/migrations/ 가 비었다.")
        print("먼저 python tools/build_migrations.py 를 돌려라.")
        return 1

    dbname = f"recipe_verify_{os.getpid()}"
    r = psql(base, sql=f'CREATE DATABASE "{dbname}"')
    if r.returncode != 0:
        print(f"\n검증용 DB 를 못 만들었다: {r.stderr.strip()}")
        return 1
    url = with_db(base, dbname)
    print(f"검증용 DB: {dbname} (끝나면 지운다)")

    bad = []
    try:
        # --- 1. 파일명 순서대로 올린다 --------------------------------
        print()
        for i, path in enumerate(migrations, 1):
            r = psql(url, path=path)
            if r.returncode != 0:
                print(f"{i}. {path.name}")
                print("   실패:")
                for line in r.stderr.strip().splitlines()[:12]:
                    print(f"     {line}")
                bad.append(f"{path.name} 적용 실패")
                return 1
            row(f"{i}. {path.name} 적용", True)

        # --- 2. 테이블이 다 올라왔나 ----------------------------------
        want = tables_in_schema()
        got = scalar(url, "SELECT string_agg(tablename, ',' ORDER BY tablename)"
                          "  FROM pg_tables WHERE schemaname = 'public'")
        got = set(got.split(",")) if got else set()
        missing = [t for t in want if t not in got]
        extra = sorted(got - set(want))
        if missing:
            bad.append(f"안 만들어진 테이블: {', '.join(missing)}")
        row(f"{len(migrations)+1}. 테이블 {len(want)}개 확인", not missing)
        if extra:
            print(f"   (스키마에 없는 테이블도 있다: {', '.join(extra)})")

        # --- 3. 시드가 CSV 만큼 들어갔나 ------------------------------
        rows = load_rows()
        ingredients, aliases, _parents, _ = build(rows)
        n_ing = int(scalar(url, "SELECT COUNT(*) FROM ingredient"))
        n_ali = int(scalar(url, "SELECT COUNT(*) FROM ingredient_alias"))
        ok_seed = (n_ing == len(ingredients) and n_ali == len(aliases))
        if not ok_seed:
            bad.append(f"시드 개수 불일치 — 재료 {n_ing}/{len(ingredients)},"
                       f" 별칭 {n_ali}/{len(aliases)}")
        row(f"{len(migrations)+2}. 시드 재료 {n_ing}종 · 별칭 {n_ali}개", ok_seed)

        # --- 4. 시드를 다시 올려도 안전한가 ---------------------------
        seed = MIG_DIR / SEED_MIGRATION
        if seed.exists():
            r = psql(url, path=seed)
            again = int(scalar(url, "SELECT COUNT(*) FROM ingredient"))
            ok_again = (r.returncode == 0 and again == n_ing)
            if not ok_again:
                bad.append("시드 재실행이 안전하지 않다 (중복이 들어갔거나 실패)")
            row(f"{len(migrations)+3}. 시드 재실행 안전 (중복 무시)", ok_again)

        # --- 5. schema.sql 이 적어둔 핵심 쿼리가 실제로 파싱되나 ------
        queries = core_queries()
        print(f"\n핵심 쿼리 {len(queries)}개 — 실제 스키마에 대고 파싱")
        if len(queries) != 3:
            bad.append(f"schema.sql 에서 핵심 쿼리를 {len(queries)}개만 찾았다")
        for i, q in enumerate(queries, 1):
            r = psql(url, sql=f"PREPARE vq_{i} AS\n{q}")
            head = q.splitlines()[0][:44]
            if r.returncode == 0:
                row(f"  ({i}) {head}", True)
            else:
                msg = [l for l in r.stderr.strip().splitlines()
                       if l.startswith("ERROR")]
                row(f"  ({i}) {head}", False)
                print(f"      {msg[0] if msg else r.stderr.strip()}")
                bad.append(f"핵심 쿼리 ({i}) 가 스키마와 안 맞는다")

        # --- 6. 원칙이 스키마에 남아 있나 -----------------------------
        #  '모르는 재료는 추측하지 않는다' 는 ingredient_id 가 NULL 을
        #  받을 수 있어야 성립한다. NOT NULL 이 붙는 순간 원칙이 깨진다.
        print("\n원칙 확인")
        nullable = scalar(
            url,
            "SELECT is_nullable FROM information_schema.columns"
            " WHERE table_name = 'recipe_ingredient'"
            "   AND column_name = 'ingredient_id'")
        ok_null = (nullable == "YES")
        if not ok_null:
            bad.append("recipe_ingredient.ingredient_id 가 NOT NULL 이다 —"
                       " 미분류를 저장할 곳이 없어진다")
        row("  recipe_ingredient.ingredient_id NULL 허용", ok_null)

        #  로그인이 없다는 건 아무나 쓴다는 뜻이 아니다. anon 키로 열려
        #  있으면 링크를 아는 누구나 레시피를 지울 수 있다 (db/policy.sql).
        open_tables = scalar(
            url,
            "SELECT string_agg(tablename, ', ' ORDER BY tablename)"
            "  FROM pg_tables"
            " WHERE schemaname = 'public' AND NOT rowsecurity")
        n_policy = int(scalar(
            url, "SELECT COUNT(*) FROM pg_policies WHERE schemaname='public'"))
        ok_rls = (not open_tables and n_policy == 0)
        if open_tables:
            bad.append(f"RLS 가 안 켜진 테이블: {open_tables}")
        if n_policy:
            bad.append(f"정책이 {n_policy}개 있다 — v1 은 정책 없이 잠가둔다")
        row("  모든 테이블 RLS 잠김 · 정책 0개", ok_rls)

        # --- 7. 마이그레이션을 다 올린 결과 == db/schema.sql 인가 ----
        #
        #  얼린 마이그레이션은 '그때의 과거'라 db/schema.sql 과 글자가
        #  다른 게 정상이다 (build_migrations.py 머리말). 그래서 글자
        #  대신 **결과**를 본다 — 마이그레이션을 다 올린 DB 와 schema.sql
        #  만 올린 DB 의 컬럼을 하나씩 맞춰본다. 델타를 빠뜨리면 여기서
        #  걸린다. 이게 앞으로 스키마를 고칠 때의 유일한 안전망이다.
        mirror = f"recipe_schema_{os.getpid()}"
        psql(base, sql=f'DROP DATABASE IF EXISTS "{mirror}" WITH (FORCE)')
        rm = psql(base, sql=f'CREATE DATABASE "{mirror}"')
        if rm.returncode != 0:
            bad.append("대조용 DB 를 못 만들었다")
        else:
            murl = with_db(base, mirror)
            try:
                rs = psql(murl, path=SCHEMA)
                if rs.returncode != 0:
                    bad.append("db/schema.sql 이 PostgreSQL 에서 안 돈다")
                    print()
                    for line in rs.stderr.strip().splitlines()[:8]:
                        print(f"     {line}")
                    row("  db/schema.sql == 마이그레이션 결과", False)
                else:
                    a = columns_of(url) or []
                    b = columns_of(murl) or []
                    only_mig = [x for x in a if x not in set(b)]
                    only_sch = [x for x in b if x not in set(a)]
                    same = not only_mig and not only_sch
                    if not same:
                        bad.append("db/schema.sql 과 마이그레이션 결과가 다르다"
                                   " — 델타를 빠뜨렸거나 schema.sql 을 안 고쳤다")
                    row(f"  db/schema.sql == 마이그레이션 결과"
                        f" (컬럼 {len(b)}개)", same)
                    for x in only_sch[:8]:
                        print(f"     schema.sql 에만: {x}")
                    for x in only_mig[:8]:
                        print(f"     마이그레이션에만: {x}")
            finally:
                psql(base, sql=f'DROP DATABASE IF EXISTS "{mirror}" WITH (FORCE)')

        r = psql(url, sql="INSERT INTO recipe (title) VALUES ('검증용')")
        status = scalar(url, "SELECT status FROM recipe LIMIT 1")
        ok_wish = (r.returncode == 0 and status == "WISH")
        if not ok_wish:
            bad.append("recipe.status 기본값이 WISH 가 아니다 —"
                       " 저장만 한 레시피가 추천 풀에 섞인다")
        row(f"  recipe.status 기본값 = WISH ({status or '?'})", ok_wish)

    finally:
        psql(base, sql=f'DROP DATABASE IF EXISTS "{dbname}" WITH (FORCE)')

    print("\n" + "-" * W)
    if bad:
        print("실패")
        for b in bad:
            print(f"  {b}")
        print("-" * W)
        return 1
    print("통과 — 마이그레이션이 진짜 PostgreSQL 에서 돌아간다")
    print("-" * W)
    return 0


if __name__ == "__main__":
    sys.exit(main())
