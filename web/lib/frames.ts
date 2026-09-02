/**
 * 영상에서 장면 뽑기 — 브라우저에서 한다
 *
 * **캡처를 여러 장 찍는 게 제일 귀찮다.** 릴스·쇼츠는 재료와 단계가
 * 화면을 넘겨가며 나와서, 지금은 사람이 5~6번 스크린샷을 찍어야 했다.
 * 화면 녹화 한 번으로 끝나게 한다 — 장면은 앱이 뽑는다.
 *
 * **서버로 영상을 보내지 않는다.** 영상은 수십 MB 라 무료 요금제에서
 * 올리는 것부터 실패하고, 서버에서 프레임을 뽑으려면 ffmpeg 이 필요하다.
 * 브라우저의 <video> 는 이미 디코더를 갖고 있으니 거기서 뽑아 이미지로만
 * 보낸다 (그다음은 캡처를 올린 것과 완전히 같은 길이다).
 *
 * **플랫폼에서 영상을 내려받지 않는다** (지시서 4장). 사용자가 자기 폰에서
 * 녹화한 파일을 고르는 것이고, 앱은 그 파일만 읽는다.
 */

/** 뽑아서 보낼 장면 수. 파싱 비용이 장수에 비례해서 무한정 늘리지 않는다 */
const WANT = 8;

/** 이보다 긴 영상은 앞부분만 본다. 레시피는 보통 앞에 다 나온다 */
const MAX_SECONDS = 180;

/** 긴 변. 캡처와 같은 눈금이면 파서가 글자를 읽는 데 충분하다 */
const MAX_EDGE = 1280;

/** 이만큼 안 다르면 같은 장면으로 본다 (0~1). 정지된 구간을 걸러낸다 */
const SAME = 0.02;

export function isVideo(file: File): boolean {
  return file.type.startsWith("video/");
}

/**
 * 고르게 훑어서 장면을 뽑고, 거의 같은 장면은 버린다.
 *
 * 영상은 멈춰 있는 구간이 길다 (완성 컷을 5초 보여주는 식). 고르게만
 * 뽑으면 같은 그림이 여러 장 나와서, 장수는 다 쓰고 정작 재료 화면은
 * 한 장도 못 건질 수 있다.
 */
export async function framesFromVideo(file: File): Promise<File[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await once(video, "loadedmetadata");
    const span = Math.min(video.duration || 0, MAX_SECONDS);
    if (!Number.isFinite(span) || span <= 0) return [];

    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(video.videoWidth, video.videoHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];

    // 고르게 훑되 넉넉히 본 다음 비슷한 걸 버린다
    const looks = Math.min(WANT * 2, Math.max(WANT, Math.ceil(span)));
    const out: File[] = [];
    let last: number[] | null = null;

    for (let i = 0; i < looks && out.length < WANT; i++) {
      // 처음과 끝은 검은 화면일 때가 많아 살짝 안쪽부터
      const at = span * ((i + 0.5) / looks);
      video.currentTime = at;
      await once(video, "seeked");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const now = fingerprint(ctx, canvas.width, canvas.height);
      if (last && diff(last, now) < SAME) continue;
      last = now;

      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", 0.85),
      );
      if (!blob) continue;
      out.push(
        new File([blob], `frame-${out.length + 1}.jpg`, { type: "image/jpeg" }),
      );
    }
    return out;
  } finally {
    video.src = "";
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error("영상을 읽지 못했어요"));
    };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener("error", bad);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

/** 8×8 밝기 격자. 장면이 바뀌었는지만 보면 되니 이 정도면 된다 */
function fingerprint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): number[] {
  const { data } = ctx.getImageData(0, 0, w, h);
  const grid = new Array(64).fill(0);
  const counts = new Array(64).fill(0);
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const cell = Math.min(7, Math.floor((y / h) * 8)) * 8 +
        Math.min(7, Math.floor((x / w) * 8));
      const i = (y * w + x) * 4;
      grid[cell] += (data[i] + data[i + 1] + data[i + 2]) / 3;
      counts[cell]++;
    }
  }
  return grid.map((sum, i) => (counts[i] ? sum / counts[i] / 255 : 0));
}

function diff(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}


/* ---------------------------------------------------------------- */
/*  긴 캡처 자르기                                                    */
/* ---------------------------------------------------------------- */

/** 가로는 이보다 크면 줄인다. 폰 캡처(1080)는 그대로 지나간다 */
const MAX_WIDTH = 1280;

/**
 * 이보다 길면 자른다. 보통 폰 캡처(1080×2400 쯤)는 자르지 않는다 —
 * 한 장이면 될 걸 둘로 나누면 읽는 값만 두 배가 된다.
 */
const TOO_TALL = 2600;

/** 한 조각의 세로. 폰 화면 한 장 반쯤이라 글자가 넉넉히 산다 */
const SLICE_HEIGHT = 2200;

/** 자른 자리에서 글자가 반 토막 나지 않게 겹쳐서 자른다 */
const OVERLAP = 80;

/**
 * 사진 한 장을 **보낼 수 있는 크기로** 다듬는다.
 *
 * 서버 액션의 본문 제한은 1MB 다. 스크롤 캡처는 그냥 넘고, 폰 스크린샷도
 * 아슬아슬하다 — 넘으면 파싱이 아니라 **화면이 통째로 죽는다** (413).
 *
 * 통째로 줄이지 않고 **자른다.** 1080×9000 을 한 장으로 줄이면 글자가
 * 뭉개져서 읽을 수가 없다. 폭은 그대로 두고 세로로 잘라야 글자가 산다 —
 * 어차피 파서는 여러 장을 한 번에 읽는다.
 *
 * 자른 자리에서 글자가 반 토막 나지 않게 조금 겹쳐서 자른다.
 */
export async function shotsFromImage(file: File): Promise<File[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [file];

  const out: File[] = [];
  // 길지 않으면 한 장 그대로 (폭만 맞추고 다시 굽는다)
  const step = h <= TOO_TALL ? h : SLICE_HEIGHT - OVERLAP;
  const cut = h <= TOO_TALL ? h : SLICE_HEIGHT;
  let n = 0;

  for (let top = 0; top < h && out.length < WANT_SHOTS; top += step) {
    const height = Math.min(cut, h - top);
    // 마지막 조각이 겹침보다 얇으면 앞 조각에 이미 다 들어 있다
    if (out.length > 0 && height <= OVERLAP) break;

    canvas.width = w;
    canvas.height = height;
    ctx.drawImage(
      bitmap,
      0, top / scale, bitmap.width, height / scale,
      0, 0, w, height,
    );

    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.85),
    );
    if (blob) {
      n += 1;
      out.push(new File([blob], `shot-${n}.jpg`, { type: "image/jpeg" }));
    }
  }

  bitmap.close();
  return out.length > 0 ? out : [file];
}

/** 한 장에서 나올 수 있는 조각 수 상한. 서버가 읽는 장수와 같은 눈금이다 */
const WANT_SHOTS = 10;
