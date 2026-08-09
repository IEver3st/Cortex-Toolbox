import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { WebContents } from 'electron';
import {
  decideAiPermission,
  type AiChangeProposal,
  type AiChatRequest,
  type AiStreamEvent,
  type CortexAiModel,
} from '@cortex/ai';
import { hashAiSource, validateAiChangeProposal } from '@cortex/ai/patches';
import type { ResourceFile } from '@cortex/resource-parser';
import type { Preferences } from '../../shared/contracts';
import { aiStreamEvent } from '../../shared/contracts';
import { loadCuratedOpenRouterModels, isCuratedModel } from './model-registry';
import { OpenRouterClient, type OpenRouterMessage } from './openrouter';
import { CortexHostedClient } from './hosted-client';
import { secureSecrets } from './secure-storage';
import { CORTEX_WORKSPACE_TOOLS, CortexWorkspaceTools } from './workspace-tools';
import { resolveAiWorkspaceFile } from './workspace-sandbox';

interface PlannedWrite {
  relativePath: string;
  planId: string;
}

export class CortexAiService {
  private readonly runs = new Map<string, AbortController>();

  constructor(
    private readonly getPreferences: () => Preferences,
    private readonly getWorkspaceRoot: () => string,
    private readonly listWorkspaceFiles: () => Promise<ResourceFile[]>,
    private readonly planWrite: (relativePath: string, source: string) => Promise<string>,
    private readonly getHostedAccessToken: () => Promise<string>,
    private readonly hostedBaseUrl: string,
  ) {}

  credentialStatus(): { configured: boolean; encryptionAvailable: boolean } {
    return {
      configured: secureSecrets.has('openrouter-api-key'),
      encryptionAvailable: secureSecrets.encryptionAvailable(),
    };
  }

  setCredential(apiKey: string): { configured: true } {
    secureSecrets.set('openrouter-api-key', apiKey.trim());
    return { configured: true };
  }

  removeCredential(): boolean {
    secureSecrets.remove('openrouter-api-key');
    return true;
  }

  async models(signal?: AbortSignal): Promise<CortexAiModel[]> {
    const preferences = this.assertAiEnabled();
    if (preferences.aiProvider === 'cortex-hosted') {
      const token = await this.getHostedAccessToken();
      return new CortexHostedClient(this.hostedBaseUrl, token).models(signal);
    }
    return loadCuratedOpenRouterModels(signal);
  }

  async testProvider(): Promise<{ provider: Preferences['aiProvider']; model: string }> {
    const preferences = this.assertAiEnabled();
    if (!isCuratedModel(preferences.aiModel))
      throw new Error('Select a supported Cortex AI model.');
    if (preferences.aiProvider === 'openrouter') {
      const key = secureSecrets.get('openrouter-api-key');
      if (!key) throw new Error('Add an OpenRouter API key first.');
      await new OpenRouterClient(key).test();
      return { provider: preferences.aiProvider, model: preferences.aiModel };
    }
    const token = await this.getHostedAccessToken();
    await new CortexHostedClient(this.hostedBaseUrl, token).me();
    return { provider: preferences.aiProvider, model: preferences.aiModel };
  }

  start(request: AiChatRequest, sender: WebContents): string {
    const preferences = this.assertEnabled();
    if (!isCuratedModel(request.model))
      throw new Error('The selected model is not in the Cortex allowlist.');
    if (this.runs.size > 0)
      throw new Error('Cortex AI already has an active run. Stop it before starting another.');
    const runId = randomUUID();
    const controller = new AbortController();
    this.runs.set(runId, controller);
    this.emit(sender, { runId, type: 'started' });
    void this.run(runId, request, preferences, sender, controller.signal).finally(() => {
      this.runs.delete(runId);
    });
    return runId;
  }

  cancel(runId: string): boolean {
    const controller = this.runs.get(runId);
    if (!controller) return false;
    controller.abort();
    this.runs.delete(runId);
    return true;
  }

  async planProposal(proposal: AiChangeProposal): Promise<PlannedWrite[]> {
    const preferences = this.assertWorkspaceEnabled();
    const permission = decideAiPermission(preferences.aiWorkspaceAccess, 'apply-change');
    if (!permission.allowed) throw new Error(permission.reason);
    const validated = validateAiChangeProposal(proposal);
    const plans: PlannedWrite[] = [];
    for (const file of validated.files) {
      const resolved = await resolveAiWorkspaceFile(this.getWorkspaceRoot(), file.relativePath, {
        mustExist: true,
      });
      const currentSource = await readFile(resolved.target, 'utf8');
      if (hashAiSource(currentSource) !== file.beforeHash) {
        throw new Error(
          `${file.relativePath} changed since Cortex prepared this edit. Recalculate the changes.`,
        );
      }
      plans.push({
        relativePath: file.relativePath,
        planId: await this.planWrite(file.relativePath, file.afterSource),
      });
    }
    return plans;
  }

