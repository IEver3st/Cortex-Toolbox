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

test('Follow system uses the Electron native color scheme', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();

    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'dark';
    });
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');

    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'light';
    });
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  } finally {
    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'system';
    });
    await app.close();
  }
});

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
  await expect(page.getByRole('heading', { name: 'CORTEX TOOLBOX' })).toBeVisible();
  await expect(
    page.getByText('Free tools for people who make things.', { exact: true }),
  ).toBeVisible();
  const onboardingTitlebar = page.locator('.onboarding-titlebar');
  await expect(onboardingTitlebar).toHaveText('');
  await expect(onboardingTitlebar.getByRole('button', { name: 'Minimize window' })).toBeVisible();
  await expect(onboardingTitlebar.getByRole('button', { name: 'Maximize window' })).toBeVisible();
  await expect(onboardingTitlebar.getByRole('button', { name: 'Close window' })).toBeVisible();
  await expect(page.locator('.onboarding-stage')).toHaveCSS('animation-name', 'none');
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureVisualQa(page, 'onboarding-welcome-1440x900');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'onboarding-welcome-390x844');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Make the toolbox yours.' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.getByRole('combobox', { name: 'Cortex theme' }).click();
  await page.getByRole('option', { name: /Graphite/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite');
  await captureVisualQa(page, 'onboarding-appearance-1440x900');
  await page.setViewportSize({ width: 390, height: 844 });
  await captureVisualQa(page, 'onboarding-appearance-390x844');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Use Cortex AI?' })).toBeVisible();
  await captureVisualQa(page, 'onboarding-ai-disabled-1440x900');
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your toolbox is set.' })).toBeVisible();
  await expect(
    page.locator('.onboarding-summary > span').filter({ hasText: 'Cortex AI' }),
  ).toContainText('Off');
  await captureVisualQa(page, 'onboarding-complete-1440x900');
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
  await captureVisualQa(page, 'onboarding-ai-enabled-1440x900');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Choose reasoning and autonomy.' })).toBeVisible();
  await page.getByRole('button', { name: 'Advanced' }).click();
  await page.getByRole('button', { name: 'Approve all' }).click();
  await captureVisualQa(page, 'onboarding-behaviour-1440x900');
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureVisualQa(page, 'overview-empty-1440x900');
  await app.close();
});

