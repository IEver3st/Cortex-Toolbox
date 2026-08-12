import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CORTEX_AI_SYSTEM_PROMPT,
  assertAiReadablePath,
  isSensitiveAiPath,
  type AiChangeProposal,
  type AiChatRequest,
} from '@cortex/ai';
import { createAiFileChange } from '@cortex/ai/patches';
import {
  HANDLING_FIELDS,
  parseHandlingDocument,
  updateHandlingEntry,
  validateMetaXml,
} from '@cortex/vehicle-meta';
import type { ResourceFile } from '@cortex/resource-parser';
import type { HostedToolDefinition } from './hosted-protocol';
import { resolveAiWorkspaceFile } from './workspace-sandbox';

const TEXT_EXTENSIONS = new Set([
  '.lua',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  '.xml',
  '.meta',
  '.cfg',
  '.ini',
  '.md',
  '.txt',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
]);

export const CORTEX_WORKSPACE_TOOLS: HostedToolDefinition[] = [
  tool('get_workspace_summary', 'Get a concise summary of the active FiveM workspace.', {}),
  tool('list_workspace_files', 'List workspace-relative files. Sensitive files are excluded.', {
    query: { type: 'string', description: 'Optional case-insensitive path filter.' },
  }),
  tool(
    'read_workspace_file',
    'Read a text file inside the active workspace.',
    {
      relative_path: { type: 'string' },
      start_line: { type: 'integer', minimum: 1 },
      end_line: { type: 'integer', minimum: 1 },
    },
    ['relative_path'],
  ),
  tool(
    'search_workspace',
    'Search text files in the active workspace.',
    {
      query: { type: 'string', minLength: 1 },
      path_prefix: { type: 'string' },
    },
    ['query'],
  ),
  tool('get_active_context', 'Get the current module, file, and user-selected context.', {}),
  tool('get_resource_diagnostics', 'Run deterministic metadata diagnostics on relevant files.', {}),
  tool('get_active_handling', 'Read typed values from the active or only handling.meta.', {
    relative_path: { type: 'string' },
    handling_name: { type: 'string' },
  }),
  tool(
    'get_handling_field_definition',
    'Get the definition and typical interaction range for a handling field.',
    {
      field: { type: 'string' },
    },
    ['field'],
  ),
  tool(
    'propose_file_patch',
    'Prepare a reviewable full-source replacement for one workspace file. This does not write.',
    {
      relative_path: { type: 'string' },
      after_source: { type: 'string' },
      title: { type: 'string' },
      summary: { type: 'string' },
    },
    ['relative_path', 'after_source', 'title', 'summary'],
  ),
  tool(
    'propose_handling_patch',
    'Prepare typed numeric changes to one handling entry. Scalar fields use their XML property name; vectors use centreOfMass.x, inertiaMultiplier.y, or seatOffset.z; monetaryValue is also supported. This does not write.',
    {
      relative_path: { type: 'string' },
      handling_name: { type: 'string' },
      changes: { type: 'object', additionalProperties: { type: 'number' } },
      title: { type: 'string' },
      summary: { type: 'string' },
    },
    ['relative_path', 'handling_name', 'changes', 'title', 'summary'],
  ),
];

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): HostedToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
  };
}

export class CortexWorkspaceTools {
  constructor(
    private readonly getRoot: () => string,
    private readonly listFiles: () => Promise<ResourceFile[]>,
    private readonly request: AiChatRequest,
    private readonly onProposal: (proposal: AiChangeProposal) => Promise<void> | void,
  ) {}

  systemPrompt(): string {
    return CORTEX_AI_SYSTEM_PROMPT;
  }

  async execute(name: string, rawArguments: string): Promise<string> {
    const parsedArguments: unknown = JSON.parse(rawArguments || '{}');
    const input =
      parsedArguments !== null &&
      typeof parsedArguments === 'object' &&
      !Array.isArray(parsedArguments)
        ? (parsedArguments as Record<string, unknown>)
        : {};
    switch (name) {
      case 'get_workspace_summary':
        return this.workspaceSummary();
      case 'list_workspace_files':
        return this.workspaceFiles(input);
      case 'read_workspace_file':
        return this.readWorkspaceFile(input);
      case 'search_workspace':
        return this.searchWorkspace(input);
      case 'get_active_context':
        return JSON.stringify({
          activeModule: this.request.activeModule,
          activeFile: this.request.activeFile,
          attachments: this.request.attachments,
        });
      case 'get_resource_diagnostics':
        return this.resourceDiagnostics();
      case 'get_active_handling':
        return this.activeHandling(input);
      case 'get_handling_field_definition':
        return this.handlingField(input);
      case 'propose_file_patch':
        return this.proposeFilePatch(input);
      case 'propose_handling_patch':
        return this.proposeHandlingPatch(input);
      default:
        throw new Error(`Unknown Cortex workspace tool: ${name}`);
    }
  }

