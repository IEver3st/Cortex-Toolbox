import { HttpError } from './auth';

const CURATED_MODELS = [
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', tier: 'fast' as const },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', tier: 'advanced' as const },
];

export function isCuratedModel(modelId: string): boolean {
  return CURATED_MODELS.some((model) => model.id === modelId);
}

interface OpenRouterModelsResponse {
  data?: { id?: string; context_length?: number; supported_parameters?: string[] }[];
}

export async function curatedModels(): Promise<unknown[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  if (!response.ok) throw new HttpError(502, 'The model registry is temporarily unavailable.');
  const payload = await response.json<OpenRouterModelsResponse>();
  const byId = new Map((payload.data ?? []).map((model) => [model.id, model]));
  return CURATED_MODELS.flatMap((curated) => {
    const live = byId.get(curated.id);
    if (!live?.supported_parameters?.includes('tools')) return [];
    return [
      {
        ...curated,
        contextLength:
          typeof live.context_length === 'number' && Number.isInteger(live.context_length)
            ? live.context_length
            : null,
        supportsTools: true,
        supportsStreaming: true,
        trainingPolicy: 'no-training',
      },
    ];
  });
}
