import { spawnSync } from 'node:child_process';
for (const [command, args] of [
  ['pnpm', ['typecheck']],
  ['pnpm', ['lint']],
  ['pnpm', ['test']],
  ['pnpm', ['build']],
]) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
