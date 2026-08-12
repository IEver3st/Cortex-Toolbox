# Cortex Toolbox public-source security audit

Audit date: 2026-08-12
Scope: all publishable files, Electron main/preload/renderer boundaries, Cortex Cloud Worker, Stripe, WorkOS, OpenRouter, CI/release configuration, Git history and refs, and generated Electron/Worker artifacts.

## Executive summary

The publishable working tree has been remediated so production credentials and production deployment identifiers are no longer stored in source. Worker configuration now fails closed, production metadata is generated into an ignored overlay, provider and billing credentials remain Cloudflare secrets, release builds cannot inherit developer env files, production source maps are disabled, logging redaction is broader, and local plus CI secret scanning is permanent.

The official GitHub refs have been replaced with a single sanitized root commit, the old release tag now points to that commit, the pre-hardening release has been quarantined as a draft, and a fresh clone contains no prior history. The repository must nevertheless **remain private** for one final GitHub-controlled cleanup: GitHub's Git Data API still serves the orphaned pre-rewrite commit by its known SHA. That commit contains production Stripe catalogue identifiers. They are not authentication credentials and cannot authorize access, but publishing while GitHub retains the object would violate the deployment-metadata policy. GitHub Support must purge the orphaned object and cached commit views before visibility changes.

No committed authentication secret was found by Gitleaks across all locally reachable commits and refs. A GitHub credential exists only in an ignored local `.env`; it was not tracked, was not found in Git history, and is not present in the rebuilt Electron artifacts. It does not require rotation based on this audit.

## Findings

### CRITICAL

#### PS-001 — vulnerable parser and packaging dependency chain — remediated

The initial dependency audit reported 44 advisories, including two critical vulnerabilities and high-severity issues in XML parsing, archive handling, image processing, routing, YAML, URL parsing, temporary files, and build tooling.

Remediation upgraded direct dependencies and applied narrow pnpm overrides to patched transitive versions. The final `pnpm audit` reports no known vulnerabilities. Repository tests, E2E, Worker checks, and Electron packaging were repeated after the upgrades.

### HIGH

#### PS-002 — production deployment identifiers in source — remediated; GitHub object purge required

The working tree contained a production WorkOS Client ID, four Stripe Price IDs, Stripe Product IDs, a portal configuration ID, a Cloudflare D1 database ID, a production billing return URL, and production-oriented Wrangler documentation/configuration.

All current values were removed. The public Wrangler profile now contains empty deployment values and safe flags. Stripe Product and Price IDs are owner-supplied configuration. The D1 ID is written only to an ignored generated production overlay.

An atomic, lease-protected rewrite replaced `main`, `v1.0.0`, and the temporary hardening branch with a sanitized root commit. The PR head now resolves to the same root and has no merge ref. A fresh clone exposes one commit and no production-shaped deployment identifiers across reachable refs. GitHub still retains the orphaned pre-rewrite commit in object storage and returns it through the authenticated Git Data API when addressed by its known SHA. Purging that unreachable object and cached views is the only open publication blocker.

#### PS-003 — Worker configuration failed open toward commercial/provider behavior — remediated

Missing `CORTEX_FREE_ONLY`, `CORTEX_AI_ENABLED`, or `AI_PROVIDER_ENABLED` values previously permitted commercial/provider paths by default. The defaults now resolve to free-only, hosted-AI disabled, and provider disabled. Typed service-boundary validation names a missing variable internally without returning its value to clients.

#### PS-004 — production config validator required committed production values — remediated

The former validator treated committed WorkOS, Stripe, billing, and D1 values as a deployable production profile. It was replaced by:

- validation that blocks identifiers and secrets in the checked-in Wrangler profile;
- a typed deployment environment schema;
- an ignored generated `.wrangler/deploy/wrangler.production.toml` overlay;
- a manual, protected GitHub `production` Environment deployment workflow;
- Cloudflare secret-name verification without reading values.

#### PS-011 — pre-hardening release artifacts remained published — remediated

The published `v1.0.0` release contained desktop artifacts produced before source maps and deployment metadata were removed from packaged output. The release was converted to a draft so its seven assets remain recoverable to the owner but cannot become public with the repository. A new public release must be built from the sanitized root using the hardened release workflow.

### MEDIUM

#### PS-005 — production source maps and local env contamination — remediated

