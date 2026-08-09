import type { AiChangeProposal, AiContextAttachment, CortexAiModuleProvider } from '@cortex/ai';

export interface CortexAiRendererModuleProvider extends CortexAiModuleProvider {
  getAttachments?: () => AiContextAttachment[];
  applyProposal?: (proposal: AiChangeProposal) => Promise<boolean> | boolean;
}

const providers = new Map<string, CortexAiRendererModuleProvider>();

export function registerCortexAiModuleProvider(
  provider: CortexAiRendererModuleProvider,
): () => void {
  providers.set(provider.moduleId, provider);
  return () => {
    if (providers.get(provider.moduleId) === provider) providers.delete(provider.moduleId);
  };
}

export function getCortexAiModuleProvider(
  moduleId: string | null | undefined,
): CortexAiRendererModuleProvider | null {
  return moduleId ? (providers.get(moduleId) ?? null) : null;
}

export function clearCortexAiModuleProvidersForTests(): void {
  providers.clear();
}
