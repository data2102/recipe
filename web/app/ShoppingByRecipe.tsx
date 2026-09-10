import Shopping from "./Shopping";
import type { RecipeGroup, ShoppingItem } from "@/lib/shopping.types";

/** Same controls and counts as the merged view; only grouping changes. */
export default function ShoppingByRecipe({
  groups,
  items,
  week,
  closed,
}: {
  groups: RecipeGroup[];
  items: ShoppingItem[];
  dates: string[];
  week?: "this" | "next";
  closed?: boolean;
}) {
  return (
    <Shopping
      groups={groups}
      items={items}
      week={week}
      closed={closed}
      byRecipe
    />
  );
}
