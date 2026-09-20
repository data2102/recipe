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
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  API_BASE,
  ApiError,
  cooked as markCooked,
  photos as photosApi,
  recipes as recipesApi,
  type EditItem,
  type RecipeDetail,
} from "../../lib/api";
import {
  addDays,
  cookedAgo,
  dateFull,
  dateSay,
  lastPlaced,
  todayInput,
} from "../../lib/pure";
import PlanSheet from "../../components/PlanSheet";
import { shrink } from "../../lib/shrink";
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
  /** 지난 날 고르는 판이 열렸나 ("다른 날에 만들었어요") */
  const [pickDay, setPickDay] = useState(false);
  /** 고치는 중인가. 화면을 통째로 갈아끼운다 (add.tsx 의 단계와 같은 방식) */
  const [edit, setEdit] = useState<{
    title: string;
    items: EditItem[];
    steps: string;
  } | null>(null);
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
  // 여러 날에 담겼으면 **마지막 날짜**를 적는다 (lib/plan.types.ts)
  const at = lastPlaced(placed);
  const times = placed.length > 1 ? ` · ${placed.length}번` : "";
  const planLabel = !at
    ? "식단에 담기"
    : at.date
      ? `${dateFull(at.date)}에 먹어요${times} · 날짜 바꾸기`
      : `${at.which === "next" ? "다음 주" : "이번 주"}에 담았어요${times} · 날짜 고르기`;

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

  /**
   * 만든 사진 올리기.
   *
   * **사진은 조리 기록에 붙는다.** 최근 기록이 있으면 거기, 없으면
   * 오늘 만든 기록이 새로 생긴다 (`lib/photos.ts` attach). 그래서
   * 버튼 글자가 **그렇게 될 거라고 미리 말한다** — 사진을 고르는
   * 행동이 앞에 있으니 자동 기록과는 다르다.
   */
  async function addPhoto() {
    const ok = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!ok.granted) {
      setFailed("사진을 볼 수 있어야 올릴 수 있어요. 설정에서 켜주세요.");
      return;
    }
    const got = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1, // 줄이는 건 우리가 한다 (lib/shrink.ts)
    });
    if (got.canceled || !data) return;
    setBusy(true);
    setFailed(null);
    try {
      const a = got.assets[0];
      await photosApi.add(data.id, await shrink(a.uri, a.width, a.height));
      await load();
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "사진을 못 올렸어요");
    } finally {
      setBusy(false);
    }
  }

  /** 사진만 뗀다. **그날 만든 기록은 남는다** */
  function confirmDetach(cookId: number) {
    Alert.alert("사진을 뗄까요", "만든 기록은 그대로 남아요.", [
      { text: "그만두기", style: "cancel" },
      {
        text: "뗄게요",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await photosApi.remove(cookId);
            await load();
          } catch (e) {
            setFailed(e instanceof ApiError ? e.message : "못 뗐어요");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  /** 지난 날로 기록한다 — 오늘이 아니라 **그 날짜로** */
  async function cookedOn(date: string) {
    if (!data) return;
    setPickDay(false);
    setBusy(true);
    try {
      await markCooked(data.id, date);
      setDone(true);
      await load();
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "기록 못 했어요");
    } finally {
      setBusy(false);
    }
  }

  /**
   * 고치기를 시작한다 — 지금 값을 그대로 담는다.
   *
   * **`ingredient_id` 는 안 들고 간다.** 서버가 저장할 때 사전 대조를
   * 다시 하기 때문이다 (`recipes.edit`) — 이름을 고치면 붙는 재료가
   * 달라지고 장보기 합산도 달라져야 한다.
   */
  function startEdit() {
    if (!data) return;
    setFailed(null);
    setEdit({
      title: data.title,
      items: data.items.map((it) => ({
        raw_name: it.raw_name,
        raw_qty: it.raw_qty,
        section: it.section,
        origin: it.origin,
        choice_group: it.choice_group,
        confirmed: it.confirmed,
      })),
      steps: data.steps.join("\n"),
    });
  }

  async function saveEdit() {
    if (!data || !edit) return;
    setBusy(true);
    setFailed(null);
    try {
      await recipesApi.edit(data.id, {
        title: edit.title,
        // 이름을 비운 줄이 "지운 줄" 이다 — 서버가 버린다
        items: edit.items,
        steps: edit.steps.split("\n"),
      });
      setEdit(null);
      await load();
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "고치지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 고치기 ---------------- */
  if (edit) {
    const set = (i: number, patch: Partial<EditItem>) =>
      setEdit((e) =>
        e
          ? {
              ...e,
              items: e.items.map((it, j) =>
                j === i ? { ...it, ...patch } : it,
              ),
            }
          : e,
      );

    return (
      <ScrollView
        style={[s.screen, { paddingTop: insets.top }]}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>레시피 고치기</Text>
        {/*
          **조리 기록·사진·원본은 안 건드린다** — 고치는 건 내용뿐이다.
          원본이 남아야 파서를 고친 뒤 다시 읽을 수 있다 (원칙 ⑤).
        */}
        <Text style={s.sub}>
          만든 기록과 사진, 원본은 그대로예요. 재료 이름을 고치면 장보기도
          따라서 다시 세요.
        </Text>

        {!!failed && (
          <View style={s.warn}>
            <Text style={s.warnText}>{failed}</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.cardTitle}>이름</Text>
          <TextInput
            style={s.input}
            value={edit.title}
            onChangeText={(title) => setEdit((e) => (e ? { ...e, title } : e))}
            placeholder="요리 이름"
            placeholderTextColor={c.textTertiary}
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>재료</Text>
          <Text style={s.help}>이름을 비우면 그 줄은 사라져요.</Text>
          {edit.items.map((it, i) => (
            <View key={i} style={s.editRow}>
              <Tap
                style={s.keep}
                onPress={() => set(i, { confirmed: !it.confirmed })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: it.confirmed }}
              >
                <Text style={s.keepMark}>{it.confirmed ? "✓" : ""}</Text>
              </Tap>
              <TextInput
                style={[s.input, s.grow]}
                value={it.raw_name}
                onChangeText={(raw_name) => set(i, { raw_name })}
                placeholder="재료"
                placeholderTextColor={c.textTertiary}
              />
              <TextInput
                style={[s.input, s.qtyInput]}
                value={it.raw_qty ?? ""}
                onChangeText={(raw_qty) => set(i, { raw_qty })}
                placeholder="수량"
                placeholderTextColor={c.textTertiary}
              />
            </View>
          ))}
          <Text style={s.help}>왼쪽 체크는 장보기에 넣을지예요.</Text>
          <Tap
            style={s.secondaryBlock}
            onPress={() =>
              setEdit((e) =>
                e
                  ? {
                      ...e,
                      items: [
                        ...e.items,
                        {
                          raw_name: "",
                          raw_qty: null,
                          section: null,
                          // 새로 넣은 줄은 사람이 넣은 것이다
                          origin: "USER",
                          choice_group: null,
                          confirmed: true,
                        },
                      ],
                    }
                  : e,
              )
            }
          >
            <Text style={s.secondaryText}>재료 한 줄 더</Text>
          </Tap>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>만드는 법</Text>
          <Text style={s.help}>한 줄이 한 단계예요.</Text>
          <TextInput
            style={[s.input, s.area]}
            value={edit.steps}
            onChangeText={(steps) => setEdit((e) => (e ? { ...e, steps } : e))}
            multiline
            textAlignVertical="top"
            placeholder="한 줄에 한 단계씩"
            placeholderTextColor={c.textTertiary}
          />
        </View>

        <Tap
          style={[s.primary, busy && s.dim]}
          disabled={busy}
          onPress={() => void saveEdit()}
        >
          <Text style={s.primaryText}>{busy ? "저장 중…" : "저장할게요"}</Text>
        </Tap>
        <Tap style={s.quiet} disabled={busy} onPress={() => setEdit(null)}>
          <Text style={s.quietText}>그만두기</Text>
        </Tap>
      </ScrollView>
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
        {/*
          **지난 날은 그 날짜로 기록한다.** 웹의 더보기에 있던 자리다 —
          어제 만들어놓고 오늘 누르면 `last_cooked_on` 이 하루 틀어지고,
          그 하나가 30일 추천과 정렬을 같이 틀어놓는다.
        */}
        <Tap style={s.quiet} disabled={busy} onPress={() => setPickDay(true)}>
          <Text style={s.quietText}>다른 날에 만들었어요</Text>
        </Tap>
      </View>

      {/*
        만든 사진이 먼저다. 재료·만드는 법보다 이게 이 요리를 기억하게
        한다 — "저번에 이렇게 나왔지" 가 다시 만들 이유가 된다.

        **사진은 조리 기록에 붙는다** (`cook_log.photo_key`). 레시피에
        따로 매달지 마라 — 언제 만든 건지 모르는 사진만 쌓인다.
      */}
      <View style={s.card}>
        <Text style={s.cardTitle}>만든 사진</Text>
        {data.photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {data.photos.map((ph) => (
              <Tap
                key={ph.id}
                style={s.shot}
                onPress={() => confirmDetach(ph.id)}
                accessibilityLabel={`${dateSay(ph.cooked_on)} 사진 떼기`}
              >
                <Image
                  source={{ uri: `${API_BASE}/photo/${ph.id}` }}
                  style={s.shotImage}
                />
                <Text style={s.shotWhen}>{dateSay(ph.cooked_on)}</Text>
              </Tap>
            ))}
          </ScrollView>
        )}
        {/*
          **무슨 일이 일어날지 버튼이 미리 말한다.** 사진을 올리면 만든
          기록이 생기는데 (없을 때), 그걸 안 적으면 "왜 만든 걸로 됐지" 가
          된다. 붙을 자리는 서버가 알려준다 (`attachesTo`) — 화면이
          지어내지 않는다.
        */}
        <Tap
          style={[s.secondaryBlock, busy && s.dim]}
          disabled={busy}
          onPress={() => void addPhoto()}
        >
          <Text style={s.secondaryText}>
            {data.attachesTo
              ? `사진 올리기 · ${dateSay(data.attachesTo)} 만든 걸로`
              : "사진 올리기 · 오늘 만든 걸로 기록돼요"}
          </Text>
        </Tap>
      </View>

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
        고치기. **사전 대조는 서버가 다시 한다** (`recipes.edit`) — 그래서
        앱이 화면만 갖고도 된다. 예전에는 그 대조가 서버 액션 안에 있어서
        앱에서 못 했다 (그때는 "웹에서만 돼요" 라고 적어뒀다).
      */}
      <Tap style={s.secondaryBlock} disabled={busy} onPress={startEdit}>
        <Text style={s.secondaryText}>레시피 고치기</Text>
      </Tap>

      <Tap style={s.danger} disabled={busy} onPress={confirmRemove}>
        <Text style={s.dangerText}>레시피 지우기</Text>
      </Tap>

      {/*
        **지난 날 고르기.** 날짜 고르는 기계를 들이지 않는다 — 꾸러미가
        하나 늘고, 묻는 건 "며칠 전에 만들었나" 라서 최근 열나흘이면
        충분하다 (담기 판이 열나흘을 늘어놓는 것과 같은 범위다).
        앞날은 없다: 아직 안 만든 날을 만들었다고 적을 수는 없다.
      */}
      <Modal
        visible={pickDay}
        transparent
        animationType="slide"
        onRequestClose={() => setPickDay(false)}
      >
        <Tap style={s.scrim} onPress={() => setPickDay(false)}>
          <Tap
            style={[s.sheet, { paddingBottom: insets.bottom + sp[4] }]}
            onPress={() => {}}
          >
            <Text style={s.sheetTitle}>언제 만들었어요</Text>
            <ScrollView>
              {Array.from({ length: 14 }, (_, i) =>
                addDays(todayInput(), -i),
              ).map((iso) => (
                <Tap
                  key={iso}
                  style={s.day}
                  disabled={busy}
                  onPress={() => void cookedOn(iso)}
                >
                  <Text style={s.dayText}>{dateFull(iso)}</Text>
                </Tap>
              ))}
            </ScrollView>
            <Tap style={s.quiet} onPress={() => setPickDay(false)}>
              <Text style={s.quietText}>닫기</Text>
            </Tap>
          </Tap>
        </Tap>
      </Modal>
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

  /* ---- 고치기 ---- */
  quiet: { minHeight: TOUCH, alignItems: "center", justifyContent: "center" },
  quietText: { color: c.textTertiary, fontSize: 14, fontWeight: "600" },
  help: { fontSize: 12, color: c.textTertiary, marginBottom: sp[2] },
  input: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSunken,
    color: c.text,
    paddingHorizontal: sp[3],
    fontSize: 15,
  },
  area: { minHeight: 160, paddingTop: sp[3], lineHeight: 22 },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp[2],
    marginBottom: sp[2],
  },
  grow: { flex: 1 },
  qtyInput: { width: 84 },
  /* 체크는 터치 영역을 지킨다 — 줄마다 누르는 자리다 */
  keep: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  keepMark: { color: c.accent, fontSize: 16, fontWeight: "700" },

  /* ---- 지난 날 고르기 ---- */
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: sp[4],
    paddingTop: sp[4],
    maxHeight: "70%",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
    marginBottom: sp[2],
  },
  day: {
    minHeight: TOUCH,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  dayText: { fontSize: 15, color: c.text },
}));
