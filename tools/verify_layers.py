#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
층 경계 확인 — 순수 로직에 웹이 스며들지 않았나

    python tools/verify_layers.py

왜 있나
-------
언젠가 네이티브(리액트 네이티브)로 갈 수도 있다고 정했다. **지금 옮기지는
않는다** — 판정 기준("4주 뒤 마트에서 실제로 열었는가")이 아직 안 나왔고,
안 쓰는 앱을 두 벌 만드는 건 제일 비싼 실수다.

대신 **언제든 갈 수 있는 상태만 유지한다.** 그 상태라는 게 딱 하나다:

    날짜 셈·정렬·닮음 판정 같은 순수 로직이 DB·React·Next·DOM 을
    안 끌고 다닌다.

이건 네이티브와 상관없이도 이미 지키던 규칙이다 (`*.types.ts` 를 따로 뺀
이유가 그것이다 — 서버 전용 코드가 브라우저 번들에 실리면 안 된다).
네이티브는 그 규칙에 이유를 하나 더 얹을 뿐이다.

문서로만 적어두면 반년 뒤에 무너진다. 그래서 여기서 실제로 잰다.

무엇을 잡나
-----------
  1. PURE 에 적힌 파일이 금지된 것을 import 하는가 (db·pg·react·next·node:)
  2. PURE 에 적힌 파일이 DOM 전역을 쓰는가 (document·window·…)
  3. PURE 가 PURE 아닌 것을 import 하는가 (한 다리 건너 스며드는 경우)
  4. **lib/ 에 새 파일이 생겼는데 어느 층에도 안 적혔는가**
  5. **네이티브 앱이 순수 아닌 것을 끌어가는가**

4번이 진짜 목적이다. 새 파일을 만들 때 "이건 어느 층인가" 를 한 번
묻게 만든다. 물어보지 않으면 서버 코드가 순수 층에 슬금슬금 섞인다.

5번은 값이 제일 비싼 것이다. `native/` 는 `web/lib/` 의 순수 파일을
**복사하지 않고 그대로 읽는다** (metro.config.js). 그 길로 `db.ts` 가
딸려 들어오면 **접속 문자열이 앱 파일에 실린다.** TypeScript 는 이걸
안 막는다 — `web/node_modules` 에서 `pg` 타입을 찾아내고 통과시킨다
(실제로 해봤다). 그래서 여기서 잰다.

표준 라이브러리만 쓴다 (tools/ 의 조건 — API 키 없이 CI 에서 돈다).
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = ROOT / "web" / "lib"
NATIVE = ROOT / "native"

# ---------------------------------------------------------------------
#  층
#
#  파일을 새로 만들면 여기에 적어라. 안 적으면 이 스크립트가 막는다.
# ---------------------------------------------------------------------

# 순수 TS. DB 도 화면도 안 본다 — 네이티브로 그대로 옮겨진다.
PURE = {
    "say.ts",                # 날짜 말하기 (한국 기준). 앱의 시계가 여기 있다
    "recipe-sort.ts",        # 정렬 = 추천
    "week.types.ts",
    "shopping.types.ts",
    "fridge.types.ts",
    "notes.types.ts",
    "plan.types.ts",
    "youtube-evidence.ts",   # 설명란에서 수량 있는 재료 세기
    "parse/prompts.ts",      # 자동 생성물 (prompts/*.md -> 문자열)
}

# DB 에 붙는다. 네이티브로 가면 **이쪽이 API 뒤로 들어간다** —
# 화면이 다시 그려져도 SQL 은 한 벌로 남는다.
SERVER = {
    "db.ts",
    "fridge.ts",
    "notes.ts",
    "photos.ts",
    "recipes.ts",
    "shopping.ts",
    "similar.ts",
    "week.ts",
    "weeks.ts",
    "youtube-search.ts",     # 공식 API 키를 쓴다 — 키는 서버에만 둔다
    "parse/claude.ts",
    "parse/fake.ts",
    "parse/link.ts",         # robots.txt 를 보고 읽는다. 서버에서만
    "parse/normalize.ts",
    "parse/originals.ts",
    "parse/parse.ts",
    "parse/store.ts",
    # 네이티브로 가는 문. 서버 층을 HTTP 뒤로 내는 자리라 여기 속한다
    "api/guard.ts",
}

# 브라우저에서만 돈다 (DOM). 네이티브로 가면 **다시 써야 하는 것**이다.
WEB = {
    "frames.ts",             # 영상에서 장면 뽑기 (video + canvas)
}

# 순수 층에 있으면 안 되는 import
BANNED_IMPORTS = (
    "./db",
    "../db",
    "pg",
    "react",
    "next",
    "next/",
    "@anthropic-ai/sdk",
)

# 순수 층에 있으면 안 되는 전역
BANNED_GLOBALS = (
    "document",
    "window",
    "navigator",
    "localStorage",
    "HTMLCanvasElement",
    "FileReader",
)

