import { ingredientEvidence } from "./youtube-evidence";

export type VideoRecipe = { id: string; title: string; channel: string; description: string; evidence: string[] };
type Video = { id: string; snippet: { title: string; channelTitle: string; description: string } };
async function api(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("유튜브 검색을 준비 중이에요. 캡처나 글로 레시피를 추가할 수 있어요.");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries({ ...params, key }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? "유튜브 검색 한도 또는 연결 설정을 확인해야 해요. 잠시 후 다시 시도해주세요." : "유튜브에 연결하지 못했어요. 다시 검색해주세요.");
  return response.json();
}
function candidate(video: Video): VideoRecipe {
  return { id: video.id, title: video.snippet.title, channel: video.snippet.channelTitle, description: video.snippet.description, evidence: ingredientEvidence(video.snippet.description) };
}
export async function searchYoutube(term: string, pageToken = "") {
  if (!term.trim() || term.length > 80 || pageToken.length > 250) throw new Error("검색어는 80자 이내로 입력해주세요.");
  const data = await api("search", { part: "snippet", type: "video", q: `${term.trim()} 레시피`, maxResults: "20", relevanceLanguage: "ko", regionCode: "KR", safeSearch: "strict", ...(pageToken ? { pageToken } : {}) });
  const ids = (data.items ?? []).map((i: { id?: { videoId?: string } }) => i.id?.videoId).filter((id: string | undefined) => id && /^[\w-]{11}$/.test(id));
  if (!ids.length) return { videos: [] as VideoRecipe[], next: data.nextPageToken as string | undefined, checked: 0 };
  const details = await api("videos", { part: "snippet", id: ids.join(",") });
  const videos = (details.items as Video[] ?? []).map(candidate).filter(v => v.evidence.length >= 2);
  return { videos, next: data.nextPageToken as string | undefined, checked: ids.length };
}
export async function youtubeRecipe(id: string) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("영상 주소를 확인해주세요.");
  const data = await api("videos", { part: "snippet", id });
  if (!data.items?.length) throw new Error("삭제되었거나 공개되지 않은 영상이에요.");
  const video = candidate(data.items[0]);
  if (video.evidence.length < 2) throw new Error("설명란에서 재료와 수량을 확인하지 못했어요. 다른 영상을 골라주세요.");
  return video;
}
