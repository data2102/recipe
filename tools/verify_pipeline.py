#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""수집 -> 파싱 -> 정규화 -> 저장 한 바퀴 검증 (개발 순서 2번의 완료 판단)

    python tools/verify_pipeline.py

**API 키가 필요 없다.** LLM 자리에 미리 적어둔 응답을 넣는다.
재는 것은 파서의 정확도가 아니라 **배관**이다 — 파서가 뱉은 것이 사전을
거쳐 DB 까지 규칙대로 흘러가는가. 파서 정확도는 tools/accuracy_test.py 가
실제 이미지로 잰다.

가짜 응답은 실측 샘플(묵은지고등어조림, tools/truth.example.json)을 본떴다.
스펙이 신경 쓰는 경로가 한 건에 다 들어 있다.

    고추가루   오탈자 -> 고춧가루로 매핑되지만 원문은 안 바뀐다
    간장       AMBIGUOUS. 사전에 후보가 있어도 단정하지 않는다
    묵은지     사전에 없다 -> 미분류 + unmapped_term
    무 / 물    조리 단계에만 나온다 -> origin=BODY, 확인 필요
    대패삼겹살 택1 그룹
"""

import base64
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from pipeline import db, normalize, parser as P, store  # noqa: E402

# 1x1 PNG. 파서에 안 보내므로 내용은 상관없다 — 수집·보관 경로만 탄다.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwA"
    "EhQGAhKmMIQAAAABJRU5ErkJggg==")

PASS1_REPLY = """{
  "요리명": "묵은지고등어조림",
  "재료": [
    {"이름": "묵은지",   "수량": "1/4포기", "구분": "재료"},
    {"이름": "고등어",   "수량": "2마리",   "구분": "재료"},
    {"이름": "대패삼겹살", "수량": "200g",  "구분": "재료"},
    {"이름": "양파",     "수량": "1개",     "구분": "재료"},
    {"이름": "고추가루", "수량": "3T",      "구분": "양념"},
    {"이름": "간장",     "수량": "2T",      "구분": "양념"},
    {"이름": "다진 마늘", "수량": "1T",     "구분": "양념"}
  ],
  "택1그룹": [["대패삼겹살", "앞다리살"]],
  "조리단계": [
    "냄비에 무 먼저 깔아주고 묵은지를 올린다",
    "고등어를 얹고 물을 자작하게 붓는다",
    "양념을 끼얹어 20분 조린다"
  ]
}"""

PASS2_REPLY = """{"누락재료": [
  {"이름": "무", "수량": "미상", "근거": "1번 단계 - 냄비에 무 먼저 깔아주고"},
  {"이름": "물", "수량": "자작하게", "근거": "2번 단계 - 물을 자작하게 붓는다"}
]}"""


class FakeAsk:
    """LLM 자리. 어떤 호출에 이미지가 붙었는지 기록한다."""

    def __init__(self, pass1=PASS1_REPLY, pass2=PASS2_REPLY):
        self.pass1, self.pass2 = pass1, pass2
        self.calls = []

    def __call__(self, prompt, source, max_tokens):
        is_pass2 = "누락재료" in prompt
        self.calls.append({"pass": 2 if is_pass2 else 1,
                           "had_source": source is not None,
                           "prompt": prompt})
        return (self.pass2 if is_pass2 else self.pass1), (100, 50)


# ---------------------------------------------------------------------

FAILS = []


def check(label, cond, detail=""):
    print(f"  {'OK  ' if cond else '실패'} {label}")
    if not cond:
        FAILS.append(f"{label} {detail}".strip())
        if detail:
            print(f"       {detail}")


def by_name(rows, name):
    for r in rows:
        if r["raw_name"] == name:
            return r
    return None


def main():
    W = 62
    print("=" * W)
    print("파이프라인 한 바퀴 검증")
    print("=" * W)

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="recipe-verify-"))
    img = tmp / "capture.png"
    img.write_bytes(PNG)
    store_dir = tmp / "originals"

    conn = db.open_db(":memory:")
    ask = FakeAsk()

    # --- 수집 -> 파싱 ------------------------------------------------
    print("\n[1] 수집 -> 파싱")
    source = P.image_source(img)
    parsed = P.parse(source, ask)

    check("2패스로 호출됐다", [c["pass"] for c in ask.calls] == [1, 2],
          f"실제: {[c['pass'] for c in ask.calls]}")
    check("1차에는 이미지를 보낸다", ask.calls[0]["had_source"])
    check("2차에는 이미지를 다시 보내지 않는다  <-- 원가 2.2배 -> 1.2배",
          not ask.calls[1]["had_source"])
    check("2차 프롬프트에 조리 단계 텍스트가 들어갔다",
          "냄비에 무 먼저 깔아주고" in ask.calls[1]["prompt"])
    check("조리 단계 3개를 옮겨왔다", len(parsed["steps"]) == 3)
    check("숨은 재료 2개를 찾았다 (무, 물)",
          sum(1 for i in parsed["items"] if i["origin"] == "BODY") == 2)
    check("파서 버전이 찍힌다", parsed["parser_version"] == P.PARSER_VERSION)

    # --- 정규화 ------------------------------------------------------
    print("\n[2] 정규화 — 여기부터 LLM 안 씀")
    table = normalize.load_dictionary(conn)
    rows = normalize.normalize(parsed["items"], parsed["choice_groups"], table)

    r = by_name(rows, "고추가루")
    check("오탈자가 표준으로 매핑된다 (고추가루 -> 고춧가루)",
          r and r["canonical"] == "고춧가루" and r["bucket"] == normalize.MAPPED)
    check("원문은 안 바뀐다", r and r["raw_name"] == "고추가루")
    check("표기는 표준명(원문) 형태", r and r["label"] == "고춧가루(고추가루)")

    r = by_name(rows, "다진 마늘")
    check("띄어쓰기 차이를 잡는다 (다진 마늘 -> 다진마늘)",
          r and r["canonical"] == "다진마늘")
    check("원문==표준명이면 괄호를 숨긴다",
          by_name(rows, "양파")["label"] == "양파")

    r = by_name(rows, "간장")
    check("AMBIGUOUS 는 단정하지 않는다 (ingredient_id 안 붙임)",
          r and r["ingredient_id"] is None and r["bucket"] == normalize.CHECK)
    check("AMBIGUOUS 는 unmapped_term 에 안 넣는다 (사전에 있으므로)",
          r and not r["record_unmapped"])
    check("AMBIGUOUS 는 후보를 근거로 보여준다",
          r and "진간장" in (r["evidence"] or ""))
    check("AMBIGUOUS 표기에 표준명을 얹지 않는다 ('진간장(간장)' 금지)",
          r and r["label"] == "간장", f"실제: {r and r['label']}")

    r = by_name(rows, "묵은지")
    check("사전에 없으면 미분류 + 적립",
          r and r["bucket"] == normalize.UNMAPPED and r["record_unmapped"])

    r = by_name(rows, "무")
    check("조리 단계에만 나온 재료는 확인 필요",
          r and r["origin"] == "BODY" and r["bucket"] == normalize.CHECK)
    check("확인 필요에는 근거 문장이 붙는다",
          r and "1번 단계" in (r["evidence"] or ""))

    r = by_name(rows, "대패삼겹살")
    check("택1은 묶이고 확인 필요로 간다",
          r and r["choice_group"] and r["bucket"] == normalize.CHECK)

    counts, rate = normalize.summary(rows)
    print(f"       확정 {counts[normalize.MAPPED]} · "
          f"확인 필요 {counts[normalize.CHECK]} · "
          f"미분류 {counts[normalize.UNMAPPED]}  (미분류 {rate:.0%})")

    # --- 저장 --------------------------------------------------------
    print("\n[3] 저장")
    rid = store.save(conn, parsed, rows, source, store_dir,
                     source_url="https://example.com/r/1")

    rec = conn.execute("SELECT * FROM recipe WHERE id=?", (rid,)).fetchone()
    check("저장 시점 상태는 WISH ('해보고 싶다')", rec["status"] == "WISH")
    check("원본 링크를 같이 보관한다 (저작권)",
          rec["source_url"] == "https://example.com/r/1")

    n_ing = conn.execute(
        "SELECT COUNT(*) FROM recipe_ingredient WHERE recipe_id=?",
        (rid,)).fetchone()[0]
    check(f"재료 {len(rows)}건이 들어갔다", n_ing == len(rows))
    check("조리 단계가 들어갔다", conn.execute(
        "SELECT COUNT(*) FROM recipe_step WHERE recipe_id=?",
        (rid,)).fetchone()[0] == 3)

    a = conn.execute("SELECT * FROM source_asset WHERE recipe_id=?",
                     (rid,)).fetchone()
    check("원본이 보관됐다", a is not None and a["storage_key"]
          and pathlib.Path(a["storage_key"]).exists())
    check("재파싱용 파서 버전이 남았다", a and a["parser_version"] == P.PARSER_VERSION)
    check("파싱 원문이 남았다", a and a["raw_text"])

    um = {r["raw_name"]: r["hit_count"] for r in conn.execute(
        "SELECT raw_name, hit_count FROM unmapped_term")}
    check("사전에 없는 표기가 전부 적립됐다",
          set(um) == {"묵은지", "고등어", "대패삼겹살"}, f"실제: {sorted(um)}")
    check("'간장'은 적립 안 됨 (AMBIGUOUS — 사전에 있다)", "간장" not in um)
    # 버킷은 사용자가 할 일, 적립은 관리자가 할 일. 겹쳐도 서로 안 지운다.
    check("택1이면서 사전에 없으면 — 화면은 확인 필요, 적립은 그대로",
          by_name(rows, "대패삼겹살")["bucket"] == normalize.CHECK
          and "대패삼겹살" in um)

    # --- 같은 걸 또 넣으면 -------------------------------------------
    print("\n[4] 같은 캡처를 다시 넣으면")
    rows2 = normalize.normalize(parsed["items"], parsed["choice_groups"], table)
    rid2 = store.save(conn, parsed, rows2, source, store_dir)
    check("레시피는 새로 쌓인다", rid2 != rid)
    um2 = {r["raw_name"]: r["hit_count"] for r in conn.execute(
        "SELECT raw_name, hit_count FROM unmapped_term")}
    check("미분류는 새 행이 아니라 hit_count 가 오른다",
          um2.get("묵은지") == 2 and len(um2) == 3, f"실제: {um2}")
    check("원본은 해시가 같아 사본이 안 늘어난다",
          len(list(pathlib.Path(store_dir).iterdir())) == 1)

    # --- 실패해도 원본은 남는다 --------------------------------------
    print("\n[5] 파싱이 실패해도")
    n_before = conn.execute("SELECT COUNT(*) FROM source_asset").fetchone()[0]
    broken = FakeAsk(pass1='{"요리명": "빈 것", "재료": [], "조리단계": []}')
    try:
        P.parse(source, broken)
        check("재료 0개는 실패로 처리한다", False, "실패하지 않았다")
    except P.ParseError as e:
        check("재료 0개는 실패로 처리한다", True)
        store.save_failed(conn, source, store_dir, e.raw_text, P.PARSER_VERSION)
    n_after = conn.execute("SELECT COUNT(*) FROM source_asset").fetchone()[0]
    check("실패해도 원본은 남는다 (원칙 ⑤)", n_after == n_before + 1)

    # JSON 이 깨지면 한 번 재시도
    flaky = FakeAsk(pass1="이건 JSON 이 아니다")
    try:
        P.parse(source, flaky)
        check("JSON 이 깨지면 실패로 떨어진다", False)
    except P.ParseError:
        check("JSON 이 깨지면 1회 재시도 후 실패", len(flaky.calls) == 2,
              f"호출 {len(flaky.calls)}회")

    conn.close()

    print("\n" + "-" * W)
    if FAILS:
        print(f"실패 {len(FAILS)}건")
        for f in FAILS:
            print(f"  {f}")
        return 1
    print("통과 — 캡처 1장이 레시피로 저장된다 (개발 순서 2번 완료 판단)")
    print("-" * W)
    return 0


if __name__ == "__main__":
    sys.exit(main())
