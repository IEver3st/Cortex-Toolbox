import { readFileSync } from 'node:fs';
import { validatePublicConfig } from '../src/deployment-config';

const configUrl = new URL('../wrangler.toml', import.meta.url);
const issues = validatePublicConfig(readFileSync(configUrl, 'utf8'));

if (issues.length > 0) {
  console.error('Cortex Cloud public configuration is unsafe:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log('Cortex Cloud public configuration is safe and structurally valid.');
}
