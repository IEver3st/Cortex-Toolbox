# Cortex Cloud deployment

The checked-in `wrangler.toml` is a safe local-development profile. It contains binding names, variable names, and fail-closed defaults, but no Cortex production IDs. Production deployment metadata is supplied through an owner shell or a protected GitHub `production` Environment and rendered to the ignored file `.wrangler/deploy/wrangler.production.toml`.

Use Node 24 and pnpm 10 for every command.

## Configuration classes

### Cloudflare secrets

Set these interactively with Wrangler. Never put them in TOML, env examples, CI variables, command arguments, Electron, Vite, logs, or documentation.

- `OPENROUTER_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

```powershell
pnpm --filter @cortex/cloud exec wrangler secret put OPENROUTER_API_KEY
pnpm --filter @cortex/cloud exec wrangler secret put STRIPE_SECRET_KEY
pnpm --filter @cortex/cloud exec wrangler secret put STRIPE_WEBHOOK_SECRET
```

### Deployment configuration

Keep these in a protected GitHub Environment or the owner shell. They are not authentication secrets, but they identify the production billing, authentication, or infrastructure deployment and therefore do not belong in source control.

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_D1_DATABASE_NAME`
- `CLOUDFLARE_WORKER_NAME`
- `WORKOS_CLIENT_ID`
- `WORKOS_ISSUER`
- `STRIPE_CREATOR_MONTHLY_PRICE_ID`
- `STRIPE_CREATOR_ANNUAL_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `STRIPE_PORTAL_CONFIGURATION_ID`
- `BILLING_RETURN_URL`
- `CORTEX_ADMIN_WORKOS_USER_IDS`
- `STRIPE_RECONCILE_AFTER_SECONDS`

The production GitHub Environment must also set the policy flags explicitly:

```dotenv
CORTEX_AI_ENABLED=true
AI_PROVIDER_ENABLED=true
CORTEX_FREE_ONLY=false
```

The public/local profile intentionally uses the inverse, fail-closed values. Missing flags never enable billing or provider traffic. Commercial deployment validation also fails unless a restricted `bpc_` Customer Portal configuration is present.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Leave the free-only defaults in place when working on local Toolbox features.
3. For billing/auth/hosted-AI development, use WorkOS sandbox data, Stripe test-mode objects, and a restricted development provider key.
4. Apply migrations against local D1 and start Wrangler.

```powershell
pnpm --filter @cortex/cloud exec wrangler d1 migrations apply DB --local
pnpm --filter @cortex/cloud dev
```

HTTP billing return URLs are accepted only for `localhost`, `127.0.0.1`, and `[::1]`. Every non-loopback deployment must use HTTPS.

The Worker validates configuration at each service boundary and reports missing variable names internally without returning values to clients.

## Production deployment

The manual `Deploy Cortex Cloud` workflow is the preferred production path. It reads non-secret metadata from GitHub Environment variables, reads only the Cloudflare API token from GitHub Secrets, renders and validates the ignored production configuration, verifies the required Worker secret names against that exact Worker, performs a dry run, applies migrations, and deploys.

For an owner-shell deployment, set the deployment variables without saving them in shell history or tracked files, authenticate Wrangler, then run:

```powershell
pnpm --filter @cortex/cloud run verify:config
pnpm --filter @cortex/cloud run check:bindings
pnpm --filter @cortex/cloud run deploy:dry-run
pnpm --filter @cortex/cloud run migrate:production
pnpm --filter @cortex/cloud deploy
```

The generator never writes provider, Stripe, webhook, WorkOS server, or Cloudflare administrative credentials. `CLOUDFLARE_API_TOKEN` is consumed directly by Wrangler.

## Stripe setup

The optional `stripe:setup` script reads the four approved Price IDs from the owner environment, derives their Product IDs from Stripe, and validates the product metadata before it can create or update the restricted Customer Portal. It contains no production catalogue identifiers. Use test-mode objects during development and never run automated tests with a live Stripe credential.

Required owner-shell variables for catalogue validation are:

- `STRIPE_CREATOR_MONTHLY_PRICE_ID`
- `STRIPE_CREATOR_ANNUAL_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `STRIPE_SECRET_KEY`

Run validation first:

```powershell
pnpm --filter @cortex/cloud stripe:setup
```

Portal mutation additionally requires `CORTEX_STRIPE_SETUP_CONFIRM=I_UNDERSTAND_THIS_MUTATES_STRIPE` and the `--apply-portal` argument. Store the resulting `bpc_` configuration ID as deployment configuration, not source. Checkout and Portal remain disabled until that ID is configured.

Configure the production Stripe webhook at the deployed Worker origin plus `/v1/stripe/webhook` for these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The webhook signing secret belongs only in Cloudflare secret storage.

## Desktop release coordinates

The desktop requires two intentionally public coordinates for hosted functionality: `CORTEX_WORKOS_CLIENT_ID` and `CORTEX_CLOUD_API_URL`. Supply them as GitHub repository/environment variables at build time. They are compiled into Electron main-process code and must be treated as public. The release workflow rejects a missing or malformed WorkOS client ID and any non-HTTPS cloud origin. Production builds ignore developer `.env` files, preventing local credentials or deployment IDs from contaminating a release.

No desktop build may contain Stripe server credentials, a WorkOS API key, an OpenRouter credential, a Cloudflare token, the GitHub reporting token, or a signing password.

## Verification order

1. Run public-source scanning and `verify:config`.
2. Generate the production overlay and run Wrangler dry-run/startup checks.
3. Verify required Cloudflare secret names against the generated production Worker without printing values.
4. Apply D1 migrations and deploy from the protected production Environment.
5. Confirm `/health` succeeds and unauthenticated `/v1/me` returns 401.
6. Verify WorkOS PKCE sign-in and client/issuer pinning, including both documented trailing-slash issuer forms.
7. Verify Stripe test-mode checkout, restricted portal, webhook signature, projection, cancellation, and payment-failure behavior.
8. Verify provider requests occur only for entitled users and never expose provider responses or credentials in logs.
9. Rebuild the desktop with explicit public coordinates and scan the unpacked app, ASAR, installer, and any source maps.

Live deployment, billing, authentication, inference, signing, and clean-machine installation remain owner-controlled release gates; local tests cannot substitute for them.
