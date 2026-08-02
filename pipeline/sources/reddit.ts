import { XMLParser } from 'fast-xml-parser';
import { config } from '../config.ts';
import { fetchText, stripHtml } from '../fetch-util.ts';
import type { RawArticle } from '../types.ts';

interface AtomEntry {
  title: string;
  link?: { '@_href'?: string };
  id: string;
  updated?: string;
  published?: string;
  content?: { '#text'?: string } | string;
}

/**
 * Reddit — .rss (Atom). 비인증 .json은 2026년부터 403.
 * 429가 잦으므로 fetchText의 지수 백오프에 의존하고, 실패해도 전체를 중단하지 않는다.
 */
export async function fetchReddit(): Promise<RawArticle[]> {
  const results: RawArticle[] = [];
  const parser = new XMLParser({ ignoreAttributes: false });

  for (const sub of config.subreddits) {
    try {
      const xml = await fetchText(`https://www.reddit.com/r/${sub}/.rss`, {
        retries: 4,
        backoffMs: 3000,
      });
      const feed = parser.parse(xml);
      const entries: AtomEntry[] = [feed?.feed?.entry ?? []].flat();
      for (const entry of entries) {
        const commentsUrl = entry.link?.['@_href'] ?? '';
        if (!commentsUrl || !entry.title) continue;
        const rawContent =
          typeof entry.content === 'string' ? entry.content : (entry.content?.['#text'] ?? '');
        results.push({
          source: 'reddit',
          id: entry.id || commentsUrl, // t3_xxx fullname
          title: String(entry.title),
          url: commentsUrl,
          commentsUrl,
          publishedAt: entry.published ?? entry.updated ?? new Date().toISOString(),
          snippet: stripHtml(String(rawContent)).slice(0, 1000),
        });
      }
    } catch (err) {
      console.warn(`  [reddit] r/${sub} 수집 실패 — 스킵:`, (err as Error).message);
    }
  }
  return results;
}
