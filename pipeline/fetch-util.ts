import { config } from './config.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchTextOptions {
  retries?: number;
  /** 429/5xx 재시도 기본 대기(ms), 지수 백오프 */
  backoffMs?: number;
  timeoutMs?: number;
}

/** UA 포함 GET, 429/5xx 지수 백오프 재시도 */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  const { retries = 3, backoffMs = 2000, timeoutMs = 20000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': config.userAgent },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (res.ok) return await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const wait = backoffMs * 2 ** attempt;
        console.warn(`  [retry] ${res.status} ${url} — ${wait}ms 대기 후 재시도 (${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`fetch failed: ${url}`);
}

export async function fetchJson<T>(url: string, opts?: FetchTextOptions): Promise<T> {
  return JSON.parse(await fetchText(url, opts)) as T;
}

/** HTML → plain text (간이 변환) */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
