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
