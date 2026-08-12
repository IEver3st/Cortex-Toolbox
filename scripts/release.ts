import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RELEASE_ENVIRONMENT = 'release';
const WORKFLOW_FILE = 'release.yml';
const REQUIRED_STABLE_SECRETS = [
  'CORTEX_WINDOWS_CERTIFICATE_BASE64',
  'CORTEX_WINDOWS_CERTIFICATE_PASSWORD',
];

interface CommandOptions {
  allowFailure?: boolean;
  inheritIO?: boolean;
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface RepositoryDetails {
  nameWithOwner: string;
  defaultBranchRef?: { name?: string };
}

interface ReleaseSecret {
  name: string;
}

interface WorkflowRun {
  databaseId: number;
  headSha: string;
  createdAt: string;
  status: string;
  url: string;
}

interface ValidatedRepository {
  head: string;
  repo: string;
  tag: string;
}

function stop(message: string): never {
  console.error(`Release preflight failed: ${message}`);
  process.exit(1);
}

function run(command: string, args: string[], options: CommandOptions = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    stdio: options.inheritIO ? 'inherit' : 'pipe',
  });
  if (result.error) stop(`${command} could not start: ${result.error.message}`);
  if (!options.allowFailure && result.status !== 0) {
    const detail = [result.stderr, result.stdout].find((value) => value.length > 0)?.trim() ?? '';
    stop(
      `${command} ${args.join(' ')} exited with ${String(result.status)}.${detail ? `\n${detail}` : ''}`,
    );
  }
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

function parseJsonResult(result: CommandResult, description: string): unknown {
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    return parsed;
  } catch {
    return stop(`${description} returned invalid JSON.`);
  }
}

function readPackageVersion(file: string): string {
  const parsed = parseJsonResult(
    { status: 0, stdout: readFileSync(file, 'utf8'), stderr: '' },
    file,
  );
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed)) {
    return stop(`${file} has no version.`);
  }
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== 'string') return stop(`${file} has an invalid version.`);
  return version;
}

function normalizeVersion(raw: string | undefined): string {
  const version = (raw ?? '').trim().replace(/^v/i, '');
  if (!SEMVER_PATTERN.test(version)) {
    return stop('provide a semantic version such as 1.0.0 or 1.1.0-beta.1.');
  }
  return version;
}

function normalizeChannel(raw: string | undefined, version: string): 'stable' | 'beta' {
  const inferred = version.includes('-') ? 'beta' : 'stable';
  const channel = (raw ?? inferred).trim().toLowerCase();
  if (channel !== 'stable' && channel !== 'beta') {
    return stop('the release channel must be stable or beta.');
  }
  if (channel === 'stable' && version.includes('-')) {
    return stop('stable releases cannot use a prerelease semantic version.');
  }
  if (channel === 'beta' && !version.includes('-')) {
    return stop('beta releases require a prerelease version such as 1.1.0-beta.1.');
  }
  return channel;
}

function validateProjectMetadata(version: string): void {
  const rootVersion = readPackageVersion('package.json');
  const desktopVersion = readPackageVersion('apps/desktop/package.json');
  if (rootVersion !== version || desktopVersion !== version) {
    stop(
      `version ${version} must match package.json (${rootVersion}) and apps/desktop/package.json (${desktopVersion}).`,
    );
  }
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (
    !new RegExp(`^## \\[${escaped}\\](?:\\s+-\\s+\\d{4}-\\d{2}-\\d{2})?\\s*$`, 'm').test(changelog)
  ) {
    stop(`CHANGELOG.md does not contain a release heading for ${version}.`);
  }
}

