export interface OpenRouterToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type OpenRouterMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: OpenRouterToolCall[] }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

interface CompletionChoice {
  message?: { content?: string | null; tool_calls?: OpenRouterToolCall[] };
}

export class OpenRouterClient {
  constructor(private readonly apiKey: string) {}

  async test(signal?: AbortSignal): Promise<void> {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error('OpenRouter rejected this API key.');
  }

  async completeWithTools(input: {
    model: string;
    messages: OpenRouterMessage[];
    tools: OpenRouterToolDefinition[];
    signal: AbortSignal;
  }): Promise<{ content: string; toolCalls: OpenRouterToolCall[] }> {
    const response = await this.request(
      {
        model: input.model,
        messages: input.messages,
        tools: input.tools,
        tool_choice: 'auto',
        max_tokens: 2_000,
        temperature: 0.2,
        stream: false,
        provider: { data_collection: 'deny' },
      },
      input.signal,
    );
    const payload = (await response.json()) as {
      choices?: CompletionChoice[];
      error?: { message?: string };
    };
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error(payload.error?.message ?? 'OpenRouter returned no completion.');
    return { content: message.content ?? '', toolCalls: message.tool_calls ?? [] };
  }

  async streamFinal(input: {
    model: string;
    messages: OpenRouterMessage[];
    signal: AbortSignal;
    onDelta: (text: string) => void;
  }): Promise<void> {
    const response = await this.request(
      {
        model: input.model,
        messages: input.messages,
        max_tokens: 4_096,
        temperature: 0.25,
        stream: true,
        provider: { data_collection: 'deny' },
      },
      input.signal,
    );
    if (!response.body) throw new Error('OpenRouter did not provide a response stream.');
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

  private async request(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/IEver3st/Cortex-Toolbox',
        'X-Title': 'Cortex Toolbox',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${detail.slice(0, 400)}`);
    }
    return response;
  }
}
