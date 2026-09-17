/**
 * 식단 — **날짜를 쭉 늘어놓는다.**
 *
 * 웹의 `app/Plan.tsx` 와 같은 화면이다.
 *
 * **주 탭을 만들지 마라.** 이번 주와 다음 주를 가르지 않고 열나흘을 세로로
 * 늘어놓는다. 사람이 묻는 건 "이번 주에 뭐 담았지" 가 아니라 **"수요일에 뭐
 * 먹지"** 인데, 주를 먼저 고르게 하면 그 답 하나 보려고 탭을 오간다.
 *
 * **추천을 여기 올리지 마라.** 예전에 이 자리에 추천이 있었다 — 고르는 일과
 * "뭘 먹기로 했더라" 가 한 화면에 겹쳐서 자주 하는 뒤쪽이 아래로 밀렸다.
 * 고르는 자리는 메뉴 고르기다.
 *
 * **빈 날을 감추지 않는다.** 안 정한 날이 보여야 정할 수 있고, 약속이 있는
 * 날은 *안 정해도 되는 날*이라고 적어둘 수 있다.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ApiError,
  cooked as markCooked,
  plan as planApi,
  type PlanDish,
  type PlanScreen,
} from "../lib/api";
import {
  DAYS,
  NOTE_MAX,
  atHome,
  dateFull,
  dateSay,
  dateTiny,
  dayIndex,
} from "../lib/pure";
import PlanSheet from "../components/PlanSheet";
import Tap from "../components/Tap";
import { radius, sp, themed, TOUCH } from "../lib/tokens";

export default function Plan() {
  const { s, c } = useTheme();
  const [data, setData] = useState<PlanScreen | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      setData(await planApi.read());
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "식단을 못 읽었어요");
    } finally {
      setLoading(false);
    }
  }, []);

  /*
    탭을 다시 열 때마다 읽는다. 담기는 **메뉴 고르기에서도 일어나고**
    장보기 체크가 "집에 있음" 을 바꾼다 — 한 번만 읽으면 돌아왔을 때
    어제 걸 보여준다 (웹의 `revalidatePath("/", "layout")` 자리다).
  */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveNote(date: string, note: string) {
    setBusy(true);
    try {
      await planApi.note(date, note);
      setEditing(null);
      await load();
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "메모를 저장 못 했어요");
    } finally {
      setBusy(false);
    }
  }

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
        <Text style={s.title}>식단을 못 읽었어요</Text>
        <Text style={s.sub}>{failed}</Text>
        <Tap style={s.primary} onPress={() => void load()}>
          <Text style={s.primaryText}>다시 해볼게요</Text>
        </Tap>
      </View>
    );
  }

  const { today } = data;

  /*
    날짜를 고르는 판에 넘길 것. **담기 화면과 같은 판이다** —
    고르는 길이 둘이면 한쪽만 좋아진다.
  */
  const pickDays = data.days.map((d) => ({
    iso: d.date,
    which: d.week,
    note: d.note,
    titles: data.dishes.filter((x) => x.date === d.date).map((x) => x.title),
  }));

  const loose = data.dishes.filter((d) => d.date === null);

  function Dish({ p }: { p: PlanDish }) {
    const isOpen = open === `${p.week}-${p.recipeId}`;
    const have = data!.excluded[p.week];
    const need = p.items.filter(
      (i) => !atHome(have, i.ingredient_id, i.raw_name),
    );

    return (
      <View style={s.dish}>
        <View style={s.dishHead}>
          <Tap
            style={s.name}
            onPress={() => setOpen(isOpen ? null : `${p.week}-${p.recipeId}`)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
          >
            <Text style={s.caret}>{isOpen ? "⌄" : "›"}</Text>
            <View style={s.nameText}>
              <Text style={s.dishTitle} numberOfLines={1}>
                {p.title}
              </Text>
              {/* 판정하지 않고 근거를 적는다 (원칙 ③) */}
              <Text style={s.count}>
                {p.cooked
                  ? "만들었어요"
                  : p.items.length === 0
                    ? "재료 없어요"
                    : need.length === 0
                      ? "보유 확인했어요"
                      : `보유 확인 전 ${need.length}`}
              </Text>
            </View>
          </Tap>

          {/*
            **날짜를 누르면 고르는 판이 뜬다.** 웹에서는 여기가 <select>
            였는데 네모와 화살표가 줄마다 서서 요리 이름을 밀어냈고,
            무엇보다 그 목록에는 **그날 뭐가 있는지**가 안 보였다.
          */}
          <PlanSheet
            recipeId={p.recipeId}
            title={p.title}
            days={pickDays}
            today={today}
            placed={[{ date: p.date, which: p.week }]}
            label={p.date ? dateTiny(p.date) : "날짜 고르기"}
            tone="quiet"
            onDone={load}
          />
        </View>

        {/*
          지난 날은 **물어보되 자동으로 기록하지 않는다.** 약속이 생겨
          건너뛴 날이 흔한데 자동으로 체크하면 안 만든 게 만든 것으로
          남고, `last_cooked_on` 하나가 30일 추천과 정렬을 통째로 틀어놓는다.
        */}
        {p.past && !p.cooked && p.date && (
          <View style={s.ask}>
            <Text style={s.askText}>
              {dateFull(p.date)}이 지났어요. 만들었어요?
            </Text>
            <View style={s.askRow}>
              <Tap
                style={s.secondary}
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await markCooked(p.recipeId, p.date!);
                    await load();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Text style={s.secondaryText}>만들었어요</Text>
              </Tap>
              {/*
                "안 먹었어요" 는 **요일만 미정으로 되돌린다.** 못 먹었을
                뿐이지 이번 주에서 빼는 게 아니다 — 장보기에는 남는다.
              */}
              <Tap
                style={s.secondary}
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await planApi.onDate(p.recipeId, null, p.week);
                    await load();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Text style={s.secondaryText}>안 먹었어요</Text>
              </Tap>
            </View>
          </View>
        )}

        {isOpen && (
          <View style={s.detail}>
            <Tap onPress={() => router.push(`/recipe/${p.recipeId}`)}>
              <Text style={s.read}>만드는 법 보기 →</Text>
            </Tap>

            {p.items.map((it) => {
              const hasIt = atHome(have, it.ingredient_id, it.raw_name);
              return (
                /*
                  **잠긴 칸이다 — 누르는 칸이 아니다.** 장보기의 체크와
                  생김새가 비슷하지만 저쪽은 구매 기록을 만들고 이쪽은
                  읽기만 한다. 답을 쓰는 자리는 장보기 하나다.
                */
                <View key={it.id} style={s.item}>
                  <Text style={[s.mark, hasIt && s.markOn]}>
                    {hasIt ? "집에 있음" : "확인 전"}
                  </Text>
                  <Text style={[s.itemName, hasIt && s.gotIt]}>
                    {it.raw_name}
                  </Text>
                  {!!it.raw_qty && <Text style={s.qty}>{it.raw_qty}</Text>}
                  {!!it.choice_group && <Text style={s.qty}>택1</Text>}
                </View>
              );
            })}

            {p.items.length === 0 && (
              <Text style={s.hint}>
                재료가 아직 안 붙어 있어요. 캡처로 채우면 여기 나와요.
              </Text>
            )}

            <Tap
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await planApi.remove(p.recipeId, p.week);
                  await load();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Text style={s.unpick}>식단에서 뺄게요</Text>
            </Tap>
          </View>
        )}
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
      <Text style={s.title}>식단</Text>
      <Text style={s.sub}>이번 주와 다음 주, 열나흘</Text>

      {!!failed && (
        <View style={s.warn}>
          <Text style={s.warnText}>{failed}</Text>
        </View>
      )}

      {data.days.map((day, i) => {
        const dishes = data.dishes.filter((d) => d.date === day.date);
        const isToday = day.date === today;
        return (
          <View key={day.date}>
            {i === 7 && <Text style={s.weekMark}>다음 주</Text>}
            <View
              style={[
                s.day,
                isToday && s.todayDay,
                day.date < today && s.pastDay,
              ]}
            >
              {/*
                빈 날은 한 줄이다. 열나흘마다 "아직 안 정했어요" 를 적으면
                화면의 절반이 그 말이 된다 — 안 정한 건 비어 있는 것으로 보인다.
              */}
              <View style={s.dayHead}>
                {/*
                  **이 화면의 주인공은 오늘이다** (웹의 `Plan.module.css` 와
                  같은 규칙 — docs/ui-references.md 11장 A1). 위계는 하나를
                  키우는 일이 아니라 나머지를 내리는 일이라, 오늘을 올리고
                  열세 날을 내리면 화면이 오히려 짧아진다.
                */}
                <Text style={s.dayName}>
                  <Text style={isToday ? s.dateToday : s.dateOther}>
                    {dateSay(day.date)}
                  </Text>
                  <Text style={isToday ? s.weekdayToday : s.weekday}>
                    {" "}
                    ({DAYS[dayIndex(day.date)]})
                  </Text>
                </Text>
                {isToday && <Text style={s.badge}>오늘</Text>}
                <View style={s.spacer} />
                {!day.note && editing !== day.date && day.date >= today && (
                  <Tap
                    style={s.addNote}
                    onPress={() => {
                      setEditing(day.date);
                      setDraft("");
                    }}
                  >
                    <Text style={s.addNoteText}>+ 메모</Text>
                  </Tap>
                )}
              </View>

              {/*
                **메모는 날짜에 붙는다 — 주가 아니라.** 약속이 있는 날은
                *안 정해도 되는 날*이라고 적어두는 자리다. 앱이 해석하지
                마라 — 메모가 있다고 담기를 막거나 추천에서 빼지 않는다.
              */}
              {editing === day.date ? (
                <View style={s.noteForm}>
                  <TextInput
                    style={s.input}
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={NOTE_MAX}
                    autoFocus
                    placeholder="저녁 약속, 외식, 야근…"
                    placeholderTextColor={c.textDisabled}
                    onSubmitEditing={() => void saveNote(day.date, draft)}
                  />
                  <Tap
                    style={s.secondary}
                    disabled={busy}
                    onPress={() => void saveNote(day.date, draft)}
                  >
                    <Text style={s.secondaryText}>저장</Text>
                  </Tap>
                  <Tap style={s.quiet} onPress={() => setEditing(null)}>
                    <Text style={s.quietText}>그만두기</Text>
                  </Tap>
                </View>
              ) : day.note ? (
                <View style={s.noteRow}>
                  <Text style={s.noteText}>{day.note}</Text>
                  <Tap
                    style={s.quiet}
                    onPress={() => {
                      setEditing(day.date);
                      setDraft(day.note);
                    }}
                  >
                    <Text style={s.quietText}>고치기</Text>
                  </Tap>
                </View>
              ) : null}

              {dishes.map((p) => (
                <Dish key={`${p.week}-${p.recipeId}`} p={p} />
              ))}
            </View>
          </View>
        );
      })}

      {loose.length > 0 && (
        <View style={s.day}>
          <View style={s.dayHead}>
            <Text style={s.dayName}>
              <Text style={s.dateOther}>날짜 미정</Text>
              <Text style={s.weekday}> {loose.length}개</Text>
            </Text>
          </View>
          <Text style={s.hint}>
            날짜를 고르면 위로 올라가요. 안 정해도 장보기에는 들어가요.
          </Text>
          {loose.map((p) => (
            <Dish key={`${p.week}-${p.recipeId}`} p={p} />
          ))}
        </View>
      )}

      {/* 지난 주는 따로 본다 — 목록 하나가 지난 한 주다 */}
      <Tap style={s.secondaryBlock} onPress={() => router.push("/weeks")}>
        <Text style={s.secondaryText}>지난 주 보기</Text>
      </Tap>
    </ScrollView>
  );
}

const useTheme = themed((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3] },
  body: { padding: sp[4], gap: sp[2], paddingBottom: sp[12] },

  title: { fontSize: 22, fontWeight: "700", color: c.text },
  sub: { fontSize: 14, color: c.textSecondary, marginBottom: sp[2] },
  hint: { fontSize: 13, color: c.textTertiary, marginTop: sp[1] },

  weekMark: {
    fontSize: 13,
    fontWeight: "700",
    color: c.textTertiary,
    marginTop: sp[5],
    marginBottom: sp[2],
  },

  day: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: sp[4],
    marginBottom: sp[2],
  },
  todayDay: { borderWidth: 2, borderColor: c.accent },
  /** 지난 날은 흐리게 — 지우지는 않는다. 만들었는지 물어볼 게 남아 있다 */
  pastDay: { opacity: 0.72 },

  dayHead: { flexDirection: "row", alignItems: "center", gap: sp[2] },
  spacer: { flex: 1 },
  dayName: { fontSize: 15 },
  /* 오늘 28 / 나머지 13 — 웹의 --fs-display · --fs-caption 과 같은 값 */
  dateToday: { fontSize: 28, lineHeight: 34, color: c.text, fontWeight: "700" },
  dateOther: { fontSize: 13, color: c.textSecondary, fontWeight: "700" },
  weekday: { color: c.textTertiary, fontWeight: "400" },
  weekdayToday: { fontSize: 15, color: c.textTertiary, fontWeight: "400" },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: c.accentStrong,
    backgroundColor: c.accentBg,
    paddingHorizontal: sp[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  addNote: { minHeight: TOUCH, justifyContent: "center", paddingHorizontal: sp[2] },
  addNoteText: { color: c.accent, fontSize: 13 },

  noteRow: { flexDirection: "row", alignItems: "center", gap: sp[2] },
  noteText: { flex: 1, fontSize: 14, color: c.textSecondary },
  noteForm: { flexDirection: "row", alignItems: "center", gap: sp[2], marginTop: sp[2] },
  input: {
    flex: 1,
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: sp[3],
    fontSize: 15,
    color: c.text,
  },

  dish: { marginTop: sp[3], borderTopWidth: 1, borderTopColor: c.border, paddingTop: sp[2] },
  dishHead: { flexDirection: "row", alignItems: "center", gap: sp[2] },
  name: { flex: 1, flexDirection: "row", alignItems: "center", gap: sp[2], minHeight: TOUCH },
  caret: { color: c.textTertiary, fontSize: 16, width: 12 },
  nameText: { flex: 1 },
  dishTitle: { fontSize: 16, color: c.text },
  count: { fontSize: 12, color: c.textTertiary, marginTop: 2 },

  ask: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
    padding: sp[3],
    marginTop: sp[2],
    gap: sp[2],
  },
  askText: { fontSize: 13, color: c.textSecondary },
  askRow: { flexDirection: "row", gap: sp[2] },

  detail: { marginTop: sp[2], gap: sp[1] },
  read: { color: c.accent, fontSize: 14, paddingVertical: sp[2] },
  item: { flexDirection: "row", alignItems: "center", gap: sp[2], paddingVertical: 3 },
  mark: {
    fontSize: 11,
    color: c.textTertiary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.pill,
    paddingHorizontal: sp[2],
    paddingVertical: 1,
    overflow: "hidden",
  },
  markOn: { color: c.accentStrong, borderColor: c.accent },
  itemName: { flex: 1, fontSize: 14, color: c.text },
  gotIt: { color: c.textTertiary },
  qty: { fontSize: 12, color: c.textTertiary },
  unpick: { color: c.warm, fontSize: 13, paddingVertical: sp[3] },

  primary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: c.accentStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp[5],
  },
  primaryText: { color: c.onAccent, fontSize: 15, fontWeight: "700" },
  secondary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp[4],
  },
  secondaryBlock: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginTop: sp[4],
  },
  secondaryText: { color: c.textSecondary, fontSize: 14, fontWeight: "600" },
  quiet: { minHeight: TOUCH, justifyContent: "center", paddingHorizontal: sp[2] },
  quietText: { color: c.textTertiary, fontSize: 13 },

  warn: { backgroundColor: c.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: c.warm, fontSize: 13 },
}));
