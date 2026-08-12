const PRODUCTS = {
  creator: required(process.env.STRIPE_CREATOR_PRODUCT_ID, 'Set STRIPE_CREATOR_PRODUCT_ID.'),
  pro: required(process.env.STRIPE_PRO_PRODUCT_ID, 'Set STRIPE_PRO_PRODUCT_ID.'),
};

/** @type {Array<{plan: 'creator' | 'pro', interval: 'month' | 'year', variable: string, expectedAmount: number}>} */
const PRICES = [
  {
    plan: 'creator',
    interval: 'month',
    variable: 'STRIPE_CREATOR_MONTHLY_PRICE_ID',
    expectedAmount: 799,
  },
  {
    plan: 'creator',
    interval: 'year',
    variable: 'STRIPE_CREATOR_ANNUAL_PRICE_ID',
    expectedAmount: 6999,
  },
  { plan: 'pro', interval: 'month', variable: 'STRIPE_PRO_MONTHLY_PRICE_ID', expectedAmount: 1499 },
  { plan: 'pro', interval: 'year', variable: 'STRIPE_PRO_ANNUAL_PRICE_ID', expectedAmount: 12999 },
];

const secret = required(
  process.env.STRIPE_SECRET_KEY,
  'Set STRIPE_SECRET_KEY in this owner shell before running setup.',
);
/** @type {Array<{plan: 'creator' | 'pro', interval: 'month' | 'year', id: string}>} */
const resolved = [];

for (const policy of PRICES) {
  const id = required(process.env[policy.variable], `Set ${policy.variable}.`);
  const price = await stripe('GET', `/v1/prices/${encodeURIComponent(id)}`);
  const productValue = price.product;
  const productId =
    typeof productValue === 'string' ? productValue : recordString(productValue, 'id');
  const recurring = record(price.recurring);
  if (price.active !== true || productId !== PRODUCTS[policy.plan]) {
    throw new Error(`${id} is not an active ${policy.plan} price on the expected product.`);
  }
  if (
    price.currency !== 'usd' ||
    price.unit_amount !== policy.expectedAmount ||
    recurring.interval !== policy.interval
  ) {
    throw new Error(
      `${id} does not match the approved ${policy.plan}/${policy.interval} amount and cadence.`,
    );
  }
  resolved.push({ plan: policy.plan, interval: policy.interval, id });
  console.log(`Verified configured ${policy.plan}/${policy.interval} price.`);
}

if (!process.argv.includes('--apply-portal')) {
  console.log(
    'Validation complete. Re-run with --apply-portal to explicitly create or update the restricted Customer Portal configuration.',
  );
  process.exit(0);
}

if (process.env.CORTEX_STRIPE_SETUP_CONFIRM !== 'I_UNDERSTAND_THIS_MUTATES_STRIPE') {
  throw new Error(
    'Set CORTEX_STRIPE_SETUP_CONFIRM=I_UNDERSTAND_THIS_MUTATES_STRIPE before --apply-portal.',
  );
}

const form = new URLSearchParams({
  'business_profile[headline]': 'Manage your Cortex AI subscription',
  'features[invoice_history][enabled]': 'true',
  'features[payment_method_update][enabled]': 'true',
  'features[subscription_cancel][enabled]': 'true',
  'features[subscription_cancel][mode]': 'at_period_end',
  'features[subscription_update][enabled]': 'true',
  'features[subscription_update][default_allowed_updates][0]': 'price',
});

for (const [index, product] of Object.values(PRODUCTS).entries()) {
  form.set(`features[subscription_update][products][${index}][product]`, product);
  const ids = resolved.filter((price) => PRODUCTS[price.plan] === product).map((price) => price.id);
  ids.forEach((id, priceIndex) => {
    form.set(`features[subscription_update][products][${index}][prices][${priceIndex}]`, id);
  });
}

const configurationId = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
const configuration = await stripe(
  'POST',
  configurationId
    ? `/v1/billing_portal/configurations/${encodeURIComponent(configurationId)}`
    : '/v1/billing_portal/configurations',
  form,
);
console.log(
  `Portal configuration ready: ${requiredString(configuration.id, 'Stripe returned no portal configuration ID.')}`,
);
console.log('Set STRIPE_PORTAL_CONFIGURATION_ID to that ID in the Worker production variables.');

/**
 * @param {'GET' | 'POST'} method
 * @param {string} route
 * @param {URLSearchParams=} body
 * @returns {Promise<Record<string, unknown>>}
 */
async function stripe(method, route, body) {
  const response = await fetch(`https://api.stripe.com${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body } : {}),
  });
  /** @type {unknown} */
  const value = await response.json();
  const payload = record(value);
  if (!response.ok) {
    const message = recordString(payload.error, 'message');
    throw new Error(message ?? `Stripe returned ${response.status}.`);
  }
  return payload;
}

/** @param {unknown} value */
function record(value) {
  return value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {unknown} value @param {string} key */
function recordString(value, key) {
  const candidate = record(value)[key];
  return typeof candidate === 'string' ? candidate : null;
}

/** @param {unknown} value @param {string} message */
function requiredString(value, message) {
  if (typeof value !== 'string' || !value) throw new Error(message);
  return value;
}

/** @param {string | undefined} value @param {string} message */
function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}
