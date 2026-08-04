import { XMLParser } from 'fast-xml-parser';
import { fetchText, stripHtml } from '../fetch-util.ts';
import type { RawArticle } from '../types.ts';

interface AtomEntry {
  title: string;
  link?: { '@_href'?: string };
  id: string;
  published?: string;
  updated?: string;
  content?: { '#text'?: string } | string;
}

/** GeekNews — news.hada.io Atom 피드. content에 한국어 요약이 이미 포함되어 있음 */
export async function fetchGeekNews(): Promise<RawArticle[]> {
  const xml = await fetchText('https://news.hada.io/rss/news');
  const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });
  const feed = parser.parse(xml);
  const entries: AtomEntry[] = [feed?.feed?.entry ?? []].flat();

  return entries
    .map((entry) => {
      const topicUrl: string = entry.link?.['@_href'] ?? entry.id;
      const rawContent =
        typeof entry.content === 'string'
          ? entry.content
          : (entry.content?.['#text'] ?? (entry.content as any)?.__cdata ?? '');
      const rawTitle: any = entry.title;
      const title = stripHtml(
        typeof rawTitle === 'string' ? rawTitle : (rawTitle?.__cdata ?? rawTitle?.['#text'] ?? ''),
      );
      if (!title || !topicUrl) return null;
      return {
        source: 'geeknews' as const,
        id: topicUrl,
        title,
        url: topicUrl,
        commentsUrl: topicUrl,
        publishedAt: entry.published ?? entry.updated ?? new Date().toISOString(),
        snippet: stripHtml(String(rawContent)),
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
}

/** 토픽 페이지 상단 제목 링크에서 원문 URL 추출 (자체 글이면 없음) */
function parseExternalUrl(html: string): string | undefined {
  const m = html.match(/topictitle[^>]*>[\s\S]{0,300}?href=['"]([^'"]+)['"]/);
  const href = m?.[1];
  if (!href || !/^https?:\/\//.test(href) || href.includes('news.hada.io')) return undefined;
  return href;
}

/**
 * GeekNews 글의 원문 URL을 토픽 페이지에서 확보해 externalUrl에 채운다.
 * 피드에는 원문 링크가 없어 페이지를 직접 받아야 함 — seen 제외 후 새 글만 넘길 것.
 * 실패해도 무시 (제목 휴리스틱으로 폴백).
 */
export async function enrichGeekNewsExternalUrls(
  articles: RawArticle[],
  concurrency = 2,
): Promise<void> {
  const targets = articles.filter((a) => a.source === 'geeknews' && !a.externalUrl);
  const queue = [...targets];
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        const html = await fetchText(a.url, { retries: 1, timeoutMs: 10000 });
        a.externalUrl = parseExternalUrl(html);
      } catch {
        /* 원문 URL 없이 진행 */
      }
      await new Promise((r) => setTimeout(r, 500)); // 429 방지
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}
