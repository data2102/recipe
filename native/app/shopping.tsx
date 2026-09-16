/**
 * 장보기 — **제일 먼저 옮긴 화면**
 *
 * 마트에서 여는 화면이라 여기부터 했다. 신호가 나쁘고 손이 하나인
 * 자리에서 웹이 실제로 겪은 문제들이 여기 다 들어 있다.
 *
 * 웹(`web/app/Shopping.tsx`)과 **같은 규칙**을 지킨다. 화면을 다시 그린
 * 것이지 동작을 다시 정한 게 아니다:
 *
 *   - 체크는 **서버가 따라올 때까지** 체크된 채로 둔다
 *   - 저장 중에도 **누른 줄만** 잠근다
 *   - 체크한 것은 맨 아래로 내려가고 **접지 않는다**
 *   - 이미 체크한 항목의 칸은 안 바꾼다
 *   - 매대로 묶되 한 매대뿐이면 제목을 안 붙인다
 *   - 되돌릴 틈을 몇 초 준다
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, shopping, type ShoppingScreen } from "../lib/api";
import {
  BUCKET_TITLE,
  NO_AISLE,
  dateRange,
  remaining,
  type ShoppingItem,
  type Which,
} from "../lib/pure";
import { radius, sp, themed, TOUCH } from "../lib/tokens";

export default function Shopping() {
  const { s, c } = useTheme();
  const [week, setWeek] = useState<Which>("this");
  const [data, setData] = useState<ShoppingScreen | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /*
    체크한 것은 **서버가 따라올 때까지** 체크된 채로 둔다.

    웹에서 `useOptimistic` 이 액션이 끝나는 순간 원래 값으로 돌아가는
    바람에, 마트 신호가 나쁘면 **체크가 도로 풀린 것처럼 보였다** (DB
    에는 들어가 있는데 앱을 다시 켜야 "구매했어요" 에 있었다).
    소원(wish)을 들고 있다가 **서버가 같은 값을 보내면 그때 놓는다.**
  */
  const [wish, setWish] = useState<Record<string, boolean>>({});

  /** 지금 서버에 보내는 중인 항목. **그 줄만** 잠근다 */
  const [busy, setBusy] = useState<string | null>(null);

  /*
    방금 담은 것 — 되돌릴 틈. 체크하면 맨 아래로 내려가는데, 잘못
    눌렀을 때 어디로 갔는지 놓친다 (목록이 길고 손이 하나다).
  */
  const [undo, setUndo] = useState<string | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  const load = useCallback(
    async (which: Which) => {
      try {
        const next = await shopping.read(which);
        setData(next);
        setFailed(null);
        /*
          서버가 따라온 소원만 놓는다. 아직 안 따라온 것은 들고 있어야
          이 새로고침이 체크를 도로 풀지 않는다.
        */
        setWish((w) => {
          const keep: Record<string, boolean> = {};
          for (const [labelName, want] of Object.entries(w)) {
            const caught = next.items.some(
              (i) => i.label === labelName && i.checked === want,
            );
            if (!caught) keep[labelName] = want;
          }
          return keep;
        });
      } catch (e) {
        setFailed(e instanceof ApiError ? e.message : "장보기를 못 읽었어요");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    void load(week);
  }, [week, load]);

  async function check(item: ShoppingItem, want: boolean) {
    setBusy(item.label);
    setWish((w) => ({ ...w, [item.label]: want }));
    // 담은 것만 되돌릴 틈을 준다 — 푸는 건 이미 되돌리는 일이다
    setUndo(want ? item.label : null);
    try {
      await shopping.check(item.label, want, week);
      await load(week);
    } catch (e) {
      setWish((w) => {
        const next = { ...w };
        delete next[item.label];
        return next;
      });
      setFailed(e instanceof ApiError ? e.message : "체크를 저장 못 했어요");
    } finally {
      setBusy(null);
    }
  }

  async function have(item: ShoppingItem, excluded: boolean) {
    setBusy(item.label);
    try {
      await shopping.have(item.label, excluded, week);
      await load(week);
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "저장 못 했어요");
    } finally {
      setBusy(null);
    }
  }

  const insets = useSafeAreaInsets();

  if (loading && !data) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <Text style={s.title}>장보기를 못 읽었어요</Text>
        <Text style={s.sub}>{failed}</Text>
        <Pressable style={s.primary} onPress={() => void load(week)}>
          <Text style={s.primaryText}>다시 해볼게요</Text>
        </Pressable>
      </View>
    );
  }

  // 화면에 그릴 값 = 서버가 준 것 위에 아직 안 따라온 소원을 얹은 것
  const shown = data.items.map((i) =>
    i.label in wish ? { ...i, checked: wish[i.label] } : i,
  );
  const left = remaining(shown);
  const bought = shown.filter((i) => i.checked);
  const home = shown.filter((i) => i.bucket === "HAVE" && !i.checked);

  /*
    매대로 묶는다 — **칸과 다른 축이다.** 칸(사야 해요 / 있는지 봐주세요)은
    "살지 말지" 를 가르고, 매대는 "어디로 갈지" 다. 그래서 **칸 안에서**
    매대로 나눈다: 칸을 없애고 매대로만 늘어놓으면 3단 분류가 사라진다.

    목록은 이미 매대순으로 와 있어서 (lib/shopping.ts) 붙어 있는 것끼리
    묶기만 하면 된다. **한 매대뿐이면 제목을 안 붙인다** — 항목이 셋인데
    머리말이 하나 더 붙으면 그게 더 시끄럽다.
  */
  function byAisle(list: ShoppingItem[]) {
    const out: { aisle: string; items: ShoppingItem[] }[] = [];
    for (const item of list) {
      const name = item.aisle ?? NO_AISLE;
      const last = out[out.length - 1];
      if (last && last.aisle === name) last.items.push(item);
      else out.push({ aisle: name, items: [item] });
    }
    return out.length > 1 ? out : null;
  }

  function row(item: ShoppingItem) {
    const uses = data!.groups.filter((g) => g.labels.includes(item.label));
    const quantity =
      uses
        .flatMap((g) =>
          g.quantities
            .filter((q) => q.label === item.label)
            .map((q) => q.qty || "수량 확인 필요"),
        )
        .join(" + ") || "수량 확인 필요";

    const locked = busy === item.label || !!data!.closed;
    const home = item.bucket === "HAVE" && !item.checked;

    return (
      <View
        /*
          같은 이름이 두 줄로 나올 수 있다 — 사전에 붙은 '대파' 와 못
          붙인 '대파' 는 다른 행이다. 이름만 key 로 쓰면 엉뚱한 줄을
          다시 그린다.
        */
        key={`${item.ingredient_id ?? "?"}:${item.label}`}
        style={s.line}
      >
        <View style={s.lineHead}>
          {home ? (
            <View style={s.nameWrap}>
              <Text style={s.name}>{item.label}</Text>
              <Text style={s.quantity}>{quantity}</Text>
            </View>
          ) : (
            <Pressable
              style={s.tap}
              disabled={locked}
              onPress={() => void check(item, !item.checked)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked, disabled: locked }}
              accessibilityLabel={`${item.label} ${quantity}`}
            >
              <View style={[s.box, item.checked && s.boxOn]}>
                {item.checked && <Text style={s.tick}>✓</Text>}
              </View>
              <View style={s.nameWrap}>
                <Text style={[s.name, item.checked && s.nameDone]}>
                  {item.label}
                </Text>
                <Text style={s.quantity}>{quantity}</Text>
              </View>
            </Pressable>
          )}

          {!item.checked && (
            <Pressable
              disabled={locked}
              onPress={() => void have(item, item.bucket !== "HAVE")}
              style={s.side}
            >
              <Text style={[s.sideText, locked && s.dim]}>
                {item.bucket === "HAVE" ? "다시 살 것에" : "집에 있어요"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* 판정하지 않고 근거를 적는다 — "3일 전에 샀어요" (원칙 ③) */}
        {!!item.reason && <Text style={s.reason}>{item.reason}</Text>}
        {uses.length > 1 && (
          <Text style={s.reason}>
            다른 요리에도 — {uses.map((g) => g.title).join(" · ")}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load(week)} />
        }
      >
        <Text style={s.title}>
          {week === "next" ? "다음 주 장보기" : "이번 주 장보기"}
        </Text>
        <Text style={s.sub}>
          {dateRange(data.dates[0], data.dates[6])} ·{" "}
          {data.items.length === 0
            ? "담은 요리가 없어요"
            : data.closed
              ? "장 다 봤어요"
              : left === 0
                ? "더 살 것이 없어요"
                : `살 것 ${left}개`}
        </Text>

        {/*
          **주가 남아 있는 건 장보기뿐이다.** 장은 주에 한 번 보니까
          목록이 주 단위다. 식단은 열나흘을 쭉 늘어놓는다 — 주 탭을
          거기에 다시 만들지 마라.
        */}
        <View style={s.tabs}>
          {(["this", "next"] as const).map((w) => (
            <Pressable
              key={w}
              onPress={() => setWeek(w)}
              style={[s.tab, week === w && s.tabOn]}
            >
              <Text style={[s.tabText, week === w && s.tabTextOn]}>
                {w === "this" ? "이번 주" : "다음 주"}
              </Text>
            </Pressable>
          ))}
        </View>

        {!!failed && (
          <View style={s.warn}>
            <Text style={s.warnText}>{failed}</Text>
          </View>
        )}

        {data.closed && (
          <View style={s.card}>
            <Text style={s.cardTitle}>이 주 장보기는 끝냈어요</Text>
            <Text style={s.body2}>
              담았던 요리는 그대로 남아 있어요 — 잘못 눌렀으면 다시 열 수
              있어요.
            </Text>
            <Pressable
              style={s.secondary}
              onPress={async () => {
                await shopping.finish(week, false);
                await load(week);
              }}
            >
              <Text style={s.secondaryText}>다시 열게요</Text>
            </Pressable>
          </View>
        )}

        {data.items.length === 0 ? (
          <Text style={s.empty}>
            {data.picked.length > 0
              ? "담은 요리에 재료가 아직 안 붙어 있어요."
              : "메뉴 고르기에서 담으면 살 것을 합쳐서 보여드려요."}
          </Text>
        ) : (
          <>
            <Text style={s.note}>
              집에 있는 재료는 ‘집에 있어요’를 눌러 빼주세요.
            </Text>
            {/*
              **판정하지 말고 근거를 보여준다.** 칸 이름이 "없음" 이 아니라
              "있는지 봐주세요" 인 이유다 — 마지막으로 산 게 언제인지는
              알지만 지금 냉장고에 있는지는 앱이 모른다.
            */}
            {(["BUY", "CHECK"] as const).map((bucket) => {
              const rows = shown.filter(
                (i) => i.bucket === bucket && !i.checked,
              );
              if (rows.length === 0) return null;
              const aisles = byAisle(rows);
              return (
                <View key={bucket} style={s.card}>
                  <Text style={s.bucket}>
                    {BUCKET_TITLE[bucket]} · {rows.length}
                  </Text>
                  {aisles
                    ? aisles.map((a) => (
                        <View key={a.aisle}>
                          <Text style={s.aisle}>{a.aisle}</Text>
                          {a.items.map(row)}
                        </View>
                      ))
                    : rows.map(row)}
                </View>
              );
            })}

            {home.length > 0 && (
              <View style={s.card}>
                <Text style={s.bucket}>
                  {BUCKET_TITLE.HAVE} · {home.length}
                </Text>
                {home.map(row)}
              </View>
            )}

            {/*
              **체크한 것은 맨 아래로 내려가고, 접지 않는다.** 접어두면
              누른 것이 사라져 보여서 "안 눌렸나" 하고 한 번 더 누른다.
              거기 있다는 건 보이게 둔다.
            */}
            {bought.length > 0 && (
              <View style={s.card}>
                <Text style={s.bucket}>구매했어요 · {bought.length}</Text>
                {bought.map(row)}
              </View>
            )}

            {!data.closed && left === 0 && (
              <Pressable
                style={s.primary}
                onPress={async () => {
                  await shopping.finish(week, true);
                  await load(week);
                }}
              >
                <Text style={s.primaryText}>장보기 끝</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {/*
        되돌리기는 탭바 위에 띄운다. 마트에서 한 손으로 누르는 자리라
        화면 아래가 맞고, 탭바에 가리면 못 누른다.
      */}
      {undo && (
        <View style={[s.toast, { bottom: insets.bottom + TOUCH + 24 }]}>
          <Text style={s.toastText} numberOfLines={1}>
            {undo} 담았어요
          </Text>
          <Pressable
            onPress={() => {
              const item = data.items.find((i) => i.label === undo);
              setUndo(null);
              if (item) void check(item, false);
            }}
          >
            <Text style={s.toastAction}>취소</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const useTheme = themed((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3] },
  body: { padding: sp[4], gap: sp[3], paddingBottom: sp[12] },

  title: { fontSize: 22, fontWeight: "700", color: c.text },
  sub: { fontSize: 14, color: c.textSecondary },
  body2: { fontSize: 14, color: c.textSecondary, lineHeight: 21 },
  note: { fontSize: 13, color: c.textTertiary },
  empty: {
    fontSize: 14,
    color: c.textSecondary,
    paddingVertical: sp[8],
    textAlign: "center",
  },

  tabs: { flexDirection: "row", gap: sp[2] },
  tab: {
    minHeight: TOUCH,
    justifyContent: "center",
    paddingHorizontal: sp[4],
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  tabOn: { backgroundColor: c.accentBg, borderColor: c.accent },
  tabText: { fontSize: 14, color: c.textSecondary },
  tabTextOn: { color: c.accentStrong, fontWeight: "700" },

  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: sp[4],
    gap: sp[1],
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: c.text,
    marginBottom: sp[2],
  },
  bucket: {
    fontSize: 15,
    fontWeight: "700",
    color: c.text,
    marginBottom: sp[2],
  },
  aisle: {
    fontSize: 13,
    fontWeight: "700",
    color: c.textSecondary,
    marginBottom: sp[2],
  },

  line: { paddingVertical: sp[1] },
  lineHead: { flexDirection: "row", alignItems: "center", gap: sp[2] },
  tap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sp[3],
    minHeight: TOUCH,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: c.accentStrong, borderColor: c.accentStrong },
  tick: { color: c.onAccent, fontSize: 14, fontWeight: "700" },

  nameWrap: { flex: 1 },
  name: { fontSize: 16, color: c.text },
  nameDone: { color: c.textTertiary, textDecorationLine: "line-through" },
  quantity: { fontSize: 13, color: c.textTertiary, marginTop: 2 },

  side: { minHeight: TOUCH, justifyContent: "center", paddingLeft: sp[2] },
  sideText: { fontSize: 13, color: c.accent },
  dim: { color: c.textDisabled },

  reason: { fontSize: 12, color: c.textTertiary, marginTop: 2 },

  primary: {
    minHeight: TOUCH + 4,
    borderRadius: radius.md,
    backgroundColor: c.accentStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp[5],
  },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "700" },
  secondary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: sp[3],
  },
  secondaryText: { color: c.textSecondary, fontSize: 15, fontWeight: "600" },

  warn: {
    backgroundColor: c.warmBg,
    borderRadius: radius.md,
    padding: sp[3],
  },
  warnText: { color: c.warm, fontSize: 13 },

  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: sp[4],
    maxWidth: "92%",
    paddingVertical: sp[3],
    paddingHorizontal: sp[4],
    borderRadius: radius.pill,
    backgroundColor: c.text,
  },
  toastText: { color: c.surface, fontSize: 14, flexShrink: 1 },
  /*
   * 토스트는 **뒤집힌 면**이다 (바탕이 c.text, 글자가 c.surface). 되돌리기도
   * 그 위의 글자라 같은 색에 밑줄로 낸다 — 웹과 같다 (`Shopping.module.css`
   * 의 `.undo`). 파란 글자를 박아두면 어두운 모드에서 토스트가 밝아질 때
   * 안 보인다.
   */
  toastAction: {
    color: c.surface,
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
}));