function writeCiMetadata(version: string, channel: 'stable' | 'beta'): void {
  validateProjectMetadata(version);
  if (process.env.GITHUB_REF !== 'refs/heads/main') {
    stop('the release workflow must be dispatched from main.');
  }
  const commit = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commit) {
    stop('the checked-out commit does not match the workflow commit.');
  }
  const output = process.env.GITHUB_OUTPUT;
  if (!output) stop('GITHUB_OUTPUT is unavailable.');
  const tag = `v${version}`;
  const lines = [
    `version=${version}`,
    `tag=${tag}`,
    `channel=${channel}`,
    `prerelease=${channel === 'beta' ? 'true' : 'false'}`,
    `commit_sha=${commit}`,
  ];
  const append = spawnSync(
    process.execPath,
    [
      '-e',
      "require('node:fs').appendFileSync(process.argv[1], process.argv[2] + '\\n')",
      output,
      lines.join('\n'),
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (append.status !== 0) stop('could not write release metadata for GitHub Actions.');
  console.log(`Validated ${tag} (${channel}) at ${commit}.`);
}

function validateLocalRepository(version: string, channel: 'stable' | 'beta'): ValidatedRepository {
  validateProjectMetadata(version);
  run('gh', ['auth', 'status']);

  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all']).stdout.trim();
  if (status) stop('commit or stash every working-tree change before releasing.');
  const branch = run('git', ['branch', '--show-current']).stdout.trim();
  if (branch !== 'main')
    stop(`switch to main before releasing (current branch: ${branch || 'detached'}).`);

  run('git', ['fetch', 'origin', 'main', '--tags']);
  const head = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  const remoteHead = run('git', ['rev-parse', 'origin/main']).stdout.trim();
  if (head !== remoteHead) stop('local main must exactly match origin/main.');

  const repository = parseJsonResult(
    run('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef']),
    'GitHub repository lookup',
  ) as RepositoryDetails;
  if (repository.defaultBranchRef?.name !== 'main') stop('the GitHub default branch is not main.');
  const repo = repository.nameWithOwner;
  if (!repo) stop('GitHub did not return the repository name.');
  run('gh', ['workflow', 'view', WORKFLOW_FILE, '--repo', repo]);
  run('gh', ['api', `repos/${repo}/environments/${RELEASE_ENVIRONMENT}`]);

  const tag = `v${version}`;
  const remoteTag = run(
    'git',
    ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`],
    { allowFailure: true },
  );
  if (remoteTag.status === 0) stop(`tag ${tag} already exists on origin.`);
  const existingRelease = run(
    'gh',
    ['release', 'view', tag, '--repo', repo, '--json', 'tagName,isDraft,url'],
    { allowFailure: true },
  );
  if (existingRelease.status === 0) stop(`GitHub Release ${tag} already exists.`);

  if (channel === 'stable') {
    const secrets = parseJsonResult(
      run('gh', ['secret', 'list', '--repo', repo, '--env', RELEASE_ENVIRONMENT, '--json', 'name']),
      'release secret lookup',
    ) as ReleaseSecret[];
    const names = new Set(secrets.map((entry) => entry.name));
    const missing = REQUIRED_STABLE_SECRETS.filter((name) => !names.has(name));
    if (missing.length) {
      stop(
        `stable signing is not configured in the ${RELEASE_ENVIRONMENT} environment: ${missing.join(', ')}. Run scripts/configure-release.ps1 first.`,
      );
    }
  }

  return { head, repo, tag };
}

function latestRun(repo: string, head: string, notBefore: number): WorkflowRun | undefined {
  const result = run('gh', [
    'run',
    'list',
    '--repo',
    repo,
    '--workflow',
    WORKFLOW_FILE,
    '--event',
    'workflow_dispatch',
    '--limit',
    '20',
    '--json',
    'databaseId,headSha,createdAt,status,url',
  ]);
  const runs = parseJsonResult(result, 'workflow run lookup') as WorkflowRun[];
  return runs.find(
    (entry) => entry.headSha === head && Date.parse(entry.createdAt) >= notBefore - 5_000,
  );
}

async function dispatchAndWait(
  version: string,
  channel: 'stable' | 'beta',
  repository: ValidatedRepository,
): Promise<void> {
  const started = Date.now();
  run('gh', [
    'workflow',
    'run',
    WORKFLOW_FILE,
    '--repo',
    repository.repo,
    '--ref',
    'main',
    '-f',
    `version=${version}`,
    '-f',
    `channel=${channel}`,
  ]);
  console.log(`Dispatched ${repository.tag}; waiting for GitHub Actions to register the run...`);

  let workflowRun: WorkflowRun | undefined;
  for (let attempt = 0; attempt < 20 && !workflowRun; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    workflowRun = latestRun(repository.repo, repository.head, started);
  }
  if (!workflowRun) stop('the release workflow was dispatched but its run could not be located.');
  console.log(`Release workflow: ${workflowRun.url}`);
  run(
    'gh',
    ['run', 'watch', String(workflowRun.databaseId), '--repo', repository.repo, '--exit-status'],
    { inheritIO: true },
  );
  console.log(`Release ${repository.tag} completed successfully.`);
}

function printHelp(): void {
  console.log(`Usage:
  pnpm release:check -- <version> [stable|beta]
  pnpm release -- <version> [stable|beta]

The command validates clean, synchronized main; matching package/changelog versions; the GitHub
release environment; and stable signing secret names. The release command then dispatches the
GitHub workflow and waits for its result. It never creates or uploads an installer locally.`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (args.includes('--ci-metadata')) {
  const version = normalizeVersion(process.env.RELEASE_VERSION);
  const channel = normalizeChannel(process.env.RELEASE_CHANNEL, version);
  writeCiMetadata(version, channel);
  process.exit(0);
}

const checkOnly = args.includes('--check');
const positional = args.filter((value) => !value.startsWith('-'));
if (!positional[0]) {
  printHelp();
  process.exit(1);
}
const version = normalizeVersion(positional[0]);
const channel = normalizeChannel(positional[1], version);
const repository = validateLocalRepository(version, channel);
console.log(`Release preflight passed for ${repository.tag} (${channel}) at ${repository.head}.`);
if (!checkOnly) await dispatchAndWait(version, channel, repository);
