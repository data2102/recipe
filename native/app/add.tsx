/**
 * 레시피 넣기 — 캡처 → 파싱 → **확인** → 저장
 *
 * 웹의 `app/add/Add.tsx` 와 같은 흐름이다. 세 걸음이 한 화면에 있다:
 * 고르기 · 읽는 중 · 확인.
 *
 * **사용자가 보기 전에는 레시피가 아니다.** 파싱 결과를 바로 저장하지
 * 않고 확인 화면으로 낸다 — 파서가 지어낸 재료가 조용히 장보기에
 * 들어가면 마트에서야 안다.
 *
 * **물어보는 문장에 물음표를 달지 마라** (원칙 ②). 아래에 "넣을게요 /
 * 아니요" 가 붙어 있어서, 질문이면 "아니요" 가 재료를 통째로 뺀다.
 *
 * **오래 걸리는 일은 시작할 때 화면을 바꾼다.** 파싱은 30초쯤 걸린다 —
 * 30초 동안 아무 반응이 없으면 사용자는 또 누른다.
 */

import { useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ApiError,
  ingest as ingestApi,
  type Draft,
  type DraftItem,
} from "../lib/api";
import { color, radius, sp, TOUCH } from "../lib/tokens";

/**
 * 폰 사진은 3~5MB 다. **줄여서 보낸다.**
 *
 * 웹은 캔버스로 같은 일을 한다 (`web/lib/frames.ts`, 긴 변 1280).
 * 그 파일은 video + canvas 라 네이티브로 그대로 못 옮긴다 — 층 표의
 * "웹(다시 써야 한다)" 가 이것이다. 값은 맞춘다.
 *
 * **긴 캡처는 줄이지 말고 잘라야 한다** (글자가 뭉개진다). 그건 아직
 * 안 옮겼다 — 보통 폰 캡처는 한 장이라 여기서는 줄이기만 한다.
 */
const MAX_EDGE = 1280;

