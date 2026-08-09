export interface HostedToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface HostedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type HostedMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: HostedToolCall[] }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };
