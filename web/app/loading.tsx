import { HeadBones, Loading, RowBones } from "./Skeleton";

/** 식단 — 머리말 + 날짜 줄들 */
export default function PlanLoading() {
  return (
    <Loading>
      <HeadBones />
      <RowBones rows={6} />
    </Loading>
  );
}