# 여러 줄로 쓴 import 도 잡는다.
#
#     import {
#       a, b,
#     } from "...";
#
# 한 줄짜리만 잡던 때는 이게 통째로 안 보였다 — RN 화면은 거의 다
# 여러 줄이라, 못 잡는 게 기본이고 잡는 게 예외였다 (실제로 놓쳤다).
# `;` 를 안 세는 대신 `{...}` 안에서만 줄을 넘게 해서, 뒤에 오는
# 문장이 딸려 들어오지 않게 한다.
IMPORT = re.compile(
    r'^[ \t]*(?:import|export)\s*(?:\{[^}]*\}|[^;\n]*?)\s*from\s+"([^"]+)"',
    re.M,
)


def rel(path):
    return str(path.relative_to(LIB)).replace("\\", "/")


def imports_of(path):
    return IMPORT.findall(path.read_text(encoding="utf-8"))


def resolve(name, importer):
    """상대 import 를 lib/ 기준 이름으로. lib/ 밖이면 None"""
    if not name.startswith("."):
        return None
    here = (LIB / importer).parent
    target = (here / name).resolve()
    try:
        out = target.relative_to(LIB)
    except ValueError:
        return None
    return f"{out}.ts".replace("\\", "/")


def main():
    W = 62
    print("=" * W)
    print("층 경계 확인")
    print("=" * W)
    print()

    if not LIB.is_dir():
        print(f"web/lib 을 못 찾았다: {LIB}")
        return 1

    found = {rel(p) for p in LIB.rglob("*.ts")}
    listed = PURE | SERVER | WEB
    problems = []

    # 4. 분류 안 된 파일 — 이게 이 스크립트의 진짜 목적이다
    for name in sorted(found - listed):
        problems.append(
            f"{name}: 어느 층인지 안 적혀 있다.\n"
            f"       tools/verify_layers.py 의 PURE / SERVER / WEB 중 하나에 넣어라.\n"
            f"       (순수 로직이면 PURE — 네이티브로 그대로 간다)"
        )
    for name in sorted(listed - found):
        problems.append(f"{name}: 목록에는 있는데 파일이 없다. 지웠으면 목록에서도 빼라")

    # 1~3. 순수 층이 순수한가
    for name in sorted(PURE & found):
        path = LIB / name
        body = path.read_text(encoding="utf-8")

        for imp in imports_of(path):
            if imp in BANNED_IMPORTS or imp.startswith("next/"):
                problems.append(f"{name}: 순수 층인데 `{imp}` 를 import 한다")
                continue
            inside = resolve(imp, name)
            if inside is None:
                if not imp.startswith("."):
                    problems.append(
                        f"{name}: 순수 층인데 바깥 꾸러미 `{imp}` 를 import 한다"
                    )
                continue
            if inside not in PURE:
                problems.append(
                    f"{name}: 순수 층인데 `{inside}` (순수 아님) 를 import 한다.\n"
                    f"       한 다리 건너 DB·DOM 이 딸려 온다"
                )

        # 주석·문자열은 뺀다 — "window" 라는 낱말이 설명에 나올 수 있다
        code = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
        code = re.sub(r"//[^\n]*", "", code)
        code = re.sub(r'"[^"\n]*"|\'[^\'\n]*\'|`[^`]*`', '""', code, flags=re.S)
        for g in BANNED_GLOBALS:
            if re.search(rf"\b{g}\b", code):
                problems.append(f"{name}: 순수 층인데 `{g}` 를 쓴다 (브라우저 전역)")

    # 5. 네이티브가 web/lib 에서 무엇을 끌어가나
    #
    #    앱의 창구는 `native/lib/pure.ts` 하나다. 거기만 web/lib 을
    #    import 하고, 다른 파일은 그 창구를 거친다 — 어느 파일이 순수인지
    #    아는 곳이 한 군데여야 실수도 한 군데서만 난다.
    if NATIVE.is_dir():
        gate = "lib/pure.ts"
        for path in sorted(NATIVE.rglob("*.ts*")):
            if "node_modules" in path.parts or ".expo" in path.parts:
                continue
            here = str(path.relative_to(NATIVE)).replace("\\", "/")
            for imp in imports_of(path):
                if "web/lib" not in imp:
                    continue
                if here != gate:
                    problems.append(
                        f"native/{here}: `web/lib/` 을 직접 import 한다.\n"
                        f"       앱의 창구는 native/{gate} 하나다 — 거기를 거쳐라"
                    )
                    continue
                wanted = imp.split("web/lib/", 1)[1] + ".ts"
                if wanted not in PURE:
                    problems.append(
                        f"native/{here}: 순수가 아닌 `web/lib/{wanted}` 를 앱으로 끌어간다.\n"
                        f"       서버 층은 API 뒤에 있어야 한다 — db.ts 가 딸려가면\n"
                        f"       **접속 문자열이 앱 파일에 실린다**"
                    )

    print(f"  순수 (그대로 옮겨진다)   {len(PURE & found):2d}개")
    print(f"  서버 (API 뒤로 들어간다) {len(SERVER & found):2d}개")
    print(f"  웹   (다시 써야 한다)    {len(WEB & found):2d}개")
    print()

    if problems:
        print("-" * W)
        for p in problems:
            print(f"  X {p}")
        print("-" * W)
        print(f"막힘 — {len(problems)}건")
        return 1

    print("-" * W)
    print("통과 — 순수 층에 웹이 안 스며들었다")
    print("-" * W)
    return 0


if __name__ == "__main__":
    sys.exit(main())
