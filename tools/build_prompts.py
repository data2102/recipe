#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""프롬프트 생성  (작업 순서 4번 — docs/claude-code-brief.md 8장)

prompts/*.md 를 TypeScript 모듈로 옮긴다. **내용은 한 글자도 바꾸지 않는다.**

    python tools/build_prompts.py            # 생성
    python tools/build_prompts.py --check    # 어긋났는지만 확인 (파일 안 씀)

왜 복사하는가
-------------
같은 프롬프트를 두 곳이 쓴다 — pipeline/parser.py (정확도 측정)와
web/lib/parse/ (제품). 두 벌로 손보면 **측정한 파서와 제품이 쓰는 파서가
달라진다.** 그러면 정확도 숫자가 거짓말이 된다.

파이썬은 prompts/ 를 직접 읽는다. TypeScript 쪽은 못 읽는다 — 배포하면
web/ 밖의 파일이 번들에 안 실린다. 그래서 이쪽만 생성물로 둔다.
(db/*.sql -> supabase/migrations/ 와 같은 방식이다)
"""

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "prompts"
OUT = ROOT / "web" / "lib" / "parse" / "prompts.ts"

# 이름 -> 파일. 여기 이름이 TypeScript 에서 export 되는 이름이다.
PROMPTS = {
    "PASS1": "pass1.md",
    "PASS2": "pass2.md",
}


def render(texts):
    L = []
    add = L.append
    add("// " + "=" * 68)
    add("//  파싱 프롬프트")
    add("//")
    add("//  자동 생성 파일 — 직접 고치지 말 것.")
    add("//  원본: prompts/*.md")
    add("//  생성: python tools/build_prompts.py")
    add("//")
    add("//  프롬프트를 고치면 pipeline/parser.py 의 PARSER_VERSION 도 올린다.")
    add("//  source_asset.parser_version 에 박혀서 재파싱 대상을 뽑는 기준이 된다.")
    add("// " + "=" * 68)
    add("")
    for name, fname in PROMPTS.items():
        add(f"/** prompts/{fname} */")
        # JSON 문자열로 넣는다. 백틱·${} 가 프롬프트 본문에 있어도 안전하다.
        add(f"export const {name} = {json.dumps(texts[name], ensure_ascii=False)};")
        add("")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description="prompts/*.md -> web/lib/parse/prompts.ts")
    ap.add_argument("--check", action="store_true",
                    help="어긋났는지만 확인하고 파일은 쓰지 않는다")
    args = ap.parse_args()

    W = 62
    print("=" * W)
    print("프롬프트 " + ("확인" if args.check else "생성"))
    print("=" * W)

    texts = {}
    for name, fname in PROMPTS.items():
        path = SRC / fname
        if not path.exists():
            print(f"\n원본이 없다: prompts/{fname}")
            return 1
        texts[name] = path.read_text(encoding="utf-8")
        print(f"\n  prompts/{fname}   {len(texts[name])}자")

    want = render(texts)
    have = OUT.read_text(encoding="utf-8") if OUT.exists() else None

    print("\n" + "-" * W)
    if have == want:
        print("통과 — web/lib/parse/prompts.ts 가 prompts/ 와 일치한다")
        print("-" * W)
        return 0

    if args.check:
        print("실패 — web/lib/parse/prompts.ts 가 prompts/ 보다 낡았다")
        print("\npython tools/build_prompts.py 를 다시 돌려라.")
        print("-" * W)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(want, encoding="utf-8")
    print(f"생성: {OUT.relative_to(ROOT)}")
    print("-" * W)
    return 0


if __name__ == "__main__":
    sys.exit(main())
