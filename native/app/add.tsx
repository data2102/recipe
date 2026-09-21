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

import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ApiError,
  ingest as ingestApi,
  youtube as youtubeApi,
  type Draft,
  type DraftItem,
} from "../lib/api";
import { shrink } from "../lib/shrink";
import Tap from "../components/Tap";
import { radius, sp, themed, TOUCH } from "../lib/tokens";

type Stage = "pick" | "reading" | "confirm";

export default function Add() {
  const { s, c } = useTheme();
  const [stage, setStage] = useState<Stage>("pick");
  const [shots, setShots] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failed, setFailed] = useState<{
    message: string;
    hint?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /** 유튜브에서 온 경우의 원문 주소. **화면에 안 보여도 저장된다** */
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /*
    **유튜브에서 고른 영상으로 시작한다** (`/add?youtube=<id>`).

    설명란을 읽어 오는 건 서버다 (`GET /api/youtube?id=`) — 키가 앱에
    없어야 하기 때문이다. 받아온 제목+설명을 글 칸에 넣고, **주소는
    따로 들고 간다** (지시서 4장 저작권: 화면에 안 보여도 `source_url`
    로 저장돼야 한다).

    **자동으로 읽기 시작하지 않는다.** 웹은 공유 시트에서 넘어온 경우만
    알아서 시작하는데, 여기는 사용자가 영상을 고르고 "재료 확인하고
    저장" 을 누른 참이라 한 번 더 보여주는 게 맞다 — 설명란이 레시피가
    아닐 수도 있고, 그때 30초를 태우면 되돌릴 길이 없다.
  */
  const { youtube: videoId } = useLocalSearchParams<{ youtube?: string }>();
  const fetched = useRef(false);
  useEffect(() => {
    if (!videoId || fetched.current) return;
    fetched.current = true;
    void (async () => {
      setBusy(true);
      try {
        const got = await youtubeApi.one(String(videoId));
        if (!got.ok) {
          setFailed({ message: got.message });
          return;
        }
        setText(`${got.video.title}\n${got.video.description}`);
        setSourceUrl(`https://www.youtube.com/watch?v=${got.video.id}`);
      } catch (e) {
        setFailed({
          message:
            e instanceof ApiError ? e.message : "영상을 확인하지 못했어요.",
        });
      } finally {
        setBusy(false);
      }
    })();
  }, [videoId]);

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
      const result = await ingestApi(shots, text, sourceUrl);
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
      /*
        **보관했다고 함부로 말하지 마라.**

        "올린 건 그대로 보관했어요" 는 서버가 받았을 때만 참이다 (원칙 ⑤ 는
        서버가 파싱보다 먼저 보관한다는 약속이지, 닿지도 못한 요청까지
        보관한다는 뜻이 아니다). 폰에서 끊긴 경우(status 0)에 저 말을 하면
        거짓말이고, 사용자는 서버에 있는 줄 알고 기다린다.
      */
      const reached = e instanceof ApiError && e.status > 0;
      setFailed({
        message:
          e instanceof ApiError ? e.message : "레시피를 읽다가 막혔어요.",
        /*
          **아는 만큼만 말한다.** 서버가 답을 준 경우(status > 0)에만
          보관됐다고 말할 수 있다 — 그때는 원본이 파싱보다 먼저
          보관됐다는 약속이 지켜진 뒤다 (원칙 ⑤).

          끊긴 경우(status 0)는 **닿았는지 아닌지를 우리가 모른다.**
          3초 만에 끊겼으면 못 간 것이고 40초 만이면 올라간 뒤 끊긴
          것인데 둘 다 여기로 온다. 그래서 "서버까지 못 갔어요" 라고
          단정하지 않는다 — 위 문장에 몇 초인지가 적혀 있다.
        */
        hint: reached
          ? "올린 건 그대로 보관했어요. 다시 해보셔도 돼요."
          : "신호가 잡히는 곳에서 다시 해주세요.",
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
        <ActivityIndicator color={c.accent} size="large" />
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
                  {!!item.raw_qty && <Text style={s.qty}> {item.raw_qty}</Text>}
                </Text>
                {/*
                  왜 물어보는지 **서버가 적어 보낸 근거를 그대로** 적는다
                  (원칙 ③). 여기서 따로 지어내지 않는다 — 택1 이라는 말도
                  이미 `evidence` 에 들어 있어서, 한 줄 더 쓰면 같은 말이
                  두 번 나온다 (실제로 그렇게 나왔다).
                */}
                {!!item.evidence && <Text style={s.why}>{item.evidence}</Text>}
                <View style={s.yesno}>
                  <Tap
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
                  </Tap>
                  <Tap
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
                  </Tap>
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

        <Tap
          style={[s.primary, busy && s.dim]}
          disabled={busy}
          onPress={() => void save()}
        >
          <Text style={s.primaryText}>
            {busy ? "저장 중…" : "이대로 저장할게요"}
          </Text>
        </Tap>
        <Tap style={s.quiet} onPress={() => router.back()}>
          <Text style={s.quietText}>그만두기</Text>
        </Tap>
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
      <Tap style={s.back} onPress={() => router.back()}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Tap>

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

      <Tap style={s.secondaryBlock} onPress={() => void pick()}>
        <Text style={s.secondaryText}>
          {shots.length > 0 ? `캡처 ${shots.length}장 · 다시 고르기` : "캡처 고르기"}
        </Text>
      </Tap>

      {/*
        **유튜브에서 찾기로 가는 길은 여기 하나다** (웹도 그렇다).
        이미 영상에서 들어온 참이면 안 낸다 — 왔던 데로 또 보내는 칸이다.
      */}
      {!videoId && (
        <Tap style={s.secondaryBlock} onPress={() => router.push("/youtube")}>
          <Text style={s.secondaryText}>유튜브에서 찾기</Text>
        </Tap>
      )}

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
          placeholderTextColor={c.textDisabled}
        />
      </View>

      <Tap style={s.primary} onPress={() => void read()}>
        <Text style={s.primaryText}>읽어주세요</Text>
      </Tap>

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

const useTheme = themed((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3], padding: sp[6] },
  body: { padding: sp[4], gap: sp[3], paddingBottom: sp[12] },

  back: { minHeight: TOUCH, justifyContent: "center" },
  backText: { color: c.accent, fontSize: 15 },

  title: { fontSize: 22, fontWeight: "700", color: c.text, textAlign: "center" },
  sub: { fontSize: 14, color: c.textSecondary, lineHeight: 21, textAlign: "center" },
  body2: { fontSize: 14, color: c.textSecondary, lineHeight: 21 },
  hint: { fontSize: 13, color: c.textTertiary, textAlign: "center" },

  card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: sp[4] },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.text, marginBottom: sp[3] },
  label: { fontSize: 13, color: c.textTertiary, marginBottom: sp[2] },

  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: sp[3],
    paddingVertical: sp[2],
    fontSize: 15,
    color: c.text,
  },
  area: { minHeight: 120, textAlignVertical: "top" },

  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    marginRight: sp[2],
    backgroundColor: c.surfaceSunken,
  },

  check: {
    paddingVertical: sp[3],
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  checkName: { fontSize: 16, color: c.text },
  qty: { fontSize: 14, color: c.textTertiary },
  why: { fontSize: 12, color: c.textTertiary, marginTop: sp[1] },
  yesno: { flexDirection: "row", gap: sp[2], marginTop: sp[3] },
  choice: {
    flex: 1,
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  picked: { borderColor: c.accent, backgroundColor: c.accentBg },
  choiceText: { fontSize: 14, color: c.textSecondary, fontWeight: "600" },
  pickedText: { color: c.accentStrong, fontWeight: "700" },

  step: { flexDirection: "row", gap: sp[3], paddingVertical: sp[2] },
  stepNo: { width: 22, fontSize: 13, fontWeight: "700", color: c.textTertiary },
  stepText: { flex: 1, fontSize: 15, color: c.text, lineHeight: 23 },

  primary: {
    minHeight: TOUCH + 4,
    borderRadius: radius.md,
    backgroundColor: c.accentStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: c.onAccent, fontSize: 16, fontWeight: "700" },
  secondaryBlock: {
    minHeight: TOUCH + 4,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: c.textSecondary, fontSize: 15, fontWeight: "600" },
  quiet: { minHeight: TOUCH, alignItems: "center", justifyContent: "center" },
  quietText: { color: c.textTertiary, fontSize: 14 },
  dim: { opacity: 0.5 },

  warn: { backgroundColor: c.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: c.warm, fontSize: 14 },
  warnHint: { color: c.warm, fontSize: 12, marginTop: sp[1], opacity: 0.85 },
}));
