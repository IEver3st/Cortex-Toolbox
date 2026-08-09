import { z } from 'zod';
import type { CortexAiModel } from '@cortex/ai/contracts';
import type { OpenRouterMessage, OpenRouterToolCall, OpenRouterToolDefinition } from './openrouter';

const hostedAccountSchema = z
  .object({
    plan: z.enum(['free', 'pro']),
    usage: z
      .object({
        used: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
        remaining: z.number().int().nonnegative(),
        periodEnd: z.iso.datetime(),
      })
      .strict(),
    billing: z
      .object({
        status: z.enum(['none', 'active', 'trialing', 'past_due', 'canceled', 'unpaid']),
        renewalDate: z.iso.datetime().nullable(),
      })
      .strict(),
  })
  .strict();

export type HostedAccount = z.infer<typeof hostedAccountSchema>;

interface HostedCompletionChoice {
  message?: { content?: string | null; tool_calls?: OpenRouterToolCall[] };
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

  async models(signal?: AbortSignal): Promise<CortexAiModel[]> {
    const payload = await this.json('/v1/ai/models', {
      method: 'GET',
      ...(signal ? { signal } : {}),
    });
    return z.array(z.custom<CortexAiModel>()).parse(payload);
  }

  async checkout(cadence: 'monthly' | 'annual'): Promise<string> {
    const payload = z
      .object({ url: z.url() })
      .parse(await this.json('/v1/billing/checkout', { method: 'POST', body: { cadence } }));
    return payload.url;
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
    model: string;
    messages: OpenRouterMessage[];
    tools: OpenRouterToolDefinition[];
    signal: AbortSignal;
  }): Promise<{ content: string; toolCalls: OpenRouterToolCall[] }> {
    const payload = (await this.json('/v1/ai/chat', {
      method: 'POST',
      body: {
        runId: input.runId,
        step: input.step,
        final: false,
        stream: false,
        model: input.model,
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
    model: string;
    messages: OpenRouterMessage[];
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
        model: input.model,
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
      throw new Error(message || `Cortex Hosted request failed (${response.status}).`);
    }
    return response;
  }
}
