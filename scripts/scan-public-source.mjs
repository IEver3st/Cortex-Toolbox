import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const staged = process.argv.includes('--staged');
const gitArgs = staged
  ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
  : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
const listed = spawnSync('git', gitArgs, { encoding: 'utf8' });
if (listed.status !== 0) {
  process.stderr.write(listed.stderr || 'Could not enumerate Git files.\n');
  process.exit(2);
}

const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g],
  ['stripe-secret', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/g],
  ['stripe-publishable-key', /\bpk_(?:live|test)_[A-Za-z0-9_-]{12,}\b/g],
  ['stripe-webhook-secret', /\bwhsec_[A-Za-z0-9_-]{12,}\b/g],
  ['openrouter-key', /\bsk-or-[A-Za-z0-9_-]{12,}\b/g],
  [
    'github-token',
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  ],
  ['jwt', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g],
  ['stripe-object-id', /\b(?:price|prod|bpc)_[A-Za-z0-9]{12,}\b/g],
  ['stripe-account-object-id', /\b(?:acct|cus|sub)_[A-Za-z0-9]{12,}\b/g],
  ['workos-client-id', /\bclient_[A-Za-z0-9]{20,}\b/g],
  ['workos-environment-id', /\benvironment_[A-Za-z0-9]{12,}\b/g],
  ['worker-deployment-url', /https:\/\/[A-Za-z0-9.-]+\.workers\.dev\b/gi],
  [
    'd1-database-id',
    /\bdatabase_id\s*[:=]\s*["'][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}["']/gi,
  ],
  [
    'cloudflare-resource-id',
    /\b(?:account_id|zone_id|namespace_id)\s*[:=]\s*["'][0-9a-f]{32}["']/gi,
  ],
  [
    'credential-assignment',
    /\b(?:api[_-]?key|secret|password|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["'][A-Za-z0-9/+_.-]{20,}["']/gi,
  ],
];

const findings = [];
for (const file of listed.stdout.split('\0').filter(Boolean)) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\0')) continue;
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push({ file, line, rule });
    }
  }
}

if (findings.length) {
  console.error(`Public-source scan blocked ${findings.length} potential exposure(s):`);
  for (const finding of findings) {
    console.error(`- [${finding.rule}] ${finding.file}:${finding.line}`);
  }
  console.error('Values are intentionally omitted. Remove them or use deployment/secret storage.');
  process.exit(1);
}

console.log(`Public-source scan passed (${staged ? 'staged files' : 'publishable working tree'}).`);
