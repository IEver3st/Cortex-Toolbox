import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('overview survives activity history and renders sections', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-overview-debug-'));
  const app = await electron.launch({
    args: ['apps/desktop', `--user-data-dir=${userData}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.evaluate(() => {
    localStorage.setItem(
      'cortex.activityHistory',
      JSON.stringify([
        {
          id: '1',
          tool: 'probe',
          workspaceRoot: 'C:\\test',
          workspaceName: 'test',
          at: new Date().toISOString(),
          status: 'success',
          summary: '3 scripts indexed',
          navigate: { kind: 'probe', tabLabel: 'Probe' },
        },
        {
          id: '2',
          tool: 'badtool',
          workspaceRoot: 'C:\\test2',
          workspaceName: 'test2',
          at: new Date().toISOString(),
          status: 'success',
          summary: 'corrupt entry',
          navigate: { kind: 'probe', tabLabel: 'Probe' },
        },
      ]),
    );
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'What are you working on?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continue working' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();

  if (errors.length) {
    throw new Error(`Page errors: ${errors.join(' | ')}`);
  }

  await app.close();
});
