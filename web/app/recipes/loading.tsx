import { CardBones, HeadBones, Loading } from "../Skeleton";

/** 메뉴 고르기 — 머리말 + 카드 격자 */
export default function RecipesLoading() {
  return (
    <Loading>
      <HeadBones />
      <CardBones cards={6} />
    </Loading>
  );
}
