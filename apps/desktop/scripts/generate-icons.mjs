/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands -- png-to-ico has no useful runtime types in this build script. */
/**
 * Rasterize brand masters to multi-size PNG + Windows ICO for electron-packager.
 *
 * Usage: node apps/desktop/scripts/generate-icons.mjs
 * Sources:
 *   assets/brand/icon-stable.png   -> icon (stable release branch)
 *   assets/brand/icon-developer.png -> icon-dev (developer release branch)
 *   assets/brand/icon-beta.svg     -> icon-beta
 * Outputs: assets/brand/icon.png, icon.ico, icon-256.png, and dev/beta equivalents
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'assets', 'brand');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const force = process.argv.includes('--force');

async function isStale(sourcePath, outBase) {
  if (force) return true;
  try {
    const sourceStat = await stat(sourcePath);
    const icoStat = await stat(path.join(brandDir, `${outBase}.ico`));
    const pngStat = await stat(path.join(brandDir, `${outBase}.png`));
    return sourceStat.mtimeMs > icoStat.mtimeMs || sourceStat.mtimeMs > pngStat.mtimeMs;
  } catch {
    return true;
  }
}

/** Pack PNG buffers into a Vista+ ICO (PNG-compressed entries). */
function encodeIco(entries) {
  const count = entries.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const dir = Buffer.alloc(headerSize);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // icon type
  dir.writeUInt16LE(count, 4);

  for (let i = 0; i < count; i += 1) {
    const { size, png } = entries[i];
    const entryOffset = 6 + i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    dir.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    dir.writeUInt8(0, entryOffset + 2); // color palette
    dir.writeUInt8(0, entryOffset + 3); // reserved
    dir.writeUInt16LE(1, entryOffset + 4); // planes
    dir.writeUInt16LE(32, entryOffset + 6); // bit count
    dir.writeUInt32LE(png.length, entryOffset + 8);
    dir.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  }

  return Buffer.concat([dir, ...entries.map((entry) => entry.png)]);
}

async function rasterizeFromSource(sourceName, outBase) {
  const sourcePath = path.join(brandDir, sourceName);
  if (!(await isStale(sourcePath, outBase))) {
    console.log(`Up to date: ${outBase}.ico`);
    return;
  }
  const source = await readFile(sourcePath);
  const isSvg = sourceName.endsWith('.svg');
  const pngEntries = [];

  for (const size of sizes) {
    const pipeline = isSvg
      ? sharp(source, { density: 384 }).resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
      : sharp(source).resize(size, size, { fit: 'cover' });
    const png = await pipeline.png().toBuffer();
    pngEntries.push({ size, png });
    if (size === 256) {
      await writeFile(path.join(brandDir, `${outBase}-256.png`), png);
      await writeFile(path.join(brandDir, `${outBase}.png`), png);
    }
  }

  const ico = encodeIco(pngEntries.filter((entry) => [16, 32, 48, 256].includes(entry.size)));
  await writeFile(path.join(brandDir, `${outBase}.ico`), ico);
  console.log(`Wrote ${outBase}.ico / .png from ${sourceName}`);
}

await mkdir(brandDir, { recursive: true });
await rasterizeFromSource('icon-stable.png', 'icon');
await rasterizeFromSource('icon-developer.png', 'icon-dev');
await rasterizeFromSource('icon-beta.svg', 'icon-beta');
console.log('Brand icons ready in', brandDir);