  private async run(
    runId: string,
    request: AiChatRequest,
    preferences: Preferences,
    sender: WebContents,
    signal: AbortSignal,
  ): Promise<void> {
    let secret: string | null = null;
    try {
      const openRouter =
        preferences.aiProvider === 'openrouter'
          ? new OpenRouterClient((secret = secureSecrets.get('openrouter-api-key') ?? ''))
          : null;
      if (preferences.aiProvider === 'openrouter' && !secret) {
        throw new Error('Add an OpenRouter API key in Settings → AI.');
      }
      const hosted =
        preferences.aiProvider === 'cortex-hosted'
          ? new CortexHostedClient(this.hostedBaseUrl, await this.getHostedAccessToken())
          : null;
      const tools = new CortexWorkspaceTools(
        this.getWorkspaceRoot,
        this.listWorkspaceFiles,
        request,
        (proposal) => this.emit(sender, { runId, type: 'proposal', proposal }),
      );
      const messages: OpenRouterMessage[] = [
        { role: 'system', content: tools.systemPrompt() },
        ...request.messages.map((message) => ({ role: message.role, content: message.content })),
      ];
      let toolSteps = 0;
      while (toolSteps < 8) {
        const completion = openRouter
          ? await openRouter.completeWithTools({
              model: request.model,
              messages,
              tools: CORTEX_WORKSPACE_TOOLS,
              signal,
            })
          : hosted
            ? await hosted.completeWithTools({
                runId,
                step: toolSteps,
                model: request.model,
                messages,
                tools: CORTEX_WORKSPACE_TOOLS,
                signal,
              })
            : failMissingProvider();
        messages.push({
          role: 'assistant',
          content: completion.content,
          ...(completion.toolCalls.length > 0 ? { tool_calls: completion.toolCalls } : {}),
        });
        if (completion.toolCalls.length === 0) break;
        for (const toolCall of completion.toolCalls) {
          toolSteps += 1;
          if (toolSteps > 8) throw new Error('Cortex AI reached the workspace tool-step limit.');
          const activityId = randomUUID();
          this.emit(sender, {
            runId,
            type: 'tool',
            activity: {
              id: activityId,
              tool: toolCall.function.name,
              label: toolLabel(toolCall.function.name),
              status: 'running',
              summary: null,
            },
          });
          try {
            const result = await tools.execute(toolCall.function.name, toolCall.function.arguments);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: result,
            });
            this.emit(sender, {
              runId,
              type: 'tool',
              activity: {
                id: activityId,
                tool: toolCall.function.name,
                label: toolLabel(toolCall.function.name),
                status: 'complete',
                summary: summarizeToolResult(toolCall.function.name, result),
              },
            });
          } catch (error) {
            const message = redactError(error, secret);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: JSON.stringify({ error: message }),
            });
            this.emit(sender, {
              runId,
              type: 'tool',
              activity: {
                id: activityId,
                tool: toolCall.function.name,
                label: toolLabel(toolCall.function.name),
                status: 'failed',
                summary: message,
              },
            });
          }
        }
      }
      messages.push({
        role: 'user',
        content:
          'Provide the final concise answer now. Summarize verified tool results and any proposed changes. Do not call more tools and do not claim writes were applied.',
      });
      const onDelta = (text: string) => this.emit(sender, { runId, type: 'delta', text });
      if (openRouter) {
        await openRouter.streamFinal({ model: request.model, messages, signal, onDelta });
      } else if (hosted) {
        await hosted.streamFinal({
          runId,
          step: toolSteps + 1,
          model: request.model,
          messages,
          signal,
          onDelta,
        });
      } else {
        failMissingProvider();
      }
      this.emit(sender, { runId, type: 'complete' });
    } catch (error) {
      if (signal.aborted) {
        this.emit(sender, { runId, type: 'complete' });
        return;
      }
      this.emit(sender, { runId, type: 'error', message: redactError(error, secret) });
    }
  }

  private assertEnabled(): Preferences {
    return this.assertWorkspaceEnabled();
  }

  private assertAiEnabled(): Preferences {
    const preferences = this.getPreferences();
    if (!preferences.aiEnabled) throw new Error('Cortex AI is disabled.');
    return preferences;
  }

  private assertWorkspaceEnabled(): Preferences {
    const preferences = this.assertAiEnabled();
    this.getWorkspaceRoot();
    return preferences;
  }

  private emit(sender: WebContents, event: AiStreamEvent): void {
    if (!sender.isDestroyed()) sender.send(aiStreamEvent, event);
  }
}

function failMissingProvider(): never {
  throw new Error('The selected Cortex AI provider is not available.');
}

function redactError(error: unknown, secret: string | null): string {
  const message =
    error instanceof Error ? error.message : 'Cortex AI could not complete the request.';
  return secret ? message.replaceAll(secret, '[redacted]') : message;
}

function toolLabel(name: string): string {
  return (
    (
      {
        get_workspace_summary: 'Inspecting workspace',
        list_workspace_files: 'Listing workspace files',
        read_workspace_file: 'Reading workspace file',
        search_workspace: 'Searching workspace',
        get_active_context: 'Checking active context',
        get_resource_diagnostics: 'Running deterministic diagnostics',
        get_active_handling: 'Inspecting handling entry',
        get_handling_field_definition: 'Checking handling field',
        propose_file_patch: 'Preparing file changes',
        propose_handling_patch: 'Preparing handling changes',
      } as Record<string, string>
    )[name] ?? name
  );
}

function summarizeToolResult(name: string, result: string): string {
  if (name.startsWith('propose_')) return 'Reviewable changes prepared; nothing was written.';
  if (result.length < 160) return result;
  return 'Completed with structured workspace results.';
}
