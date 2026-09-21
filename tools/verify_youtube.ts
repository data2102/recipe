import assert from "node:assert/strict";
import { ingredientEvidence } from "../web/lib/youtube-evidence.ts";
const yes = ['재료\n두부 1모\n간장 2큰술', '[재료]\n양파 1/2개, 돼지고기 300g\n[양념]\n간장 2T', 'Ingredients\ntofu 200g\nsoy sauce 2 tbsp'];
for (const text of yes) assert(ingredientEvidence(text).length >= 2, text);
const no = ['두부조림 맛있게 만들어요! 구독해주세요', '재료\n00:30 두부 1모\nhttps://shop.test/간장2큰술', '재료\n두부\n간장\n문의\n제품 2개', '재료\n두부 1모\n조리 방법\n2분 익히세요\n광고 제품 3개'];
for (const text of no) assert(ingredientEvidence(text).length < 2, text);
console.log('PASS YouTube ingredient evidence: measured lists, fractions, English, timestamps, links, prose');
async function main() {
const { searchYoutube, youtubeRecipe } = await import('../web/lib/youtube-search.ts');
const originalFetch = globalThis.fetch;
const originalKey = process.env.YOUTUBE_API_KEY;
process.env.YOUTUBE_API_KEY = 'test-only';
const valid = { id: 'abcdefghijk', snippet: { title: '두부조림', channelTitle: '요리', description: yes[0] } };
const invalid = { id: 'lmnopqrstuv', snippet: { title: '광고', channelTitle: '채널', description: no[0] } };
const calls: string[] = [];
globalThis.fetch = async (input) => {
  const u = new URL(String(input)); calls.push(u.pathname);
  assert.equal(u.hostname, 'www.googleapis.com');
  return new Response(JSON.stringify(u.pathname.endsWith('/search') ? { items: [{id:{videoId: valid.id}}, {id:{videoId:invalid.id}}], nextPageToken:'NEXT' } : { items: [valid, invalid] }), {status:200});
};
try {
  const result = await searchYoutube('두부조림');
  assert.deepEqual(result.videos.map(v=>v.id),[valid.id]);
  assert.equal(result.next,'NEXT');
  assert.equal(calls.length,2);
  assert.equal((await youtubeRecipe(valid.id)).evidence.length,2);
  await assert.rejects(()=>youtubeRecipe('invalid/url'));
  globalThis.fetch = async () => new Response('{}',{status:403});
  await assert.rejects(()=>searchYoutube('두부'),/한도/);
  delete process.env.YOUTUBE_API_KEY;
  // **무엇이 없는지 말해야 한다** (원칙 ③). "준비 중이에요" 는 곧 될
  // 것처럼 읽히는데, 키를 넣기 전까지 영영 안 된다 — 그래서 이 검사는
  // 문구가 아니라 **키 이름이 들어 있는지**를 본다.
  await assert.rejects(()=>searchYoutube('두부'),/YOUTUBE_API_KEY/);
  console.log('PASS YouTube API: batch filtering, pagination, selection validation, quota and missing key');
} finally { globalThis.fetch = originalFetch; if(originalKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY=originalKey; }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