test('compact no-workspace overview keeps its real launchpad content inside the usable area', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 390, height: 844 });
  const title = page.getByRole('heading', { name: 'Open your first workspace' });
  const copy = page.getByText('Choose a project folder and Cortex will detect its structure', {
    exact: false,
  });
  const openFolder = page.getByRole('main').getByRole('button', { name: 'Open a folder' });
  await expect(title).toBeVisible();
  await expect(copy).toBeVisible();
  await expect(openFolder).toBeVisible();

  const usable = await page.locator('.workspace-content').boundingBox();
  if (!usable) throw new Error('Compact workspace bounds were not rendered.');
  for (const locator of [page.locator('.launchpad'), title, copy, openFolder]) {
    const bounds = await locator.boundingBox();
    if (!bounds) throw new Error('An important compact launchpad element was not rendered.');
    expect(bounds.x).toBeGreaterThanOrEqual(usable.x - 1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(usable.x + usable.width + 1);
  }
  await expect(title).not.toHaveCSS('white-space', 'nowrap');
  await captureVisualQa(page, 'overview-empty-390x844');
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureVisualQa(page, 'settings-general-1440x900');

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

test('compact Settings navigates every section and returns to the app with keyboard support', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Settings' }).click();
  const sectionSelector = page.getByRole('combobox', { name: 'Settings section' });
  await expect(sectionSelector).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to app' })).toBeVisible();

  const sections = [
    ['General', 'Interface'],
    ['Appearance', 'Appearance'],
    ['Editor', 'Code editor'],
    ['Modules', 'Available modules'],
    ['Accessibility', 'Motion'],
    ['AI', 'Cortex AI'],
    ['Account', 'Account'],
    ['Privacy and data', 'Data handling'],
    ['Feedback', 'Feedback'],
    ['Sidebar', 'Behavior'],
    ['About', 'Application'],
  ] as const;

  for (const [label, heading] of sections) {
    await sectionSelector.click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await expect(sectionSelector).toHaveText(label);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }

  await sectionSelector.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(sectionSelector).toHaveText('General');
  await expect(page.getByRole('heading', { name: 'Interface', exact: true })).toBeVisible();
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'settings-general-390x844');
  await page.getByRole('button', { name: 'Back to app' }).click();
  await expect(page.getByRole('heading', { name: 'Open your first workspace' })).toBeVisible();
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
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.locator('#pointer-cursor')).toBeAttached();
  const toggleColors = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--cortex-accent)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    const toggleTrack = document.querySelector('#pointer-cursor + .toggle-track');
    if (!toggleTrack) throw new Error('Pointer cursor toggle track was not rendered.');
    const toggle = getComputedStyle(toggleTrack).backgroundColor;
    probe.remove();
    return { accent, toggle };
  });
  expect(toggleColors.toggle).toBe(toggleColors.accent);
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
  await writeFile(
    path.join(resourceRoot, 'fxmanifest.lua'),
    "fx_version 'cerulean'\ngame 'gta5'\nclient_script 'client/missing.lua'\nui_page 'html/missing.html'\nfiles { 'html/missing.html', 'stream/missing.ytyp' }\ndata_file 'DLC_ITYP_REQUEST' 'stream/missing.ytyp'\n",
  );
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
  await expect(page.locator('.brief-skeleton')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureVisualQa(page, 'workspace-overview-1440x900');

  await page.getByRole('button', { name: 'Sentinel', exact: true }).click();
  await page.getByRole('button', { name: 'Run validation' }).click();
  await expect(page.getByText('Declared path not found').first()).toBeVisible();
  await captureVisualQa(page, 'sentinel-broken-1440x900');

  await page.getByRole('button', { name: 'Bundle', exact: true }).click();
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(page.getByText('Release gate blocked.')).toBeVisible();
  await expect(page.getByText(/Manifest ui_page reference.*html\/missing\.html/i)).toBeVisible();
  await expect(
    page.getByText(/Manifest data_file reference.*stream\/missing\.ytyp/i),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose output and build' })).toBeDisabled();
  await captureVisualQa(page, 'bundle-blocked-1440x900');

  await page.getByRole('button', { name: 'Index', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Manifest Lua source' });
  await expect(editor).toBeVisible();
  await captureVisualQa(page, 'index-manifest-1440x900');
  await editor.click();
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
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(page.getByText('Ready to release').first()).toBeVisible();
  await captureVisualQa(page, 'sentinel-clean-1440x900');

  await page.getByRole('button', { name: 'Probe', exact: true }).click();
  await page.getByRole('button', { name: 'Scan resource' }).click();
  await expect(page.getByRole('button', { name: 'Scan again' }).first()).toBeVisible();
  await captureVisualQa(page, 'probe-results-1440x900');

  await page.getByRole('button', { name: 'Bundle', exact: true }).click();
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(
    page.locator('.preview-files code').filter({ hasText: 'fxmanifest.lua' }),
  ).toBeVisible();
  await captureVisualQa(page, 'bundle-clean-1440x900');
  await page.getByRole('button', { name: 'Choose output and build' }).click();
  await expect(page.getByText('Build hello-cortex.zip', { exact: true })).toBeVisible();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => readFile(archivePath).then((buffer) => buffer.subarray(0, 2).toString()))
    .toBe('PK');
  await app.close();
});

test('Index creates a reviewed fxmanifest.lua in a manifest-less resource', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-manifest-create-e2e-'));
  const resourceRoot = path.join(temporary, 'manifest-less-resource');
  await mkdir(path.join(resourceRoot, 'client'), { recursive: true });
  await writeFile(path.join(resourceRoot, 'client', 'main.lua'), 'print("Cortex")\n', 'utf8');

  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();
  page.on('pageerror', (error) =>
    console.error(`[renderer:error] ${error.stack ?? error.message}`),
  );

  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await expect(page.getByRole('heading', { name: 'manifest-less-resource' })).toBeVisible();
  await page.getByRole('button', { name: 'Index', exact: true }).click();
  await expect(page.getByText('No manifest on disk yet')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Manifest Lua source' })).toContainText(
    "fx_version 'cerulean'",
  );
  await page.getByRole('button', { name: 'Review & save' }).click();
  const reviewDialog = page.getByRole('dialog', { name: 'Review & save' });
  await expect(reviewDialog).toContainText('Creating fxmanifest.lua');
  await reviewDialog.getByRole('button', { name: 'Save manifest' }).click();
  await expect(reviewDialog).toBeHidden();
  await expect
    .poll(async () => readFile(path.join(resourceRoot, 'fxmanifest.lua'), 'utf8'))
    .toContain("game 'gta5'");
  await expect(page.getByText('No manifest on disk yet')).toHaveCount(0);
  await app.close();
});

