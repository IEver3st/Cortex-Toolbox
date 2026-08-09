import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AccountStatus } from '../src/shared/contracts';

async function seedEstablishedProfile(userData: string): Promise<void> {
  const configPath = path.join(userData, 'config.json');
  try {
    await readFile(configPath, 'utf8');
  } catch {
    await mkdir(userData, { recursive: true });
    await writeFile(configPath, JSON.stringify({ preferences: { onboardingVersion: 1 } }), 'utf8');
  }
}

const launch = async (options: { fresh?: boolean } = {}) => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-e2e-profile-'));
  if (!options.fresh) await seedEstablishedProfile(userData);
  return electron.launch({
    args: ['apps/desktop', `--user-data-dir=${userData}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
};

const launchWithProfile = async (userData: string, options: { fresh?: boolean } = {}) => {
  if (!options.fresh) await seedEstablishedProfile(userData);
  return electron.launch({
    args: ['apps/desktop', `--user-data-dir=${userData}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
};

async function mockAccountStatus(app: ElectronApplication, status: AccountStatus): Promise<void> {
  await app.evaluate(({ BrowserWindow, ipcMain }, nextStatus) => {
    ipcMain.removeHandler('account:status');
    ipcMain.handle('account:status', () => ({ ok: true, data: nextStatus }));
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('account:changed', nextStatus);
    }
  }, status);
}

function paidAccountStatus(): AccountStatus {
  return {
    configured: true,
    cloudConfigured: true,
    status: 'signed-in',
    identity: {
      id: 'user_ai_e2e',
      email: 'ai-e2e@example.com',
      displayName: 'AI E2E',
      avatarUrl: null,
    },
    plan: 'pro',
    billing: {
      interval: 'month',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
      renewsAt: '2026-09-09T00:00:00.000Z',
      stripeCustomerPresent: true,
      paymentFailed: false,
    },
    ai: {
      entitled: true,
      enabled: true,
      usage: { percent: 12, state: 'plenty', resetsAt: '2026-09-09T00:00:00.000Z' },
      limits: { concurrentRuns: 2 },
    },
    message: null,
  };
}

async function captureVisualQa(
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  name: string,
): Promise<void> {
  const directory = process.env.CORTEX_VISUAL_QA_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
}

test('fresh install completes optional-AI onboarding and persists canonical appearance', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-onboarding-profile-'));
  const app = await launchWithProfile(userData, { fresh: true });
  const page = await app.firstWindow();
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) =>
    console.error(`[renderer:error] ${error.stack ?? error.message}`),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByRole('heading', { name: 'Free tools for people who make things.' }),
  ).toBeVisible();
  await expect(page.locator('.onboarding-stage')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Make the workbench yours.' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.getByRole('combobox', { name: 'Cortex theme' }).click();
  await page.getByRole('option', { name: /Graphite/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Use Cortex AI?' })).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your workbench is set.' })).toBeVisible();
  await expect(
    page.locator('.onboarding-summary > span').filter({ hasText: 'Cortex AI' }),
  ).toContainText('Off');
  await page.getByRole('button', { name: 'Open Cortex Toolbox' }).click();
  await expect(page.getByRole('heading', { name: 'Open your first workspace' })).toBeVisible();
  await app.close();

  const relaunched = await launchWithProfile(userData);
  const relaunchedPage = await relaunched.firstWindow();
  await expect(relaunchedPage.getByRole('dialog', { name: 'Cortex setup' })).toHaveCount(0);
  await expect(relaunchedPage.locator('html')).toHaveAttribute('data-theme', 'graphite');
  await expect(
    relaunchedPage.getByRole('heading', { name: 'Open your first workspace' }),
  ).toBeVisible();
  await relaunched.close();
});

