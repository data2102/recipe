/**
 * 담기 — **누르면 날짜를 묻는다.**
 *
 * 웹의 `app/PlanButton.tsx` 와 같은 판이다. 고르는 사람 머릿속에는 이미
 * "목요일에 이거" 가 있는데 받아줄 데가 없으면 식단에 가서 또 골라야 한다.
 *
 * **고르는 길이 둘이면 한쪽만 좋아진다.** 그래서 식단·메뉴 고르기·레시피
 * 상세가 전부 이 판 하나를 쓴다.
 *
 * 판에는 **그날 이미 담긴 메뉴와 적어둔 약속**을 같이 낸다 — 빈 날을
 * 찾으려고 여는 판이라 날짜만 늘어놓으면 소용이 없다.
 *
 * "날짜는 나중에" 를 남겨둔다. 요일은 안 정해도 된다는 규칙은 그대로다
 * (`day_of_week` 는 NULL 을 허용한다) — 그때만 어느 주인지 물어본다.
 * 날짜를 고르면 주는 **날짜가 정한다** (서버의 `whichOf`).
 */

import { useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, plan as planApi } from "../lib/api";
import {
  dateFull,
  dateTiny,
  lastPlaced,
  type PickDay,
  type Placement,
  type Which,
} from "../lib/pure";
import Tap from "./Tap";
import { radius, sp, themed, TOUCH } from "../lib/tokens";

const WEEK_NAME: Record<Which, string> = { this: "이번 주", next: "다음 주" };

/**
 * 담긴 자리를 버튼에 적는다. **마지막 날짜만** (웹의 `PlanButton` 과 같다).
 *
 * 한 주에 여러 날짜에 담을 수 있게 되면서 (2026-09-19) 자리가 여럿일 수
 * 있는데, 카드 한 줄에 다 적으면 요리 이름보다 길어진다. 대신 여러 날이면
 * **개수를 같이 적는다** — 안 그러면 나머지가 사라진 것으로 읽힌다.
 */
export function placedLabel(placed: Placement[]): string {
  if (placed.length === 0) return "+ 담기";

  const last = lastPlaced(placed)!;

  const more = placed.length > 1 ? ` · ${placed.length}번` : "";
  if (last.date) return `✓ ${dateTiny(last.date)}${more}`;
  return `✓ ${WEEK_NAME[last.which]} · 날짜 미정${more}`;
}

