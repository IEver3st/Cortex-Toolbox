# Cortex AI production deployment

This is the owner runbook for Cortex Cloud, WorkOS, Stripe, D1, and OpenRouter. Cortex Toolbox remains free; only authenticated Creator and Pro accounts receive hosted Cortex AI. Run commands with Node 24 and pnpm 10. Never put server secrets in Electron, Vite variables, preload, renderer storage, diagnostics, or packaged files.

## 1. WorkOS production application

1. Create or select the production AuthKit application.
2. Register `cortex-toolbox://auth/callback` for packaged protocol sign-in. If the production build uses loopback mode, also register the exact WorkOS-supported loopback redirect used by the app.
3. Record the public WorkOS client ID. Cortex Cloud verifies JWTs through public JWKS; a WorkOS API key is not required by this implementation.
4. Confirm PKCE, state validation, refresh, encrypted session storage, and sign-out with a production desktop build.

## 2. D1 and Worker configuration

```powershell
pnpm --filter @cortex/cloud exec wrangler login
pnpm --filter @cortex/cloud exec wrangler d1 create cortex-cloud
```

Put the returned database ID in `apps/cortex-cloud/wrangler.toml`. Replace `WORKOS_CLIENT_ID` and `BILLING_RETURN_URL` placeholders. The return URL must be a safe HTTPS page owned by Cortex; the desktop refreshes `/v1/me` after browser focus and with a bounded 2/5/10-second refresh sequence.

Apply all migrations locally first, then remotely:

```powershell
pnpm --filter @cortex/cloud exec wrangler d1 migrations apply cortex-cloud --local
pnpm --filter @cortex/cloud exec wrangler d1 migrations apply cortex-cloud --remote
```

Migration `0003_commercial_ai.sql` preserves existing Free/Pro accounts, adds Creator and Stripe projection fields, stops old request counters from controlling entitlement, and creates the integer-microUSD usage periods, reservations, raw ledger, and webhook idempotency state. Existing Pro rows remain Pro until webhook/reconciliation evidence changes them.

## 3. Server secrets and kill switches

Create a dedicated production OpenRouter key for Cortex. In OpenRouter, set an account/key spending cap as the final blast door beyond monthly user caps, per-run caps, hourly limits, and concurrency.

```powershell
pnpm --filter @cortex/cloud exec wrangler secret put OPENROUTER_API_KEY
pnpm --filter @cortex/cloud exec wrangler secret put STRIPE_SECRET_KEY
```

Set `CORTEX_AI_ENABLED=false` to stop all hosted inference or `AI_PROVIDER_ENABLED=false` to stop provider traffic without shipping a desktop update. Both default to enabled when absent; production should set them explicitly as shown in `wrangler.toml`.

## 4. Approved Stripe objects

Do not create replacement products, prices, meters, invoice items, or usage-based billing.

| Plan    | Product               | Monthly price                    | Annual price                     |
| ------- | --------------------- | -------------------------------- | -------------------------------- |
| Creator | `prod_V2UrxUNT6VYpQA` | `price_1U2PuXQqaHP22wnxni38nsWc` | `price_1U2PueQqaHP22wnxROZLdlkX` |
| Pro     | `prod_V2Ur5t20SdTTZQ` | `price_1U2PulQqaHP22wnxUhu72m9y` | `price_1U2PurQqaHP22wnxp58We6AZ` |

The four price IDs are non-secret Worker variables. Tests must use mocks or separately supplied Stripe test-mode IDs and keys. Never run automated tests with a live secret key.

## 5. Customer Portal

The Stripe account does not yet have the required restricted portal configuration. Validate objects read-only:

```powershell
$env:STRIPE_SECRET_KEY='sk_live_...'
$env:STRIPE_CREATOR_MONTHLY_PRICE_ID='price_1U2PuXQqaHP22wnxni38nsWc'
$env:STRIPE_CREATOR_ANNUAL_PRICE_ID='price_1U2PueQqaHP22wnxROZLdlkX'
$env:STRIPE_PRO_MONTHLY_PRICE_ID='price_1U2PulQqaHP22wnxUhu72m9y'
$env:STRIPE_PRO_ANNUAL_PRICE_ID='price_1U2PurQqaHP22wnxp58We6AZ'
pnpm --filter @cortex/cloud stripe:setup
```

To explicitly create the portal configuration, review the script, then run:

```powershell
$env:CORTEX_STRIPE_SETUP_CONFIRM='I_UNDERSTAND_THIS_MUTATES_STRIPE'
pnpm --filter @cortex/cloud stripe:setup -- --apply-portal
```

The script enables payment-method updates, invoices, period-end cancellation, and price changes restricted to the four approved prices. Put the printed `bpc_...` ID in the Worker variable `STRIPE_PORTAL_CONFIGURATION_ID`. It never runs during Worker or desktop startup.

## 6. Deploy and configure the webhook

```powershell
pnpm --filter @cortex/cloud run verify:config
pnpm --filter @cortex/cloud deploy
```

Wrangler prints the public Worker origin. The canonical production webhook URL is that exact origin plus:

```text
/v1/stripe/webhook
```

