import type { CortexAiModel } from '@cortex/ai/contracts';

const CURATED_MODELS = [
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', tier: 'fast' as const },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', tier: 'advanced' as const },
];

interface OpenRouterModelRecord {
  id?: unknown;
  context_length?: unknown;
  supported_parameters?: unknown;
}

export async function loadCuratedOpenRouterModels(signal?: AbortSignal): Promise<CortexAiModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', signal ? { signal } : {});
  if (!response.ok) throw new Error(`OpenRouter model registry returned ${response.status}.`);
  const payload = (await response.json()) as { data?: OpenRouterModelRecord[] };
  const live = new Map(
    (payload.data ?? [])
      .filter(
        (model): model is OpenRouterModelRecord & { id: string } => typeof model.id === 'string',
      )
      .map((model) => [model.id, model]),
  );
  return CURATED_MODELS.flatMap((curated) => {
    const model = live.get(curated.id);
    if (!model) return [];
    const supported = Array.isArray(model.supported_parameters)
      ? model.supported_parameters.filter((value): value is string => typeof value === 'string')
      : [];
    if (!supported.includes('tools')) return [];
    return [
      {
        ...curated,
        contextLength:
          typeof model.context_length === 'number' && Number.isInteger(model.context_length)
            ? model.context_length
            : null,
        supportsTools: true,
        supportsStreaming: true,
        // Every Cortex request also sets provider.data_collection="deny".
        trainingPolicy: 'no-training' as const,
      },
    ];
  });
}

export function isCuratedModel(modelId: string): boolean {
  return CURATED_MODELS.some((model) => model.id === modelId);
}
