import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, kstDateString } from './config.ts';
import { fetchText, stripHtml } from './fetch-util.ts';
import { interestScore } from './interest.ts';
import { getProvider } from './llm/provider.ts';
import { canonicalUrl, selectArticles } from './select.ts';
import { enrichGeekNewsExternalUrls, fetchGeekNews } from './sources/geeknews.ts';
import { fetchHackerNews } from './sources/hn.ts';
import { fetchReddit } from './sources/reddit.ts';
import { fetchYozm } from './sources/yozm.ts';
import type { DailyData, RawArticle, SummarizedArticle } from './types.ts';

const DATA_DIR = path.resolve(import.meta.dirname, '../data');
const SEEN_PATH = path.join(DATA_DIR, 'seen.json');

interface SeenEntry {
  id: string;
  date: string; // 처리된 날짜 (보관 기간 관리용)
}

function parseArgs(): { limit?: number; dryRun: boolean; noBatch: boolean } {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  return {
    limit: limitIdx >= 0 ? Number.parseInt(args[limitIdx + 1], 10) : undefined,
    dryRun: args.includes('--dry-run'),
    // Batch API는 완료까지 수 분 걸리므로 로컬 테스트 시 순차 호출로 전환
    noBatch: args.includes('--no-batch'),
  };
}

async function loadSeen(): Promise<SeenEntry[]> {
  try {
    return JSON.parse(await readFile(SEEN_PATH, 'utf8')) as SeenEntry[];
  } catch {
    return [];
  }
}

/** 스니펫이 없는 글(HN 외부 링크 등)은 본문 페이지를 받아 텍스트 추출 */
async function enrichSnippet(article: RawArticle): Promise<RawArticle> {
  if (article.snippet && article.snippet.length > 200) return article;
  try {
    const html = await fetchText(article.url, { retries: 1, timeoutMs: 15000 });
    const text = stripHtml(html).slice(0, config.maxSnippetChars);
    if (text.length > 100) return { ...article, snippet: text };
  } catch {
    // 본문 확보 실패 시 제목만으로 요약 (프롬프트에서 추측 금지 명시)
  }
  return article;
}

async function main() {
  const { limit, dryRun, noBatch } = parseArgs();
  const today = kstDateString();
  console.log(`=== syc_study 파이프라인 (${today}) ===`);

  // 1. 수집
  console.log('[1/4] 수집 중...');
  const results = await Promise.allSettled([
    fetchHackerNews(),
    fetchGeekNews(),
    fetchYozm(),
    fetchReddit(),
  ]);
  const all: RawArticle[] = [];
  const sourceNames = ['HN', 'GeekNews', '요즘IT', 'Reddit'];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  ${sourceNames[i]}: ${r.value.length}건`);
      all.push(...r.value);
    } else {
      console.warn(`  ${sourceNames[i]}: 수집 실패 — ${r.reason?.message ?? r.reason}`);
    }
  });

  // 2. 선별
  console.log('[2/4] 선별 중...');
  const seen = await loadSeen();
  const seenIds = new Set(seen.map((s) => s.id));
  // GeekNews 새 글의 원문 URL 확보 — HN/Reddit과의 URL 기준 중복 제거에 사용
  await enrichGeekNewsExternalUrls(all.filter((a) => !seenIds.has(a.id)));
  let selected = selectArticles(all, seenIds);
  if (limit) selected = selected.slice(0, limit);
  console.log(`  ${selected.length}건 선별 (상한 ${limit ?? config.maxArticles})`);
  for (const a of selected) {
    const score = interestScore(a);
    console.log(`    ${score > 0 ? `★${score} ` : ''}[${a.source}] ${a.title}`);
  }

  if (dryRun) {
    console.log('--dry-run: 요약 없이 종료');
    return;
  }
  if (selected.length === 0) {
    console.log('새 글이 없어 종료합니다.');
    return;
  }

  // 3. 요약·번역
  console.log('[3/4] 요약·번역 중...');
  const provider = await getProvider();
  console.log(`  provider: ${provider.name}`);
  const summarized: SummarizedArticle[] = [];

  // 본문 확보는 배치 제출 전에 완료해야 하므로 먼저 수행
  const enriched: RawArticle[] = [];
  for (const article of selected) enriched.push(await enrichSnippet(article));

  if (provider.summarizeAll && !noBatch) {
    // Batch API — 비용 50% 할인, 개별 실패는 스킵
    const results = await provider.summarizeAll(enriched);
    for (const article of enriched) {
      const summary = results.get(article.id);
      if (summary) {
        summarized.push({ ...article, ...summary });
        console.log(`  ✓ ${summary.oneLineKo}`);
      } else {
        console.warn(`  ✗ 요약 실패 — 스킵: ${article.title}`);
      }
    }
  } else {
    for (const article of enriched) {
      try {
        const summary = await provider.summarize(article);
        summarized.push({ ...article, ...summary });
        console.log(`  ✓ ${summary.oneLineKo}`);
      } catch (err) {
        console.warn(`  ✗ 요약 실패 — 스킵: ${article.title} (${(err as Error).message})`);
      }
    }
  }
  provider.reportUsage();

  // 4. 저장
  console.log('[4/4] 저장 중...');
  const daily: DailyData = {
    date: today,
    generatedAt: new Date().toISOString(),
    model: provider.name,
    articles: summarized,
  };
  await mkdir(path.join(DATA_DIR, 'daily'), { recursive: true });
  const dailyPath = path.join(DATA_DIR, 'daily', `${today}.json`);

  // 같은 날 재실행 시 기존 결과에 병합 (중복 id 제외)
  try {
    const existing = JSON.parse(await readFile(dailyPath, 'utf8')) as DailyData;
    const existingIds = new Set(existing.articles.map((a) => a.id));
    daily.articles = [...existing.articles, ...summarized.filter((a) => !existingIds.has(a.id))];
  } catch {
    // 오늘 첫 실행
  }
  await writeFile(dailyPath, JSON.stringify(daily, null, 2), 'utf8');

  // seen 갱신 + 보관 기간 초과분 정리
  const cutoff = kstDateString(new Date(Date.now() - config.seenRetentionDays * 86400000));
  // id와 함께 원문 정규화 URL도 기록 — 며칠 뒤 다른 소스에 같은 글이 떠도 걸러진다
  const nextSeen = [
    ...seen.filter((s) => s.date >= cutoff),
    ...summarized.flatMap((a) => {
      const entries = [{ id: a.id, date: today }];
      const canon = canonicalUrl(a.externalUrl ?? a.url);
      if (canon && canon !== a.id) entries.push({ id: canon, date: today });
      return entries;
    }),
  ];
  await writeFile(SEEN_PATH, JSON.stringify(nextSeen, null, 2), 'utf8');

  console.log(`완료: ${dailyPath} (${daily.articles.length}건)`);
}

main().catch((err) => {
  console.error('파이프라인 실패:', err);
  process.exit(1);
});