  private async workspaceSummary(): Promise<string> {
    const files = await this.listFiles();
    const manifests = files.filter((file) =>
      ['fxmanifest.lua', '__resource.lua'].includes(file.name),
    );
    return JSON.stringify({
      name: path.basename(this.getRoot()),
      fileCount: files.length,
      manifestPaths: manifests.map((file) => file.relativePath),
      handlingFiles: files
        .filter((file) => file.name.toLowerCase() === 'handling.meta')
        .map((file) => file.relativePath),
    });
  }

  private async workspaceFiles(input: Record<string, unknown>): Promise<string> {
    const query = typeof input.query === 'string' ? input.query.toLowerCase() : '';
    const files = (await this.listFiles())
      .filter((file) => !isSensitiveAiPath(file.relativePath))
      .filter((file) => !query || file.relativePath.toLowerCase().includes(query))
      .slice(0, 2_000)
      .map((file) => ({ path: file.relativePath, bytes: file.bytes }));
    return JSON.stringify(files);
  }

  private async readWorkspaceFile(input: Record<string, unknown>): Promise<string> {
    const relativePath = assertAiReadablePath(stringInput(input, 'relative_path'));
    const file = await resolveAiWorkspaceFile(this.getRoot(), relativePath, { mustExist: true });
    const source = await readFile(file.target, 'utf8');
    if (Buffer.byteLength(source, 'utf8') > 500_000)
      throw new Error('AI reads are limited to 500 KB per file.');
    const lines = source.split(/\r?\n/);
    const start = Math.max(1, Number(input.start_line) || 1);
    const end = Math.min(
      lines.length,
      Number(input.end_line) || Math.min(lines.length, start + 399),
    );
    return JSON.stringify({
      relativePath,
      startLine: start,
      endLine: end,
      content: lines.slice(start - 1, end).join('\n'),
    });
  }

