import { config } from './config.ts';
import { interestScore } from './interest.ts';
import type { RawArticle, SourceId } from './types.ts';

/** 제목 정규화 — 교차 소스 중복 판별용 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * URL 정규화 — 프로토콜/www/트래킹 파라미터/말미 슬래시 차이를 무시하고 같은 글로 판별.
 * 파싱 불가하면 null.
 */
export function canonicalUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|fbclid|gclid)/.test(key)) u.searchParams.delete(key);
    }
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const qs = u.searchParams.toString();
    return `${host}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return null;
  }
}

/** 이 글이 가리키는 원문의 정규화 URL (GeekNews는 externalUrl 우선) */
function articleCanonicalUrl(a: RawArticle): string | null {
  return canonicalUrl(a.externalUrl ?? a.url);
}

/** GeekNews가 HN 인기 글을 한국어로 다루는 경우가 많아, 제목이 겹치는 해외 글은 제외 */
function isDuplicateOfKorean(article: RawArticle, koreanTitles: string[]): boolean {
  const norm = normalizeTitle(article.title);
  if (norm.length < 6) return false;
  return koreanTitles.some((k) => k.includes(norm) || (norm.includes(k) && k.length >= 6));
}

/**
 * 선별: seen 제외 → 소스별 필터/정렬 → 교차 소스 중복 제거 → 쿼터 적용 → 전체 상한 절단.
 * 순서는 소스 다양성 유지를 위해 라운드로빈으로 섞는다.
 */
export function selectArticles(all: RawArticle[], seenIds: Set<string>): RawArticle[] {
  // seen에는 id와 원문 정규화 URL이 함께 저장됨 — 어제 GeekNews로 다룬 글이 오늘 HN에 떠도 걸러진다
  const fresh = all.filter((a) => {
    if (seenIds.has(a.id)) return false;
    const canon = articleCanonicalUrl(a);
    return !(canon && seenIds.has(canon));
  });

  const bySource: Record<SourceId, RawArticle[]> = { hn: [], geeknews: [], yozm: [], reddit: [] };
  for (const a of fresh) bySource[a.source].push(a);

  // 한국어 소스(GeekNews/요즘IT)와 같은 원문을 다루는 HN/Reddit 글 제외.
  // 1순위는 원문 URL 일치(GeekNews externalUrl), 제목 포함 관계는 폴백 휴리스틱.
  const koreanArticles = [...bySource.geeknews, ...bySource.yozm];
  const koreanUrls = new Set(
    koreanArticles
      .flatMap((a) => [canonicalUrl(a.externalUrl), canonicalUrl(a.url)])
      .filter((u): u is string => u !== null),
  );
  const koreanTitles = koreanArticles.map((a) => normalizeTitle(a.title));
  const isDuplicate = (a: RawArticle): boolean => {
    const canon = articleCanonicalUrl(a);
    if (canon && koreanUrls.has(canon)) return true;
    return isDuplicateOfKorean(a, koreanTitles);
  };
  for (const src of ['hn', 'reddit'] as const) {
    for (const a of bySource[src].filter(isDuplicate)) {
      console.log(`  [중복 제외] [${a.source}] ${a.title} — 한국어 소스와 원문이 같음`);
    }
    bySource[src] = bySource[src].filter((a) => !isDuplicate(a));
  }

  // 관심 키워드 점수 — 소스 내 우선순위 1순위 (동점이면 기존 기준 적용)
  const interest = new Map<string, number>(fresh.map((a) => [a.id, interestScore(a)]));
  const byInterest = (a: RawArticle, b: RawArticle) =>
    (interest.get(b.id) ?? 0) - (interest.get(a.id) ?? 0);

  // HN: 점수 필터 + (관심 → 점수순)
  bySource.hn = bySource.hn
    .filter((a) => (a.score ?? 0) >= config.hnMinPoints)
    .sort((a, b) => byInterest(a, b) || (b.score ?? 0) - (a.score ?? 0));
  // Reddit: 관심 → 피드 순서(핫) 유지 (sort는 stable이라 동점 시 원래 순서 보존)
  bySource.reddit.sort(byInterest);
  // GeekNews / 요즘IT: 관심 → 최신순
  const byDateDesc = (a: RawArticle, b: RawArticle) =>
    Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  bySource.geeknews.sort((a, b) => byInterest(a, b) || byDateDesc(a, b));
  bySource.yozm.sort((a, b) => byInterest(a, b) || byDateDesc(a, b));

  // 쿼터 적용
  const quotaed: Record<SourceId, RawArticle[]> = {
    hn: bySource.hn.slice(0, config.quotas.hn),
    geeknews: bySource.geeknews.slice(0, config.quotas.geeknews),
    yozm: bySource.yozm.slice(0, config.quotas.yozm),
    reddit: bySource.reddit.slice(0, config.quotas.reddit),
  };

  // 라운드로빈으로 섞어 상한 절단
  const order: SourceId[] = ['geeknews', 'hn', 'yozm', 'reddit'];
  const selected: RawArticle[] = [];
  for (let i = 0; selected.length < config.maxArticles; i++) {
    let added = false;
    for (const src of order) {
      const next = quotaed[src][i];
      if (next && selected.length < config.maxArticles) {
        selected.push(next);
        added = true;
      }
    }
    if (!added) break;
  }
  return selected;
}
