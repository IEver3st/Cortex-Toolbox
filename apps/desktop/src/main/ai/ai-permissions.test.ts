import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAiFileChange } from '@cortex/ai/patches';
import { DEFAULT_PREFERENCES } from '../../shared/contracts';
import { CortexAiService } from './ai-service';

async function fixture(access: 'ask-before-changes' | 'approve-all') {
  const root = await mkdtemp(path.join(tmpdir(), 'cortex-ai-permission-'));
  const beforeSource = 'local value = 1\n';
  await writeFile(path.join(root, 'client.lua'), beforeSource, 'utf8');
  const planWrite = vi.fn(() => Promise.resolve('reviewed-plan-1'));
  const applyWritePlans = vi.fn(() => Promise.resolve(['client.lua']));
  const send = vi.fn<(channel: string, payload: unknown) => void>();
  const service = new CortexAiService(
    () => ({ ...DEFAULT_PREFERENCES, aiEnabled: true, aiWorkspaceAccess: access }),
    () => root,
    () => Promise.resolve([]),
    planWrite,
    applyWritePlans,
    () => Promise.resolve('access-token'),
    'https://cloud.example/',
  );
  const proposal = {
    id: 'proposal-1',
    title: 'Update client value',
    summary: 'A bounded test edit.',
    createdAt: new Date(0).toISOString(),
    files: [
      createAiFileChange({
        relativePath: 'client.lua',
        beforeSource,
        afterSource: 'local value = 2\n',
      }),
    ],
    handlingPatch: null,
    status: 'proposed' as const,
  };
  return {
    root,
    service,
    proposal,
    planWrite,
    applyWritePlans,
    sender: { isDestroyed: () => false, send } as never,
    send,
  };
}

describe('Approve all proposal application', () => {
  it('keeps Ask mode reviewable without applying', async () => {
    const test = await fixture('ask-before-changes');
    await test.service.handleProposal('run-1', test.proposal, test.root, test.sender);
    expect(test.planWrite).not.toHaveBeenCalled();
    expect(test.applyWritePlans).not.toHaveBeenCalled();
    expect(test.send).toHaveBeenCalledTimes(1);
  });

  it('auto-applies only through reviewed write plans in Approve all', async () => {
    const test = await fixture('approve-all');
    await test.service.handleProposal('run-1', test.proposal, test.root, test.sender);
    expect(test.planWrite).toHaveBeenCalledWith('client.lua', 'local value = 2\n');
    expect(test.applyWritePlans).toHaveBeenCalledWith(['reviewed-plan-1']);
    const sent = test.send.mock.calls.at(-1);
    expect(sent?.[0]).toBe('ai:stream');
    expect(sent?.[1]).toMatchObject({ proposal: { status: 'applied' } });
  });

  it.each([
    ['root escape', '../outside.lua'],
    ['sensitive path', '.env'],
  ])('still blocks %s proposals before write planning', async (_label, relativePath) => {
    const test = await fixture('approve-all');
    const [firstFile] = test.proposal.files;
    if (!firstFile) throw new Error('Test proposal is missing its fixture file.');
    const unsafe = {
      ...test.proposal,
      files: [{ ...firstFile, relativePath }],
    };
    await expect(
      test.service.handleProposal('run-1', unsafe, test.root, test.sender),
    ).rejects.toThrow();
    expect(test.planWrite).not.toHaveBeenCalled();
    expect(test.applyWritePlans).not.toHaveBeenCalled();
  });

  it('blocks invalid baselines and external changes before transactions', async () => {
    const test = await fixture('approve-all');
    await writeFile(path.join(test.root, 'client.lua'), 'external change\n', 'utf8');
    await expect(
      test.service.handleProposal('run-1', test.proposal, test.root, test.sender),
    ).rejects.toThrow(/changed since/);
    expect(test.applyWritePlans).not.toHaveBeenCalled();

    const [firstFile] = test.proposal.files;
    if (!firstFile) throw new Error('Test proposal is missing its fixture file.');
    const invalid = {
      ...test.proposal,
      files: [{ ...firstFile, beforeHash: '0'.repeat(64) }],
    };
    await expect(
      test.service.handleProposal('run-2', invalid, test.root, test.sender),
    ).rejects.toThrow(/baseline hash/);
  });
});
