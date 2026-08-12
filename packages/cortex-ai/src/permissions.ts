import type { AiWorkspaceAccess } from './contracts';

export type AiWorkspaceOperation = 'inspect' | 'propose-change' | 'apply-change' | 'destructive';

export interface AiPermissionDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  autoApply: boolean;
  reason: string;
}

export function decideAiPermission(
  access: AiWorkspaceAccess,
  operation: AiWorkspaceOperation,
): AiPermissionDecision {
  if (operation === 'inspect') {
    return {
      allowed: true,
      requiresConfirmation: false,
      autoApply: false,
      reason: 'Workspace inspection is allowed.',
    };
  }
  if (operation === 'destructive') {
    return {
      allowed: true,
      requiresConfirmation: true,
      autoApply: false,
      reason: 'Destructive changes always require explicit confirmation.',
    };
  }
  if (access === 'read-only') {
    return {
      allowed: false,
      requiresConfirmation: false,
      autoApply: false,
      reason: 'Workspace access is read only.',
    };
  }
  if (operation === 'propose-change') {
    return {
      allowed: true,
      requiresConfirmation: false,
      autoApply: false,
      reason: 'The AI may prepare a reviewable proposal.',
    };
  }
  return access === 'ask-before-changes'
    ? {
        allowed: true,
        requiresConfirmation: true,
        autoApply: false,
        reason: 'Applying changes requires user approval.',
      }
    : access === 'approve-safe-edits'
      ? {
          allowed: true,
          requiresConfirmation: false,
          autoApply: false,
          reason: 'Eligible safe edits are allowed for the active workspace.',
        }
      : {
          allowed: true,
          requiresConfirmation: false,
          autoApply: true,
          reason: 'Eligible changes may be applied automatically inside the active workspace.',
        };
}

export function shouldAutoApplyAiProposal(access: AiWorkspaceAccess): boolean {
  return decideAiPermission(access, 'apply-change').autoApply;
}