Main, preload, and renderer production builds emitted source maps, and the main build read ignored local env files. Existing local artifacts therefore contained production WorkOS/Worker coordinates, although no desktop secret was found bundled.

Production source maps are now disabled. Production builds read public client coordinates only from explicit CI/owner process variables; ignored `.env`, `.env.local`, and `.env.production` files are not build inputs. A clean public-default rebuild produced zero packaged source maps, and exact-value checks confirmed that ignored GitHub, WorkOS, and Worker values were absent from Vite output and `app.asar`.

#### PS-006 — incomplete permanent regression protection — remediated

The repository lacked a dedicated current-tree identifier scanner and full-history secret CI job. It now has:

- `pnpm security:scan` for credentials and production-shaped service identifiers;
- staged-file scanning in Husky before commits;
- CI current-tree scanning;
- Gitleaks on pushes and pull requests with full checkout history;
- high-severity dependency audit enforcement in CI.

#### PS-007 — diagnostic redaction gaps — remediated

Diagnostics already redacted Bearer and common GitHub tokens but did not directly cover OpenRouter, Stripe, webhook, JWT, WorkOS/Stripe deployment IDs, or Worker origins. The redactor and tests now cover those classes. Backend errors remain generic to clients and log only safe error classes/messages, never headers or raw environment objects.

### LOW

#### PS-008 — ignore and example coverage was incomplete — remediated

`.gitignore` now covers nested env variants, `.dev.vars`, credentials/service accounts, secret directories, certificate/signing formats, Cloudflare state, scan reports, source maps, logs, and profiler output while retaining safe example files. Example files classify secrets versus deployment configuration and default local development to free-only.

### INFORMATIONAL

#### PS-009 — ignored local credentials are present but isolated

Gitleaks found a fine-grained GitHub credential in the ignored root `.env`. It is not tracked, was absent from all scanned history, and was absent from rebuilt Vite, ASAR, package, and installer artifacts. The file was preserved because it is owner-controlled local configuration. Never add ignored env files with `git add -f`.

#### PS-010 — signing remains owner-controlled

The release workflow can materialise an optional P12 certificate from a GitHub Actions secret into the runner temp directory and supplies the password only at package time. No certificate or signing password is stored in source. The locally generated installer is unsigned because owner signing secrets were intentionally not used during this audit.

## Remediations performed

- Removed current WorkOS, Stripe, D1, portal, billing-return, and Worker deployment values from tracked source.
- Externalised Stripe Product IDs in the owner-only setup script and stopped logging configured Price IDs.
- Reworked Wrangler into a safe public profile plus ignored typed production overlay.
- Added typed, fail-closed Worker runtime configuration validation.
- Kept OpenRouter, Stripe API, and Stripe webhook credentials exclusively as Cloudflare secret bindings.
- Added a protected manual Cloudflare deployment workflow using GitHub Environment variables and a GitHub secret for the Cloudflare API token.
- Updated release/package workflows to source public desktop coordinates from GitHub variables and signing material from GitHub secrets.
- Prevented production Electron builds from reading ignored developer env files, including an implicit `.env.production` lookup.
- Disabled production main, preload, and renderer source maps.
- Expanded diagnostic redaction and tests.
- Hardened `.gitignore`, safe examples, deployment documentation, README guidance, and `SECURITY.md` incident response.
- Added local/staged/CI public-source scanning, full-history Gitleaks on pull requests/main/release tags, and scanner/audit gates in manual and tagged packaging workflows.
- Upgraded vulnerable direct dependencies and pinned patched transitive versions until upstream toolchains adopt them.
- Created and verified an offline pre-rewrite Git bundle outside the repository.
- Atomically replaced `main`, `v1.0.0`, and the PR branch with a lease-protected sanitized root commit.
- Quarantined the pre-hardening `v1.0.0` binaries by converting the release to a draft.
- Deleted 132 pre-rewrite GitHub Actions runs, which removed 17 active pre-hardening artifacts and their associated logs while retaining seven green sanitized-root runs.
- Disabled the SBOM action's implicit artifact/release uploads so release publication occurs only through the explicit, dependency-gated publish job.

## Credentials requiring rotation

None identified from tracked source or Git history.

Rotation becomes mandatory if the final pre-publication Gitleaks run finds a credential in any remote ref not present during this audit, or if an owner knows a value was shared outside Git through another channel.

