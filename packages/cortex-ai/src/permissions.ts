import type { AiWorkspaceAccess } from './contracts';

export type AiWorkspaceOperation = 'inspect' | 'propose-change' | 'apply-change' | 'destructive';

export interface AiPermissionDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
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
      reason: 'Workspace inspection is allowed.',
    };
  }
  if (operation === 'destructive') {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: 'Destructive changes always require explicit confirmation.',
    };
  }
  if (access === 'read-only') {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'Workspace access is read only.',
    };
  }
  if (operation === 'propose-change') {
    return {
      allowed: true,
      requiresConfirmation: false,
      reason: 'The AI may prepare a reviewable proposal.',
    };
  }
  return access === 'allow-session'
    ? {
        allowed: true,
        requiresConfirmation: false,
        reason: 'Low-risk edits are allowed for this workspace session.',
      }
    : {
        allowed: true,
        requiresConfirmation: true,
        reason: 'Applying changes requires user approval.',
      };
}
