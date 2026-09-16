/**
 * 지난 주 — **목록 하나가 지난 한 주다.**
 *
 * 웹의 `app/weeks/page.tsx` 와 같은 화면이다.
 *
 * **끝낸 장보기를 지우지 않는 이유**가 이 화면이다. 담았던 요리도 요일도
 * 그대로 남아 있어서, 지난 달에 뭘 먹었는지 여기서 읽는다.
 *
 * 접힌 채로도 그 주가 어땠는지 한 줄로 알 수 있어야 한다 — 펼쳐야만
 * 보이면 열두 주를 다 펼쳐보게 된다.
 *
 * **담은 것과 만든 것은 다르다.** 담아놓고 못 만든 날이 흔한데 한 줄로
 * 합치면 그게 안 보인다.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ApiError,
  weeks as weeksApi,
  type PastDish,
  type PastWeek,
} from "../lib/api";
import {
  DAYS,
  addDays,
  dateRange,
  dateSay,
  dayIndex,
  monthWeek,
  whenShort,
} from "../lib/pure";
import { color, radius, sp, TOUCH } from "../lib/tokens";

export default function Weeks() {
  const [data, setData] = useState<{
    weeks: PastWeek[];
    dishes: PastDish[];
    notes: Record<string, string>;
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** 펼친 주 — 식단 탭과 같은 모양으로 날짜를 늘어놓는다 */
  const [open, setOpen] = useState<number | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      setData(await weeksApi.read());
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "지난 주를 못 읽었어요");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !data) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <Text style={s.title}>지난 주를 못 읽었어요</Text>
        <Text style={s.sub}>{failed}</Text>
        <Pressable style={s.secondary} onPress={() => void load()}>
          <Text style={s.secondaryText}>다시 해볼게요</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.screen, { paddingTop: insets.top }]}
      contentContainerStyle={s.body}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} />
      }
    >
      <Pressable style={s.back} onPress={() => router.back()}>
        <Text style={s.backText}>← 식단</Text>
      </Pressable>

      <Text style={s.title}>지난 주</Text>
      <Text style={s.sub}>지나간 주 {data.weeks.length}개</Text>

      {!!failed && (
        <View style={s.warn}>
          <Text style={s.warnText}>{failed}</Text>
        </View>
      )}

      {data.weeks.length === 0 && (
        <Text style={s.empty}>한 주가 지나가면 여기 남아요.</Text>
      )}

      {data.weeks.map((w) => {
        const mine = data.dishes.filter((d) => d.list_id === w.id);
        const dates = Array.from({ length: 7 }, (_, i) =>
          addDays(w.opened_on, i),
        );
        const loose = mine.filter((d) => d.day === null);
        const made = mine.filter((d) => d.cooked).length;
        const isOpen = open === w.id;

        return (
          <View key={w.id} style={s.card}>
            <Pressable
              style={s.summary}
              onPress={() => setOpen(isOpen ? null : w.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={s.caret}>{isOpen ? "⌄" : "›"}</Text>
              <View style={s.summaryText}>
                <Text style={s.when}>{monthWeek(w.opened_on)}</Text>
                <Text style={s.range}>
                  {w.closed_on
                    ? `${whenShort(w.closed_on)} 끝냈어요`
                    : "안 끝냈어요"}
                  {" · "}
                  {mine.length > 0
                    ? `담은 ${mine.length} · 만든 ${made}`
                    : "담은 요리 없음"}
                </Text>
              </View>
            </Pressable>

            {isOpen && (
              <View style={s.detail}>
                {/*
                  **그 주 이레를 그대로 적는다.** 예전에는 "연 날 ~ 끝낸 날"
                  이라 끝낸 날이 주 중간이면 기간이 짧게 나왔다. 이제 주는
                  날짜가 정하니까 끝낸 날은 위 줄이 따로 말한다.
                */}
                <Text style={s.range}>{dateRange(dates[0], dates[6])}</Text>

                {/* 식단 화면과 같은 모양 — 날짜가 세로로, 그 밑에 그날 먹은 것 */}
                {dates.map((iso) => {
                  const day = mine.filter((d) => d.day === dayIndex(iso));
                  const memo = data.notes[iso];
                  return (
                    <View key={iso} style={s.day}>
                      <Text style={s.dayName}>
                        <Text style={s.date}>{dateSay(iso)}</Text>
                        <Text style={s.weekday}> ({DAYS[dayIndex(iso)]})</Text>
                      </Text>
                      {!!memo && <Text style={s.memo}>{memo}</Text>}
                      {day.length > 0 ? (
                        day.map((d) => (
                          <Pressable
                            key={d.recipe_id}
                            style={s.dish}
                            onPress={() => router.push(`/recipe/${d.recipe_id}`)}
                          >
                            <Text style={s.dishTitle}>{d.title}</Text>
                            <Text
                              style={[s.mark, d.cooked && s.markOn]}
                            >
                              {d.cooked ? "만들었어요" : "안 만들었어요"}
                            </Text>
                          </Pressable>
                        ))
                      ) : (
                        !memo && <Text style={s.none}>안 정했어요</Text>
                      )}
                    </View>
                  );
                })}

                {loose.length > 0 && (
                  <View style={s.day}>
                    <Text style={s.dayName}>
                      <Text style={s.date}>날짜 미정</Text>
                      <Text style={s.weekday}> {loose.length}개</Text>
                    </Text>
                    {loose.map((d) => (
                      <Pressable
                        key={d.recipe_id}
                        style={s.dish}
                        onPress={() => router.push(`/recipe/${d.recipe_id}`)}
                      >
                        <Text style={s.dishTitle}>{d.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Text style={s.bought}>{w.bought}개 샀어요</Text>

                {/*
                  끝낸 주는 아무거나 다시 열 수 있다. 주가 날짜로 정해지면서
                  되돌려도 "이번 주" 가 흔들리지 않는다 — 예전에는 승격을
                  되돌려야 해서 최근 것 하나만 됐다.
                */}
                {!!w.closed_on && (
                  <Pressable
                    style={s.secondaryBlock}
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        await weeksApi.reopen(w.id);
                        await load();
                      } catch (e) {
                        setFailed(
                          e instanceof ApiError
                            ? e.message
                            : "다시 열지 못했어요",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Text style={s.secondaryText}>
                      아직 안 끝낸 걸로 돌릴게요
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3], padding: sp[4] },
  body: { padding: sp[4], gap: sp[2], paddingBottom: sp[12] },

  back: { minHeight: TOUCH, justifyContent: "center" },
  backText: { color: color.accent, fontSize: 15 },

  title: { fontSize: 22, fontWeight: "700", color: color.text },
  sub: { fontSize: 14, color: color.textSecondary, marginBottom: sp[2] },
  empty: {
    fontSize: 14,
    color: color.textSecondary,
    textAlign: "center",
    paddingVertical: sp[10],
  },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingHorizontal: sp[4],
    marginBottom: sp[2],
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp[2],
    minHeight: TOUCH + 12,
    paddingVertical: sp[3],
  },
  caret: { color: color.textTertiary, fontSize: 16, width: 12 },
  summaryText: { flex: 1 },
  when: { fontSize: 16, fontWeight: "600", color: color.text },
  range: { fontSize: 13, color: color.textTertiary, marginTop: 2 },

  detail: {
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: sp[3],
    paddingBottom: sp[4],
    gap: sp[1],
  },
  day: { marginTop: sp[3] },
  dayName: { fontSize: 14 },
  date: { color: color.text, fontWeight: "700" },
  weekday: { color: color.textTertiary, fontWeight: "400" },
  memo: { fontSize: 13, color: color.textSecondary, marginTop: 2 },
  none: { fontSize: 13, color: color.textTertiary, marginTop: 2 },

  dish: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp[2],
    minHeight: TOUCH,
  },
  dishTitle: { flex: 1, fontSize: 15, color: color.accent },
  mark: { fontSize: 11, color: color.textTertiary },
  markOn: { color: color.accentStrong, fontWeight: "700" },

  bought: { fontSize: 13, color: color.textTertiary, marginTop: sp[4] },

  secondary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp[4],
  },
  secondaryBlock: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSunken,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: sp[3],
  },
  secondaryText: { color: color.textSecondary, fontSize: 14, fontWeight: "600" },

  warn: { backgroundColor: color.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: color.warm, fontSize: 13 },
});