## Production identifiers removed

- Stripe Product, Price, and Billing Portal configuration IDs
- WorkOS Client IDs
- Cloudflare D1 database IDs
- deployed Worker origins and webhook origins
- production billing return URLs
- hard-coded production GitHub owner/repository fallbacks from the desktop env profile
- production-only catalogue values from examples and tests

## Remaining intentional public identifiers

- GitHub repository links and workflow-provided repository coordinates: necessary for the public project, releases, updates, and issue links.
- `api.workos.com`, `api.stripe.com`, and `openrouter.ai`: public third-party API origins required by server-side implementations; no Cortex account or application ID is included.
- the OpenRouter model and provider route names: functional server-side policy, not credentials or Cortex infrastructure identifiers.
- `cortex-toolbox://auth/callback`: the desktop protocol contract required for PKCE callback routing.
- localhost development origins: loopback-only developer defaults, never production infrastructure.
- symbolic environment/binding names: required to document and validate configuration structure.

The production WorkOS Client ID and Worker URL are intentionally compiled into a hosted-enabled desktop release at build time and are therefore public in distributed binaries. They are GitHub deployment variables, not committed source, and no server credential is paired with them.

## Verification

Completed checks:

```text
Node 24.11.1 / pnpm 10.33.0
pnpm install --frozen-lockfile
pnpm security:scan
pnpm security:scan --staged
pnpm audit
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm make
pnpm --filter @cortex/cloud run verify:config
pnpm --filter @cortex/cloud run types:bindings
pnpm --filter @cortex/cloud run check:bindings
pnpm exec vitest run apps/cortex-cloud/src
pnpm --filter @cortex/cloud exec wrangler deploy --dry-run
pnpm --filter @cortex/cloud exec wrangler check startup
gitleaks git . --log-opts="--all" --redact=100
gitleaks dir <isolated-publishable-file-snapshot> --max-archive-depth 3 --redact=100
gitleaks dir apps/desktop/out --max-archive-depth 3 --redact=100
```

Evidence from a fresh private-remote clone after the ref rewrite:

- Reachable history: one root commit; `main`, `v1.0.0`, the temporary branch, and PR head all resolved to the sanitized root at the rewrite checkpoint.
- Reachable deployment-identifier scan: zero matching files.
- Gitleaks 8.30.1: one reachable commit, approximately 2.95 MB, zero findings.
- Root tests: 43 files / 210 tests passed.
- Cortex Cloud focused tests: 7 files / 37 tests passed.
- Electron E2E: 15/15 passed.
- Typecheck passed across all 12 applicable workspace projects; lint completed with zero errors.
- Dependency audit: zero known vulnerabilities.
- Worker configuration, generated binding check, dry run, and startup analysis passed with safe empty deployment values and free-only/provider-disabled flags.
- Electron production package and stable Windows installer built successfully with zero source maps.
- Packaged executable launched with an isolated profile and produced four Electron processes; all smoke processes were terminated afterward.
- Gitleaks scanned approximately 181.82 MB of packaged output, including nested archives, with zero findings.
- Packaged-output deployment-identifier scan found zero matching files.
- GitHub Actions on the sanitized root passed security analysis, pull-request checks, and the platform build matrix.
- The old published release was converted to a draft; all pre-rewrite Actions runs/artifacts were removed; no forks exist.

## Required GitHub object purge before publication

Official refs and normal clone history are sanitized. Keep the repository private and open a GitHub Support sensitive-data-removal request asking GitHub to purge the orphaned pre-rewrite commit object and cached commit views. Provide Support with the repository name, the old commit SHA recorded in the private recovery bundle, and explain that the object contains production billing catalogue identifiers removed under a coordinated history rewrite.

After Support confirms removal, verify that the old SHA returns `404` through the Git Data API, repeat the fresh-clone history and Gitleaks checks, publish a newly rebuilt release rather than restoring the draft pre-hardening assets, and only then change repository visibility.

## Final verdict

**NOT SAFE TO PUBLISH**

Current source, reachable history, generated artifacts, licensing, and official GitHub refs satisfy the public-source architecture, and no credential rotation is required. Publication is blocked only by GitHub's retained orphaned pre-rewrite commit object. After GitHub Support purges that object and the owner repeats the short post-purge verification, the verdict becomes **SAFE TO PUBLISH** without additional source changes.
