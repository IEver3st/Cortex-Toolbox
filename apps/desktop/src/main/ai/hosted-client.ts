import { z } from 'zod';
import type { CortexReasoningMode } from '@cortex/ai/contracts';
import type { HostedMessage, HostedToolCall, HostedToolDefinition } from './hosted-protocol';

const hostedAccountSchema = z
  .object({
    plan: z.enum(['free', 'creator', 'pro']),
    billing: z
      .object({
        interval: z.enum(['month', 'year']).nullable(),
        subscriptionStatus: z.enum([
          'none',
          'active',
          'trialing',
          'past_due',
          'unpaid',
          'canceled',
          'incomplete',
          'incomplete_expired',
          'paused',
        ]),
        cancelAtPeriodEnd: z.boolean(),
        renewsAt: z.iso.datetime().nullable(),
        stripeCustomerPresent: z.boolean(),
        paymentFailed: z.boolean(),
      })
      .strict(),
    ai: z
      .object({
        entitled: z.boolean(),
        enabled: z.boolean(),
        usage: z
          .object({
            percent: z.number().int().min(0).max(100),
            state: z.enum(['plenty', 'normal', 'nearing', 'grace', 'used']),
            resetsAt: z.iso.datetime().nullable(),
          })
          .strict(),
        limits: z.object({ concurrentRuns: z.number().int().min(0).max(2) }).strict(),
      })
      .strict(),
  })
  .strict();

export type HostedAccount = z.infer<typeof hostedAccountSchema>;

interface HostedCompletionChoice {
  message?: { content?: string | null; tool_calls?: HostedToolCall[] };
}

export class CortexHostedClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string,
  ) {}

  async me(signal?: AbortSignal): Promise<HostedAccount> {
    return hostedAccountSchema.parse(
      await this.json('/v1/me', { method: 'GET', ...(signal ? { signal } : {}) }),
    );
  }

  async checkout(plan: 'creator' | 'pro', interval: 'month' | 'year'): Promise<string> {
    const payload = z
      .object({ url: z.url() })
      .parse(await this.json('/v1/billing/checkout', { method: 'POST', body: { plan, interval } }));
    return payload.url;
  }

  async markApplied(runId: string): Promise<void> {
    await this.json(`/v1/ai/runs/${encodeURIComponent(runId)}/applied`, {
      method: 'POST',
      body: {},
    });
  }

  async portal(): Promise<string> {
    const payload = z
      .object({ url: z.url() })
      .parse(await this.json('/v1/billing/portal', { method: 'POST', body: {} }));
    return payload.url;
  }

  async completeWithTools(input: {
    runId: string;
    step: number;
    reasoningMode: CortexReasoningMode;
    messages: HostedMessage[];
    tools: HostedToolDefinition[];
    signal: AbortSignal;
  }): Promise<{ content: string; toolCalls: HostedToolCall[] }> {
    const payload = (await this.json('/v1/ai/chat', {
      method: 'POST',
      body: {
        runId: input.runId,
        step: input.step,
        final: false,
        stream: false,
        reasoningMode: input.reasoningMode,
        messages: input.messages,
        tools: input.tools,
      },
      signal: input.signal,
    })) as { choices?: HostedCompletionChoice[]; error?: { message?: string } };
    const message = payload.choices?.[0]?.message;
    if (!message)
      throw new Error(payload.error?.message ?? 'Cortex Hosted returned no completion.');
    return { content: message.content ?? '', toolCalls: message.tool_calls ?? [] };
  }

  async streamFinal(input: {
    runId: string;
    step: number;
    reasoningMode: CortexReasoningMode;
    messages: HostedMessage[];
    signal: AbortSignal;
    onDelta: (text: string) => void;
  }): Promise<void> {
    const response = await this.request('/v1/ai/chat', {
      method: 'POST',
      body: {
        runId: input.runId,
        step: input.step,
        final: true,
        stream: true,
        reasoningMode: input.reasoningMode,
        messages: input.messages,
      },
      signal: input.signal,
    });
    if (!response.body) throw new Error('Cortex Hosted did not provide a response stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunk = await reader.read();
    while (!chunk.done) {
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data) as {
          choices?: { delta?: { content?: string | null } }[];
          error?: { message?: string };
        };
        if (event.error?.message) throw new Error(event.error.message);
        const text = event.choices?.[0]?.delta?.content;
        if (text) input.onDelta(text);
      }
      chunk = await reader.read();
    }
  }

  private async json(
    route: string,
    init: { method: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal },
  ): Promise<unknown> {
    const response = await this.request(route, init);
    return response.json();
  }

  private async request(
    route: string,
    init: { method: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal },
  ): Promise<Response> {
    if (!this.baseUrl) throw new Error('Cortex Hosted is not configured in this build.');
    const response = await fetch(new URL(route, this.baseUrl), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.signal ? { signal: init.signal } : {}),
    });
    if (!response.ok) {
      const detail = await response.text();
      let message = detail.slice(0, 400);
      try {
        const payload = JSON.parse(detail) as { error?: string; message?: string };
        message = payload.message ?? payload.error ?? message;
      } catch {
        // Keep the bounded response text when the service did not return JSON.
      }
      throw new Error(productErrorForHostedResponse(response.status, message));
    }
    return response;
  }
}

function productErrorForHostedResponse(status: number, detail: string): string {
  if (status === 401) return 'Sign in to use Cortex AI.';
  if (status === 402) {
    return /available with Creator or Pro/i.test(detail)
      ? 'Cortex AI is available with Creator or Pro.'
      : "You've used this month's Cortex AI capacity.";
  }
  if (status === 409) return detail || 'Another Cortex AI request is already active.';
  if (status === 413) return 'Cortex AI context is too large for this request.';
  if (status === 429) return detail || 'Cortex AI reached a safe run limit.';
  if (status === 503 && /not configured/i.test(detail)) {
    return 'Cortex Cloud is not configured correctly.';
  }
  if (status >= 500) return 'Cortex AI is temporarily unavailable.';
  return detail || 'Cortex AI could not complete the request.';
}
