import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import type { RawArticle, SummaryResult } from '../types.ts';
import { buildUserPrompt, SYSTEM_PROMPT, type LlmProvider } from './provider.ts';

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    oneLineKo: { type: 'string', description: '핵심 한 줄 요약 (40자 이내)' },
    summaryKo: { type: 'string', description: '3~4문장 한국어 요약' },
    tags: { type: 'array', items: { type: 'string' }, description: '기술 키워드 1~3개' },
  },
  required: ['oneLineKo', 'summaryKo', 'tags'],
  additionalProperties: false,
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Claude API 구현 — structured outputs로 JSON 스키마 보장, 기본은 Batch API (50% 할인) */
export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  private client = new Anthropic();
  private inputTokens = 0;
  private outputTokens = 0;
  private batchMode = false;

  constructor() {
    this.name = `anthropic/${config.anthropicModel}`;
  }

  private buildParams(article: RawArticle) {
    return {
      model: config.anthropicModel,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema' as const, schema: SUMMARY_SCHEMA },
      },
      messages: [{ role: 'user' as const, content: buildUserPrompt(article) }],
    };
  }

  /** 메시지 응답 → SummaryResult (실패 시 throw) */
  private parseMessage(msg: Anthropic.Message): SummaryResult {
    if (msg.stop_reason === 'refusal') throw new Error('요약 거부됨 (refusal)');
    const text = msg.content.find((b) => b.type === 'text')?.text;
    if (!text) throw new Error('응답에 텍스트 블록이 없음');
    return JSON.parse(text) as SummaryResult;
  }

  async summarize(article: RawArticle): Promise<SummaryResult> {
    const response = await this.client.messages.create(this.buildParams(article));
    this.inputTokens += response.usage.input_tokens;
    this.outputTokens += response.usage.output_tokens;
    return this.parseMessage(response);
  }

  /**
   * Batch API — 비용 50% 할인. 보통 수 분 내 완료되며 최대 60분까지 30초 간격 폴링.
   * 60분 초과 시 배치를 취소하고 실패 처리 (Actions가 실패 알림 이슈를 남김).
   */
  async summarizeAll(articles: RawArticle[]): Promise<Map<string, SummaryResult>> {
    this.batchMode = true;
    const batch = await this.client.messages.batches.create({
      // custom_id는 64자 영숫자 제한이라 URL 대신 인덱스 사용
      requests: articles.map((a, i) => ({ custom_id: `a${i}`, params: this.buildParams(a) })),
    });
    console.log(`  batch ${batch.id} 제출 (${articles.length}건) — 완료 대기 중...`);

    const deadline = Date.now() + 60 * 60 * 1000;
    let status = batch;
    while (status.processing_status !== 'ended') {
      if (Date.now() > deadline) {
        await this.client.messages.batches.cancel(batch.id).catch(() => {});
        throw new Error(`batch ${batch.id} 60분 내 미완료 — 취소함`);
      }
      await sleep(30_000);
      status = await this.client.messages.batches.retrieve(batch.id);
    }

    const out = new Map<string, SummaryResult>();
    for await (const entry of await this.client.messages.batches.results(batch.id)) {
      const article = articles[Number(entry.custom_id.slice(1))];
      if (!article) continue;
      if (entry.result.type !== 'succeeded') {
        console.warn(`  ✗ batch 항목 실패 (${entry.result.type}): ${article.title}`);
        continue;
      }
      const msg = entry.result.message;
      this.inputTokens += msg.usage.input_tokens;
      this.outputTokens += msg.usage.output_tokens;
      try {
        out.set(article.id, this.parseMessage(msg));
      } catch (err) {
        console.warn(`  ✗ batch 응답 파싱 실패: ${article.title} (${(err as Error).message})`);
      }
    }
    return out;
  }

  reportUsage(): void {
    // Haiku 4.5: $1 / $5 per 1M tokens, Batch API는 50% 할인 (2026-08 기준)
    const discount = this.batchMode ? 0.5 : 1;
    const cost = ((this.inputTokens / 1e6) * 1 + (this.outputTokens / 1e6) * 5) * discount;
    console.log(
      `[usage] ${this.name}${this.batchMode ? ' (batch)' : ''} — 입력 ${this.inputTokens.toLocaleString()} / 출력 ${this.outputTokens.toLocaleString()} 토큰, ` +
        `이번 실행 약 $${cost.toFixed(4)} (월 30회 환산 약 $${(cost * 30).toFixed(2)})`,
    );
  }
}
