const clientId = (process.env.CORTEX_WORKOS_CLIENT_ID ?? '').trim();
if (!/^client_[A-Za-z0-9]+$/.test(clientId)) {
  throw new Error('CORTEX_WORKOS_CLIENT_ID is missing or invalid.');
}

const rawCloudUrl = (process.env.CORTEX_CLOUD_API_URL ?? '').trim();
let cloudUrl;
try {
  cloudUrl = new URL(rawCloudUrl);
} catch {
  throw new Error('CORTEX_CLOUD_API_URL is missing or invalid.');
}
if (
  cloudUrl.protocol !== 'https:' ||
  cloudUrl.username ||
  cloudUrl.password ||
  cloudUrl.pathname !== '/' ||
  cloudUrl.search ||
  cloudUrl.hash
) {
  throw new Error('CORTEX_CLOUD_API_URL must be an HTTPS origin without credentials or a path.');
}

console.log('Verified hosted desktop release coordinates.');
