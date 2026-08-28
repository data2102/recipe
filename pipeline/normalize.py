# -*- coding: utf-8 -*-
"""[3층] 정규화 — 여기부터는 LLM 을 쓰지 않는다.

파서가 옮겨온 원문 표기를 사전과 대조해 표준 ID 를 붙인다.
사전에 없으면 붙이지 않는다. 추측은 금지다 (원칙 ④).

세 갈래로 갈린다. 화면 ③(레시피 저장 확인)의 3분류가 그대로 이것이다.

    MAPPED     사전에 있고 단정해도 되는 표기        -> ingredient_id 채움
    CHECK      단정하면 안 되는 것                  -> ingredient_id 는 NULL
    UNMAPPED   사전에 없는 이름                     -> ingredient_id 는 NULL
                                                     + unmapped_term 에 적립

CHECK 로 가는 경우는 셋이다.
    - origin='BODY'          조리 단계에만 나온 재료. 근거를 보여주고 물어본다
    - kind='AMBIGUOUS'       '간장' 처럼 사전에 후보는 있지만 종류가 불명
    - 택1 그룹               'A OR B'. 하나만 사야 한다

**AMBIGUOUS 는 unmapped_term 에 넣지 않는다.** 사전에 이미 있는 표기라
거기 쌓이면 "사전에 없어서 못 붙인 것" 목록이 오염된다. 후보는 evidence 에
문장으로 남겨서 확인 카드가 쓰게 한다 (스펙 4장 화면 ③).

버킷과 적립(record_unmapped)은 별개다. 겹칠 수 있기 때문이다 —
'대패삼겹살'은 택1 그룹이라 화면에서는 확인 필요로 가지만, 사전에 없는
표기인 건 그대로라 적립은 된다.

    버킷            사용자가 지금 뭘 해야 하는가   (화면 ③)
    record_unmapped 관리자가 사전에 뭘 넣어야 하는가 (개발 순서 3번)

둘을 하나로 묶으면 택1에 걸린 새 표기가 사전에 영영 안 들어간다.
"""

import re

MAPPED = "MAPPED"
CHECK = "CHECK"
UNMAPPED = "UNMAPPED"


def _key(s):
    """조회용 완화 정규화. 공백만 없앤다.

    '다진 마늘' -> '다진마늘' 까지만 잡는다. 그 이상은 추측이다.
    """
    return re.sub(r"\s+", "", s or "")


def load_dictionary(conn):
    """사전을 한 번에 읽어 조회표로 만든다.

    표준명이 먼저다. 별칭이 표준명을 덮지 않게 setdefault 를 쓴다.
    """
    table = {}
    for r in conn.execute("SELECT id, canonical_name FROM ingredient"):
        table[_key(r["canonical_name"])] = {
            "id": r["id"], "canonical": r["canonical_name"], "kind": None}
    for r in conn.execute(
            "SELECT a.alias, a.kind, i.id, i.canonical_name"
            "  FROM ingredient_alias a"
            "  JOIN ingredient i ON i.id = a.ingredient_id"):
        table.setdefault(_key(r["alias"]), {
            "id": r["id"], "canonical": r["canonical_name"], "kind": r["kind"]})
    return table


def label(raw_name, canonical):
    """화면 표기 규칙: 표준명(원문). 원문이 표준명과 같으면 괄호를 숨긴다."""
    if not canonical or _key(canonical) == _key(raw_name):
        return raw_name
    return f"{canonical}({raw_name})"


def normalize(items, choice_groups, table):
    """파싱 결과 -> 저장 직전 형태. 원문 필드는 건드리지 않는다."""
    # 택1 그룹에 속한 표기를 그룹 키로 찍어둔다.
    group_of = {}
    for n, group in enumerate(choice_groups, 1):
        if len(group) < 2:
            continue                       # 혼자면 택1이 아니다
        for name in group:
            group_of[_key(name)] = f"c{n}"

    out = []
    for it in items:
        hit = table.get(_key(it["raw_name"]))
        group = group_of.get(_key(it["raw_name"]))

        row = dict(it)
        row["choice_group"] = group
        row["canonical"] = hit["canonical"] if hit else None
        row["ingredient_id"] = None
        row["reasons"] = []

        if hit is None:
            row["bucket"] = UNMAPPED
            row["record_unmapped"] = True
        elif hit["kind"] == "AMBIGUOUS":
            # 사전에 후보는 있다. 그래도 단정하지 않는다.
            row["bucket"] = CHECK
            row["record_unmapped"] = False
            row["reasons"].append(
                f"'{it['raw_name']}' 은 종류가 불명하다. "
                f"'{hit['canonical']}' 인가요?")
        else:
            row["ingredient_id"] = hit["id"]
            row["bucket"] = MAPPED
            row["record_unmapped"] = False

        if it["origin"] == "BODY":
            row["bucket"] = CHECK
            row["reasons"].append(
                it.get("evidence") or "재료 목록에 없고 조리 단계에만 나온다")

        if group:
            row["bucket"] = CHECK
            row["reasons"].append("택1 — 이 중 하나만 사면 된다")

        # 확인 카드가 보여줄 문장. 없으면 원래 근거를 그대로 둔다.
        row["evidence"] = " / ".join(row["reasons"]) or it.get("evidence")

        # 표기에 표준명을 얹는 건 **실제로 매핑했을 때만**이다.
        # AMBIGUOUS 는 후보(canonical)를 알면서도 안 붙였는데, 화면에
        # '진간장(간장)' 이라고 쓰면 데이터가 거부한 단정을 UI 가 해버린다.
        # 후보는 아래 근거 문장에서 물어보는 걸로 족하다.
        row["label"] = label(it["raw_name"],
                             row["canonical"] if row["ingredient_id"] else None)
        out.append(row)

    return out


def summary(rows):
    """버킷별 개수. 미분류율은 개발 순서 3번의 판단 근거다."""
    counts = {MAPPED: 0, CHECK: 0, UNMAPPED: 0}
    for r in rows:
        counts[r["bucket"]] += 1
    total = len(rows) or 1
    return counts, counts[UNMAPPED] / total
