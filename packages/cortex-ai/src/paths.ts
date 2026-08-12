const SENSITIVE_BASENAMES = [/^\.env(?:\..+)?$/i, /^credentials(?:\..+)?$/i];
const SENSITIVE_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx']);

export class AiWorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiWorkspacePathError';
  }
}

export function normalizeAiWorkspacePath(input: string): string {
  if (!input.trim()) throw new AiWorkspacePathError('A workspace-relative path is required.');
  if (input.includes('\0')) throw new AiWorkspacePathError('Null bytes are not allowed in paths.');
  const withSlashes = input.replaceAll('\\', '/');
  if (
    withSlashes.startsWith('/') ||
    withSlashes.startsWith('//') ||
    /^[a-z]:\//i.test(withSlashes) ||
    /^[a-z][a-z0-9+.-]*:/i.test(withSlashes)
  ) {
    throw new AiWorkspacePathError('AI file access must use a workspace-relative path.');
  }
  const segments: string[] = [];
  for (const segment of withSlashes.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      throw new AiWorkspacePathError('AI file access cannot traverse outside the workspace.');
    }
    segments.push(segment);
  }
  if (segments.length === 0) throw new AiWorkspacePathError('A file path is required.');
  return segments.join('/');
}

export function isSensitiveAiPath(input: string): boolean {
  const relativePath = normalizeAiWorkspacePath(input);
  const basename = relativePath.split('/').at(-1) ?? relativePath;
  const dot = basename.lastIndexOf('.');
  const extension = dot >= 0 ? basename.slice(dot).toLowerCase() : '';
  return (
    SENSITIVE_BASENAMES.some((pattern) => pattern.test(basename)) ||
    SENSITIVE_EXTENSIONS.has(extension)
  );
}

export function assertAiReadablePath(input: string, allowSensitive = false): string {
  const relativePath = normalizeAiWorkspacePath(input);
  if (!allowSensitive && isSensitiveAiPath(relativePath)) {
    throw new AiWorkspacePathError('Sensitive files are excluded from AI context by default.');
  }
  return relativePath;
}
