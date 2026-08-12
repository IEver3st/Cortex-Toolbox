import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createProductionConfig, validateProductionConfig } from '../src/deployment-config';

const output = resolve(import.meta.dirname, '../.wrangler/deploy/wrangler.production.toml');
const config = createProductionConfig(process.env);
const issues = validateProductionConfig(config);
if (issues.length) throw new Error(`Generated deployment config is invalid: ${issues.join(' ')}`);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, config, { encoding: 'utf8', mode: 0o600 });
console.log('Generated ignored production deployment config with no secret values.');
