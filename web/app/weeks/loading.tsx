import { HeadBones, Loading, RowBones } from "../Skeleton";

/** 지난 식단 — 주마다 접힌 줄 */
export default function WeeksLoading() {
  return (
    <Loading>
      <HeadBones />
      <RowBones rows={4} />
    </Loading>
  );
}