For example: `https://cortex-cloud.<your-workers-subdomain>.workers.dev/v1/stripe/webhook`. The repository cannot know the account subdomain before owner deployment; copy the exact deployed origin from Wrangler rather than guessing it.

In Stripe Workbench, create one webhook endpoint with only:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy the endpoint signing secret into Cloudflare, then redeploy if required:

```powershell
pnpm --filter @cortex/cloud exec wrangler secret put STRIPE_WEBHOOK_SECRET
```

The route verifies the signature against the raw body before JSON parsing. Successfully processed event IDs are idempotent; failed processing remains retryable.

## 7. Local Stripe development

Use test-mode keys and test-mode equivalents of all four prices in `apps/cortex-cloud/.dev.vars`. Never point local automated tests at live objects.

```powershell
stripe login
stripe listen --forward-to http://127.0.0.1:8787/v1/stripe/webhook
pnpm --filter @cortex/cloud dev
```

Put the temporary `whsec_...` from Stripe CLI into the local `STRIPE_WEBHOOK_SECRET`. Use Stripe CLI fixtures or a test Checkout; do not mutate the production webhook for local work.

## 8. Desktop public configuration

Only public coordinates belong in the release environment:

```dotenv
CORTEX_WORKOS_CLIENT_ID=client_...
CORTEX_WORKOS_CALLBACK_MODE=protocol
CORTEX_CLOUD_API_URL=https://cortex-cloud.<your-workers-subdomain>.workers.dev
```

Build and inspect the packaged output. It must not contain `OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or a WorkOS server API key.

## 9. Provider route verification

Before each production release, verify the public OpenRouter metadata rather than silently changing policy:

```powershell
$model = (Invoke-RestMethod 'https://openrouter.ai/api/v1/models').data |
  Where-Object id -eq 'deepseek/deepseek-v4-flash-0731'
$endpoints = (Invoke-RestMethod 'https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints').data.endpoints
$model.id
$model.reasoning.supported_efforts
$endpoints | Where-Object tag -eq 'baseten/fp8' |
  Select-Object provider_name, tag, quantization, context_length, supported_parameters
```

Shipping policy is one model (`deepseek/deepseek-v4-flash-0731`), one provider tag (`baseten/fp8`), `allow_fallbacks=false`, Fast=`low`, Advanced=`max`. If either identifier disappears or the Baseten route loses required tool/reasoning parameters, stop deployment and investigate; do not substitute another model or provider.

## 10. Production verification order

1. Confirm `/health` returns `{ "ok": true }`.
2. Confirm unauthenticated `/v1/me` returns 401.
3. Sign in through the production WorkOS flow and confirm a new account is Free with `ai.entitled=false`.
4. Confirm Free can use local Toolbox and receives the polished upgrade state without an OpenRouter request.
5. Run a real `$7.99` Creator monthly Checkout.
6. Confirm `checkout.session.completed` links the stable WorkOS/Cortex ID to one Stripe Customer.
7. Confirm the subscription webhook sets Creator/month and `/v1/me` updates without trusting the redirect.
8. Run one Fast and one Advanced Creator task; verify usage percentage advances and D1 records integer provider cost.
9. Upgrade to Pro through the portal; confirm current monthly usage is preserved while the hard budget rises.
10. Run one Fast and one Advanced Pro task and confirm the Pro concurrency policy is represented.
11. Schedule cancellation; confirm access remains and the desktop shows `Cancels <date>` until Stripe ends the subscription.
12. In test mode, simulate `invoice.payment_failed`; confirm the warning and portal action while recoverable access remains.
13. Exercise soft and hard limits with mocked/provider test accounting; confirm no Stripe overage, meter, invoice item, token pack, or fallback is created.
14. Inspect D1 reservations after an intentionally abandoned run and verify TTL cleanup releases unused capacity.
15. Cancel/refund the owner’s live verification subscription as appropriate.

## Owner checklist

- [ ] Replace the D1 ID in `wrangler.toml`
- [ ] Replace the production WorkOS client ID and HTTPS billing return URL
- [ ] Apply D1 migrations remotely
- [ ] Add the dedicated `OPENROUTER_API_KEY` Worker secret
- [ ] Set an OpenRouter production spending cap
- [ ] Add `STRIPE_SECRET_KEY` as a Worker secret
- [ ] Validate the four existing Stripe prices
- [ ] Explicitly create/configure the restricted Customer Portal
- [ ] Set `STRIPE_PORTAL_CONFIGURATION_ID`
- [ ] Deploy Cortex Cloud and copy its exact public origin
- [ ] Create the Stripe webhook at `<deployed-origin>/v1/stripe/webhook`
- [ ] Add `STRIPE_WEBHOOK_SECRET` as a Worker secret
- [ ] Build the desktop with only the public WorkOS client ID and Worker URL
- [ ] Run a live `$7.99` Creator Checkout
- [ ] Confirm webhook-to-D1 entitlement sync
- [ ] Verify Creator Fast and Advanced runs
- [ ] Upgrade to Pro and verify preserved usage plus Pro limits
- [ ] Verify cancellation and payment-failure UX
- [ ] Cancel/refund the owner verification subscription if appropriate

Code and deterministic tests can leave the product one owner-controlled deployment sequence away from live billing, but they cannot prove production readiness until these external steps succeed.
