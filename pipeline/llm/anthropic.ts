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

/** Claude API 구현 — structured outputs로 JSON 스키마 보장 */
export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  private client = new Anthropic();
  private inputTokens = 0;
  private outputTokens = 0;

  constructor() {
    this.name = `anthropic/${config.anthropicModel}`;
  }

  async summarize(article: RawArticle): Promise<SummaryResult> {
    const response = await this.client.messages.create({
      model: config.anthropicModel,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
      },
      messages: [{ role: 'user', content: buildUserPrompt(article) }],
    });

    this.inputTokens += response.usage.input_tokens;
    this.outputTokens += response.usage.output_tokens;

    if (response.stop_reason === 'refusal') {
      throw new Error('요약 거부됨 (refusal)');
    }
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) throw new Error('응답에 텍스트 블록이 없음');
    return JSON.parse(text) as SummaryResult;
  }

  reportUsage(): void {
    // Haiku 4.5: $1 / $5 per 1M tokens (2026-08 기준)
    const cost = (this.inputTokens / 1e6) * 1 + (this.outputTokens / 1e6) * 5;
    console.log(
      `[usage] ${this.name} — 입력 ${this.inputTokens.toLocaleString()} / 출력 ${this.outputTokens.toLocaleString()} 토큰, ` +
        `이번 실행 약 $${cost.toFixed(4)} (월 30회 환산 약 $${(cost * 30).toFixed(2)})`,
    );
  }
}
