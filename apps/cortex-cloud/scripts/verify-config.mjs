import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const match = /^database_id\s*=\s*"([^"]+)"/m.exec(config);
const placeholders = [...config.matchAll(/"([^"]*(?:REPLACE|PLACEHOLDER)[^"]*)"/gi)].map(
  (match) => match[1],
);

if (!match?.[1] || /replace|placeholder/i.test(match[1])) {
  console.error(
    'Cortex Cloud deployment is blocked: replace the D1 database_id placeholder in apps/cortex-cloud/wrangler.toml.',
  );
  process.exitCode = 1;
}

if (placeholders.length > 0) {
  console.error(
    `Cortex Cloud deployment is blocked by placeholder values: ${placeholders.join(', ')}`,
  );
  process.exitCode = 1;
}
