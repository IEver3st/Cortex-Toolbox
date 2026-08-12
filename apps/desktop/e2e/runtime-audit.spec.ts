import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function launchEstablished() {
  const userData = await mkdtemp(path.join(tmpdir(), 'cortex-runtime-audit-profile-'));
  await mkdir(userData, { recursive: true });
  await writeFile(
    path.join(userData, 'config.json'),
    JSON.stringify({ preferences: { onboardingVersion: 1, reducedMotion: true } }),
    'utf8',
  );
  return electron.launch({
    args: ['apps/desktop', `--user-data-dir=${userData}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
}

async function inspectSurface(page: Page, label: string): Promise<void> {
  const result = await page.evaluate((surfaceLabel) => {
    const visible = (element: Element): boolean => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const nameFor = (element: Element): string => {
      const labelledBy = element.getAttribute('aria-labelledby');
      const labelledText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
        : '';
      return [
        element.getAttribute('aria-label'),
        labelledText,
        element.getAttribute('title'),
        element.textContent,
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const selectorFor = (element: Element): string => {
      const id = element.getAttribute('id');
      const testId = element.getAttribute('data-testid');
      return id
        ? `${element.tagName.toLowerCase()}#${id}`
        : testId
          ? `${element.tagName.toLowerCase()}[data-testid="${testId}"]`
          : `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).join('.')}`;
    };
    const ids = [...document.querySelectorAll<HTMLElement>('[id]')].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const brokenReferences = [
      ...document.querySelectorAll('[aria-controls],[aria-labelledby]'),
    ].flatMap((element) =>
      ['aria-controls', 'aria-labelledby'].flatMap((attribute) =>
        (element.getAttribute(attribute) ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .filter((id) => !document.getElementById(id))
          .map((id) => `${selectorFor(element)} ${attribute}=${id}`),
      ),
    );
    const unnamedActions = [
      ...document.querySelectorAll('button,a[href],[role="button"],[role="tab"]'),
    ]
      .filter(visible)
      .filter((element) => nameFor(element).length === 0)
      .map(selectorFor);
    const unlabeledFields = [
      ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type="hidden"]),textarea,select',
      ),
    ]
      .filter(visible)
      .filter(
        (element) =>
          element.labels?.length === 0 &&
          !element.getAttribute('aria-label') &&
          !element.getAttribute('aria-labelledby') &&
          !element.getAttribute('title'),
      )
      .map(selectorFor);
    const imagesWithoutAlt = [...document.querySelectorAll('img:not([alt])')]
      .filter(visible)
      .map(selectorFor);
    const viewportWidth = document.documentElement.clientWidth;
    const overflow = Math.max(
      0,
      document.documentElement.scrollWidth - viewportWidth,
      document.body.scrollWidth - viewportWidth,
    );
    return {
      surfaceLabel,
      overflow,
      duplicateIds,
      brokenReferences,
      unnamedActions,
      unlabeledFields,
      imagesWithoutAlt,
    };
  }, label);
  expect(result, label).toEqual({
    surfaceLabel: label,
    overflow: 0,
    duplicateIds: [],
    brokenReferences: [],
    unnamedActions: [],
    unlabeledFields: [],
    imagesWithoutAlt: [],
  });
}

test('standalone and settings surfaces pass compact runtime semantics', async () => {
  const app = await launchEstablished();
  try {
    const page = await app.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 960, height: 600 });
    await inspectSurface(page, 'Overview 960x600');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
    await inspectSurface(page, 'Settings 960x600');
    await page.getByRole('button', { name: 'Back to app' }).click();

    for (const moduleName of ['Pulse', 'Align', 'Chevron', 'Chassis']) {
      await page.getByRole('button', { name: moduleName, exact: true }).click();
      await inspectSurface(page, `${moduleName} 960x600`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await inspectSurface(page, 'Chassis 390x844');
    expect(pageErrors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('workspace modules pass compact runtime semantics on a synthetic resource', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-runtime-audit-resource-'));
  const resourceRoot = path.join(temporary, 'runtime-audit-resource');
  await cp('packages/test-fixtures/resources/hello-cortex', resourceRoot, { recursive: true });
  const app = await launchEstablished();
  try {
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [root] });
    }, resourceRoot);
    const page = await app.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 960, height: 600 });
    await page.getByRole('main').getByRole('button', { name: 'Open a folder' }).click();
    await expect(page.getByRole('heading', { name: 'runtime-audit-resource' })).toBeVisible();
    await inspectSurface(page, 'Workspace overview 960x600');

    for (const moduleName of ['Index', 'Sentinel', 'Probe', 'Wire', 'Bundle']) {
      await page.getByRole('button', { name: moduleName, exact: true }).click();
      await inspectSurface(page, `${moduleName} 960x600`);
    }
    expect(pageErrors).toEqual([]);
  } finally {
    await app.close();
  }
});
