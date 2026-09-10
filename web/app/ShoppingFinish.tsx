"use client";
import { finishShopping } from "./actions";
import ActionButton from "./ActionButton";
import styles from "./Shopping.module.css";

export default function ShoppingFinish({
  bought,
  week = "this",
  remaining,
  total,
}: {
  bought: number;
  week?: "this" | "next";
  remaining: number;
  total: number;
}) {
  if (!total) return null;
  return (
    <div className="wide">
      <p className={styles.note}>
        {remaining > 0
          ? `${remaining}개가 남아 있어요. 나중에 이어서 장볼 수 있어요.`
          : "필요한 재료를 모두 확인했어요."}
      </p>
      <ActionButton
        action={finishShopping}
        fields={{ week }}
        label={
          remaining > 0
            ? `오늘 장보기 마치기 · ${bought}개 구매`
            : "장보기 완료"
        }
        className="ds-btn ds-btn-primary ds-btn-block"
      />
    </div>
  );
}
