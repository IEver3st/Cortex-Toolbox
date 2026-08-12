import { createHash } from 'node:crypto';
import { aiChangeProposalSchema, type AiChangeProposal, type AiFileChange } from './contracts';
import { assertAiReadablePath } from './paths';

export function hashAiSource(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

export function createAiFileChange(input: {
  relativePath: string;
  beforeSource: string;
  afterSource: string;
}): AiFileChange {
  const relativePath = assertAiReadablePath(input.relativePath);
  if (input.beforeSource === input.afterSource) {
    throw new Error('An AI file change must modify the source.');
  }
  return {
    relativePath,
    beforeHash: hashAiSource(input.beforeSource),
    beforeSource: input.beforeSource,
    afterSource: input.afterSource,
  };
}

export function validateAiChangeProposal(proposal: AiChangeProposal): AiChangeProposal {
  const parsed = aiChangeProposalSchema.parse(proposal);
  const paths = new Set<string>();
  for (const file of parsed.files) {
    const path = assertAiReadablePath(file.relativePath);
    if (paths.has(path.toLowerCase())) throw new Error(`Duplicate AI patch target: ${path}`);
    paths.add(path.toLowerCase());
    if (file.beforeHash !== hashAiSource(file.beforeSource)) {
      throw new Error(`AI patch baseline hash does not match ${path}.`);
    }
    if (file.beforeSource === file.afterSource) {
      throw new Error(`AI patch for ${path} does not contain a change.`);
    }
  }
  return parsed;
}
