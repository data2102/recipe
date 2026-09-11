import Link from "next/link";

/** The next action stays in reach after picking from a long recipe list. */
export default function MealBasket({
  count,
  week,
}: {
  count: number;
  week: "this" | "next";
}) {
  if (!count) return null;
  return (
    <aside className="meal-basket" aria-label="담은 메뉴와 장보기">
      <div>
        <strong>
          {week === "next" ? "다음 주" : "이번 주"} 메뉴 {count}개
        </strong>
        <Link href={`/?week=${week}#week-plan`}>담은 식단 확인하기 →</Link>
      </div>
      <Link href={`/shopping?week=${week}`} className="ds-btn ds-btn-secondary">
        장보기 목록 보기
      </Link>
    </aside>
  );
}
