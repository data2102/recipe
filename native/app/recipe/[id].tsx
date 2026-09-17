/**
 * 레시피 한 건 (재료 + 만드는 법)
 *
 * 저장해둔 걸 **읽는 화면**이다. 목록은 제목과 재료 몇 개만 보여줘서,
 * 캡처로 넣은 레시피는 만드는 법을 다시 볼 데가 없었다 — 원본 링크가
 * 없으면(인스타 캡처가 그렇다) 저장해두고도 못 읽는다.
 *
 * **여기서 하지 않는 것: 타이머 · 단계 넘기기 · 화면 켜두기.** 요리 중
 * UX 는 아직 안 정한 것이다 (지시서 9장) — 지금 정하면 근거 없이 정하게
 * 된다. 이 화면은 적어둔 걸 그대로 보여주기만 한다.
 *
 * **원문 그대로 보여준다** (원칙 ①). 확인 화면에서 "아니요" 한 재료도
 * 지우지 않고 장보기에서 뺐다고만 적는다 — 여기는 장보기 목록이 아니라
 * 레시피 원문이다.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  API_BASE,
  ApiError,
  cooked as markCooked,
  recipes as recipesApi,
  type RecipeDetail,
} from "../../lib/api";
import { cookedAgo, dateFull, dateSay, todayInput } from "../../lib/pure";
import PlanSheet from "../../components/PlanSheet";
import Tap from "../../components/Tap";
import { radius, sp, themed, TOUCH } from "../../lib/tokens";

export default function Recipe() {
  const { s, c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const n = Number(id);
  const [data, setData] = useState<RecipeDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    if (!Number.isInteger(n) || n <= 0) {
      setFailed("레시피를 못 찾겠어요");
      setLoading(false);
      return;
    }
    try {
      setData(await recipesApi.one(n));
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "레시피를 못 읽었어요");
    } finally {
      setLoading(false);
    }
  }, [n]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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
        <Text style={s.title}>레시피를 못 읽었어요</Text>
        <Text style={s.sub}>{failed}</Text>
        <Tap style={s.secondary} onPress={() => router.back()}>
          <Text style={s.secondaryText}>돌아가기</Text>
        </Tap>
      </View>
    );
  }

  const placed = data.placed;
  const planLabel =
    placed.length === 0
      ? "식단에 담기"
      : placed[0].date
        ? `${dateFull(placed[0].date)}에 먹어요 · 날짜 바꾸기`
        : `${placed[0].which === "next" ? "다음 주" : "이번 주"}에 담았어요 · 날짜 고르기`;

  // 섹션이 여럿이면 소제목으로 나눈다. 하나뿐이면 굳이 붙이지 않는다.
  const sections = [...new Set(data.items.map((i) => i.section ?? ""))];

  /**
   * 지우기 — **되돌릴 수 없어서 한 번 더 묻는다.**
   *
   * 레시피가 사라지는 자리는 서버의 `recipes.remove` 하나다. 담긴 주
   * (`shopping_list_recipe`)는 CASCADE 가 없어서 손으로 먼저 떼는데,
   * 그 순서가 거기 안에 있다.
   */
  function confirmRemove() {
    Alert.alert(
      "이 레시피를 지울까요?",
      `${data!.title} — 재료와 만드는 법, 조리 기록까지 같이 지워져요. 되돌릴 수 없어요.`,
      [
        { text: "그만두기", style: "cancel" },
        {
          text: "지울게요",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await recipesApi.remove(n);
              router.back();
            } catch (e) {
              setFailed(
                e instanceof ApiError ? e.message : "지우지 못했어요",
              );
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={[s.screen, { paddingTop: insets.top }]}
      contentContainerStyle={s.body}
    >
      <Tap style={s.back} onPress={() => router.back()}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Tap>

      <Text style={s.title}>{data.title}</Text>
      <Text style={s.sub}>
        {data.cook_count > 0
          ? `${data.cook_count}번 만들었어요 · ${cookedAgo(data.last_cooked_on)}`
          : "아직 안 만들어봤어요"}
      </Text>

      {!!failed && (
        <View style={s.warn}>
          <Text style={s.warnText}>{failed}</Text>
        </View>
      )}

      {/*
        버튼 둘을 붙여놓지 않는다. 담기와 기록하기가 맞닿아 있으면
        누를 때 손가락이 옆을 짚는다 (웹에서 실제로 그랬다).
      */}
      <View style={s.card}>
        <PlanSheet
          recipeId={data.id}
          title={data.title}
          days={data.days}
          today={todayInput()}
          placed={placed}
          label={planLabel}
          onDone={load}
        />
        <View style={s.gap} />
        <Tap
          style={[s.primary, (busy || done) && s.dim]}
          disabled={busy || done}
          onPress={async () => {
            setBusy(true);
            try {
              await markCooked(data.id);
              setDone(true);
              await load();
            } catch (e) {
              setFailed(e instanceof ApiError ? e.message : "기록 못 했어요");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Text style={s.primaryText}>
            {done ? "기록했어요" : "오늘 만들었어요"}
          </Text>
        </Tap>
      </View>

      {/*
        만든 사진이 먼저다. 재료·만드는 법보다 이게 이 요리를 기억하게
        한다 — "저번에 이렇게 나왔지" 가 다시 만들 이유가 된다.

        **사진은 조리 기록에 붙는다** (`cook_log.photo_key`). 레시피에
        따로 매달지 마라 — 언제 만든 건지 모르는 사진만 쌓인다.
      */}
      {data.photos.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>만든 사진</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {data.photos.map((ph) => (
              <View key={ph.id} style={s.shot}>
                <Image
                  source={{ uri: `${API_BASE}/photo/${ph.id}` }}
                  style={s.shotImage}
                />
                <Text style={s.shotWhen}>{dateSay(ph.cooked_on)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>재료</Text>
        {sections.map((name) => (
          <View key={name}>
            {sections.length > 1 && !!name && (
              <Text style={s.section}>{name}</Text>
            )}
            {data.items
              .filter((i) => (i.section ?? "") === name)
              .map((it, i) => (
                <View key={i} style={s.item}>
                  <Text style={[s.itemName, !it.confirmed && s.dropped]}>
                    {it.raw_name}
                  </Text>
                  <Text style={s.qty}>{it.raw_qty}</Text>
                  {/* 흐린 글씨만 두면 왜 흐린지 알 수 없다 */}
                  {!it.confirmed && (
                    <Text style={s.note}>장보기에서 뺐어요</Text>
                  )}
                </View>
              ))}
          </View>
        ))}
        {data.items.length === 0 && (
          <Text style={s.body2}>재료가 아직 안 붙어 있어요.</Text>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>만드는 법</Text>
        {data.steps.length > 0 ? (
          data.steps.map((step, i) => (
            <View key={i} style={s.step}>
              <Text style={s.stepNo}>{i + 1}</Text>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))
        ) : (
          /* 없으면 없다고 말한다. 빈 자리를 그냥 두면 저장이 덜 된 건지
             원래 없는 건지 알 수 없다 (원칙 ③) */
          <Text style={s.body2}>
            만드는 법은 저장돼 있지 않아요. 캡처에 안 보였거나 못 읽은
            거예요 — 만드는 법이 보이는 화면을 캡처해서 새로 올리면 같이
            저장돼요.
          </Text>
        )}
      </View>

      {!!data.source_url && (
        <Tap
          style={s.secondaryBlock}
          onPress={() => void Linking.openURL(data.source_url!)}
        >
          <Text style={s.secondaryText}>원본 열기</Text>
        </Tap>
      )}

      {/*
        고치기는 아직 웹에만 있다. 없는 버튼을 그리지 않고 어디로 가야
        하는지 말한다 — 고칠 때 **사전 대조를 다시 해야** 해서 화면만
        옮겨서는 안 되는 일이다.
      */}
      <Text style={s.hint}>고치기는 아직 웹에서만 돼요.</Text>

      <Tap style={s.danger} disabled={busy} onPress={confirmRemove}>
        <Text style={s.dangerText}>레시피 지우기</Text>
      </Tap>
    </ScrollView>
  );
}

const useTheme = themed((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3], padding: sp[4] },
  body: { padding: sp[4], gap: sp[3], paddingBottom: sp[12] },

  back: { minHeight: TOUCH, justifyContent: "center" },
  backText: { color: c.accent, fontSize: 15 },

  /* 읽으러 온 화면이라 레시피 이름이 주인공이다 (11장 A1, 웹과 같은 값) */
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: c.text },
  sub: { fontSize: 14, color: c.textSecondary },
  body2: { fontSize: 14, color: c.textSecondary, lineHeight: 21 },
  hint: { fontSize: 13, color: c.textTertiary, textAlign: "center" },

  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: sp[4],
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: c.text,
    marginBottom: sp[3],
  },
  gap: { height: sp[3] },

  section: {
    fontSize: 13,
    fontWeight: "700",
    color: c.textSecondary,
    marginTop: sp[3],
    marginBottom: sp[1],
  },
  item: { flexDirection: "row", alignItems: "center", gap: sp[2], paddingVertical: 4 },
  itemName: { flex: 1, fontSize: 15, color: c.text },
  dropped: { color: c.textTertiary, textDecorationLine: "line-through" },
  qty: { fontSize: 13, color: c.textTertiary },
  note: { fontSize: 11, color: c.warm },

  step: { flexDirection: "row", gap: sp[3], paddingVertical: sp[2] },
  stepNo: {
    width: 22,
    fontSize: 13,
    fontWeight: "700",
    color: c.textTertiary,
  },
  stepText: { flex: 1, fontSize: 15, color: c.text, lineHeight: 23 },

  shot: { marginRight: sp[3] },
  shotImage: {
    width: 148,
    height: 148,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
  },
  shotWhen: { fontSize: 12, color: c.textTertiary, marginTop: sp[1] },

  primary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: c.accentStrong,
    alignItems: "center",
    justifyContent: "center",
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
  },
  secondaryText: { color: c.textSecondary, fontSize: 15, fontWeight: "600" },
  dim: { opacity: 0.5 },

  danger: { minHeight: TOUCH, alignItems: "center", justifyContent: "center" },
  dangerText: { color: c.warm, fontSize: 14, fontWeight: "600" },

  warn: { backgroundColor: c.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: c.warm, fontSize: 13 },
}));