test('Wire reviews a scoped edit and refreshes the graph after a safe write', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-wire-e2e-'));
  const resourceRoot = path.join(temporary, 'hello-cortex');
  await cp('packages/test-fixtures/resources/hello-cortex', resourceRoot, { recursive: true });
  const clientPath = path.join(resourceRoot, 'client', 'main.lua');
  const originalClient = await readFile(clientPath, 'utf8');
  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();

  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await page.getByRole('button', { name: 'Wire', exact: true }).click();
  const clientNode = page.locator('article').filter({ hasText: 'client/main.lua' });
  const editFile = clientNode.getByRole('button', { name: 'Edit main.lua' });
  await expect(editFile).toBeVisible();
  await editFile.click();

  const scopedEditor = page.getByRole('textbox', {
    name: 'Edit main.lua in client/main.lua',
  });
  await expect(scopedEditor).toBeVisible();
  await scopedEditor.fill(
    `${originalClient.trimEnd()}\n\nRegisterCommand('wire_e2e', function() end, false)\n`,
  );
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Apply safely' }).click();
  await expect(page.getByText('Source updated with a recoverable backup.')).toBeVisible();
  await expect.poll(() => readFile(clientPath, 'utf8')).toContain("RegisterCommand('wire_e2e'");

  await page.getByRole('button', { name: 'Visual map' }).click();
  await expect(page.locator('.wire-card').filter({ hasText: 'wire_e2e' })).toBeVisible();
  await captureVisualQa(page, 'wire-refreshed-1440x900');
  await app.close();
});

