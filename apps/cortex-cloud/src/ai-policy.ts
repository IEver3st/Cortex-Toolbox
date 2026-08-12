import type { CortexReasoningMode } from '@cortex/ai/contracts';

export type CortexPlan = 'free' | 'creator' | 'pro';
export type BillingInterval = 'month' | 'year';

/** The only production model and endpoint Cortex Cloud may request. */
export const CORTEX_AI_MODEL = 'deepseek/deepseek-v4-flash-0731' as const;
export const CORTEX_AI_PROVIDER = 'baseten/fp8' as const;

/**
 * Verified against OpenRouter model metadata on 2026-08-09. The model
 * advertises max, high, and low; max is therefore the exact highest effort.
 */
export const CORTEX_REASONING = {
  fast: { effort: 'low' },
  advanced: { effort: 'max' },
} as const satisfies Record<CortexReasoningMode, { effort: 'low' | 'max' }>;

export interface RunPolicy {
  contextTokens: number;
  outputReasoningTokens: number;
  toolTurns: number;
  runCostMicrousd: number;
}

export interface PaidPlanPolicy {
  aiEntitled: true;
  monthlySoftBudgetMicrousd: number;
  monthlyHardBudgetMicrousd: number;
  hourlyRuns: number;
  concurrency: number;
  fast: RunPolicy;
  advanced: RunPolicy;
}

interface FreePlanPolicy {
  aiEntitled: false;
  monthlySoftBudgetMicrousd: 0;
  monthlyHardBudgetMicrousd: 0;
  hourlyRuns: 0;
  concurrency: 0;
}

export const PLAN_POLICY = {
  free: {
    aiEntitled: false,
    monthlySoftBudgetMicrousd: 0,
    monthlyHardBudgetMicrousd: 0,
    hourlyRuns: 0,
    concurrency: 0,
  },
  creator: {
    aiEntitled: true,
    monthlySoftBudgetMicrousd: 800_000,
    monthlyHardBudgetMicrousd: 950_000,
    hourlyRuns: 20,
    concurrency: 1,
    fast: {
      contextTokens: 96_000,
      outputReasoningTokens: 8_000,
      toolTurns: 6,
      runCostMicrousd: 25_000,
    },
    advanced: {
      contextTokens: 224_000,
      outputReasoningTokens: 32_000,
      toolTurns: 10,
      runCostMicrousd: 60_000,
    },
  },
  pro: {
    aiEntitled: true,
    monthlySoftBudgetMicrousd: 1_700_000,
    monthlyHardBudgetMicrousd: 2_000_000,
    hourlyRuns: 40,
    concurrency: 2,
    fast: {
      contextTokens: 128_000,
      outputReasoningTokens: 10_000,
      toolTurns: 8,
      runCostMicrousd: 30_000,
    },
    advanced: {
      contextTokens: 384_000,
      outputReasoningTokens: 48_000,
      toolTurns: 12,
      runCostMicrousd: 90_000,
    },
  },
} as const satisfies { free: FreePlanPolicy; creator: PaidPlanPolicy; pro: PaidPlanPolicy };

export function paidPolicy(plan: CortexPlan): PaidPlanPolicy | null {
  return plan === 'free' ? null : PLAN_POLICY[plan];
}

export function runPolicy(plan: CortexPlan, mode: CortexReasoningMode): RunPolicy | null {
  return plan === 'free' ? null : PLAN_POLICY[plan][mode];
}

export interface CortexProviderRequestInput {
  reasoningMode: CortexReasoningMode;
  messages: unknown[];
  tools?: unknown[];
  stream: boolean;
  maxTokens: number;
}

export function assertAiProviderConfigured(apiKey: unknown): asserts apiKey is string {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Cortex Cloud is not configured correctly.');
  }
}

export function createProviderRequest(input: CortexProviderRequestInput) {
  return {
    model: CORTEX_AI_MODEL,
    messages: input.messages,
    ...(input.tools ? { tools: input.tools, tool_choice: 'auto' as const } : {}),
    reasoning: CORTEX_REASONING[input.reasoningMode],
    max_tokens: input.maxTokens,
    temperature: 0.2,
    stream: input.stream,
    usage: { include: true },
    provider: {
      only: [CORTEX_AI_PROVIDER],
      order: [CORTEX_AI_PROVIDER],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: 'deny' as const,
    },
  };
}

export function usageState(
  usedMicrousd: number,
  softMicrousd: number,
  hardMicrousd: number,
): 'plenty' | 'normal' | 'nearing' | 'grace' | 'used' {
  if (hardMicrousd <= 0 || usedMicrousd >= hardMicrousd) return 'used';
  if (usedMicrousd >= softMicrousd) return 'grace';
  const percent = usedMicrousd / hardMicrousd;
  if (percent >= 0.8) return 'nearing';
  if (percent >= 0.4) return 'normal';
  return 'plenty';
}
