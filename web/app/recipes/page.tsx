import { recipeCatalog } from "@/lib/recipes";
import { pickable } from "@/lib/week";
import { todayInput } from "@/lib/say";
import { dbUrl } from "@/lib/db";
import { Broken, Setup } from "../Shell";
import Picker from "./Picker";
import Slide from "../Slide";

export const dynamic = "force-dynamic";
export const metadata = { title: "메뉴 고르기" };

export default async function RecipesPage({
  searchParams,
}: PageProps<"/recipes">) {
  if (!dbUrl()) return <Setup />;
  const params = await searchParams;

  let cards, dates;
  try {
    [cards, dates] = await Promise.all([recipeCatalog(), pickable()]);
  } catch (e) {
    return (
      <Broken
        message={e instanceof Error ? e.message : "레시피를 불러오지 못했어요."}
      />
    );
  }

  return (
    <Slide>
      <Picker
        recipes={cards}
        days={dates.days}
        placed={dates.placed}
        today={todayInput()}
        initialTerm={typeof params.q === "string" ? params.q : ""}
      />
    </Slide>
  );
}