  private async searchWorkspace(input: Record<string, unknown>): Promise<string> {
    const query = stringInput(input, 'query').trim().toLowerCase();
    if (!query) throw new Error('A search query is required.');
    const prefix =
      typeof input.path_prefix === 'string' ? assertAiReadablePath(input.path_prefix) : '';
    const candidates = (await this.listFiles())
      .filter((file) => TEXT_EXTENSIONS.has(file.extension) && file.bytes <= 500_000)
      .filter((file) => !isSensitiveAiPath(file.relativePath))
      .filter((file) => !prefix || file.relativePath.startsWith(prefix))
      .slice(0, 300);
    const matches: { path: string; line: number; text: string }[] = [];
    for (const candidate of candidates) {
      const resolved = await resolveAiWorkspaceFile(this.getRoot(), candidate.relativePath, {
        mustExist: true,
      });
      const lines = (await readFile(resolved.target, 'utf8')).split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line?.toLowerCase().includes(query)) {
          matches.push({
            path: candidate.relativePath,
            line: index + 1,
            text: line.trim().slice(0, 300),
          });
          if (matches.length >= 80) return JSON.stringify(matches);
        }
      }
    }
    return JSON.stringify(matches);
  }

  private async resourceDiagnostics(): Promise<string> {
    const candidates = (await this.listFiles())
      .filter((file) => ['.meta', '.xml'].includes(file.extension) && file.bytes <= 1_000_000)
      .filter((file) => !isSensitiveAiPath(file.relativePath))
      .slice(0, 80);
    const issues = [];
    for (const candidate of candidates) {
      const resolved = await resolveAiWorkspaceFile(this.getRoot(), candidate.relativePath, {
        mustExist: true,
      });
      const source = await readFile(resolved.target, 'utf8');
      issues.push(...validateMetaXml({ name: candidate.relativePath, content: source }));
      if (issues.length >= 100) break;
    }
    return JSON.stringify(issues.slice(0, 100));
  }

  private async activeHandling(input: Record<string, unknown>): Promise<string> {
    const relativePath = await this.resolveHandlingPath(input.relative_path);
    const resolved = await resolveAiWorkspaceFile(this.getRoot(), relativePath, {
      mustExist: true,
    });
    const document = parseHandlingDocument(await readFile(resolved.target, 'utf8'));
    const requested = typeof input.handling_name === 'string' ? input.handling_name : '';
    const entry =
      document.entries.find(
        (candidate) => candidate.handlingName.toLowerCase() === requested.toLowerCase(),
      ) ?? document.entries[0];
    if (!entry) throw new Error('No CHandlingData entries were found.');
    return JSON.stringify({
      relativePath,
      handlingName: entry.handlingName,
      values: entry.values,
      setup: entry.setup,
      subHandlingTypes: entry.subHandlingTypes,
      preservedUnknownNodes: entry.unknownNodes.map((node) => node.name),
    });
  }

  private handlingField(input: Record<string, unknown>): string {
    const field = HANDLING_FIELDS.find((candidate) => candidate.key === input.field);
    if (!field) throw new Error('Unknown handling field.');
    return JSON.stringify({
      ...field,
      min: field.min,
      max: field.max,
      rangeMeaning: 'recommended interaction range, not a hard schema constraint',
    });
  }

  private async proposeFilePatch(input: Record<string, unknown>): Promise<string> {
    const relativePath = assertAiReadablePath(stringInput(input, 'relative_path'));
    const resolved = await resolveAiWorkspaceFile(this.getRoot(), relativePath, {
      mustExist: true,
    });
    const beforeSource = await readFile(resolved.target, 'utf8');
    const proposal: AiChangeProposal = {
      id: randomUUID(),
      title: stringInput(input, 'title', 'Proposed workspace change').slice(0, 240),
      summary: stringInput(input, 'summary').slice(0, 2_000),
      createdAt: new Date().toISOString(),
      files: [
        createAiFileChange({
          relativePath,
          beforeSource,
          afterSource: stringInput(input, 'after_source'),
        }),
      ],
      handlingPatch: null,
      status: 'proposed',
    };
    await this.onProposal(proposal);
    return JSON.stringify({ proposalId: proposal.id, status: 'proposed', files: [relativePath] });
  }

  private async proposeHandlingPatch(input: Record<string, unknown>): Promise<string> {
    const relativePath = await this.resolveHandlingPath(input.relative_path);
    const resolved = await resolveAiWorkspaceFile(this.getRoot(), relativePath, {
      mustExist: true,
    });
    const beforeSource = await readFile(resolved.target, 'utf8');
    const document = parseHandlingDocument(beforeSource);
    const handlingName = stringInput(input, 'handling_name');
    const entry = document.entries.find(
      (candidate) => candidate.handlingName.toLowerCase() === handlingName.toLowerCase(),
    );
    if (!entry) throw new Error(`Handling entry ${handlingName} was not found.`);
    const rawChanges =
      input.changes && typeof input.changes === 'object'
        ? (input.changes as Record<string, unknown>)
        : {};
    const values = { ...entry.values };
    const setup = {
      ...entry.setup,
      centreOfMass: { ...entry.setup.centreOfMass },
      inertiaMultiplier: { ...entry.setup.inertiaMultiplier },
      seatOffset: { ...entry.setup.seatOffset },
    };
    const changes: Record<string, number> = {};
    for (const [field, rawValue] of Object.entries(rawChanges)) {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        throw new Error(`Invalid typed handling change: ${field}`);
      }
      if (field in values) {
        values[field as keyof typeof values] = rawValue;
      } else {
        const vectorMatch = /^(centreOfMass|inertiaMultiplier|seatOffset)\.(x|y|z)$/.exec(field);
        if (vectorMatch) {
          const vector = vectorMatch[1] as 'centreOfMass' | 'inertiaMultiplier' | 'seatOffset';
          const axis = vectorMatch[2] as 'x' | 'y' | 'z';
          setup[vector][axis] = rawValue;
        } else if (field === 'monetaryValue') {
          setup.monetaryValue = Math.round(rawValue);
        } else {
          throw new Error(`Invalid typed handling change: ${field}`);
        }
      }
      changes[field] = rawValue;
    }
    if (Object.keys(changes).length === 0)
      throw new Error('At least one handling change is required.');
    const afterSource = updateHandlingEntry(document, entry.id, { values, setup });
    const proposal: AiChangeProposal = {
      id: randomUUID(),
      title: stringInput(input, 'title', 'Proposed handling changes').slice(0, 240),
      summary: stringInput(input, 'summary').slice(0, 2_000),
      createdAt: new Date().toISOString(),
      files: [createAiFileChange({ relativePath, beforeSource, afterSource })],
      handlingPatch: { relativePath, handlingName: entry.handlingName, values: changes },
      status: 'proposed',
    };
    await this.onProposal(proposal);
    return JSON.stringify({ proposalId: proposal.id, status: 'proposed', changes });
  }

  private async resolveHandlingPath(input: unknown): Promise<string> {
    if (typeof input === 'string' && input.trim()) return assertAiReadablePath(input);
    if (this.request.activeFile?.toLowerCase().endsWith('handling.meta')) {
      return assertAiReadablePath(this.request.activeFile);
    }
    const matches = (await this.listFiles()).filter(
      (file) => file.name.toLowerCase() === 'handling.meta',
    );
    if (matches.length !== 1)
      throw new Error(
        'Specify a handling.meta path because this workspace has multiple candidates.',
      );
    const [match] = matches;
    if (!match) throw new Error('No handling.meta file was found in this workspace.');
    return match.relativePath;
  }
}

function stringInput(input: Record<string, unknown>, key: string, fallback = ''): string {
  return typeof input[key] === 'string' ? input[key] : fallback;
}
