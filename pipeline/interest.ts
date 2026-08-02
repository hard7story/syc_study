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
 * 키워드당 한 번만 집계 (반복 언급으로 점수가 부풀지 않도록).
 */
export function interestScore(article: RawArticle): number {
  const title = article.title.toLowerCase();
  const snippet = (article.snippet ?? '').toLowerCase();
  let score = 0;
  for (const { keyword, weight } of config.interestKeywords) {
    if (matches(keyword, title)) score += weight;
    else if (matches(keyword, snippet)) score += weight * 0.5;
  }
  return score;
}
