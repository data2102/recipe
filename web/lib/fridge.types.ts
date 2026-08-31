/**
 * 냉장고 칩이 쓰는 모양만. **DB 를 끌고 오지 않는다.**
 *
 * `lib/fridge.ts` 는 서버 전용이다 (pg 를 쓴다). 칩은 Client Component 라
 * 거기서 타입을 가져오면 접속 코드가 브라우저 번들로 딸려 들어간다.
 */

export type Chip = { id: number; name: string };
