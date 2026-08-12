# Public release security checklist

Run this checklist from a fresh clone of the exact commit that will become public.

## Source and history

- [ ] `pnpm security:scan` passes.
- [ ] Gitleaks scans all remote branches and tags with full history and zero findings.
- [ ] No `.env`, `.dev.vars`, credential, certificate, signing, log, profiler, or local Cloudflare state file is tracked.
- [ ] No Stripe Product/Price/Portal ID, WorkOS Client ID, D1/account/resource ID, deployed Worker URL, or private endpoint appears in current source or reachable history.
- [ ] Every pre-rewrite commit SHA that GitHub previously retained returns `404` through the Git Data API; GitHub Support has confirmed cached commit/PR views were purged.
- [ ] `.gitignore` still permits only safe example env files.

## Configuration boundaries

- [ ] Checked-in Wrangler config has empty deployment values, no `database_id`, `CORTEX_FREE_ONLY=true`, and both provider flags false.
- [ ] Production Wrangler overlay is generated under ignored `.wrangler/` from a protected GitHub Environment or owner shell.
- [ ] OpenRouter, Stripe API, and Stripe webhook values exist only as Cloudflare secrets.
- [ ] Cloudflare API token and Windows signing material exist only as GitHub Actions secrets.
- [ ] WorkOS uses a public PKCE client coordinate; no WorkOS API key or client secret is in desktop/Vite configuration.
- [ ] Local development uses WorkOS sandbox/Stripe test mode and does not silently target production.

## CI, code, and artifacts

- [ ] `pnpm install --frozen-lockfile`, `pnpm audit`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` pass.
- [ ] `verify:config`, generated binding check, Worker tests, Wrangler dry-run, and startup profiling pass.
- [ ] GitHub Actions use `secrets.*` for credentials and `vars.*` for deployment metadata; no step prints credential values.
- [ ] Production main, preload, and renderer source maps are absent.
- [ ] Production Vite builds receive public client coordinates only from explicit CI/owner process variables, never ignored env files.
- [ ] `pnpm make` succeeds from an environment with local credentials unset.
- [ ] Gitleaks scans Vite output, `app.asar`, unpacked Electron output, installer, NUPKG, and ZIP archives with zero findings.
- [ ] Exact local secret/deployment values are absent from compiled bundles and `app.asar`.
- [ ] Signed release artifacts are used when signing secrets are configured; checksums and SBOM are published.
- [ ] No pre-hardening release or Actions artifact is public; release assets were rebuilt from the exact sanitized commit.
- [ ] Historical workflow runs and logs do not expose removed configuration or downloadable pre-hardening packages.

## External production checks

- [ ] WorkOS sign-in/client/issuer validation succeeds in the intended environment.
- [ ] Stripe test-mode checkout, portal, webhook signature, entitlement projection, cancellation, and failure paths succeed.
- [ ] OpenRouter requests remain server-side and occur only for entitled accounts.
- [ ] D1 migrations are applied to the intended database through the generated production overlay.
- [ ] A clean-machine Windows install/update/uninstall smoke test passes.
- [ ] `docs/security/PUBLIC_SOURCE_AUDIT.md` has no open finding and says `SAFE TO PUBLISH`.
- [ ] Repository visibility remains private until every item above is complete.
