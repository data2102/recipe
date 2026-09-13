import { recipeCatalog } from "@/lib/recipes";
import { openList, picked } from "@/lib/shopping";
import { dbUrl } from "@/lib/db";
import { Broken, Setup } from "../Shell";
import Picker from "./Picker";
export const dynamic = "force-dynamic";
export const metadata = { title: "메뉴 고르기" };
export default async function RecipesPage({
  searchParams,
}: PageProps<"/recipes">) {
  if (!dbUrl()) return <Setup />;
  const params = await searchParams;
  const week = params.week === "this" ? "this" : "next";
  let cards, basket;
  try {
    const loaded = await Promise.all([recipeCatalog(), openList(false, week)]);
    cards = loaded[0];
    const listId = loaded[1];
    basket = await picked(listId);
  } catch (e) {
    return (
      <Broken
        message={e instanceof Error ? e.message : "레시피를 불러오지 못했어요."}
      />
    );
  }
  return (
    <Picker
      key={week}
      recipes={cards}
      initialPicked={basket.map((r) => r.id)}
      week={week}
      initialTerm={typeof params.q === "string" ? params.q : ""}
    />
  );
}
