import { HeadBones, Loading, RowBones } from "../Skeleton";

/** 장보기 — 머리말 + 살 것 줄들 */
export default function ShoppingLoading() {
  return (
    <Loading>
      <HeadBones />
      <RowBones rows={7} />
    </Loading>
  );
}
