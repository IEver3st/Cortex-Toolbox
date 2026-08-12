import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { WebContents } from 'electron';
import {
  decideAiPermission,
  type AiChangeProposal,
  type AiChatRequest,
  type AiStreamEvent,
} from '@cortex/ai';
import { hashAiSource, validateAiChangeProposal } from '@cortex/ai/patches';
import type { ResourceFile } from '@cortex/resource-parser';
import type { Preferences } from '../../shared/contracts';
import { aiStreamEvent } from '../../shared/contracts';
import { CortexHostedClient } from './hosted-client';
import type { HostedMessage } from './hosted-protocol';
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
    private readonly applyWritePlans: (planIds: string[]) => Promise<unknown>,
    private readonly getHostedAccessToken: () => Promise<string>,
    private readonly hostedBaseUrl: string,
  ) {}

  start(request: AiChatRequest, sender: WebContents): string {
    this.assertEnabled();
    if (this.runs.size > 0)
      throw new Error('Cortex AI already has an active run. Stop it before starting another.');
    const runId = randomUUID();
    const controller = new AbortController();
    this.runs.set(runId, controller);
    this.emit(sender, { runId, type: 'started' });
    void this.run(runId, request, sender, controller.signal).finally(() => {
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

  async planProposal(
    proposal: AiChangeProposal,
    expectedWorkspaceRoot = this.getWorkspaceRoot(),
  ): Promise<PlannedWrite[]> {
    const preferences = this.assertWorkspaceEnabled();
    this.assertActiveWorkspace(expectedWorkspaceRoot);
    const permission = decideAiPermission(preferences.aiWorkspaceAccess, 'apply-change');
    if (!permission.allowed) throw new Error(permission.reason);
    const validated = validateAiChangeProposal(proposal);
    const plans: PlannedWrite[] = [];
    for (const file of validated.files) {
      const resolved = await resolveAiWorkspaceFile(expectedWorkspaceRoot, file.relativePath, {
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
    sender: WebContents,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const hosted = new CortexHostedClient(this.hostedBaseUrl, await this.getHostedAccessToken());
      const account = await hosted.me(signal);
      if (!account.ai.entitled) {
        throw new Error('Cortex AI is available with Creator or Pro.');
      }
      if (!account.ai.enabled) {
        throw new Error(
          account.ai.usage.state === 'used'
            ? "You've used this month's Cortex AI capacity."
            : 'Cortex AI is temporarily unavailable.',
        );
      }
      const workspaceRoot = this.getWorkspaceRoot();
      const tools = new CortexWorkspaceTools(
        () => workspaceRoot,
        async () => {
          this.assertActiveWorkspace(workspaceRoot);
          return this.listWorkspaceFiles();
        },
        request,
        (proposal) => this.handleProposal(runId, proposal, workspaceRoot, sender),
      );
      const messages: HostedMessage[] = [
        { role: 'system', content: tools.systemPrompt() },
        ...request.messages.map((message) => ({ role: message.role, content: message.content })),
      ];
      let toolSteps = 0;
      const toolResultCache = new Map<string, string>();
      while (toolSteps < 12) {
        const completion = await hosted.completeWithTools({
          runId,
          step: toolSteps,
          reasoningMode: request.reasoningMode,
          messages,
          tools: CORTEX_WORKSPACE_TOOLS,
          signal,
        });
        messages.push({
          role: 'assistant',
          content: completion.content,
          ...(completion.toolCalls.length > 0 ? { tool_calls: completion.toolCalls } : {}),
        });
        if (completion.toolCalls.length === 0) break;
        for (const toolCall of completion.toolCalls) {
          toolSteps += 1;
          if (toolSteps > 12) throw new Error('Cortex AI reached the workspace tool-step limit.');
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
            const cacheKey = `${toolCall.function.name}\u0000${toolCall.function.arguments}`;
            const cachedResult = toolResultCache.get(cacheKey);
            const result =
              cachedResult ??
              (await tools.execute(toolCall.function.name, toolCall.function.arguments));
            if (cachedResult === undefined) toolResultCache.set(cacheKey, result);
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
                summary:
                  cachedResult === undefined
                    ? summarizeToolResult(toolCall.function.name, result)
                    : 'Reused the previous identical tool result.',
              },
            });
          } catch (error) {
            const message = redactError(error);
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
        compactHostedConversation(messages);
      }
      messages.push({
        role: 'user',
        content:
          'Provide the final concise answer now. Summarize verified tool results and any proposed changes. Do not call more tools and do not claim writes were applied.',
      });
      const onDelta = (text: string) => this.emit(sender, { runId, type: 'delta', text });
      await hosted.streamFinal({
        runId,
        step: toolSteps + 1,
        reasoningMode: request.reasoningMode,
        messages,
        signal,
        onDelta,
      });
      this.emit(sender, { runId, type: 'complete' });
    } catch (error) {
      if (signal.aborted) {
        this.emit(sender, { runId, type: 'complete' });
        return;
      }
      this.emit(sender, { runId, type: 'error', message: redactError(error) });
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

  private assertActiveWorkspace(expectedRoot: string): void {
    if (this.getWorkspaceRoot() !== expectedRoot) {
      throw new Error('The active workspace changed. Start a new Cortex AI request.');
    }
  }

  /** Internal proposal event hook; exposed for security-boundary tests. */
  async handleProposal(
    runId: string,
    proposal: AiChangeProposal,
    workspaceRoot: string,
    sender: WebContents,
  ): Promise<void> {
    this.emit(sender, { runId, type: 'proposal', proposal });
    const permission = decideAiPermission(this.getPreferences().aiWorkspaceAccess, 'apply-change');
    if (!permission.autoApply) return;
    try {
      const plans = await this.planProposal(proposal, workspaceRoot);
      await this.applyWritePlans(plans.map((plan) => plan.planId));
      try {
        const hosted = new CortexHostedClient(
          this.hostedBaseUrl,
          await this.getHostedAccessToken(),
        );
        await hosted.markApplied(runId);
      } catch {
        // Applying the protected local transaction must not depend on telemetry delivery.
      }
      this.emit(sender, {
        runId,
        type: 'proposal',
        proposal: { ...proposal, status: 'applied' },
      });
    } catch (error) {
      const message = redactError(error);
      this.emit(sender, {
        runId,
        type: 'proposal',
        proposal: {
          ...proposal,
          status: /changed|workspace/i.test(message) ? 'stale' : 'failed',
        },
      });
      throw error;
    }
  }

  private emit(sender: WebContents, event: AiStreamEvent): void {
    if (!sender.isDestroyed()) sender.send(aiStreamEvent, event);
  }
}

function compactHostedConversation(messages: HostedMessage[]): void {
  if (messages.length <= 28) return;
  const system = messages[0];
  if (system?.role !== 'system') return;
  const recent = messages.slice(-18);
  const earlier = messages.slice(1, -18);
  const goal = earlier.find((message) => message.role === 'user')?.content.slice(0, 1_500) ?? '';
  const verified = earlier
    .filter((message) => message.role === 'tool')
    .slice(-10)
    .map((message) => `${message.name}: ${message.content.slice(0, 600)}`)
    .join('\n');
  const decisions = earlier
    .filter((message) => message.role === 'assistant' && message.content.trim())
    .slice(-4)
    .map((message) => message.content.slice(0, 500))
    .join('\n');
  messages.splice(
    0,
    messages.length,
    system,
    {
      role: 'system',
      content: [
        'Structured state from compacted earlier conversation:',
        `Goal: ${goal || 'Continue the current workspace task.'}`,
        `Verified tool results:\n${verified || 'No earlier tool result retained.'}`,
        `Recent decisions:\n${decisions || 'No earlier assistant decision retained.'}`,
      ].join('\n\n'),
    },
    ...recent,
  );
}

function redactError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'Cortex AI could not complete the request.';
  return message;
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
