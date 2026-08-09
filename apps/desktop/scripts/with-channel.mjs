/**
 * Run a command with CORTEX_RELEASE_CHANNEL set (Windows/macOS/Linux).
 * Usage: node ./scripts/with-channel.mjs beta electron-forge make
 */
import { spawnSync } from 'node:child_process';

const [channel, command, ...args] = process.argv.slice(2);
if (!channel || !command) {
  console.error(
    'Usage: node ./scripts/with-channel.mjs <stable|beta|development> <command> [args...]',
  );
  process.exit(1);
}

const env = { ...process.env, CORTEX_RELEASE_CHANNEL: channel };
const result = spawnSync(command, args, { stdio: 'inherit', env, shell: true });
process.exit(result.status ?? 1);
