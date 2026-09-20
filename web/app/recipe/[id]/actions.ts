"use server";

/**
 * 레시피 상세의 서버 액션 — 사진 붙이기·떼기, 레시피 고치기
 *
 * **여기에 로직을 두지 마라.** 하는 일은 전부 `lib/` 에 있고 이 파일은
 * 폼을 값으로 바꿔 넘기고 화면을 터는 자리다 (CLAUDE.md). 앱은 서버
 * 액션을 못 쓰고 `app/api/` 를 타는데, 로직이 여기 있으면 저쪽에 한 벌을
 * 더 쓰게 된다 — 그러면 "사진을 올리면 만든 기록이 생긴다" 나 "고칠 때
 * 사전 대조를 다시 한다" 같은 규칙이 두 군데가 되고 한쪽만 고쳐진다.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MEDIA_TYPES } from "@/lib/parse/claude";
import { MAX_BYTES, keepOriginal } from "@/lib/parse/originals";
import { attach, detach } from "@/lib/photos";
import { edit, type EditItem } from "@/lib/recipes";

export async function addPhoto(formData: FormData): Promise<void> {
  const recipeId = Number(formData.get("recipeId"));
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    throw new Error("레시피를 못 찾았어요");
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("사진을 골라주세요");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`사진이 너무 커요 (${Math.round(file.size / 1e6)}MB)`);
  }
  const mediaType = MEDIA_TYPES[file.type];
  if (!mediaType) throw new Error("PNG · JPG · WEBP 만 올릴 수 있어요");

  // 원본을 먼저 보관한다 (원칙 ⑤). DB 가 실패해도 사진은 남는다.
  const bytes = Buffer.from(await file.arrayBuffer());
  await attach(recipeId, await keepOriginal(bytes, mediaType));

  revalidatePath("/", "layout");
}

export async function removePhoto(formData: FormData): Promise<void> {
  const cookId = Number(formData.get("cookId"));
  if (!Number.isInteger(cookId) || cookId <= 0) {
    throw new Error("사진을 못 찾았어요");
  }
  await detach(cookId);
  revalidatePath("/", "layout");
}

/**
 * 레시피 고치기 — 폼을 값으로 바꿔 `recipes.edit` 에 넘긴다.
 *
 * 화면은 재료를 **줄 단위 배열**로 보낸다 (`name`·`qty`·… 이 같은 길이).
 * 빈 줄은 지운 재료다 — `edit` 이 버린다.
 */
export async function saveEdits(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");

  const names = formData.getAll("name").map((v) => String(v).trim());
  const qtys = formData.getAll("qty").map((v) => String(v).trim());
  const sections = formData.getAll("section").map((v) => String(v));
  const origins = formData.getAll("origin").map((v) => String(v));
  const groups = formData.getAll("group").map((v) => String(v));
  const keep = new Set(formData.getAll("keep").map((v) => Number(v)));

  const items: EditItem[] = names.map((raw_name, i) => ({
    raw_name,
    raw_qty: qtys[i] || null,
    section: sections[i] || null,
    // 새로 넣은 줄은 사람이 넣은 것이다 (조리 단계에서 온 게 아니다)
    origin: (origins[i] || "USER") as EditItem["origin"],
    choice_group: groups[i] || null,
    confirmed: keep.has(i),
  }));

  await edit(id, {
    title: String(formData.get("title") ?? ""),
    items,
    steps: String(formData.get("steps") ?? "").split("\n"),
  });

  revalidatePath("/", "layout");
  redirect(
    `/recipe/${id}?week=${formData.get("week") === "next" ? "next" : "this"}`,
  );
}