test('AI onboarding preserves account intent and persists reasoning and permissions', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-onboarding-ai-profile-'));
  const app = await launchWithProfile(userData, { fresh: true });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Enable Cortex AI' }).click();
  await expect(page.getByText('Sign in for Cortex AI', { exact: true })).toBeVisible();
  await expect(page.getByText('Hosted AI is paid and optional', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Advanced' }).click();
  await page.getByRole('button', { name: 'Approve all' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.locator('.onboarding-summary > span').filter({ hasText: 'Cortex AI' }),
  ).toContainText('Enabled · sign in required');
  await page.getByRole('button', { name: 'Open Cortex Toolbox' }).click();
  const stored = await page.evaluate(() => window.cortex.settings.get());
  expect(stored).toMatchObject({
    ok: true,
    data: {
      aiEnabled: true,
      reasoningMode: 'advanced',
      aiWorkspaceAccess: 'approve-all',
      onboardingVersion: 1,
    },
  });
  await app.close();
});

test('established install opens the local workspace model without forced onboarding', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole('dialog', { name: 'Cortex setup' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Open your first workspace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open a folder' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await app.close();
});

test('settings expose useful local preferences and auto-save', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.locator('.cursor-settings')).toBeAttached();
  const settingsButton = page.getByRole('button', { name: 'Settings' });
  await settingsButton.evaluate((button) =>
    button.addEventListener(
      'click',
      () => {
        document.documentElement.dataset.e2eNavigationStartedAt = String(performance.now());
      },
      { once: true },
    ),
  );
  await settingsButton.click();
  await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  const settingsOpenElapsed = await page.evaluate(
    () => performance.now() - Number(document.documentElement.dataset.e2eNavigationStartedAt ?? 0),
  );
  console.log(`Settings opened in ${settingsOpenElapsed.toFixed(1)} ms`);
  expect(settingsOpenElapsed).toBeLessThan(300);
  await expect(page.getByRole('button', { name: 'Back to app' })).toBeVisible();

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByRole('switch', { name: 'Enable Cortex AI' }).click();
  await expect(page.getByRole('heading', { name: 'Reasoning' })).toBeVisible();
  const reasoningMode = page.getByRole('combobox', { name: 'Default reasoning' });
  await expect(reasoningMode).toHaveText('Fast');
  await reasoningMode.click();
  await page.getByRole('option', { name: 'Advanced', exact: true }).click();
  await expect(reasoningMode).toHaveText('Advanced');
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'settings-ai-reasoning-1440x900');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const mobileSettingsHeader = await page.locator('.cursor-settings-main-header').boundingBox();
  const mobileSettingsActions = await page.locator('.cursor-settings-main-actions').boundingBox();
  const mobileFirstCard = await page.locator('.settings-card').first().boundingBox();
  if (!mobileSettingsHeader || !mobileSettingsActions || !mobileFirstCard) {
    throw new Error('Compact settings header bounds were not rendered.');
  }
  expect(mobileSettingsHeader.y + mobileSettingsHeader.height).toBeLessThanOrEqual(
    mobileFirstCard.y,
  );
  expect(mobileSettingsActions.y + mobileSettingsActions.height).toBeLessThanOrEqual(
    mobileFirstCard.y,
  );
  await captureVisualQa(page, 'settings-ai-reasoning-390x844');
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole('button', { name: 'Privacy and data' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy and data' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data handling' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Application' })).toBeHidden();

  await page.getByRole('button', { name: 'About' }).click();
  await expect(page.getByRole('heading', { name: 'About', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Application' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
  await page.getByRole('button', { name: 'Modules' }).click();

  await page.getByRole('button', { name: 'Editor' }).click();
  const fontSize = page.getByRole('combobox', { name: 'Code font size' });
  await expect(fontSize).toHaveText('14px');
  await fontSize.click();
  await page.getByRole('option', { name: '15px', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--editor-font-size')),
    )
    .toBe('15px');
  await fontSize.click();
  await page.getByRole('option', { name: '14px', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--editor-font-size')),
    )
    .toBe('14px');

  const backButton = page.getByRole('button', { name: 'Back to app' });
  await backButton.evaluate((button) =>
    button.addEventListener(
      'click',
      () => {
        document.documentElement.dataset.e2eNavigationStartedAt = String(performance.now());
      },
      { once: true },
    ),
  );
  await backButton.click();
  await expect(page.locator('.launchpad')).toBeVisible();
  const appReturnElapsed = await page.evaluate(
    () => performance.now() - Number(document.documentElement.dataset.e2eNavigationStartedAt ?? 0),
  );
  console.log(`Settings returned to app in ${appReturnElapsed.toFixed(1)} ms`);
  expect(appReturnElapsed).toBeLessThan(300);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Editor', level: 1 })).toBeVisible();
  await app.close();
});

test('theme choice persists across restart', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-e2e-profile-'));
  const launchWithProfile = async () => {
    await seedEstablishedProfile(userData);
    return electron.launch({
      args: ['apps/desktop', `--user-data-dir=${userData}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
  };

  const app = await launchWithProfile();
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('combobox', { name: 'Palette' }).click();
  await page.getByRole('option', { name: /Graphite/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite');
  await page.waitForTimeout(500);
  await app.close();

  const relaunch = await launchWithProfile();
  const relaunched = await relaunch.firstWindow();
  await expect(relaunched.locator('html')).toHaveAttribute('data-theme', 'graphite');
  await relaunch.close();
});

test('Pulse presets and preview preferences persist across restart', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-e2e-profile-'));
  const launchWithProfile = async () => {
    await seedEstablishedProfile(userData);
    return electron.launch({
      args: ['apps/desktop', `--user-data-dir=${userData}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
  };

  const app = await launchWithProfile();
  const page = await app.firstWindow();
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) =>
    console.error(`[renderer:error] ${error.stack ?? error.message}`),
  );
  await page.getByRole('button', { name: 'Pulse' }).click();
  await page.getByLabel('Name').fill('Fleet baseline');
  await page.getByRole('switch', { name: 'Light bloom' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fleet baseline 600 BPM' })).toBeVisible();
  await page.waitForTimeout(300);
  await app.close();

  const relaunch = await launchWithProfile();
  const relaunched = await relaunch.firstWindow();
  await relaunched.getByRole('button', { name: 'Pulse' }).click();
  await expect(relaunched.getByLabel('Name')).toHaveValue('Fleet baseline');
  await expect(relaunched.getByRole('switch', { name: 'Light bloom' })).toBeChecked();
  await relaunched.getByLabel('Name').fill('Temporary edit');
  await relaunched.getByRole('button', { name: 'Fleet baseline 600 BPM' }).click();
  await expect(relaunched.getByLabel('Name')).toHaveValue('Fleet baseline');
  await relaunch.close();
});

test('opens, audits, edits, and packages a resource end to end', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-e2e-'));
  const resourceRoot = path.join(temporary, 'hello-cortex');
  const archivePath = path.join(temporary, 'hello-cortex.zip');
  await cp('packages/test-fixtures/resources/hello-cortex', resourceRoot, { recursive: true });
  const app = await launch();
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [paths.root] });
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: paths.archive });
    },
    { root: resourceRoot, archive: archivePath },
  );
  const page = await app.firstWindow();
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) =>
    console.error(`[renderer:error] ${error.stack ?? error.message}`),
  );

  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await expect(page.getByRole('heading', { name: 'hello-cortex' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Manifest summary' })).toBeVisible();

  await page.getByRole('button', { name: 'Index', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Manifest Lua source' });
  await editor.click({ position: { x: 120, y: 80 } });
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(
    "fx_version 'cerulean'\ngame 'gta5'\ndescription 'Edited safely by Cortex E2E'\nclient_script 'client/main.lua'\nserver_script 'server/main.lua'\n",
  );
  await page.getByRole('button', { name: 'Review & save' }).click();
  const reviewDialog = page.getByRole('dialog', { name: 'Review & save' });
  await expect(reviewDialog).toBeVisible();
  await reviewDialog.getByRole('button', { name: 'Save manifest' }).click();
  await expect(reviewDialog).toBeHidden();
  await expect
    .poll(async () => readFile(path.join(resourceRoot, 'fxmanifest.lua'), 'utf8'))
    .toContain('Edited safely by Cortex E2E');

  await page.getByRole('button', { name: 'Sentinel', exact: true }).click();
  await page.getByRole('button', { name: 'Run validation' }).click();
  await expect(page.getByText('Ready to release').first()).toBeVisible();

  await page.getByRole('button', { name: 'Bundle', exact: true }).click();
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(
    page.locator('.preview-files code').filter({ hasText: 'fxmanifest.lua' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Choose output and build' }).click();
  await expect(page.getByText('Build hello-cortex.zip', { exact: true })).toBeVisible();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => readFile(archivePath).then((buffer) => buffer.subarray(0, 2).toString()))
    .toBe('PK');
  await app.close();
});

test('standalone creative modules work without an open workspace', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) =>
    console.error(`[renderer:error] ${error.stack ?? error.message}`),
  );

  await page.getByRole('button', { name: 'Pulse' }).click();
  await expect(page.getByText('Pulse siren patterns', { exact: true })).toBeVisible();
  const steps = page.getByRole('gridcell');
  await expect(steps).toHaveCount(768);
  await expect(page.locator('.pulse-lightbar button')).toHaveCount(24);
  const first = steps.first();
  const selected = await first.getAttribute('aria-selected');
  await first.click();
  await expect(first).toHaveAttribute('aria-selected', selected === 'true' ? 'false' : 'true');
  await page.getByRole('switch', { name: 'Light bloom' }).click();
  await expect(page.getByRole('switch', { name: 'Light bloom' })).toBeChecked();
  await page.getByLabel('Name').fill('Pack baseline');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pack baseline 600 BPM' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'carcols.meta' })).toBeVisible();

  await page.getByRole('button', { name: 'Chassis' }).click();
  await expect(page.getByRole('heading', { name: 'Open a workspace first' })).toBeVisible();

  await page.getByRole('button', { name: 'Align' }).click();
  await expect(
    page.getByRole('main').getByText('Align metadata repair', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose metadata' })).toBeVisible();

  await page.getByRole('button', { name: 'Chevron', exact: true }).click();
  await expect(page.getByRole('main').getByText('Chevron Builder', { exact: true })).toBeVisible();
  const canvas = page.locator('.chevron-canvas-stage canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL().length))
    .toBeGreaterThan(500);
  await page.getByRole('button', { name: /Recovery amber/i }).click();
  await expect(page.getByRole('textbox', { name: 'Stripe A', exact: true })).toHaveValue('#EE9E2D');
  await page.getByRole('button', { name: 'Flashlight' }).click();
  await expect(page.getByRole('button', { name: 'Flashlight' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.chevron-canvas-stage').hover({ position: { x: 160, y: 120 } });
  await expect(page.locator('.chevron-spotlight-overlay.is-engaged')).toBeVisible();
  await page.getByRole('button', { name: 'Mask', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mask', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
  await app.close();
});

test('Chassis auto-loads handling.meta and saves the original file with Ctrl+S', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-chassis-e2e-'));
  const resourceRoot = path.join(temporary, 'vehicle-resource');
  await cp(
    'packages/test-fixtures/vehicle-meta-repair-suite/fixed_reference/07_vehicles_handling_id_mismatch',
    resourceRoot,
    { recursive: true },
  );
  const initialFiles = (await readdir(resourceRoot)).sort();
  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();
  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await expect(page.getByRole('heading', { name: 'vehicle-resource' })).toBeVisible();

  await page.getByRole('button', { name: 'Chassis' }).click();
  await expect(page.getByTitle('handling.meta')).toBeVisible();
  await expect(page.getByText('CORTEX_TEST', { exact: true })).toBeVisible();
  const saveState = page.locator('.chassis-save-state');
  await expect(saveState).toContainText('Loaded from disk');
  await expect(page.getByRole('navigation', { name: 'Chassis sections' })).toBeVisible();

  const mass = page.getByRole('spinbutton', { name: 'Mass', exact: true });
  await expect(mass).toHaveValue('1500');
  await mass.fill('9876.5');
  await expect(saveState).toContainText('Modified');
  await page.keyboard.press('Control+S');
  await expect
    .poll(async () => readFile(path.join(resourceRoot, 'handling.meta'), 'utf8'))
    .toMatch(/<fMass value="9876\.5/);
  await expect(saveState).toContainText('Saved');
  await expect(page.getByRole('dialog', { name: 'Review & save' })).toHaveCount(0);

  await mass.fill('4321');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => readFile(path.join(resourceRoot, 'handling.meta'), 'utf8'))
    .toMatch(/<fMass value="4321/);
  await mass.fill('5000');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(mass).toHaveValue('4321');

  const backups = await readdir(path.join(resourceRoot, '.cortex', 'backups'), {
    recursive: true,
  });
  expect(backups.some((entry) => entry.replaceAll('\\', '/').endsWith('/handling.meta'))).toBe(
    true,
  );
  const finalFiles = (await readdir(resourceRoot))
    .filter((entry) => entry !== '.cortex' && entry !== '.cortex-write.lock')
    .sort();
  expect(finalFiles).toEqual(initialFiles);

  await app.close();
});

test('Chassis creates only an explicit handling.meta and immediately edits it', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-chassis-create-e2e-'));
  const resourceRoot = path.join(temporary, 'new-vehicle');
  await mkdir(resourceRoot, { recursive: true });
  await writeFile(
    path.join(resourceRoot, 'fxmanifest.lua'),
    "fx_version 'cerulean'\ngame 'gta5'\n",
    'utf8',
  );
  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();
  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await page.getByRole('button', { name: 'Chassis' }).click();
  await expect(page.getByRole('heading', { name: 'No handling.meta found' })).toBeVisible();
  await page.getByRole('button', { name: 'Create handling', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Create handling' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Handling name').fill('FRESH_BUILD');
  await dialog.getByLabel('Workspace path').fill('data/handling.meta');
  await dialog.getByRole('button', { name: 'Create handling', exact: true }).click();

  await expect(page.getByText('FRESH_BUILD', { exact: true })).toBeVisible();
  await expect(page.getByTitle('data/handling.meta')).toBeVisible();
  const created = await readFile(path.join(resourceRoot, 'data', 'handling.meta'), 'utf8');
  expect(created).toContain('<handlingName>FRESH_BUILD</handlingName>');
  expect((await readdir(path.join(resourceRoot, 'data'))).sort()).toEqual(['handling.meta']);

  const mass = page.getByRole('spinbutton', { name: 'Mass', exact: true });
  await mass.fill('1735.25');
  await page.keyboard.press('Control+S');
  await expect
    .poll(async () => readFile(path.join(resourceRoot, 'data', 'handling.meta'), 'utf8'))
    .toMatch(/<fMass value="1735\.25/);
  const backups = await readdir(path.join(resourceRoot, '.cortex', 'backups'), {
    recursive: true,
  });
  expect(backups.some((entry) => entry.replaceAll('\\', '/').endsWith('/data/handling.meta'))).toBe(
    true,
  );
  await app.close();
});

test('Chassis selects multiple handling files and entries and warns on external changes', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-chassis-multiple-e2e-'));
  const resourceRoot = path.join(temporary, 'multi-pack');
  await mkdir(path.join(resourceRoot, 'data'), { recursive: true });
  const entry = (name: string, mass: number) => `    <Item type="CHandlingData">
      <handlingName>${name}</handlingName>
      <fMass value="${mass}" />
      <vecCentreOfMassOffset x="0" y="0" z="-0.25" />
      <vecInertiaMultiplier x="1" y="1.4" z="1.6" />
    </Item>`;
  const document = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<CHandlingDataMgr>
  <HandlingData>
${items.join('\n')}
  </HandlingData>
</CHandlingDataMgr>
`;
  const rootSource = document([
    entry('FIRST_ENTRY', 1400),
    entry('VERY_LONG_POLICE_INTERCEPTOR_HANDLING_NAME', 2200),
  ]);
  const nestedSource = document([entry('NESTED_ENTRY', 3100)]);
  await writeFile(path.join(resourceRoot, 'handling.meta'), rootSource, 'utf8');
  await writeFile(path.join(resourceRoot, 'data', 'handling.meta'), nestedSource, 'utf8');
  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();
  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await page.getByRole('button', { name: 'Chassis' }).click();

  const fileSelect = page.getByRole('combobox', { name: 'Handling file' });
  await expect(fileSelect).toBeVisible();
  await fileSelect.click();
  await page.getByRole('option', { name: 'handling.meta', exact: true }).click();
  const entrySelect = page.getByRole('combobox', { name: 'Handling entry' });
  await expect(entrySelect).toBeVisible();
  await entrySelect.click();
  await page.getByRole('option', { name: 'VERY_LONG_POLICE_INTERCEPTOR_HANDLING_NAME' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Mass', exact: true })).toHaveValue('2200');
  await page.setViewportSize({ width: 1440, height: 900 });
  const handlingEditor = page.getByRole('region', { name: 'Handling parameter editor' });
  expect(
    await handlingEditor.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'chassis-long-entry-1440x900');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await captureVisualQa(page, 'chassis-wide-1920x1080');

  await fileSelect.click();
  await page.getByRole('option', { name: 'data/handling.meta' }).click();
  await expect(page.getByText('NESTED_ENTRY', { exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Mass', exact: true })).toHaveValue('3100');

  const external = nestedSource.replace('value="3100"', 'value="3333"');
  await writeFile(path.join(resourceRoot, 'data', 'handling.meta'), external, 'utf8');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('handling.meta changed on disk');
  await page.setViewportSize({ width: 980, height: 720 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await expect(page.getByRole('complementary', { name: 'Derived behavior profile' })).toBeHidden();
  expect(
    await handlingEditor.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'chassis-external-change-980x720');
  await page.getByRole('button', { name: 'Compare', exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: 'External handling.meta changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Mass', exact: true })).toHaveValue('3333');
  await app.close();
});

test('Cortex AI remains optional and Account remains available while logged out', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-ai-settings-e2e-'));
  const resourceRoot = path.join(temporary, 'hello-cortex');
  await cp('packages/test-fixtures/resources/hello-cortex', resourceRoot, { recursive: true });
  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();
  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await expect(page.getByRole('heading', { name: 'hello-cortex' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cortex AI' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  const enableAi = page.getByRole('switch', { name: 'Enable Cortex AI' });
  await expect(enableAi).not.toBeChecked();
  await expect(page.getByText('Cortex AI is off.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign in to manage Cortex AI and billing' }),
  ).toBeVisible();
  await expect(
    page.getByText('Toolbox and every local workflow remain free', { exact: false }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await enableAi.click();
  await page.getByRole('button', { name: 'Back to app' }).click();
  const aiButton = page.getByRole('button', { name: 'Cortex AI' });
  await expect(aiButton).toBeVisible();
  await aiButton.click();
  await expect(
    page.getByRole('complementary', { name: 'Cortex AI workspace panel' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to use Cortex AI' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Ask Cortex about this workspace' })).toHaveCount(
    0,
  );

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByRole('switch', { name: 'Enable Cortex AI' }).click();
  await expect(page.getByRole('complementary', { name: 'Cortex AI workspace panel' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Back to app' }).click();
  await expect(page.getByRole('button', { name: 'Cortex AI' })).toHaveCount(0);

  await app.close();
});

test('Account renders expired, Free, Creator recovery, and Pro states from authoritative status', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  const darkApplied = await page.evaluate(async () => {
    const current = await window.cortex.settings.get();
    if (!current.ok) return false;
    const result = await window.cortex.settings.set({ ...current.data, colorMode: 'dark' });
    return result.ok;
  });
  expect(darkApplied).toBe(true);
  const base: Pick<AccountStatus, 'configured' | 'cloudConfigured'> = {
    configured: true,
    cloudConfigured: true,
  };
  await mockAccountStatus(app, {
    ...base,
    status: 'expired',
    identity: null,
    plan: null,
    billing: null,
    ai: null,
    message: 'Refresh token expired.',
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Cortex session expired' })).toBeVisible();
  await expect(
    page.getByText('Toolbox and every local workflow remain free', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.settings-account-mark img')).toHaveAttribute('src', /icon.*\.png/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureVisualQa(page, 'account-signed-out-1440x900');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 390);
  await captureVisualQa(page, 'account-signed-out-390x844');
  await page.setViewportSize({ width: 1280, height: 800 });

  const identity = {
    id: 'user_e2e',
    email: 'jayson@example.com',
    displayName: 'Jayson D',
    avatarUrl: 'https://lh3.googleusercontent.com/a/cortex-e2e=s96-c',
  };
  await page.route(identity.avatarUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#9fbc6b"/><circle cx="16" cy="13" r="6" fill="#253036"/><path d="M7 29c1-6 5-9 9-9s8 3 9 9" fill="#253036"/></svg>',
    }),
  );
  const periodEnd = '2026-09-09T00:00:00.000Z';
  await mockAccountStatus(app, {
    ...base,
    status: 'signed-in',
    identity,
    plan: 'free',
    billing: {
      interval: null,
      subscriptionStatus: 'none',
      cancelAtPeriodEnd: false,
      renewsAt: null,
      stripeCustomerPresent: false,
      paymentFailed: false,
    },
    ai: {
      entitled: false,
      enabled: false,
      usage: { percent: 0, state: 'used', resetsAt: null },
      limits: { concurrentRuns: 0 },
    },
    message: null,
  });
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByText('Jayson D', { exact: true })).toBeVisible();
  await expect(page.locator('.settings-account-avatar img')).toHaveAttribute(
    'src',
    identity.avatarUrl,
  );
  await expect
    .poll(() =>
      page.locator('.settings-account-avatar img').evaluate((image) => {
        const avatar = image as HTMLImageElement;
        return avatar.complete && avatar.naturalWidth > 0;
      }),
    )
    .toBe(true);
  await expect(page.locator('.settings-account-avatar img')).toHaveClass(/is-loaded/);
  await expect(page.getByText('Free', { exact: true })).toBeVisible();
  await expect(page.getByText('Not included', { exact: true })).toBeVisible();
  await expect(page.getByText('Upgrade required', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View plans' }).click();
  await expect(page.getByText('$7.99 monthly', { exact: true })).toBeVisible();
  await expect(page.getByText('$14.99 monthly', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await captureVisualQa(page, 'account-free-1280x800');

  const unavailableAvatarUrl = 'https://lh3.googleusercontent.com/a/cortex-e2e-missing=s96-c';
  await page.route(unavailableAvatarUrl, (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }),
  );
  await mockAccountStatus(app, {
    ...base,
    status: 'signed-in',
    identity: { ...identity, avatarUrl: unavailableAvatarUrl },
    plan: 'free',
    billing: {
      interval: null,
      subscriptionStatus: 'none',
      cancelAtPeriodEnd: false,
      renewsAt: null,
      stripeCustomerPresent: false,
      paymentFailed: false,
    },
    ai: {
      entitled: false,
      enabled: false,
      usage: { percent: 0, state: 'used', resetsAt: null },
      limits: { concurrentRuns: 0 },
    },
    message: null,
  });
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.locator('.settings-account-avatar-fallback')).toHaveText('JD');
  await expect(page.locator('.settings-account-avatar-fallback')).toBeVisible();
  await expect
    .poll(async () => {
      const image = page.locator('.settings-account-avatar img');
      return (await image.count()) === 0
        ? '0'
        : image.evaluate((element) => getComputedStyle(element).opacity);
    })
    .toBe('0');
  await captureVisualQa(page, 'account-avatar-fallback-1280x800');

  await mockAccountStatus(app, {
    ...base,
    status: 'signed-in',
    identity,
    plan: 'creator',
    billing: {
      interval: 'year',
      subscriptionStatus: 'past_due',
      cancelAtPeriodEnd: true,
      renewsAt: '2026-09-09T00:00:00.000Z',
      stripeCustomerPresent: true,
      paymentFailed: true,
    },
    ai: {
      entitled: true,
      enabled: true,
      usage: { percent: 84, state: 'nearing', resetsAt: periodEnd },
      limits: { concurrentRuns: 1 },
    },
    message: null,
  });
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByText('AI Creator', { exact: true })).toBeVisible();
  await expect(page.getByText('We couldn’t process your latest payment.')).toBeVisible();
  const cancellationDate = await page.evaluate(
    (value) =>
      new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(value)),
    periodEnd,
  );
  await expect(
    page.getByText(`Cancels ${cancellationDate}. Access continues until then.`),
  ).toBeVisible();
  await expect(page.getByText('84% used', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Upgrade to Pro/ })).toBeVisible();
  await captureVisualQa(page, 'account-creator-past-due-1280x800');

  await mockAccountStatus(app, {
    ...base,
    status: 'signed-in',
    identity,
    plan: 'pro',
    billing: {
      interval: 'month',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
      renewsAt: '2026-09-08T00:00:00.000Z',
      stripeCustomerPresent: true,
      paymentFailed: false,
    },
    ai: {
      entitled: true,
      enabled: true,
      usage: { percent: 47, state: 'normal', resetsAt: periodEnd },
      limits: { concurrentRuns: 2 },
    },
    message: null,
  });
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByText('AI Pro', { exact: true })).toBeVisible();
  await expect(page.getByText('47% used', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage billing' })).toBeVisible();
  await captureVisualQa(page, 'account-pro-1280x800');
  await app.close();
});

test('Cortex AI streams tool activity, renders a proposal, and persists panel width', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-ai-panel-e2e-'));
  const resourceRoot = path.join(temporary, 'hello-cortex');
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-ai-panel-profile-'));
  await cp('packages/test-fixtures/resources/hello-cortex', resourceRoot, { recursive: true });
  const app = await launchWithProfile(userData);
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();
  await mockAccountStatus(app, paidAccountStatus());
  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  const darkApplied = await page.evaluate(async () => {
    const current = await window.cortex.settings.get();
    if (!current.ok) return false;
    const result = await window.cortex.settings.set({
      ...current.data,
      colorMode: 'dark',
      reducedMotion: true,
    });
    return result.ok;
  });
  expect(darkApplied).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByRole('switch', { name: 'Enable Cortex AI' }).click();
  await page.getByRole('button', { name: 'Back to app' }).click();
  await page.getByRole('button', { name: 'Cortex AI' }).click();

  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    ipcMain.removeHandler('ai:chat-start');
    ipcMain.handle('ai:chat-start', () => {
      const runId = 'e2e-stream-run';
      const send = (payload: unknown) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('ai:stream', payload);
      setTimeout(() => send({ runId, type: 'started' }), 20);
      setTimeout(
        () =>
          send({
            runId,
            type: 'tool',
            activity: {
              id: 'activity-read',
              tool: 'read_workspace_file',
              label: 'Read handling.meta',
              status: 'complete',
              summary: 'Inspected the active handling entry.',
            },
          }),
        50,
      );
      setTimeout(
        () =>
          send({
            runId,
            type: 'proposal',
            proposal: {
              id: 'proposal-e2e',
              title: 'Stabilise the vehicle response',
              summary: 'A focused source change prepared for review. Nothing has been written.',
              createdAt: new Date().toISOString(),
              files: [
                {
                  relativePath: 'client.lua',
                  beforeHash: '0'.repeat(64),
                  beforeSource: "local stability = 0.2\nprint('baseline')\n",
                  afterSource:
                    "local stability = 0.58\nlocal yawDamping = 1.7\nprint('stability tuned', yawDamping)\n",
                },
              ],
              handlingPatch: null,
              status: 'proposed',
            },
          }),
        80,
      );
      setTimeout(
        () =>
          send({
            runId,
            type: 'delta',
            text: 'I found two interacting stability issues. The proposed change keeps the adjustment narrow and reviewable.',
          }),
        100,
      );
      setTimeout(() => send({ runId, type: 'complete' }), 130);
      return { ok: true, data: { runId } };
    });
  });
  const composer = page.getByRole('textbox', { name: 'Ask Cortex about this workspace' });
  await composer.fill('Diagnose this workspace');
  await page.getByRole('button', { name: 'Send to Cortex' }).click();
  await page.getByText('Workspace activity', { exact: true }).click();
  await expect(page.getByText('Read handling.meta', { exact: true })).toBeVisible();
  await expect(
    page.getByText('I found two interacting stability issues.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Stabilise the vehicle response', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review changes' })).toBeVisible();

  const panel = page.getByRole('complementary', { name: 'Cortex AI workspace panel' });
  const initialWidth = (await panel.boundingBox())?.width ?? 0;
  const handle = page.getByRole('separator', { name: 'Resize Cortex AI panel' });
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('AI panel resize handle was not rendered.');
  await page.mouse.move(handleBox.x + 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 120, handleBox.y + handleBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initialWidth + 90);
  const resizedWidth = (await panel.boundingBox())?.width ?? 0;
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'ai-stream-proposal-1440x900');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await captureVisualQa(page, 'ai-stream-proposal-1920x1080');
  await page.waitForTimeout(300);
  await app.close();

  const relaunched = await launchWithProfile(userData);
  const relaunchedPage = await relaunched.firstWindow();
  await mockAccountStatus(relaunched, paidAccountStatus());
  await relaunched.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const openFolder = relaunchedPage
    .getByRole('main')
    .getByRole('button', { name: 'Open a folder' });
  if (await openFolder.isVisible()) {
    await openFolder.click();
  } else {
    await relaunchedPage.getByRole('button', { name: 'Open', exact: true }).first().click();
  }
  await expect(relaunchedPage.getByRole('heading', { name: 'hello-cortex' })).toBeVisible();
  await relaunchedPage.getByRole('button', { name: 'Cortex AI' }).click();
  const persistedWidth =
    (
      await relaunchedPage
        .getByRole('complementary', { name: 'Cortex AI workspace panel' })
        .boundingBox()
    )?.width ?? 0;
  expect(Math.abs(persistedWidth - resizedWidth)).toBeLessThanOrEqual(3);
  await relaunched.close();
});
