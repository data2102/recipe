"use client";

/**
 * 만든 요리 사진 — 고르면 바로 올라간다
 *
 * **폰에서 찍은 사진은 3~5MB 다.** 그대로 올리면 무료 보관함이 금방
 * 차고, 다시 볼 때마다 그만큼을 내려받는다. 브라우저에서 긴 변 1600px
 * 로 줄이고 JPEG 로 다시 굽는다 — 화면에서 볼 사진이라 그거면 충분하다.
 *
 * 올리는 데 몇 초 걸린다. 고른 순간 화면을 "올리는 중" 으로 바꾼다 —
 * 아무 반응이 없으면 사용자는 또 누른다 (app/add/Add.tsx 와 같은 이유).
 */

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { addPhoto, removePhoto } from "./actions";
import { cookedAgo, whenShort } from "@/lib/say";
import type { Photo } from "@/lib/photos";
import styles from "./photos.module.css";

/** 긴 변 기준. 폰 화면에서 보기에 넉넉하다 */
const MAX_EDGE = 1600;

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // 못 줄이면 원본을 그대로 올린다. 막다른 길은 안 만든다
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.85),
  );
}

export default function Photos({
  recipeId,
  photos,
  attachesTo,
}: {
  recipeId: number;
  photos: Photo[];
  /**
   * 사진이 붙을 최근 조리 기록의 날짜. 없으면 null —
   * 그때는 올리면서 오늘 기록이 생긴다는 걸 버튼이 말해준다.
   */
  attachesTo: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 사진을 다시 골라도 change 가 뜨게
    if (!file) return;

    setProblem(null);
    setBusy(true);
    try {
      const small = await shrink(file);
      const form = new FormData();
      form.set("recipeId", String(recipeId));
      form.set("photo", new File([small], "photo.jpg", { type: "image/jpeg" }));
      await addPhoto(form);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "사진을 못 올렸어요");
    } finally {
      setBusy(false);
    }
  }

  function onRemove(cookId: number) {
    startTransition(async () => {
      const form = new FormData();
      form.set("cookId", String(cookId));
      await removePhoto(form);
    });
  }

  return (
    <section className="ds-card">
      <h2 className={styles.title}>만든 사진</h2>

      {photos.length > 0 && (
        <ul className={styles.grid}>
          {photos.map((p) => (
            <li key={p.id} className={styles.tile}>
              <Image
                className={styles.img}
                src={`/photo/${p.id}`}
                alt={`${p.cooked_on} 에 만든 사진`}
                width={320}
                height={320}
                unoptimized
              />
              <span className={styles.when}>{cookedAgo(p.cooked_on)}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(p.id)}
                aria-label="이 사진 지우기"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        id="photo"
        className={styles.file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        /*
          capture 를 붙이지 않는다. 붙이면 카메라로 직행하는데, 만든
          그 자리에서 바로 올리는 일은 드물다 — 먹고 나서 사진첩에서
          고른다. 안 붙이면 폰이 "카메라 / 갤러리" 를 물어본다.
        */
        onChange={onPick}
      />
      <label htmlFor="photo" className={`ds-btn ds-btn-secondary ${styles.add}`}>
        {busy
          ? "올리는 중이에요"
          : attachesTo
            ? "사진 올리기"
            : "오늘 만든 사진 올리기"}
      </label>

      {/*
        버튼 글자가 이미 "오늘 만든" 이라고 말하지만, 처음 올리는 사람은
        그게 기록까지 남긴다는 걸 모른다. 한 줄로 적어둔다 (원칙 ③).
      */}
      <p className={styles.hint}>
        {attachesTo
          ? `${whenShort(attachesTo)} 만든 것으로 붙여요.`
          : "올리면 오늘 만든 걸로 같이 기록해요."}
      </p>

      {problem && <p className={styles.problem}>{problem}</p>}
    </section>
  );
}