export default function PlanSheet({
  recipeId,
  title,
  days,
  today,
  placed,
  label,
  only,
  tone = "secondary",
  onDone,
}: {
  recipeId: number;
  title: string;
  days: PickDay[];
  today: string;
  placed: Placement[];
  /** 버튼 글자를 직접 정할 때 (상세 화면처럼 한 줄짜리 버튼) */
  label?: string;
  /**
   * **이 주 하나만 고르게 한다** (메뉴 고르기의 두 칸 — 2026-09-20).
   *
   * 안 주면 열나흘이 다 나온다. 주면 그 주의 이레만 나오고 "날짜는
   * 나중에" 도 그 주 것 하나다. 이때 `placed` 도 그 주 것만 넘겨라 —
   * 판에 안 보이는 날짜를 "식단에서 빼기" 가 같이 지우면 안 된다.
   */
  only?: Which;
  tone?: "primary" | "secondary" | "quiet";
  /** 서버가 받아준 뒤에 부른다 — 화면이 다시 읽게 */
  onDone: () => void | Promise<void>;
}) {
  const { s, c } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const insets = useSafeAreaInsets();

  /**
   * 날짜를 누르면 **더한다. 이미 담긴 날을 누르면 뺀다** (웹과 같다).
   *
   * **판을 안 닫는다** — 여러 날을 고르러 연 자리라, 한 번 누를 때마다
   * 닫으면 두 번째 날짜를 고르려고 다시 열어야 한다.
   */
  async function pick(date: string | null, which: Which) {
    setFailed("");
    setBusy(true);
    const on = placed.some((p) => p.date === date && p.which === which);
    try {
      if (on) await planApi.remove(recipeId, which, date);
      else await planApi.onDate(recipeId, date, which);
      await onDone();
    } catch (e) {
      const why = e instanceof ApiError ? e.message : null;
      setFailed(why ?? (on ? "빼지 못했어요" : "담지 못했어요"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * 식단에서 빼기 — 담긴 주에서 통째로. **주 단위로 한 번씩만 부른다**:
   * `placed` 는 자리마다 한 줄이라 그대로 돌면 같은 주를 여러 번 지운다.
   */
  async function clear() {
    setFailed("");
    setBusy(true);
    try {
      for (const w of new Set(placed.map((p) => p.which)))
        await planApi.remove(recipeId, w);
      setOpen(false);
      await onDone();
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "빼지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    tone === "primary" ? s.primary : tone === "quiet" ? s.quiet : s.secondary;
  const btnText =
    tone === "primary"
      ? s.primaryText
      : tone === "quiet"
        ? s.quietText
        : s.secondaryText;

  return (
    <>
      <Tap
        style={[btn, busy && s.dim]}
        disabled={busy}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          only
            ? `${title} ${WEEK_NAME[only]} 날짜 고르기`
            : `${title} 날짜 고르기`
        }
      >
        {/*
          **두 줄까지 받는다.** 메뉴 고르기의 두 칸은 "이번주" 를 위에,
          날짜를 아래에 세운다 (`\n`). 한 줄짜리 버튼들은 그대로 한 줄로
          그려진다 — 넘칠 일이 없어서 값이 2여도 달라지지 않는다.
        */}
        <Text style={btnText} numberOfLines={2}>
          {busy ? "저장 중…" : (label ?? placedLabel(placed))}
        </Text>
      </Tap>

      {/*
        `Modal` 의 `onRequestClose` 가 **안드로이드 뒤로가기**다. 이게
        없으면 판이 닫히는 게 아니라 화면을 통째로 떠난다 — 웹에서 실제로
        그랬고, 설치해서 쓰는 앱이라 더 어긋나 보인다.
      */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        {/* 스크림. 제스처만 두지 않는다 — 누를 수 있는 "닫기" 도 아래 있다 */}
        <Tap style={s.scrim} onPress={() => setOpen(false)}>
          <Tap
            style={[s.sheet, { paddingBottom: insets.bottom + sp[4] }]}
            onPress={() => {}}
          >
            <View style={s.grip}>
              <View style={s.gripBar} />
            </View>

            <View style={s.head}>
              <View style={s.headText}>
                <Text style={s.dish} numberOfLines={1}>
                  {title}
                </Text>
                {/*
                  한 주만 고르는 판이면 **어느 주인지 물음에 적는다.**
                  아래 소제목에도 있지만 그건 목록의 머리고, 여기는 지금
                  무엇을 정하는지다 — 칸이 둘이라 잘못 누르면 한 주가
                  통째로 어긋난다.
                */}
                <Text style={s.ask}>
                  {only
                    ? `${WEEK_NAME[only]}, 언제 먹을까요?`
                    : "언제 먹을까요?"}
                </Text>
              </View>
              <Tap style={s.close} onPress={() => setOpen(false)}>
                <Text style={s.closeText}>닫기</Text>
              </Tap>
            </View>

            {!!failed && (
              <View style={s.warn}>
                <Text style={s.warnText}>{failed}</Text>
              </View>
            )}

            <ScrollView style={s.scroll}>
              {(only ? [only] : (["this", "next"] as Which[])).map((w) => (
                <View key={w}>
                  <Text style={s.weekName}>{WEEK_NAME[w]}</Text>
                  {days
                    .filter((d) => d.which === w)
                    .map((d) => {
                      const mine = placed.some((p) => p.date === d.iso);
                      const gone = d.iso < today;
                      return (
                        <Tap
                          key={d.iso}
                          style={[s.day, mine && s.mine]}
                          disabled={busy}
                          onPress={() => void pick(d.iso, w)}
                        >
                          <View style={s.dayHead}>
                            <Text style={[s.when, gone && s.gone]}>
                              {dateFull(d.iso)}
                            </Text>
                            {d.iso === today && (
                              <Text style={s.badge}>오늘</Text>
                            )}
                            {mine && (
                              <Text style={s.tick}>
                                담겨 있어요 · 누르면 빼요
                              </Text>
                            )}
                          </View>
                          {/*
                            적어둔 약속이 먼저다. 그날 뭘 담았는지보다
                            "이날은 안 되는 날" 이 고르는 데 더 크다.
                          */}
                          <Text style={s.what} numberOfLines={2}>
                            {d.note ||
                              (d.titles.length
                                ? d.titles.join(" · ")
                                : "비어 있어요")}
                          </Text>
                        </Tap>
                      );
                    })}

                  <Tap
                    style={[
                      s.day,
                      placed.some((p) => p.date === null && p.which === w) &&
                        s.mine,
                    ]}
                    disabled={busy}
                    onPress={() => void pick(null, w)}
                  >
                    <Text style={s.when}>날짜는 나중에</Text>
                    <Text style={s.what}>
                      {WEEK_NAME[w]} 장보기에는 들어가요
                    </Text>
                  </Tap>
                </View>
              ))}
            </ScrollView>

            {placed.length > 0 && (
              <Tap style={s.remove} disabled={busy} onPress={() => void clear()}>
                <Text style={s.removeText}>식단에서 빼기</Text>
              </Tap>
            )}
          </Tap>
        </Tap>
      </Modal>
    </>
  );
}

const useTheme = themed((c) => ({
  primary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: c.accentStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp[4],
  },
  primaryText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  secondary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp[4],
  },
  secondaryText: {
    color: c.textSecondary,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  /** 줄 안에 얹는 작은 것 (식단의 날짜 버튼) */
  quiet: {
    minHeight: TOUCH,
    justifyContent: "center",
    paddingHorizontal: sp[2],
  },
  quietText: { color: c.accent, fontSize: 14, fontWeight: "600" },
  dim: { opacity: 0.5 },

  scrim: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "86%",
    paddingHorizontal: sp[4],
  },
  grip: { alignItems: "center", paddingVertical: sp[3] },
  gripBar: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: c.borderStrong,
  },

  head: { flexDirection: "row", alignItems: "flex-start", gap: sp[3] },
  headText: { flex: 1 },
  dish: { fontSize: 13, color: c.textTertiary },
  ask: { fontSize: 20, fontWeight: "700", color: c.text, marginTop: 2 },
  close: { minHeight: TOUCH, justifyContent: "center", paddingHorizontal: sp[2] },
  closeText: { color: c.accent, fontSize: 15 },

  scroll: { marginTop: sp[3] },
  weekName: {
    fontSize: 13,
    fontWeight: "700",
    color: c.textTertiary,
    marginTop: sp[3],
    marginBottom: sp[2],
  },
  day: {
    minHeight: TOUCH + 12,
    justifyContent: "center",
    paddingVertical: sp[2],
    paddingHorizontal: sp[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: sp[2],
  },
  mine: { borderColor: c.accent, backgroundColor: c.accentBg },
  dayHead: { flexDirection: "row", alignItems: "center", gap: sp[2] },
  when: { fontSize: 15, color: c.text, fontWeight: "600" },
  /** 지난 날도 **고를 수 있다** — "어제 만들었어요" 를 적으러 오기도 한다 */
  gone: { color: c.textTertiary },
  badge: {
    fontSize: 11,
    color: c.accentStrong,
    fontWeight: "700",
  },
  tick: { fontSize: 11, color: c.accentStrong, fontWeight: "700" },
  what: { fontSize: 13, color: c.textTertiary, marginTop: 2 },

  warn: {
    backgroundColor: c.warmBg,
    borderRadius: radius.md,
    padding: sp[3],
    marginTop: sp[2],
  },
  warnText: { color: c.warm, fontSize: 13 },

  remove: {
    minHeight: TOUCH,
    alignItems: "center",
    justifyContent: "center",
    marginTop: sp[2],
  },
  removeText: { color: c.warm, fontSize: 14, fontWeight: "600" },
}));
