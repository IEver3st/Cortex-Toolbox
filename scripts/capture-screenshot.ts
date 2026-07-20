import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

async function main(): Promise<void> {
  const output = path.resolve('artifacts/redesign');
  await mkdir(output, { recursive: true });

  const app = await electron.launch({
    args: ['apps/desktop'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });

  try {
    await app.evaluate(({ dialog }, resourceRoot) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [resourceRoot] });
    }, path.resolve('examples/complete-resource'));

    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('heading', { name: 'Cortex ToolBox' }).waitFor();
    await page.screenshot({ path: path.join(output, 'first-launch-1440x900.png') });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: path.join(output, 'first-launch-1280x720.png') });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: path.join(output, 'first-launch-1920x1080.png') });

    await page.setViewportSize({ width: 1024, height: 640 });
    await page.screenshot({ path: path.join(output, 'first-launch-1024x640.png') });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Privacy and data' }).waitFor();
    await page.screenshot({ path: path.join(output, 'settings-1440x900.png') });

    await page.getByRole('button', { name: 'Overview' }).click();
    await page.getByRole('main').getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('heading', { name: 'complete-resource' }).waitFor();
    await page.screenshot({ path: path.join(output, 'workspace-1440x900.png') });

    const routes = [
      ['Index', 'index'],
      ['Validate', 'validate'],
      ['Script Analysis', 'script-analysis'],
      ['Release', 'release'],
      ['Textures', 'texture-studio'],
      ['Props', 'prop-workbench'],
      ['Clothing', 'clothing-workbench'],
      ['Weapons', 'weapon-workbench'],
      ['Vehicles', 'vehicle-studio'],
      ['Extensions', 'extensions'],
      ['Settings', 'settings-workspace'],
    ] as const;

    for (const [label, slug] of routes) {
      const routeButton = page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('button', { name: label, exact: true });
      if ((await routeButton.count()) === 0) continue;
      await routeButton.click();
      await page.locator('.view-loading').waitFor({ state: 'hidden' });
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, `${slug}-1440x900.png`) });
    }

    await page.keyboard.press('Control+K');
    await page.getByRole('dialog', { name: 'Search tools, commands, and files' }).waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(output, 'command-palette-1440x900.png') });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await page.getByRole('heading', { name: 'Activity' }).waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(output, 'activity-drawer-1440x900.png') });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: path.join(output, 'workspace-1280x720.png') });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: path.join(output, 'workspace-1920x1080.png') });
    await page.setViewportSize({ width: 2560, height: 1080 });
    await page.screenshot({ path: path.join(output, 'workspace-ultrawide-2560x1080.png') });
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.screenshot({ path: path.join(output, 'workspace-1024x640.png') });
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Privacy and data' }).waitFor();
    await page.screenshot({ path: path.join(output, 'settings-1024x640.png') });
  } finally {
    await app.close();
  }
}

void main();
