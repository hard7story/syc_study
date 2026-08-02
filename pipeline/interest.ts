import { config } from './config.ts';
import type { RawArticle } from './types.ts';

function matches(keyword: string, text: string): boolean {
  // 영문·숫자로만 된 키워드는 단어 경계 매칭 (ai가 maintain에 걸리지 않도록)
  if (/^[a-z0-9.+#-]+$/.test(keyword)) {
    return new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.+#-]/g, '\\$&')}([^a-z0-9]|$)`).test(text);
  }
  return text.includes(keyword); // 한국어 등은 부분 문자열 매칭
}

/**
 * 관심 점수: 제목 매칭 = 가중치 전액, 스니펫 매칭 = 절반.
 * 동의어 그룹(`java|자바`)은 어떤 표기가 몇 개 매칭되든 그룹당 한 번만 집계 —
 * 한/영 병기 글이 이중 가산되지 않는다.
 */
export function interestScore(article: RawArticle): number {
  const title = article.title.toLowerCase();
  const snippet = (article.snippet ?? '').toLowerCase();
  let score = 0;
  for (const { alternatives, weight } of config.interestKeywords) {
    if (alternatives.some((alt) => matches(alt, title))) score += weight;
    else if (alternatives.some((alt) => matches(alt, snippet))) score += weight * 0.5;
  }
  return score;
}
