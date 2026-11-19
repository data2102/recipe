#!/usr/bin/env python3
"""초안 JSON 을 레시피로 저장한다 — **파서가 막혔을 때 쓰는 우회로.**

    APP_API_TOKEN=... python3 tools/add_recipe.py tools/queue/무조림.json
    APP_API_TOKEN=... python3 tools/add_recipe.py tools/queue/*.json

**왜 있나.** `ANTHROPIC_API_KEY` 가 막히면 `/api/ingest` 가 캡처를 못
읽는다. 그런데 막힌 건 **파싱뿐**이고 저장 경로(`/api/ingest/commit`)는
멀쩡하다. 그래서 사람이(또는 Claude 가) 캡처를 읽어 초안을 손으로 적고,
이 도구가 그 초안을 서버에 넘긴다.

**저장 로직을 여기서 다시 쓰지 않는다.** 그냥 `/api/ingest/commit` 을
부를 뿐이다 — 사전 대조도, 중복 방지도, 장보기 합산도 전부 서버의
`commit()` 이 한다 (CLAUDE.md: "API 와 웹 화면이 로직을 두 벌로 갖지
않는다"). 그래서 `bucket`·`label` 같은 건 초안에 대충 적어도 된다.
서버가 사전을 다시 보고 제 값을 넣는다.

**키가 돌아오면 이 도구는 필요 없다.** 그때 `tools/queue/` 와 같이
지운다 — 캡처를 앱에서 바로 넣는 게 본래 길이다.

**같은 제목이 이미 있으면 멈춘다.** 원본(`source_asset`)이 없는 초안은
서버의 중복 방지가 안 걸려서, 두 번 보내면 레시피가 두 개 생긴다
(실제로 재봤다). 일부러 또 넣으려면 `--force`.

표준 라이브러리만 쓴다 (CLAUDE.md).
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://recipe-topaz-six.vercel.app"


def call(base, token, path, payload=None):
    req = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "authorization": f"Bearer {token}",
            **({"content-type": "application/json"} if payload else {}),
        },
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # 서버가 사람 말로 적어 보낸다. 그걸 그대로 쓴다 (원칙 ③)
        try:
            said = json.load(e).get("error", "")
        except Exception:
            said = ""
        sys.exit(f"서버가 거절했어요 ({e.code}) {said}")
    except urllib.error.URLError as e:
        sys.exit(f"서버에 못 닿았어요: {e.reason}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("files", nargs="+", help="초안 JSON 파일")
    p.add_argument("--url", default=os.environ.get("API_URL", DEFAULT_URL))
    p.add_argument("--force", action="store_true",
                   help="같은 제목이 있어도 넣는다")
    args = p.parse_args()

    token = os.environ.get("APP_API_TOKEN", "")
    if not token:
        sys.exit("APP_API_TOKEN 이 없어요. Vercel 에 넣어둔 그 값입니다.")
    base = args.url.rstrip("/")

    # 이미 있는 제목을 한 번만 읽어둔다
    have = {r["title"].strip() for r in call(base, token, "/api/recipes")["recipes"]}

    for path in args.files:
        with open(path, encoding="utf-8") as f:
            body = json.load(f)
        draft = body.get("draft", body)
        title = draft.get("title", "").strip()

        if title in have and not args.force:
            print(f"건너뜀  {title}  — 같은 제목이 이미 있어요 (--force 로 넣기)")
            continue

        got = call(base, token, "/api/ingest/commit", {"draft": draft})
        have.add(title)
        print(f"저장함  {title}  → /recipe/{got['recipeId']}"
              f"  (재료 {len(draft['items'])} · 단계 {len(draft['steps'])})")


if __name__ == "__main__":
    main()
