import { cortexReasoningModeSchema } from '@cortex/ai/contracts';
import { describe, expect, it } from 'vitest';
import {
  assertAiProviderConfigured,
  CORTEX_AI_MODEL,
  CORTEX_AI_PROVIDER,
  CORTEX_REASONING,
  createProviderRequest,
  PLAN_POLICY,
  usageState,
} from './ai-policy';

describe('Cortex AI commercial policy', () => {
  it('gives Free zero hosted entitlement and zero provider budget', () => {
    expect(PLAN_POLICY.free).toEqual({
      aiEntitled: false,
      monthlySoftBudgetMicrousd: 0,
      monthlyHardBudgetMicrousd: 0,
      hourlyRuns: 0,
      concurrency: 0,
    });
  });

  it('defines exact Creator budgets and Fast/Advanced run limits', () => {
    expect(PLAN_POLICY.creator).toMatchObject({
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
    });
  });

  it('defines exact Pro budgets and Fast/Advanced run limits', () => {
    expect(PLAN_POLICY.pro).toMatchObject({
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
    });
  });

  it('pins only the approved model and Baseten FP8 endpoint with fallback disabled', () => {
    const request = createProviderRequest({
      reasoningMode: 'fast',
      stream: false,
      maxTokens: 8_000,
      messages: [],
    });
    expect(CORTEX_AI_MODEL).toBe('deepseek/deepseek-v4-flash-0731');
    expect(CORTEX_AI_PROVIDER).toBe('baseten/fp8');
    expect(request).toMatchObject({
      model: CORTEX_AI_MODEL,
      provider: {
        only: [CORTEX_AI_PROVIDER],
        order: [CORTEX_AI_PROVIDER],
        allow_fallbacks: false,
        require_parameters: true,
      },
    });
    expect(JSON.stringify(request)).not.toMatch(/v4-pro|fallback_models|models|auto.router/i);
  });

  it('maps Fast to low and Advanced to the same model at maximum supported reasoning', () => {
    const fast = createProviderRequest({
      reasoningMode: 'fast',
      stream: false,
      maxTokens: 1_000,
      messages: [],
    });
    const advanced = createProviderRequest({
      reasoningMode: 'advanced',
      stream: false,
      maxTokens: 1_000,
      messages: [],
    });
    expect(fast.model).toBe(advanced.model);
    expect(CORTEX_REASONING.fast).toEqual({ effort: 'low' });
    expect(CORTEX_REASONING.advanced).toEqual({ effort: 'max' });
    expect(fast.reasoning).toEqual({ effort: 'low' });
    expect(advanced.reasoning).toEqual({ effort: 'max' });
  });

  it('uses hard allowance percentage states without blocking at soft allowance', () => {
    expect(usageState(799_999, 800_000, 950_000)).toBe('nearing');
    expect(usageState(800_000, 800_000, 950_000)).toBe('grace');
    expect(usageState(949_999, 800_000, 950_000)).toBe('grace');
    expect(usageState(950_000, 800_000, 950_000)).toBe('used');
  });

  it('rejects unknown reasoning intent and missing server provider configuration', () => {
    expect(cortexReasoningModeSchema.safeParse('extreme').success).toBe(false);
    expect(() => assertAiProviderConfigured('')).toThrow('not configured');
    expect(() => assertAiProviderConfigured(undefined)).toThrow('not configured');
  });
});
