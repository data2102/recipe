/** Conservative evidence gate: explicit ingredient heading + measured list rows.
 * Reject links, timestamps and promotional prose. Never invent quantities.
 */
export function ingredientEvidence(description: string): string[] {
  const lines = description.split(/\r?\n/);
  const evidence: string[] = [];
  let inIngredients = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(?:[\s#*[\]🥕🍳-]*)(?:재료|양념|소스|ingredients)(?:\s|:|$)/i.test(line) || /^\[.*(?:재료|양념|ingredients).*\]/i.test(line)) inIngredients = true;
    if (/^(?:조리|만드는|만들기|방법|순서|레시피 순서|directions|instructions|구독|문의|광고|협찬|제품)/i.test(line)) inIngredients = false;
    if (!inIngredients || /https?:|www\.|\d+:\d+|구독|할인|쿠폰|배송|협찬|광고|구매|원\b/.test(line)) continue;
    for (const part of line.split(/[,，;]|\s+[·•]\s+/)) {
      const text = part.replace(/^[\s*•\-\d.)]+/, '').trim();
      if (text.length > 80 || !/[가-힣a-zA-Z]{2,}/.test(text)) continue;
      if (/\d+(?:[./]\d+)?\s*(?:kg|mg|ml|g|l|tbsp|tsp|cups?|큰술|작은술|스푼|숟갈|숟가락|개|모|쪽|대|장|줌|컵|봉|팩|근|T|t)(?=$|[\s)\],가-힣])/i.test(text)) evidence.push(part.trim());
    }
  }
  return [...new Set(evidence)].slice(0, 30);
}
