import { z } from 'zod';

export const aiWorkspaceAccessSchema = z.enum([
  'read-only',
  'ask-before-changes',
  'approve-safe-edits',
  'approve-all',
]);
export type AiWorkspaceAccess = z.infer<typeof aiWorkspaceAccessSchema>;

export const cortexReasoningModeSchema = z.enum(['fast', 'advanced']);
export type CortexReasoningMode = z.infer<typeof cortexReasoningModeSchema>;

export const aiRoleSchema = z.enum(['user', 'assistant']);
export type AiRole = z.infer<typeof aiRoleSchema>;

export const aiContextAttachmentSchema = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum(['workspace', 'module', 'file', 'handling', 'selection', 'diagnostic']),
  label: z.string().min(1).max(200),
  reference: z.string().max(4096).nullable(),
});
export type AiContextAttachment = z.infer<typeof aiContextAttachmentSchema>;

export const aiConversationMessageSchema = z.object({
  id: z.string().min(1).max(160),
  role: aiRoleSchema,
  content: z.string().max(200_000),
  createdAt: z.string(),
  attachments: z.array(aiContextAttachmentSchema).max(20),
});
export type AiConversationMessage = z.infer<typeof aiConversationMessageSchema>;

export const aiToolActivitySchema = z.object({
  id: z.string().min(1).max(160),
  tool: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  status: z.enum(['pending', 'running', 'complete', 'failed']),
  summary: z.string().max(2_000).nullable(),
});
export type AiToolActivity = z.infer<typeof aiToolActivitySchema>;

export const aiFileChangeSchema = z.object({
  relativePath: z.string().min(1).max(4096),
  beforeHash: z.string().length(64).nullable(),
  beforeSource: z.string().max(2_000_000),
  afterSource: z.string().max(2_000_000),
});
export type AiFileChange = z.infer<typeof aiFileChangeSchema>;

export const aiHandlingPatchSchema = z.object({
  relativePath: z.string().min(1).max(4096),
  handlingName: z.string().min(1).max(200),
  values: z.record(z.string(), z.number()),
});
export type AiHandlingPatch = z.infer<typeof aiHandlingPatchSchema>;

export const aiChangeProposalSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  summary: z.string().max(2_000),
  createdAt: z.string(),
  files: z.array(aiFileChangeSchema).min(1).max(20),
  handlingPatch: aiHandlingPatchSchema.nullable().default(null),
  status: z.enum(['proposed', 'approved', 'applied', 'rejected', 'stale', 'failed']),
});
export type AiChangeProposal = z.infer<typeof aiChangeProposalSchema>;

export const aiChatRequestSchema = z
  .object({
    threadId: z.string().min(1).max(160),
    reasoningMode: cortexReasoningModeSchema,
    messages: z.array(aiConversationMessageSchema).min(1).max(100),
    attachments: z.array(aiContextAttachmentSchema).max(20),
    activeModule: z.string().max(120).nullable(),
    activeFile: z.string().max(4096).nullable(),
  })
  .strict();
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

export const aiStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ runId: z.string(), type: z.literal('started') }),
  z.object({ runId: z.string(), type: z.literal('delta'), text: z.string() }),
  z.object({ runId: z.string(), type: z.literal('tool'), activity: aiToolActivitySchema }),
  z.object({ runId: z.string(), type: z.literal('proposal'), proposal: aiChangeProposalSchema }),
  z.object({ runId: z.string(), type: z.literal('complete') }),
  z.object({ runId: z.string(), type: z.literal('error'), message: z.string() }),
]);
export type AiStreamEvent = z.infer<typeof aiStreamEventSchema>;
