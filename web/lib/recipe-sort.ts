export type RecipeOrder = "default" | "name";
type SortableRecipe = {
  id: number;
  title: string;
  created_at: string;
  last_cooked_on: string | null;
};

/** Cooked: oldest first; other filters: newest registration first. */
export function sortRecipes<T extends SortableRecipe>(
  recipes: T[],
  filter: string,
  order: RecipeOrder,
): T[] {
  return [...recipes].sort((a, b) => {
    if (order === "name")
      return a.title.localeCompare(b.title, "ko") || a.id - b.id;
    if (filter === "cooked")
      return (
        (a.last_cooked_on ?? "").localeCompare(b.last_cooked_on ?? "") ||
        a.id - b.id
      );
    return Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id;
  });
}