async function shrink(uri: string, width: number, height: number) {
  const longest = Math.max(width, height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const out = await ImageManipulator.manipulateAsync(
    uri,
    scale < 1
      ? [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }]
      : [],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  return out.uri;
}

type Stage = "pick" | "reading" | "confirm";

export default function Add() {
  const [stage, setStage] = useState<Stage>("pick");
  const [shots, setShots] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failed, setFailed] = useState<{ message: string; hint?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  async function pick() {
    const ok = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!ok.granted) {
      setFailed({
        message: "사진을 볼 수 있어야 캡처를 읽어요.",
        hint: "설정에서 사진 권한을 켜주세요.",
      });
      return;
    }
    const got = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10, // 서버의 MAX_IMAGES 와 같은 값
      quality: 1, // 줄이는 건 우리가 한다 (아래 shrink)
    });
    if (got.canceled) return;
    setFailed(null);
    setShots(
      await Promise.all(
        got.assets.map((a) => shrink(a.uri, a.width, a.height)),
      ),
    );
  }

  async function read() {
    if (shots.length === 0 && !text.trim()) {
      setFailed({ message: "캡처를 올리거나 레시피를 붙여넣어 주세요." });
      return;
    }
    /*
      **시작할 때 화면을 먼저 바꾼다.** 파싱은 30초쯤 걸리는데 그동안
      아무 반응이 없으면 사용자는 또 누른다.
    */
    setStage("reading");
    setFailed(null);
    try {
      const result = await ingestApi(shots, text);
      if (result.ok) {
        setDraft(result.draft);
        setStage("confirm");
      } else {
        /*
          실패해도 **올린 원본은 서버에 보관돼 있다** (원칙 ⑤).
          그래서 고르기 화면으로 돌아가되 고른 것을 그대로 둔다.
        */
        setFailed({ message: result.message, hint: result.hint });
        setStage("pick");
      }
    } catch (e) {
      setFailed({
        message: e instanceof ApiError ? e.message : "레시피를 읽다가 막혔어요.",
        hint: "올린 건 그대로 보관했어요. 다시 해보셔도 돼요.",
      });
      setStage("pick");
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const { recipeId } = await ingestApi.commit(draft);
      router.replace(`/recipe/${recipeId}`);
    } catch (e) {
      setFailed({
        message: e instanceof ApiError ? e.message : "저장하지 못했어요.",
      });
      setBusy(false);
    }
  }

  function set(i: number, patch: Partial<DraftItem>) {
    setDraft((d) =>
      d
        ? { ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }
        : d,
    );
  }

  /* ---------------- 읽는 중 ---------------- */
  if (stage === "reading") {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={color.accent} size="large" />
        <Text style={s.title}>읽는 중이에요</Text>
        <Text style={s.sub}>
          재료와 만드는 법을 정리하고 있어요. 30초쯤 걸려요 — 그동안 앱을
          닫아도 올린 건 보관돼 있어요.
        </Text>
      </View>
    );
  }

  /* ---------------- 확인 ---------------- */
  if (stage === "confirm" && draft) {
    /** 물어볼 것만 펼친다. 나머지는 뭉쳐서 접어둔다 */
    const ask = draft.items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => !item.answered);
    const settled = draft.items.filter((it) => it.answered && it.confirmed);

    return (
      <ScrollView
        style={[s.screen, { paddingTop: insets.top }]}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>이대로 저장할까요</Text>
        <Text style={s.sub}>
          재료 {draft.items.length} · 만드는 법 {draft.steps.length}단계
        </Text>

        {!!failed && (
          <View style={s.warn}>
            <Text style={s.warnText}>{failed.message}</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.label}>요리 이름</Text>
          <TextInput
            style={s.input}
            value={draft.title}
            onChangeText={(t) => setDraft({ ...draft, title: t })}
          />
        </View>

        {/*
          확인 필요 — **이것만 펼쳐서 물어본다.**
          답하기 전에는 어느 쪽도 고른 것처럼 보이면 안 된다. 안 물어본 걸
          답한 척하는 셈이고, "이미 골랐네" 하고 넘어가면 그 기본값이
          조용히 확정된다.
        */}
        {ask.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>이것만 확인해주세요</Text>
            {ask.map(({ item, i }) => (
              <View key={i} style={s.check}>
                <Text style={s.checkName}>
                  {item.raw_name}
                  {!!item.raw_qty && (
                    <Text style={s.qty}> {item.raw_qty}</Text>
                  )}
                </Text>
                {/*
                  왜 물어보는지 **서버가 적어 보낸 근거를 그대로** 적는다
                  (원칙 ③). 여기서 따로 지어내지 않는다 — 택1 이라는 말도
                  이미 `evidence` 에 들어 있어서, 한 줄 더 쓰면 같은 말이
                  두 번 나온다 (실제로 그렇게 나왔다).
                */}
                {!!item.evidence && (
                  <Text style={s.why}>{item.evidence}</Text>
                )}
                <View style={s.yesno}>
                  <Pressable
                    style={[
                      s.choice,
                      item.answered && item.confirmed && s.picked,
                    ]}
                    onPress={() => set(i, { confirmed: true, answered: true })}
                  >
                    <Text
                      style={[
                        s.choiceText,
                        item.answered && item.confirmed && s.pickedText,
                      ]}
                    >
                      넣을게요
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      s.choice,
                      item.answered && !item.confirmed && s.picked,
                    ]}
                    onPress={() => set(i, { confirmed: false, answered: true })}
                  >
                    <Text
                      style={[
                        s.choiceText,
                        item.answered && !item.confirmed && s.pickedText,
                      ]}
                    >
                      아니요
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {settled.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>장보기에 들어가요 · {settled.length}</Text>
            <Text style={s.body2}>
              {settled.map((it) => it.raw_name).join(" · ")}
            </Text>
          </View>
        )}

        {draft.steps.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>만드는 법 {draft.steps.length}단계</Text>
            {draft.steps.map((step, i) => (
              <View key={i} style={s.step}>
                <Text style={s.stepNo}>{i + 1}</Text>
                <Text style={s.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={[s.primary, busy && s.dim]}
          disabled={busy}
          onPress={() => void save()}
        >
          <Text style={s.primaryText}>
            {busy ? "저장 중…" : "이대로 저장할게요"}
          </Text>
        </Pressable>
        <Pressable style={s.quiet} onPress={() => router.back()}>
          <Text style={s.quietText}>그만두기</Text>
        </Pressable>
      </ScrollView>
    );
  }

  /* ---------------- 고르기 ---------------- */
  return (
    <ScrollView
      style={[s.screen, { paddingTop: insets.top }]}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={s.back} onPress={() => router.back()}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Pressable>

      <Text style={s.title}>레시피 넣기</Text>
      <Text style={s.sub}>
        재료가 보이는 화면을 캡처해서 올려주세요. 여러 장도 한 번에 읽어요.
      </Text>

      {!!failed && (
        <View style={s.warn}>
          <Text style={s.warnText}>{failed.message}</Text>
          {!!failed.hint && <Text style={s.warnHint}>{failed.hint}</Text>}
        </View>
      )}

      <Pressable style={s.secondaryBlock} onPress={() => void pick()}>
        <Text style={s.secondaryText}>
          {shots.length > 0 ? `캡처 ${shots.length}장 · 다시 고르기` : "캡처 고르기"}
        </Text>
      </Pressable>

      {shots.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {shots.map((uri) => (
            <Image key={uri} source={{ uri }} style={s.thumb} />
          ))}
        </ScrollView>
      )}

      <View style={s.card}>
        <Text style={s.label}>또는 글로 붙여넣기</Text>
        <TextInput
          style={[s.input, s.area]}
          value={text}
          onChangeText={setText}
          multiline
          placeholder="재료와 만드는 법을 그대로 붙여넣어도 돼요"
          placeholderTextColor={color.textDisabled}
        />
      </View>

      <Pressable style={s.primary} onPress={() => void read()}>
        <Text style={s.primaryText}>읽어주세요</Text>
      </Pressable>

      {/*
        영상에서 장면 뽑기는 아직 안 옮겼다 (`web/lib/frames.ts` 는
        video + canvas 라 네이티브로 다시 써야 한다). 없는 걸 있는 척
        하지 않고 그렇게 말한다.
      */}
      <Text style={s.hint}>
        영상에서 장면 뽑기는 아직 웹에서만 돼요.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3], padding: sp[6] },
  body: { padding: sp[4], gap: sp[3], paddingBottom: sp[12] },

  back: { minHeight: TOUCH, justifyContent: "center" },
  backText: { color: color.accent, fontSize: 15 },

  title: { fontSize: 22, fontWeight: "700", color: color.text, textAlign: "center" },
  sub: { fontSize: 14, color: color.textSecondary, lineHeight: 21, textAlign: "center" },
  body2: { fontSize: 14, color: color.textSecondary, lineHeight: 21 },
  hint: { fontSize: 13, color: color.textTertiary, textAlign: "center" },

  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: sp[4] },
  cardTitle: { fontSize: 16, fontWeight: "700", color: color.text, marginBottom: sp[3] },
  label: { fontSize: 13, color: color.textTertiary, marginBottom: sp[2] },

  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: sp[3],
    paddingVertical: sp[2],
    fontSize: 15,
    color: color.text,
  },
  area: { minHeight: 120, textAlignVertical: "top" },

  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    marginRight: sp[2],
    backgroundColor: color.surfaceSunken,
  },

  check: {
    paddingVertical: sp[3],
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  checkName: { fontSize: 16, color: color.text },
  qty: { fontSize: 14, color: color.textTertiary },
  why: { fontSize: 12, color: color.textTertiary, marginTop: sp[1] },
  yesno: { flexDirection: "row", gap: sp[2], marginTop: sp[3] },
  choice: {
    flex: 1,
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  picked: { borderColor: color.accent, backgroundColor: color.accentBg },
  choiceText: { fontSize: 14, color: color.textSecondary, fontWeight: "600" },
  pickedText: { color: color.accentStrong, fontWeight: "700" },

  step: { flexDirection: "row", gap: sp[3], paddingVertical: sp[2] },
  stepNo: { width: 22, fontSize: 13, fontWeight: "700", color: color.textTertiary },
  stepText: { flex: 1, fontSize: 15, color: color.text, lineHeight: 23 },

  primary: {
    minHeight: TOUCH + 4,
    borderRadius: radius.md,
    backgroundColor: color.accentStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: color.surface, fontSize: 16, fontWeight: "700" },
  secondaryBlock: {
    minHeight: TOUCH + 4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: color.textSecondary, fontSize: 15, fontWeight: "600" },
  quiet: { minHeight: TOUCH, alignItems: "center", justifyContent: "center" },
  quietText: { color: color.textTertiary, fontSize: 14 },
  dim: { opacity: 0.5 },

  warn: { backgroundColor: color.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: color.warm, fontSize: 14 },
  warnHint: { color: color.warm, fontSize: 12, marginTop: sp[1], opacity: 0.85 },
});
