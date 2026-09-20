/**
 * 유튜브에서 찾기 — 설명란에 재료가 적힌 영상만 골라준다
 *
 * 웹의 `app/youtube/page.tsx` 와 같은 화면이다. **찾는 규칙은 서버에
 * 한 벌뿐이고** (`lib/youtube-search.ts`) 앱은 `GET /api/youtube` 를
 * 거친다 — 유튜브 키를 앱에 실으면 번들을 뜯는 누구나 우리 할당량을
 * 쓰게 된다.
 *
 * **자막은 안 건드린다.** 공식 경로는 영상 주인만 되고 비공식 경로는
 * 지시서 4장이 금지한 것이다 — 설명란까지다.
 *
 * **탭이 아니다** (`_layout.tsx` 의 `href: null`). 화면은 셋이라는
 * 규칙은 그대로고, 여기는 레시피 넣기에서 들어오는 곁길이다.
 */

import { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, youtube as youtubeApi, type VideoRecipe } from "../lib/api";
import Tap from "../components/Tap";
import { radius, sp, themed, TOUCH } from "../lib/tokens";

export default function Youtube() {
  const { s, c } = useTheme();
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const [videos, setVideos] = useState<VideoRecipe[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [next, setNext] = useState<string | undefined>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  async function find(page = "") {
    const q = term.trim();
    if (!q) {
      setFailed("무엇을 찾을지 적어주세요.");
      return;
    }
    setBusy(true);
    setFailed("");
    try {
      const got = await youtubeApi.search(q, page);
      if (!got.ok) {
        /*
          한도를 넘었다거나 키가 없다는 건 **고장이 아니라 답**이다.
          서버가 사람 말로 적어 보내니 그걸 그대로 낸다 — 여기서 다시
          지어내면 서버를 고쳐도 앱은 옛말을 한다 (원칙 ③).
        */
        setFailed(got.message);
        setVideos(null);
        return;
      }
      // 다음 쪽은 이어붙인다 — 웹은 페이지를 갈아끼우지만 폰은 훑는 화면이다
      setVideos((was) => (page && was ? [...was, ...got.videos] : got.videos));
      setChecked(got.checked);
      setNext(got.next);
    } catch (e) {
      setFailed(
        e instanceof ApiError ? e.message : "유튜브를 찾다가 막혔어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={[s.screen, { paddingTop: insets.top }]}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
    >
      <Tap style={s.back} onPress={() => router.back()}>
        <Text style={s.backText}>← 돌아가기</Text>
      </Tap>

      <Text style={s.title}>유튜브에서 찾기</Text>
      <Text style={s.sub}>설명란에 재료와 수량이 적힌 영상만 골라드려요.</Text>

      <TextInput
        style={s.input}
        value={term}
        onChangeText={setTerm}
        placeholder="예: 두부조림"
        placeholderTextColor={c.textTertiary}
        maxLength={80}
        returnKeyType="search"
        onSubmitEditing={() => void find()}
      />
      <Tap style={s.primary} disabled={busy} onPress={() => void find()}>
        <Text style={s.primaryText}>{busy ? "찾는 중…" : "찾기"}</Text>
      </Tap>

      {!!failed && (
        <View style={s.warn}>
          <Text style={s.warnText}>{failed}</Text>
        </View>
      )}

      {busy && !videos && <ActivityIndicator color={c.accent} />}

      {videos && (
        <>
          <Text style={s.count}>
            영상 {checked}개의 설명란을 봤어요 · 후보 {videos.length}개
          </Text>
          <Text style={s.sub}>
            아래 재료는 설명란 원문이에요. 저장하기 전에 확인해주세요.
          </Text>

          {videos.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>재료가 적힌 영상을 못 찾았어요</Text>
              <Text style={s.sub}>
                다른 말로 찾아보시거나, 캡처로 넣으셔도 돼요.
              </Text>
            </View>
          )}

          {videos.map((v) => (
            <View key={v.id} style={s.card}>
              <Tap
                onPress={() =>
                  void Linking.openURL(
                    `https://www.youtube.com/watch?v=${v.id}`,
                  )
                }
              >
                <Image
                  source={{
                    uri: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
                  }}
                  style={s.cover}
                />
              </Tap>
              <Text style={s.cardTitle} numberOfLines={2}>
                {v.title}
              </Text>
              <Text style={s.channel}>{v.channel} · YouTube</Text>
              {/*
                **왜 레시피라고 봤는지는 서버가 적어 보낸다** (`evidence`).
                화면이 한 줄 더 쓰면 같은 말이 두 번 나온다.
              */}
              <Text style={s.evidence} numberOfLines={2}>
                {v.evidence.slice(0, 3).join(" · ")}
              </Text>
              <Tap
                style={s.secondary}
                onPress={() => router.push(`/add?youtube=${v.id}`)}
              >
                <Text style={s.secondaryText}>재료 확인하고 저장</Text>
              </Tap>
            </View>
          ))}

          {!!next && (
            <Tap
              style={s.secondary}
              disabled={busy}
              onPress={() => void find(next)}
            >
              <Text style={s.secondaryText}>
                {busy ? "찾는 중…" : "다음 영상에서 더 찾기"}
              </Text>
            </Tap>
          )}
        </>
      )}
    </ScrollView>
  );
}

const useTheme = themed((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  body: { padding: sp[4], gap: sp[3], paddingBottom: sp[12] },

  back: { minHeight: TOUCH, justifyContent: "center" },
  backText: { color: c.accent, fontSize: 15, fontWeight: "600" },

  title: { fontSize: 24, fontWeight: "700", color: c.text },
  sub: { fontSize: 14, color: c.textSecondary },
  count: { fontSize: 13, color: c.textTertiary, marginTop: sp[2] },

  input: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
    color: c.text,
    paddingHorizontal: sp[3],
    fontSize: 16,
  },

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
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: c.textSecondary, fontSize: 15, fontWeight: "600" },

  warn: { backgroundColor: c.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: c.warm, fontSize: 14 },

  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: sp[3],
    gap: sp[2],
    borderWidth: 1,
    borderColor: c.border,
  },
  cover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: c.text },
  channel: { fontSize: 13, color: c.textTertiary },
  evidence: { fontSize: 13, color: c.textSecondary },

  empty: { paddingVertical: sp[6], gap: sp[2], alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: c.text },
}));
