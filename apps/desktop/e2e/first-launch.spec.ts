import { _electron as electron, expect, test } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const launch = async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-e2e-profile-'));
  return electron.launch({
    args: ['apps/desktop', `--user-data-dir=${userData}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
};

test('first launch explains the local workspace model', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  page.on('console', (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) =>
    console.error(`[renderer:error] ${error.stack ?? error.message}`),
  );
  await expect(page.getByRole('heading', { name: 'What are you working on?' })).toBeVisible();
  await expect(
    page.getByText('Open an existing folder, create a new project, import a resource'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open workspace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import resource' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to workspace' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace-content')).toBeFocused();
  await app.close();
});

test('settings expose useful local preferences and auto-save', async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.locator('.cursor-settings')).toBeAttached();
  const settingsOpenStartedAt = performance.now();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  expect(performance.now() - settingsOpenStartedAt).toBeLessThan(300);
  await expect(page.getByRole('button', { name: 'Back to app' })).toBeVisible();
  await page.getByRole('button', { name: 'Privacy and data' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy and data' })).toBeVisible();

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

  const appReturnStartedAt = performance.now();
  await page.getByRole('button', { name: 'Back to app' }).click();
  await expect(page.locator('.launchpad')).toBeVisible();
  expect(performance.now() - appReturnStartedAt).toBeLessThan(300);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Editor', level: 1 })).toBeVisible();
  await app.close();
});

test('theme choice persists across restart', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-e2e-profile-'));
  const launchWithProfile = () =>
    electron.launch({
      args: ['apps/desktop', `--user-data-dir=${userData}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });

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
  const launchWithProfile = () =>
    electron.launch({
      args: ['apps/desktop', `--user-data-dir=${userData}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });

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
  await mkdir(path.join(resourceRoot, 'assets'), { recursive: true });
  await cp('apps/desktop/assets/brand/icon.png', path.join(resourceRoot, 'assets', 'test.png'));
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

  await page.getByRole('main').getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'hello-cortex' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'fxmanifest.lua' })).toBeVisible();

  await page.getByRole('button', { name: 'Index', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review save' })).toBeVisible();
  const editor = page.locator('.monaco-editor').first();
  await editor.click({ position: { x: 120, y: 80 } });
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(
    "fx_version 'cerulean'\ngame 'gta5'\ndescription 'Edited safely by Cortex E2E'\nclient_script 'client/main.lua'\nserver_script 'server/main.lua'\n",
  );
  await page.getByRole('button', { name: 'Review save' }).click();
  await expect(page.getByRole('heading', { name: 'Review file change' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply selected change' }).click();
  await expect(page.getByRole('heading', { name: 'Review file change' })).toBeHidden();
  await expect
    .poll(async () => readFile(path.join(resourceRoot, 'fxmanifest.lua'), 'utf8'))
    .toContain('Edited safely by Cortex E2E');

  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('option', { name: 'Sentinel' }).click();
  await page.getByRole('button', { name: 'Run validation' }).click();
  await expect(page.getByText('Ready to release').first()).toBeVisible();

  await page.getByRole('button', { name: 'Textures', exact: true }).click();
  await expect(
    page.getByRole('main').getByText('Texture Converter', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Preview of assets/test.png' })).toBeVisible();
  await page.getByLabel('Output format').selectOption('dds');
  await page.getByRole('button', { name: 'Create DDS' }).click();
  await expect
    .poll(async () => {
      try {
        const buffer = await readFile(path.join(resourceRoot, 'assets', 'test-converted.dds'));
        return buffer.subarray(0, 4).toString();
      } catch {
        return '';
      }
    })
    .toBe('DDS ');

  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('option', { name: 'Bundle' }).click();
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
  await expect(page.getByRole('heading', { name: 'Pulse' })).toBeVisible();
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
  await expect(page.getByRole('main').getByText('Chassis', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'vehicles.meta' })).toBeVisible();

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
  await page.getByRole('button', { name: 'Headlamp' }).click();
  await expect(page.getByRole('button', { name: 'Headlamp' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Mask', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mask', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
  await app.close();
});

test('Chassis exposes guided tuning and editable chassis setup', async () => {
  const app = await launch();
  const page = await app.firstWindow();

  await page.getByRole('button', { name: 'Chassis' }).click();
  await expect(page.getByRole('heading', { name: 'Chassis', level: 1 })).toBeVisible();
  await expect(page.getByText('Derived behavior profile', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Balanced street' }).click();
  await page.getByRole('button', { name: 'Apply preset' }).click();
  await page
    .getByRole('navigation', { name: 'Chassis sections' })
    .getByRole('button', { name: 'Vehicle setup' })
    .click();
  await expect(page.getByRole('group', { name: 'Centre of mass offset' })).toBeVisible();
  await page.getByRole('button', { name: 'SPORTS CAR' }).click();
  await page.getByRole('button', { name: 'Review & save' }).click();
  await expect(page.getByRole('heading', { name: 'Review & save' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Chassis sections' })
    .getByRole('button', { name: 'Source' })
    .click();
  await expect(page.getByText('handling.meta', { exact: true })).toBeVisible();

  await app.close();
});
