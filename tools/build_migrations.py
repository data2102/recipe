#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
마이그레이션 생성  (작업 순서 1번 — docs/claude-code-brief.md 8장)

db/schema.sql 과 db/seed_dictionary.sql 을 supabase/migrations/ 아래
마이그레이션 파일로 옮긴다. **내용은 한 글자도 바꾸지 않는다** — 머리말만
붙여서 그대로 복사한다.

    python tools/build_migrations.py            # 생성
    python tools/build_migrations.py --check    # 어긋났는지만 확인 (파일 안 씀)

왜 복사하는가
-------------
Supabase CLI 는 supabase/migrations/*.sql 을 파일명 순서로 올린다. 참조나
include 가 없어서 파일이 스스로 완결돼 있어야 한다. 그렇다고 스키마를 두
벌로 손보면 갈라진다 — 그래서 db/schema.sql 하나만 사람이 고치고, 이쪽은
생성물로 둔다. CI 가 --check 로 어긋남을 잡는다.
(db/seed_dictionary.sql 도 CSV 에서 나온 생성물이다. 생성물의 생성물이라
 순서가 있다: CSV -> seed_dictionary.sql -> 마이그레이션)

언제까지 재생성해도 되나
-----------------------
**아직 아무 DB 에도 안 올렸을 때까지만.** 실제 DB 에 한 번 올라간 뒤에는
그 파일이 이미 적용된 과거라서 고칠 수 없다. 그때부터는

  - 그 파일을 얼린다 (아래 FROZEN 에 이름과 해시를 넣는다)
  - 스키마 변경은 supabase/migrations/ 에 델타 파일을 손으로 새로 쓴다
  - db/schema.sql 도 같이 고친다 (여전히 '현재 상태'의 원본이다)

얼린 파일은 무엇과 비교하나
--------------------------
**자기 자신의 해시와 비교한다. db/schema.sql 과는 비교하지 않는다.**

처음에는 얼린 파일도 원본과 대조했는데, 그러면 델타를 쓰는 순간 영구히
빨간불이 된다 — db/schema.sql 은 '현재 상태'라 앞으로 가고 얼린 파일은
'그때의 과거'라 그대로 있으니, 둘이 다른 게 정상이다. 여기서 막아야 할
것은 원본과의 차이가 아니라 **과거 파일이 손대어지는 것**이다. 그래서
해시를 박아두고 그것만 본다.

그럼 db/schema.sql 과 마이그레이션이 갈라지는 건 누가 잡나 →
tools/verify_migration.py 다. 마이그레이션을 다 올린 DB 와 schema.sql 만
올린 DB 를 만들어 컬럼을 하나씩 대조한다. 글자가 아니라 결과를 본다.
"""

import argparse
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG_DIR = ROOT / "supabase" / "migrations"

# 실제 DB 에 올라가서 더는 손대면 안 되는 파일 -> 그때의 sha256.
#
# 2026-08-31 Supabase 운영 DB 에 셋 다 올렸다. 여기부터는 과거다 —
# db/schema.sql 을 고치면 델타 마이그레이션을 새로 써야 한다.
#
# 손으로 쓴 델타도 올린 뒤에는 여기 넣는다. 해시는 이렇게 뽑는다:
#   sha256sum supabase/migrations/<파일>.sql
FROZEN = {
    "20260831000000_init_schema.sql":
        "94d81d091e5d5c1f198386accb4e43e90798f456c1a01c68dbc836185c43fea7",
    "20260831000001_seed_dictionary.sql":
        "ae2d84999c2f285b87a75101b2d18c00d683a70e4a33c4e9bd86c768b8f8e565",
    "20260831000002_lock_down.sql":
        "3b252de851062e71a0744db16565a2abe113e15937b21ade76f5d037eef53287",
}


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------
#  무엇을 어디로
#
#  파일명은 Supabase 규칙 (<YYYYMMDDHHMMSS>_<이름>.sql). 파일명 순서가
#  적용 순서라서 시드가 스키마보다 뒤여야 한다.
# ---------------------------------------------------------------------

PLAN = [
    {
        "out": "20260831000000_init_schema.sql",
        "src": "db/schema.sql",
        "title": "v1 데이터 모델 — 테이블 {n_tables}개",
        "note": [
            "레시피·재료사전·구매이력·장보기. 설계 이유는 db/schema.sql 머리말과",
            "docs/claude-code-brief.md 6장에 있다.",
        ],
    },
    {
        "out": "20260831000001_seed_dictionary.sql",
        "src": "db/seed_dictionary.sql",
        "title": "재료 정규화 사전 시드",
        "note": [
            "data/ingredient-dictionary.csv 가 원본이다. 사전을 키우려면 CSV 를",
            "고치고 build_dictionary_seed.py 를 돌린 뒤 이 스크립트를 다시 돌린다.",
            "여러 번 돌려도 안전하다 (ON CONFLICT DO NOTHING).",
        ],
    },
    {
        "out": "20260831000002_lock_down.sql",
        "src": "db/policy.sql",
        "title": "접근 잠금 — RLS 켜고 정책은 두지 않는다",
        "note": [
            "v1 에는 로그인이 없다. anon 키로 아무나 읽고 지우는 일이 없게",
            "REST 문을 닫아둔다. 앱은 서버에서 PostgreSQL 에 직접 붙는다.",
            "이유는 db/policy.sql 머리말에 있다.",
        ],
    },
]


def title_of(item, body):
    """머리말 제목. 숫자는 원본에서 세서 넣는다 — 손으로 적으면 어긋난다."""
    return item["title"].format(n_tables=body.count("\nCREATE TABLE "))


def header(item, body):
    L = []
    add = L.append
    add("-- " + "=" * 66)
    add(f"--  {title_of(item, body)}")
    add("--")
    add("--  자동 생성 파일 — 직접 고치지 말 것.")
    add(f"--  원본: {item['src']}")
    add("--  생성: python tools/build_migrations.py")
    add("--")
    for line in item["note"]:
        add(f"--  {line}")
    add("--")
    add("--  방언: PostgreSQL (Supabase). 로컬 검증은 tools/verify_migration.py")
    add("-- " + "=" * 66)
    add("")
    add("")
    return "\n".join(L)


def render(item):
    body = (ROOT / item["src"]).read_text(encoding="utf-8")
    return header(item, body) + body


# ---------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="db/*.sql -> supabase/migrations/*.sql")
    ap.add_argument("--check", action="store_true",
                    help="어긋났는지만 확인하고 파일은 쓰지 않는다")
    args = ap.parse_args()

    W = 62
    print("=" * W)
    print("마이그레이션 " + ("확인" if args.check else "생성"))
    print("=" * W)

    stale = []          # 다시 만들어야 하는 것 (안 얼린 것만)
    touched = []        # 얼린 건데 내용이 바뀐 것
    missing_src = []

    for item in PLAN:
        src = ROOT / item["src"]
        if not src.exists():
            missing_src.append(item["src"])
            continue

        out = MIG_DIR / item["out"]
        have = out.read_text(encoding="utf-8") if out.exists() else None
        frozen = FROZEN.get(item["out"])

        if frozen:
            # 얼린 파일은 원본과 비교하지 않는다 (머리말 참조).
            # 이미 올라간 과거라, db/schema.sql 이 앞서 가는 게 정상이다.
            if have is None:
                state = "없음 — 지워졌다"
                touched.append(item["out"])
            elif digest(have) == frozen:
                state = "그대로  [얼림]"
            else:
                state = "바뀜 — 과거를 고쳤다  [얼림]"
                touched.append(item["out"])
            n = len(have.splitlines()) if have else 0
        else:
            want = render(item)
            if have == want:
                state = "그대로"
            elif have is None:
                state = "없음 -> 생성"
                stale.append(item)
            else:
                state = "어긋남 -> 재생성"
                stale.append(item)
            n = len(want.splitlines())

        print(f"\n  {item['src']}")
        print(f"    -> supabase/migrations/{item['out']}   {state}")
        print(f"       {n}줄")

    # PLAN 에 없는 파일 = 손으로 쓴 델타. 목록만 보여준다.
    extra = sorted(
        p.name for p in MIG_DIR.glob("*.sql")
        if p.name not in {i["out"] for i in PLAN})
    for name in extra:
        body = (MIG_DIR / name).read_text(encoding="utf-8")
        frozen = FROZEN.get(name)
        if frozen is None:
            state = "손으로 쓴 델타 — 아직 안 얼렸다"
        elif digest(body) == frozen:
            state = "그대로  [얼림]"
        else:
            state = "바뀜 — 과거를 고쳤다  [얼림]"
            touched.append(name)
        print(f"\n  (손으로 씀)")
        print(f"    -> supabase/migrations/{name}   {state}")
        print(f"       {len(body.splitlines())}줄")

    if missing_src:
        print("\n원본이 없다:")
        for m in missing_src:
            print(f"  {m}")
        print("\n먼저 python tools/build_dictionary_seed.py 를 돌려라.")
        return 1

    print("\n" + "-" * W)

    if touched:
        print("실패 — 얼린 마이그레이션이 바뀌었다")
        for name in touched:
            print(f"  {name}")
        print()
        print("이 파일은 이미 실제 DB 에 올라가서 고칠 수 없다.")
        print("되돌리고, 바꾸고 싶은 게 있으면 델타를 새로 써라.")
        print("-" * W)
        return 1

    if not stale:
        print("통과 — 마이그레이션이 db/ 원본과 일치한다")
        print("-" * W)
        return 0


    if args.check:
        print("실패 — 마이그레이션이 db/ 원본보다 낡았다")
        for i in stale:
            print(f"  {i['out']}")
        print("\npython tools/build_migrations.py 를 다시 돌려라.")
        print("-" * W)
        return 1

    MIG_DIR.mkdir(parents=True, exist_ok=True)
    for item in stale:
        (MIG_DIR / item["out"]).write_text(render(item), encoding="utf-8")
        print(f"생성: supabase/migrations/{item['out']}")
    print("-" * W)
    return 0


if __name__ == "__main__":
    sys.exit(main())
