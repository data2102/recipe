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

import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
  sortRecipes,
  type Placement,
  type RecipeOrder,
} from "../lib/pure";
import PlanSheet, { placedLabel } from "../components/PlanSheet";
import { color, radius, sp, TOUCH } from "../lib/tokens";

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

/** 카드 아래 한 줄 — 이 요리가 언제로 잡혀 있는지 */
function placedSay(placed: Placement[]): string {
  if (!placed.length) return "";
  const p = placed[0];
  if (p.date) return `${dateTiny(p.date)}에 먹기로 했어요`;
  return `${p.which === "next" ? "다음 주" : "이번 주"}에 담았어요 · 날짜 미정`;
}

const FILTERS = [
  ["all", "전체"],
  ["new", "안 만들어본 요리"],
  ["cooked", "만들어본 요리"],
] as const;

export default function Recipes() {
  const [data, setData] = useState<RecipesScreen | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<string>("all");
  /** 정렬은 **갈래마다 따로 기억한다.** "만들어본 요리" 의 기본은 오래된 순이다 */
  const [orders, setOrders] = useState<Record<string, RecipeOrder>>({});
  const order = orders[filter] ?? "default";
  const [ingredient, setIngredient] = useState("");
  /** 재료 칩을 펴뒀나. 접힌 게 기본이다 — 도구가 요리를 밀어내지 않게 */
  const [pickIngredient, setPickIngredient] = useState(false);
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

  /** 자주 쓰는 재료 여덟. **레시피에 적힌 표기 그대로다** (원칙 ①) */
  const ingredients = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    data.recipes.forEach((r) =>
      new Set(r.ingredients).forEach((n) =>
        counts.set(n, (counts.get(n) || 0) + 1),
      ),
    );
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  }, [data]);

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
        <Text style={s.title}>레시피를 못 읽었어요</Text>
        <Text style={s.sub}>{failed}</Text>
        <Pressable style={s.primary} onPress={() => void load()}>
          <Text style={s.primaryText}>다시 해볼게요</Text>
        </Pressable>
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
        (!ingredient || r.ingredients.includes(ingredient)) &&
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
        <Pressable style={s.secondary} onPress={() => router.push("/add")}>
          <Text style={s.secondaryText}>+ 레시피</Text>
        </Pressable>
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
        placeholderTextColor={color.textDisabled}
        returnKeyType="search"
        accessibilityLabel="요리명이나 재료 검색"
      />

      <View style={s.chips}>
        {FILTERS.map(([v, label]) => (
          <Pressable
            key={v}
            style={[s.chip, filter === v && s.chipOn]}
            onPress={() => setFilter(v)}
          >
            <Text style={[s.chipText, filter === v && s.chipTextOn]}>
              {label}
            </Text>
          </Pressable>
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
          <Pressable
            key={v}
            style={[s.chip, order === v && s.chipOn]}
            onPress={() => setOrders((o) => ({ ...o, [filter]: v }))}
          >
            <Text style={[s.chipText, order === v && s.chipTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/*
        재료 칩은 **접어둔다.** 웹에서 펼쳐놨다가 도구 상자가 화면의
        절반을 먹어서 되돌렸다 — 여덟 개가 폰 폭에서 두세 줄이고, 그만큼
        첫 카드가 아래로 밀린다. 이 화면을 여는 이유는 **요리를 고르는
        것**이지 도구를 보는 게 아니다 (docs/ui-references.md 9장).

        접힌 줄에 몇 가지인지·뭘 골랐는지를 적어서 "있는 줄 모르는" 것만
        막는다. **웹과 같은 모양이어야 한다** (`web/app/Fold.tsx`).
      */}
      {ingredients.length > 0 && (
        <View>
          <Pressable
            style={s.foldHead}
            onPress={() => setPickIngredient(!pickIngredient)}
            accessibilityRole="button"
            accessibilityState={{ expanded: pickIngredient }}
          >
            <Text style={s.foldLabel}>재료로 좁히기</Text>
            <Text style={s.foldHint}>
              {ingredient || `${ingredients.length}가지`}
            </Text>
            <Text style={s.foldChevron}>{pickIngredient ? "⌃" : "⌄"}</Text>
          </Pressable>
          {pickIngredient && (
            <View style={s.chips}>
              {ingredients.map((n) => (
                <Pressable
                  key={n}
                  style={[s.chip, ingredient === n && s.chipOn]}
                  onPress={() => setIngredient(ingredient === n ? "" : n)}
                >
                  <Text style={[s.chipText, ingredient === n && s.chipTextOn]}>
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={s.results}>
        <Text style={s.resultsText}>
          {review ? "담은 메뉴" : "내 레시피"} {visible.length}
        </Text>
        <Pressable
          style={[s.chip, review && s.chipOn]}
          onPress={() => {
            setReview(!review);
            setFilter("all");
            setTerm("");
            setIngredient("");
          }}
        >
          <Text style={[s.chipText, review && s.chipTextOn]}>
            {review ? "전체 레시피 보기" : `담은 메뉴만 · ${pickedCount}`}
          </Text>
        </Pressable>
      </View>

      {visible.map((r) => {
        const uri = coverUri(r);
        const here = chosen(r.id);
        return (
          <View key={r.id} style={[s.card, here.length > 0 && s.selected]}>
            <Pressable
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
                {here.length > 0 && (
                  <Text style={s.when}>{placedSay(here)}</Text>
                )}
              </View>
            </Pressable>
            <PlanSheet
              recipeId={r.id}
              title={r.title}
              days={data.days}
              today={data.today}
              placed={here}
              label={placedLabel(here)}
              onDone={load}
            />
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
            <Pressable
              style={s.secondary}
              onPress={() => {
                setTerm("");
                setIngredient("");
                setFilter("all");
                setReview(false);
              }}
            >
              <Text style={s.secondaryText}>전체 레시피 보기</Text>
            </Pressable>
          )}
          {data.recipes.length === 0 && (
            <Pressable style={s.primary} onPress={() => router.push("/add")}>
              <Text style={s.primaryText}>캡처로 레시피 넣기</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  center: { alignItems: "center", justifyContent: "center", gap: sp[3] },
  body: { padding: sp[4], gap: sp[2], paddingBottom: sp[12] },

  head: { flexDirection: "row", alignItems: "flex-end", gap: sp[3] },
  headText: { flex: 1 },
  eyebrow: { fontSize: 13, color: color.textTertiary },
  title: { fontSize: 22, fontWeight: "700", color: color.text },
  sub: { fontSize: 14, color: color.textSecondary },

  search: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    paddingHorizontal: sp[3],
    fontSize: 15,
    color: color.text,
    marginTop: sp[2],
  },

  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp[2] },
  sortLabel: { fontSize: 13, color: color.textTertiary },

  /* 접었다 펴는 줄 — 웹의 `.ds-fold` 와 같은 모양이다 */
  foldHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp[2],
    minHeight: TOUCH,
  },
  foldLabel: { fontSize: 15, fontWeight: "600", color: color.text },
  foldHint: { fontSize: 13, color: color.textTertiary },
  foldChevron: { marginLeft: "auto", fontSize: 13, color: color.textTertiary },
  chip: {
    minHeight: TOUCH,
    justifyContent: "center",
    paddingHorizontal: sp[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipOn: { borderColor: color.accent, backgroundColor: color.accentBg },
  chipText: { fontSize: 13, color: color.textSecondary },
  chipTextOn: { color: color.accentStrong, fontWeight: "700" },

  results: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp[2],
    marginTop: sp[3],
  },
  resultsText: { fontSize: 15, fontWeight: "700", color: color.text },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: sp[3],
    gap: sp[2],
    borderWidth: 1,
    borderColor: "transparent",
  },
  selected: { borderColor: color.accent },
  coverRow: { flexDirection: "row", gap: sp[3] },
  cover: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: color.surfaceSunken },
  noPhoto: { alignItems: "center", justifyContent: "center", padding: sp[2] },
  noPhotoText: { fontSize: 11, color: color.textTertiary, textAlign: "center" },
  cardBody: { flex: 1, justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: color.text },
  cardItems: { fontSize: 13, color: color.textTertiary, marginTop: 2 },
  when: { fontSize: 12, color: color.accentStrong, marginTop: sp[1] },

  empty: { alignItems: "center", gap: sp[3], paddingVertical: sp[10] },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: color.text },

  primary: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    backgroundColor: color.accentStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp[5],
  },
  primaryText: { color: color.surface, fontSize: 15, fontWeight: "700" },
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
  secondaryText: { color: color.textSecondary, fontSize: 14, fontWeight: "600" },

  warn: { backgroundColor: color.warmBg, borderRadius: radius.md, padding: sp[3] },
  warnText: { color: color.warm, fontSize: 13 },
});
