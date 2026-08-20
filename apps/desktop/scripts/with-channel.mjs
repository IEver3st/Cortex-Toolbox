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
if (!['stable', 'beta', 'development'].includes(channel)) {
  console.error(`Unsupported Cortex release channel: ${channel}`);
  process.exit(1);
}

const env = { ...process.env, CORTEX_RELEASE_CHANNEL: channel };
if (channel !== 'development' && ['make', 'package'].includes(args[0] ?? '')) {
  assertHostedReleaseCoordinates(env);
}
const result = spawnSync(command, args, { stdio: 'inherit', env, shell: true });
process.exit(result.status ?? 1);

/** @param {NodeJS.ProcessEnv} env */
function assertHostedReleaseCoordinates(env) {
  const clientId = env.CORTEX_WORKOS_CLIENT_ID?.trim() ?? '';
  if (!/^client_[A-Za-z0-9]+$/.test(clientId)) {
    throw new Error('Set a valid CORTEX_WORKOS_CLIENT_ID before packaging a release.');
  }
  const cloudUrl = env.CORTEX_CLOUD_API_URL?.trim() ?? '';
  let parsed;
  try {
    parsed = new URL(cloudUrl);
  } catch {
    throw new Error('Set a valid HTTPS CORTEX_CLOUD_API_URL before packaging a release.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Set a valid HTTPS CORTEX_CLOUD_API_URL before packaging a release.');
  }
}
