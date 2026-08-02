import { XMLParser } from 'fast-xml-parser';
import { fetchText, stripHtml } from '../fetch-util.ts';
import type { RawArticle } from '../types.ts';

interface RssItem {
  title: string;
  link: string;
  description?: string;
  guid?: string;
}

/**
 * 요즘IT — RSS 피드에는 아이템별 pubDate가 없어서
 * sitemap-news.xml의 lastmod로 발행일을 보완한다. robots.txt Crawl-delay 5초 준수.
 */
export async function fetchYozm(): Promise<RawArticle[]> {
  const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });

  const rssXml = await fetchText('https://yozm.wishket.com/magazine/feed/');
  await new Promise((r) => setTimeout(r, 5000)); // Crawl-delay: 5
  const sitemapXml = await fetchText('https://yozm.wishket.com/magazine/sitemap-news.xml');

  // sitemap: 글 URL → lastmod 매핑
  const sitemap = parser.parse(sitemapXml);
  const urlEntries: Array<{ loc: string; lastmod?: string }> = [sitemap?.urlset?.url ?? []].flat();
  const lastmodByPostId = new Map<string, string>();
  for (const entry of urlEntries) {
    const m = String(entry.loc ?? '').match(/\/magazine\/detail\/(\d+)/);
    if (m && entry.lastmod) lastmodByPostId.set(m[1], String(entry.lastmod));
  }

  const rss = parser.parse(rssXml);
  const items: RssItem[] = [rss?.rss?.channel?.item ?? []].flat();

  return items
    .map((item) => {
      const url = String(item.link ?? item.guid ?? '');
      const m = url.match(/\/magazine\/detail\/(\d+)/);
      if (!m || !item.title) return null;
      const lastmod = lastmodByPostId.get(m[1]);
      return {
        source: 'yozm' as const,
        id: url,
        title: stripHtml(String((item.title as any)?.__cdata ?? item.title)),
        url,
        // lastmod는 날짜만 있음(YYYY-MM-DD) — KST 자정으로 간주
        publishedAt: lastmod ? `${lastmod}T00:00:00+09:00` : new Date().toISOString(),
        snippet: stripHtml(String((item.description as any)?.__cdata ?? item.description ?? '')),
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
}