test('experimental Extensions preview is opt-in, persisted, and remains manifest-only', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-extensions-e2e-'));
  const resourceRoot = path.join(temporary, 'hello-cortex');
  await cp('packages/test-fixtures/resources/hello-cortex', resourceRoot, { recursive: true });
  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();
  const productionCoordinates = await page.evaluate(async () => {
    const result = await window.cortex.account.status();
    return result.ok
      ? { configured: result.data.configured, cloudConfigured: result.data.cloudConfigured }
      : null;
  });
  expect(productionCoordinates).toEqual({ configured: true, cloudConfigured: true });
  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const experimental = page.getByRole('switch', { name: 'Experimental tools' });
  await expect(experimental).not.toBeChecked();
  await experimental.click();
  await expect(experimental).toBeChecked();
  await expect
    .poll(async () => {
      const result = await page.evaluate(() => window.cortex.settings.get());
      return result.ok ? result.data.experimentalTools : false;
    })
    .toBe(true);
  await page.getByRole('button', { name: 'Modules', exact: true }).click();
  await expect(page.getByText('Extensions preview', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Enable Extensions preview' }).click();
  await page.getByRole('button', { name: 'Back to app' }).click();
  await page.getByRole('button', { name: 'Extensions preview' }).click();
  await expect(page.getByRole('heading', { name: 'Discovered manifests' })).toBeVisible();
  await expect(page.getByText('Manifest preview only', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Extension code does not run in version 1.0.', { exact: false }),
  ).toBeVisible();
  await captureVisualQa(page, 'extensions-preview-1440x900');
  await app.close();
});

test('standalone creative modules work without an open workspace', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  const exportRoot = await mkdtemp(path.join(tmpdir(), 'cortex-creative-exports-'));
  const xmlExportPath = path.join(exportRoot, 'carcols.meta');
  const pngExportPath = path.join(exportRoot, 'chevron.png');
  await app.evaluate(
    ({ BrowserWindow }, targets) => {
      const session = BrowserWindow.getAllWindows()[0]?.webContents.session;
      session?.on('will-download', (_event, item) => {
        item.setSavePath(
          item.getFilename().toLowerCase().endsWith('.png') ? targets.png : targets.xml,
        );
      });
    },
    { xml: xmlExportPath, png: pngExportPath },
  );
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) =>
    console.error(`[renderer:error] ${error.stack ?? error.message}`),
  );

  await page.getByRole('button', { name: 'Pulse' }).click();
  await expect(
    page.getByRole('grid', { name: '24 channel, 32 step siren sequencer' }),
  ).toBeVisible();
  const steps = page.getByRole('gridcell');
  await expect(steps).toHaveCount(768);
  await expect(page.locator('.pulse-lightbar button')).toHaveCount(24);
  const first = steps.first();
  const selected = await first.getAttribute('aria-selected');
  await first.click();
  await expect(first).toHaveAttribute('aria-selected', selected === 'true' ? 'false' : 'true');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  const second = steps.nth(1);
  await expect(second).toBeFocused();
  const secondSelected = await second.getAttribute('aria-selected');
  await page.keyboard.press('Space');
  await expect(second).toHaveAttribute(
    'aria-selected',
    secondSelected === 'true' ? 'false' : 'true',
  );
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('.sequencer [role="gridcell"][aria-selected="true"]')).toHaveCount(0);
  await expect(page.getByText('Cleared the sequencer.', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Light bloom' }).click();
  await expect(page.getByRole('switch', { name: 'Light bloom' })).toBeChecked();
  await page.getByLabel('Name').fill('Pack baseline');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pack baseline 600 BPM' })).toBeVisible();
  await page.getByRole('button', { name: 'carcols.meta' }).click();
  await expect
    .poll(async () => {
      try {
        return await readFile(xmlExportPath, 'utf8');
      } catch {
        return '';
      }
    })
    .toContain('<CVehicleModelInfoVarGlobal>');
  const exportedXml = await readFile(xmlExportPath, 'utf8');
  expect(exportedXml).toContain('<CVehicleModelInfoVarGlobal>');
  expect(exportedXml.match(/<lightGroup value=/g)).toHaveLength(24);
  await page.locator('input[name="siren-pattern-file"]').setInputFiles(xmlExportPath);
  await expect(page.getByText('Imported carcols.meta')).toBeVisible();
  await captureVisualQa(page, 'pulse-1440x900');

  await page.getByRole('button', { name: 'Chassis' }).click();
  await expect(page.getByRole('heading', { name: 'Open a workspace first' })).toBeVisible();

  await page.getByRole('button', { name: 'Align' }).click();
  await expect(
    page.getByRole('main').getByText('Align metadata repair', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose metadata' })).toBeVisible();
  await captureVisualQa(page, 'align-empty-1440x900');

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
  await page.getByRole('button', { name: 'Export PNG' }).click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(pngExportPath)).length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(10_000);
  const png = await readFile(pngExportPath);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(png.readUInt32BE(16)).toBe(800);
  expect(png.readUInt32BE(20)).toBe(500);
  expect(png.length).toBeGreaterThan(10_000);
  await captureVisualQa(page, 'chevron-builder-1440x900');
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

  const categoryPresets = [
    'Physical presets',
    'Powertrain presets',
    'Braking presets',
    'Traction presets',
    'Suspension presets',
    'Damage presets',
    'Advanced presets',
  ] as const;
  for (const groupName of categoryPresets) {
    const categoryName = groupName.replace(' presets', '');
    await page.getByRole('button', { name: categoryName, exact: true }).click();
    await expect(page.getByRole('group', { name: groupName })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Physical', exact: true }).click();
  await expect(
    page.getByText('Vehicle mass used by collision and acceleration calculations.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Open wiki for Mass' }).click();
  const handlingWiki = page.getByRole('dialog', { name: 'Handling parameter wiki' });
  await expect(handlingWiki).toBeVisible();
  await expect(handlingWiki.getByRole('heading', { name: 'Mass', exact: true })).toBeVisible();
  await expect(
    handlingWiki.getByText('Vehicle mass used by collision and acceleration calculations.', {
      exact: true,
    }),
  ).toBeVisible();
  await handlingWiki
    .getByRole('searchbox', { name: 'Search handling wiki' })
    .fill('pitching too far forward causing the vehicle to wheelie');
  await expect(
    handlingWiki.getByRole('heading', { name: 'Centre of mass', exact: true }),
  ).toBeVisible();
  await expect(handlingWiki.getByText(/wheelies or lifts its front wheels/i)).toBeVisible();
  await handlingWiki
    .getByRole('searchbox', { name: 'Search handling wiki' })
    .fill('suspension is not leaning into corners, too much understeer');
  await expect(
    handlingWiki.getByRole('heading', { name: 'Front spring bias', exact: true }),
  ).toBeVisible();
  await expect(
    handlingWiki.getByRole('article').getByText(/front suspension barely leans into corners/i),
  ).toBeVisible();
  await expect(
    handlingWiki.getByRole('button', { name: /Anti-roll force.*fAntiRollBarForce/i }),
  ).toBeVisible();
  await captureVisualQa(page, 'chassis-parameter-wiki-1440x900');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'chassis-parameter-wiki-390x844');
  await handlingWiki.getByRole('button', { name: 'Close handling parameter wiki' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: 'Powertrain', exact: true }).click();
  const powertrainPresets = page.getByRole('group', { name: 'Powertrain presets' });
  await powertrainPresets.getByRole('button', { name: 'AWD launch' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Front drive bias' })).toHaveValue('0.5');
  await expect(saveState).toContainText('Modified');
  await page.getByRole('button', { name: 'Reset section' }).click();

  await page.getByRole('button', { name: 'Suspension', exact: true }).click();
  const suspensionPresets = page.getByRole('group', { name: 'Suspension presets' });
  const sportPreset = suspensionPresets.getByRole('button', { name: 'Sport' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 });
  await sportPreset.focus();
  await expect(page.getByRole('tooltip')).toContainText(
    'Firmer springs and rebound, shorter travel, and stronger roll control',
  );
  await captureVisualQa(page, 'chassis-subsystem-tooltip-1440x900');
  await sportPreset.click();
  await expect(page.getByRole('spinbutton', { name: 'Spring force' })).toHaveValue('3');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 });
  await captureVisualQa(page, 'chassis-subsystem-presets-1440x900');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'chassis-subsystem-presets-390x844');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.getByRole('button', { name: 'Reset section' }).click();

  await page.getByRole('button', { name: 'Physical', exact: true }).click();

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

test('Chassis AI actions open the closed Cortex AI panel', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-chassis-ai-e2e-'));
  const resourceRoot = path.join(temporary, 'vehicle-resource');
  await cp(
    'packages/test-fixtures/vehicle-meta-repair-suite/fixed_reference/07_vehicles_handling_id_mismatch',
    resourceRoot,
    { recursive: true },
  );
  const app = await launch();
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
  }, resourceRoot);
  const page = await app.firstWindow();

  await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByRole('switch', { name: 'Enable Cortex AI' }).click();
  await page.getByRole('button', { name: 'Back to app' }).click();
  await page.getByRole('button', { name: 'Chassis', exact: true }).click();
  await expect(page.getByTitle('handling.meta')).toBeVisible();

  const panel = page.getByRole('complementary', { name: 'Cortex AI workspace panel' });
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Diagnose', exact: true }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close Cortex AI' }).click();
  await expect(panel).toHaveCount(0);

  await page.getByRole('button', { name: 'More Chassis actions' }).click();
  await page.getByRole('button', { name: 'Improve stability', exact: true }).click();
  await expect(panel).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await enableAi.click();
  await page.getByRole('button', { name: 'Back to app' }).click();
  const aiButton = page.getByRole('button', { name: 'Cortex AI' });
  await expect(aiButton).toBeVisible();
  await aiButton.click();
  const panel = page.getByRole('complementary', { name: 'Cortex AI workspace panel' });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/is-access-gate/);
  await expect(page.getByRole('heading', { name: 'Sign in to use Cortex AI' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Ask Cortex about this workspace' })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 632, height: 1390 });
  await expect
    .poll(async () =>
      panel.locator('.ai-commercial-gate').evaluate((element) => ({
        horizontal: element.scrollWidth > element.clientWidth,
        vertical: element.scrollHeight > element.clientHeight,
      })),
    )
    .toEqual({ horizontal: false, vertical: false });
  await captureVisualQa(page, 'ai-signed-out-632x1390');
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureVisualQa(page, 'ai-signed-out-1440x900');
  await page.setViewportSize({ width: 632, height: 1390 });

  await mockAccountStatus(app, {
    configured: true,
    cloudConfigured: true,
    status: 'signed-in',
    identity: {
      id: 'user_ai_free_e2e',
      email: 'free-ai-e2e@example.com',
      displayName: 'Free AI E2E',
      avatarUrl: null,
    },
    plan: 'free',
    billing: null,
    ai: {
      entitled: false,
      enabled: false,
      usage: { percent: 0, state: 'plenty', resetsAt: null },
      limits: { concurrentRuns: 0 },
    },
    message: null,
  });
  await expect(page.getByRole('heading', { name: 'Available with Creator or Pro' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Choose a plan' })).toBeVisible();
  await captureVisualQa(page, 'ai-plan-selection-632x1390');

  await page.setViewportSize({ width: 1440, height: 900 });
  await captureVisualQa(page, 'ai-plan-selection-1440x900');

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
  await expect(page.locator('.app-shell[data-workspace-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'hello-cortex' })).toBeVisible();
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
  await expect
    .poll(async () => {
      const result = await page.evaluate(() => window.cortex.settings.get());
      return result.ok ? result.data.aiPanelWidth : null;
    })
    .toBe(Math.round(resizedWidth));
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureVisualQa(page, 'ai-stream-proposal-1440x900');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await captureVisualQa(page, 'ai-stream-proposal-1920x1080');
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
