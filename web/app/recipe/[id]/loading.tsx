import { HeadBones, Loading, RowBones } from "../../Skeleton";

/** 레시피 한 건 — 머리말 + 재료 줄들 */
export default function RecipeLoading() {
  return (
    <Loading>
      <HeadBones />
      <RowBones rows={6} />
    </Loading>
  );
}
