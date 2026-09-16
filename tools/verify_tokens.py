#!/usr/bin/env python3
"""색 토큰이 웹과 폰 앱에서 **같은 값인가**.

웹은 `web/app/globals.css` 의 `light-dark(밝은 값, 어두운 값)` 을 쓰고,
폰 앱은 RN 이 CSS 변수를 못 읽어서 `native/lib/tokens.ts` 에 같은 값을 한 번
더 적는다 (CLAUDE.md "여백 토큰을 `native/lib/tokens.ts` 에 베껴 적었다").

베껴 적은 것은 갈라진다. **한쪽만 고친 게 눈에 안 띈다** — 그래서 여기서
잰다. 웹에서 캡션 색을 한 단계 내리면 폰 앱은 그대로 3.04:1 로 남는다.

같이 보는 것:
  · `--fs-*` 가 px 가 아니라 rem 인가 (폰 글자 크기 설정을 따라가는가)
  · 어두운 모드가 **양쪽 다** 켜져 있는가 (하나만 켜면 어긋난다)
  · 여백의 모니터링용 형광 시안이 되살아나지 않았는가
  · 폰 앱 화면이 색을 하드코딩하지 않았는가

표준 라이브러리만 쓴다 (CLAUDE.md). API 키도 DB 도 필요 없다.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GLOBALS = ROOT / "web" / "app" / "globals.css"
TOKENS = ROOT / "native" / "lib" / "tokens.ts"
LAYOUT = ROOT / "web" / "app" / "layout.tsx"
APP_JSON = ROOT / "native" / "app.json"
NATIVE_SCREENS = [ROOT / "native" / "app", ROOT / "native" / "components"]

# CSS 이름 -> TS 키. 이름이 다른 건 RN 이 camelCase 라서다.
# **양쪽에 다 있는 것만 적는다** — `scrim` 처럼 한쪽에만 있는 건 여기 없다.
PAIRS = {
    "--accent": "accent",
    "--accent-strong": "accentStrong",
    "--accent-bg": "accentBg",
    "--accent-pressed": "accentPressed",
    "--on-accent": "onAccent",
    "--warm": "warm",
    "--warm-bg": "warmBg",
    "--text-primary": "text",
    "--text-secondary": "textSecondary",
    "--text-tertiary": "textTertiary",
    "--text-disabled": "textDisabled",
    "--bg": "bg",
    "--surface": "surface",
    "--surface-sunken": "surfaceSunken",
    "--border": "border",
    "--border-strong": "borderStrong",
}

# 여백 다크 팔레트의 액센트. 모니터링 대시보드용이라 이 앱에 안 맞는다
# (docs/ui-references.md 8장 C). 되살아나면 알아야 한다.
MONITORING_CYAN = "#22d3ee"

problems: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


def strip_comments(text: str) -> str:
    """값만 보게 주석을 걷는다 — 주석에 적어둔 예시 색까지 세지 않게."""
    return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", text, flags=re.S))


def css_light_dark(text: str) -> dict[str, tuple[str, str]]:
    """`--이름: light-dark(밝은, 어두운);` 를 모은다."""
    out = {}
    for name, a, b in re.findall(
        r"(--[a-z-]+):\s*light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)\s*;", text
    ):
        out[name] = (a.strip(), b.strip())
    return out


def ts_object(text: str, name: str) -> dict[str, str]:
    """`const name = {` ... `}` 안의 `키: "값"` 을 모은다."""
    m = re.search(r"\bconst %s(?::[^=]+)? = \{" % re.escape(name), text)
    if not m:
        fail(f"{TOKENS.name}: `const {name}` 을 못 찾았다")
        return {}
    depth, i = 0, m.end() - 1
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    body = strip_comments(text[m.end() : i])
    # 주석 안의 예시(`color: c.text`)까지 세지 않게 먼저 걷어낸다
    return dict(re.findall(r"(\w+)\s*:\s*\"([^\"]+)\"", body))


def main() -> int:
    css = GLOBALS.read_text(encoding="utf-8")
    ts = TOKENS.read_text(encoding="utf-8")

    # --- ① 글자 크기는 rem 이다 -------------------------------------
    sizes = dict(re.findall(r"(--fs-[a-z]+):\s*([^;]+);", css))
    if not sizes:
        fail(f"{GLOBALS.name}: `--fs-*` 를 하나도 못 찾았다")
    for name, value in sizes.items():
        if "rem" not in value:
            fail(
                f"{GLOBALS.name}: `{name}: {value.strip()}` 가 rem 이 아니다 — "
                "px 로 적으면 브라우저 글자 크기 설정을 통째로 무시한다"
            )

    # --- ② 어두운 모드가 양쪽 다 켜져 있다 ---------------------------
    web_dark = css_light_dark(css)
    if not web_dark:
        fail(f"{GLOBALS.name}: `light-dark(...)` 가 없다 — 웹의 어두운 모드가 꺼졌다")

    light = ts_object(ts, "light")
    dark = ts_object(ts, "dark")
    if not light or not dark:
        fail(f"{TOKENS.name}: 폰 앱의 밝은/어두운 팔레트를 못 읽었다")

    if set(light) != set(dark):
        only_l = ", ".join(sorted(set(light) - set(dark))) or "없음"
        only_d = ", ".join(sorted(set(dark) - set(light))) or "없음"
        fail(
            f"{TOKENS.name}: 두 팔레트의 키가 다르다 "
            f"(밝은 쪽에만 {only_l} · 어두운 쪽에만 {only_d})"
        )

    layout = LAYOUT.read_text(encoding="utf-8")
    if 'colorScheme: "light dark"' not in layout:
        fail(f"{LAYOUT.name}: `colorScheme: \"light dark\"` 가 없다")
    if "prefers-color-scheme: dark" not in layout:
        fail(
            f"{LAYOUT.name}: 어두울 때의 themeColor 가 없다 — "
            "안드로이드 상태표시줄에 밝은 띠가 남는다"
        )

    app_json = json.loads(APP_JSON.read_text(encoding="utf-8"))
    style = app_json.get("expo", {}).get("userInterfaceStyle")
    if style != "automatic":
        fail(
            f"app.json: userInterfaceStyle 이 {style!r} 이다 — "
            '"automatic" 이라야 useColorScheme() 이 폰 설정을 읽는다'
        )

    # --- ③ 같은 토큰은 같은 값이다 -----------------------------------
    checked = 0
    for css_name, ts_key in PAIRS.items():
        if css_name not in web_dark:
            fail(f"{GLOBALS.name}: `{css_name}` 에 light-dark() 짝이 없다")
            continue
        if ts_key not in light:
            fail(f"{TOKENS.name}: `{ts_key}` 가 없다 (웹의 {css_name})")
            continue
        want_light, want_dark = web_dark[css_name]
        for side, want, got in (
            ("밝은", want_light, light.get(ts_key)),
            ("어두운", want_dark, dark.get(ts_key)),
        ):
            if got is not None and got.lower() != want.lower():
                fail(
                    f"{css_name} 의 {side} 값이 갈렸다 — "
                    f"웹 {want} / 폰 앱 {ts_key}={got}"
                )
        checked += 1

    # --- ④ 모니터링용 시안이 되살아나지 않았나 -----------------------
    for path, body in ((GLOBALS, css), (TOKENS, ts)):
        if MONITORING_CYAN in strip_comments(body).lower():
            fail(
                f"{path.name}: 여백의 모니터링용 형광 시안({MONITORING_CYAN})이 "
                "값으로 들어왔다 (docs/ui-references.md 8장 C)"
            )

    # --- ⑤ 폰 앱 화면은 색을 하드코딩하지 않는다 ---------------------
    hard = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(|\"(?:white|black)\"")
    screens = 0
    for base in NATIVE_SCREENS:
        for f in sorted(base.rglob("*.tsx")):
            screens += 1
            body = strip_comments(f.read_text(encoding="utf-8"))
            for line in body.splitlines():
                if hard.search(line):
                    rel = f.relative_to(ROOT)
                    fail(
                        f"{rel}: 색을 하드코딩했다 — `{line.strip()[:60]}` "
                        "(lib/tokens.ts 의 값만 쓴다)"
                    )
    if screens == 0:
        fail("폰 앱 화면을 하나도 못 찾았다 — 경로가 바뀌었나")

    print("=" * 62)
    print("색 토큰 확인")
    print("=" * 62)
    print()
    print(f"  글자 크기 {len(sizes)}개 — 전부 rem")
    print(f"  웹·폰 앱이 같이 쓰는 색 {checked}개 — 밝은 값·어두운 값 둘 다 대조")
    print(f"  폰 앱 화면 {screens}개 — 하드코딩한 색 없음")
    print()
    if problems:
        print("-" * 62)
        for p in problems:
            print(f"  X {p}")
        print("-" * 62)
        print("실패 — 웹과 폰 앱이 갈렸다")
        return 1
    print("-" * 62)
    print("통과 — 웹과 폰 앱이 같은 값을 본다")
    print("-" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
