export interface AiContextFragment {
  id: string;
  label: string;
  content: string;
  priority: 'automatic' | 'on-demand';
}

export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AiSuggestedAction {
  id: string;
  label: string;
  prompt: string;
}

export interface CortexAiModuleProvider {
  moduleId: string;
  getContext?: () => Promise<AiContextFragment[]> | AiContextFragment[];
  getTools?: () => AiToolDefinition[];
  getSuggestedActions?: () => AiSuggestedAction[];
}
