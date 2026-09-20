/**
 * 메뉴 고르기 — 모아둔 레시피에서 골라 **날짜에 담는다.**
 *
 * 웹의 `app/recipes/Picker.tsx` 와 같은 화면이다.
 *
 * **정렬이 곧 추천이다** (지시서 3장). "만들어본 요리" 는 오래된 순이
 * 기본이고, 이름순은 **찾을 때 쓰는 것**이지 기본이 아니다 — 기본을
 * 이름순으로 바꾸면 추천이 통째로 사라진다.
 *
 * **정렬·검색은 폰에서 한다.** 서버는 목록을 통째로 준다 (`GET /api/recipes`).
 * 그 정렬 코드(`lib/recipe-sort.ts`)는 순수 층이라 웹과 **같은 파일**을
 * 읽는다 — 서버에 `?sort=` 를 만들면 같은 규칙이 두 벌이 된다.
 *
 * 담기는 한 번에 끝난다. "+ 담기" 가 날짜를 묻고 고른 날짜로 바로 들어간다.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ApiError,
  API_BASE,
  recipes as recipesApi,
  type RecipeCard,
  type RecipesScreen,
} from "../lib/api";
import {
  dateTiny,
  lastPlaced,
  type Which,
  sortRecipes,
  type Placement,
  type RecipeOrder,
} from "../lib/pure";
import PlanSheet from "../components/PlanSheet";
import Tap from "../components/Tap";
import { radius, sp, themed, TOUCH } from "../lib/tokens";

/**
 * 표지 사진. 없으면 유튜브 섬네일, 그것도 없으면 글자로 그린다.
 *
 * 보관함은 비공개라 `/photo/<조리기록 id>` 로 받는다 — **저장 경로를
 * 주소에 넣지 않는다.** 버킷 구조가 밖으로 샌다.
 */
function coverUri(r: RecipeCard): string | null {
  if (r.photoId) return `${API_BASE}/photo/${r.photoId}`;
  const url = r.source_url || "";
  const m =
    /youtu\.be\/([\w-]{11})/.exec(url) ||
    /[?&]v=([\w-]{11})/.exec(url) ||
    /youtube\.com\/(?:shorts|embed)\/([\w-]{11})/.exec(url);
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
}

const WEEKS: { which: Which; name: string }[] = [
  { which: "this", name: "이번주" },
  { which: "next", name: "다음주" },
];

/**
 * 카드의 **두 칸 중 하나** — 웹의 `app/recipes/Picker.tsx` 와 같은 것이다
 * (2026-09-20).
 *
 * 고르는 일은 **두 주를 같이 짜는 일**이다. 칸이 하나면 이미 담긴 요리가
 * "담긴 것" 으로만 보여서, 이번 주에 먹은 걸 다음 주에 또 담아도 되는지가
 * 안 보였다. 칸을 둘로 두면 **비어 있는 쪽이 그대로 초대장**이 된다.
 *
 * 날짜는 그 주의 **마지막 것**이다 (`lastPlaced`). 한 주에 두 번이면
 * 뒤에 횟수를 붙인다 — 안 그러면 나머지가 사라진 것으로 읽힌다.
 */
function slotWhen(placed: Placement[]): string {
  const at = lastPlaced(placed);
  if (!at) return "+ 담기";
  const more = placed.length > 1 ? ` · ${placed.length}번` : "";
  // **"날짜 미정" 이 아니라 "미정" 이다.** 위 줄이 이미 어느 주인지
  // 말하고, 이 칸이 묻는 게 날짜라서 "날짜" 는 세 번째로 하는 말이다.
  // 320px 폰에서는 그 두 글자 때문에 칸이 세 줄이 됐다 (재서 확인했다).
  return `${at.date ? dateTiny(at.date) : "미정"}${more}`;
}

const FILTERS = [
  ["all", "전체"],
  ["new", "안 만들어본 요리"],
  ["cooked", "만들어본 요리"],
] as const;

export default function Recipes() {
  const { s, c } = useTheme();
  const [data, setData] = useState<RecipesScreen | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<string>("all");
  /** 정렬은 **갈래마다 따로 기억한다.** "만들어본 요리" 의 기본은 오래된 순이다 */
  const [orders, setOrders] = useState<Record<string, RecipeOrder>>({});
  const order = orders[filter] ?? "default";
  const [review, setReview] = useState(false);

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      setData(await recipesApi.read());
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "레시피를 못 읽었어요");
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
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <Text style={s.title}>레시피를 못 읽었어요</Text>
        <Text style={s.sub}>{failed}</Text>
        <Tap style={s.primary} onPress={() => void load()}>
          <Text style={s.primaryText}>다시 해볼게요</Text>
        </Tap>
      </View>
    );
  }

  const chosen = (id: number) => data.placed[id] ?? [];
  const pickedCount = Object.values(data.placed).filter(
    (p) => p.length > 0,
  ).length;

  const visible = sortRecipes(
    data.recipes.filter(
      (r) =>
        (!review || chosen(r.id).length > 0) &&
        (filter === "all" ||
          (filter === "new" ? !r.last_cooked_on : !!r.last_cooked_on)) &&
        `${r.title} ${r.ingredients.join(" ")}`
          .toLocaleLowerCase()
          .includes(term.trim().toLocaleLowerCase()),
    ),
    filter,
    order,
  );

  return (
    <ScrollView
      style={[s.screen, { paddingTop: insets.top }]}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} />
      }
    >
      <View style={s.head}>
        <View style={s.headText}>
          <Text style={s.eyebrow}>고르면 날짜를 물어봐요</Text>
          <Text style={s.title}>뭐 먹을까요?</Text>
        </View>
        <Tap style={s.secondary} onPress={() => router.push("/add")}>
          <Text style={s.secondaryText}>+ 레시피</Text>
        </Tap>
      </View>

      {!!failed && (
        <View style={s.warn}>
          <Text style={s.warnText}>{failed}</Text>
        </View>
      )}

      <TextInput
        style={s.search}
        value={term}
        onChangeText={setTerm}
        placeholder="어떤 요리, 어떤 재료가 당기세요?"
        placeholderTextColor={c.textDisabled}
        returnKeyType="search"
        accessibilityLabel="요리명이나 재료 검색"
      />

      <View style={s.chips}>
        {FILTERS.map(([v, label]) => (
          <Tap
            key={v}
            style={[s.chip, filter === v && s.chipOn]}
            onPress={() => setFilter(v)}
          >
            <Text style={[s.chipText, filter === v && s.chipTextOn]}>
              {label}
            </Text>
          </Tap>
        ))}
      </View>

      {/*
        **오래된 순 정렬을 뒤집지 마라 — 그 정렬이 곧 추천이다.**
        이름순은 찾을 때 쓰는 것이고 기본이 아니다.
      */}
      <View style={s.chips}>
        <Text style={s.sortLabel}>정렬</Text>
        {(
          [
            [
              "default",
              filter === "cooked" ? "만든 일자순 · 오래된 순" : "최근 등록순",
            ],
            ["name", "이름순"],
          ] as [RecipeOrder, string][]
        ).map(([v, label]) => (
          <Tap
            key={v}
            style={[s.chip, order === v && s.chipOn]}
            onPress={() => setOrders((o) => ({ ...o, [filter]: v }))}
          >
            <Text style={[s.chipText, order === v && s.chipTextOn]}>
              {label}
            </Text>
          </Tap>
        ))}
      </View>

      <View style={s.results}>
        <Text style={s.resultsText}>
          {review ? "담은 메뉴" : "내 레시피"} {visible.length}
        </Text>
        <Tap
          style={[s.chip, review && s.chipOn]}
          onPress={() => {
            setReview(!review);
            setFilter("all");
            setTerm("");
          }}
        >
          <Text style={[s.chipText, review && s.chipTextOn]}>
            {review ? "전체 레시피 보기" : `담은 메뉴만 · ${pickedCount}`}
          </Text>
        </Tap>
      </View>

      {visible.map((r) => {
        const uri = coverUri(r);
        const here = chosen(r.id);
        return (
          <View key={r.id} style={[s.card, here.length > 0 && s.selected]}>
            <Tap
              style={s.coverRow}
              onPress={() => router.push(`/recipe/${r.id}`)}
              accessibilityLabel={`${r.title} 레시피 보기`}
            >
              {uri ? (
                <Image source={{ uri }} style={s.cover} />
              ) : (
                <View style={[s.cover, s.noPhoto]}>
                  <Text style={s.noPhotoText} numberOfLines={2}>
                    {r.ingredients.slice(0, 2).join(" · ") || "내가 저장한 요리"}
                  </Text>
                </View>
              )}
              <View style={s.cardBody}>
                <Text style={s.cardTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                <Text style={s.cardItems} numberOfLines={2}>
                  {r.ingredients.slice(0, 4).join(" · ") || "재료 추가 필요"}
                </Text>
              </View>
            </Tap>
            {/*
              **칸이 둘이다 — 이번주 · 다음주.** 담긴 날짜를 따로 한 줄로
              적지 않는다: 칸 글자가 이미 "이번주 9/15" 라서 그 줄은 같은
              말을 두 번 하는 것이다.

              누르면 **그 주의 이레만** 나오는 판이 뜬다 (`only`).
              `placed` 도 그 주 것만 넘긴다 — 판에 안 보이는 날짜를
              "식단에서 빼기" 가 같이 지우면 안 된다.
            */}
            <View style={s.slots}>
              {WEEKS.map(({ which, name }) => (
                <View key={which} style={s.slot}>
                  <PlanSheet
                    recipeId={r.id}
                    title={r.title}
                    days={data.days}
                    today={data.today}
                    only={which}
                    placed={here.filter((x) => x.which === which)}
                    label={`${name}\n${slotWhen(
                      here.filter((x) => x.which === which),
                    )}`}
                    onDone={load}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {visible.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>
            {data.recipes.length
              ? review && !pickedCount
                ? "아직 담은 메뉴가 없어요"
                : "조건에 맞는 요리가 없어요"
              : "먹고 싶은 요리를 모아보세요"}
          </Text>
          {data.recipes.length > 0 && (
            <Tap
              style={s.secondary}
              onPress={() => {
                setTerm("");
                setFilter("all");
                setReview(false);
              }}
            >
              <Text style={s.secondaryText}>전체 레시피 보기</Text>
            </Tap>
          )}
          {data.recipes.length === 0 && (
            <Tap style={s.primary} onPress={() => router.push("/add")}>
              <Text style={s.primaryText}>캡처로 레시피 넣기</Text>
            </Tap>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const useTheme = themed((c) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3] },
  body: { padding: sp[4], gap: sp[2], paddingBottom: sp[12] },

  head: { flexDirection: "row", alignItems: "flex-end", gap: sp[3] },
  headText: { flex: 1 },
  eyebrow: { fontSize: 13, color: c.textTertiary },
  title: { fontSize: 22, fontWeight: "700", color: c.text },
  sub: { fontSize: 14, color: c.textSecondary },

  search: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    paddingHorizontal: sp[3],
    fontSize: 15,
    color: c.text,
    marginTop: sp[2],
  },

  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp[2] },
  sortLabel: { fontSize: 13, color: c.textTertiary },

  chip: {
    minHeight: TOUCH,
    justifyContent: "center",
    paddingHorizontal: sp[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  chipOn: { borderColor: c.accent, backgroundColor: c.accentBg },
  chipText: { fontSize: 13, color: c.textSecondary },
  chipTextOn: { color: c.accentStrong, fontWeight: "700" },

  results: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp[2],
    marginTop: sp[3],
  },
  resultsText: { fontSize: 15, fontWeight: "700", color: c.text },

  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: sp[3],
    gap: sp[2],
    borderWidth: 1,
    borderColor: "transparent",
  },
  selected: { borderColor: c.accent },
  coverRow: { flexDirection: "row", gap: sp[3] },
  cover: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: c.surfaceSunken },
  noPhoto: { alignItems: "center", justifyContent: "center", padding: sp[2] },
  noPhotoText: { fontSize: 11, color: c.textTertiary, textAlign: "center" },
  cardBody: { flex: 1, justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: c.text },
  cardItems: { fontSize: 13, color: c.textTertiary, marginTop: 2 },
  /* 담기 칸 둘 — 폭을 반반으로. 한쪽만 넓으면 그쪽이 기본값처럼 읽힌다 */
  slots: { flexDirection: "row", gap: sp[2] },
  slot: { flex: 1, minWidth: 0 },

  empty: { alignItems: "center", gap: sp[3], paddingVertical: sp[10] },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: c.text },

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
  secondaryText: { color: c.textSecondary, fontSize: 14, fontWeight: "600" },

  warn: { backgroundColor: c.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: c.warm, fontSize: 13 },
}));
