# Cortex Toolbox public-source security audit

Audit date: 2026-08-11
Scope: all publishable files, Electron main/preload/renderer boundaries, Cortex Cloud Worker, Stripe, WorkOS, OpenRouter, CI/release configuration, Git history and refs, and generated Electron/Worker artifacts.

## Executive summary

The publishable working tree has been remediated so production credentials and production deployment identifiers are no longer stored in source. Worker configuration now fails closed, production metadata is generated into an ignored overlay, provider and billing credentials remain Cloudflare secrets, release builds cannot inherit developer env files, production source maps are disabled, logging redaction is broader, and local plus CI secret scanning is permanent.

The repository must **not** be made public yet. The current private remote `main` history contains Stripe catalogue identifiers introduced in one commit. They are not authentication credentials and cannot authorise access, but they violate the public-source deployment-metadata policy and would become permanently public if repository visibility changed now. A coordinated history rewrite and force-push is the final publication gate.

No committed authentication secret was found by Gitleaks across all locally reachable commits and refs. A GitHub credential exists only in an ignored local `.env`; it was not tracked, was not found in Git history, and is not present in the rebuilt Electron artifacts. It does not require rotation based on this audit.

## Findings

### CRITICAL

#### PS-001 — vulnerable parser and packaging dependency chain — remediated

The initial dependency audit reported 44 advisories, including two critical vulnerabilities and high-severity issues in XML parsing, archive handling, image processing, routing, YAML, URL parsing, temporary files, and build tooling.

Remediation upgraded direct dependencies and applied narrow pnpm overrides to patched transitive versions. The final `pnpm audit` reports no known vulnerabilities. Repository tests, E2E, Worker checks, and Electron packaging were repeated after the upgrades.

### HIGH

#### PS-002 — production deployment identifiers in source — remediated in the working tree; history action required

The working tree contained a production WorkOS Client ID, four Stripe Price IDs, Stripe Product IDs, a portal configuration ID, a Cloudflare D1 database ID, a production billing return URL, and production-oriented Wrangler documentation/configuration.

All current values were removed. The public Wrangler profile now contains empty deployment values and safe flags. Stripe Product and Price IDs are owner-supplied configuration. The D1 ID is written only to an ignored generated production overlay.

The private remote history still contains Stripe catalogue identifiers in commit `e03feeae6ab02c5d7bb579249cd310754ba33aa0`. This is the only open publication blocker.

#### PS-003 — Worker configuration failed open toward commercial/provider behavior — remediated

Missing `CORTEX_FREE_ONLY`, `CORTEX_AI_ENABLED`, or `AI_PROVIDER_ENABLED` values previously permitted commercial/provider paths by default. The defaults now resolve to free-only, hosted-AI disabled, and provider disabled. Typed service-boundary validation names a missing variable internally without returning its value to clients.

#### PS-004 — production config validator required committed production values — remediated

The former validator treated committed WorkOS, Stripe, billing, and D1 values as a deployable production profile. It was replaced by:

- validation that blocks identifiers and secrets in the checked-in Wrangler profile;
- a typed deployment environment schema;
- an ignored generated `.wrangler/deploy/wrangler.production.toml` overlay;
- a manual, protected GitHub `production` Environment deployment workflow;
- Cloudflare secret-name verification without reading values.

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

Evidence at the completed audit point:

- Gitleaks 8.30.1 history: 215 reachable commits scanned, approximately 442.87 MB, zero authentication-secret findings.
- Publishable snapshot: 491 tracked/unignored files, approximately 2.96 MB, zero Gitleaks findings.
- Root tests: 45 files / 223 tests passed after the final dependency refresh and configuration hardening.
- Cortex Cloud focused tests: 7 files / 37 tests passed.
- Electron E2E: 21/21 passed on the final full-suite rerun.
- Typecheck passed across all 12 applicable workspace projects; lint completed with zero errors and one Fast Refresh warning in the renderer entrypoint.
- Dependency audit: zero known vulnerabilities after remediation.
- Worker dry run: passed with safe empty deployment variables and free-only/provider-disabled flags.
- Worker startup profile: passed on Wrangler 4.120.1; active startup sample was 25.9 ms, including 4.3 ms garbage collection.
- Electron production package and stable Windows installer: built successfully after the final dependency/configuration changes with zero source maps.
- Packaged executable: passed an isolated-profile launch from outside the repository and cleanly terminated all four smoke processes.
- Vite/ASAR exact local-value check: all three locally present credential/deployment values were absent across 46 production bundle/ASAR files.
- Gitleaks generated artifacts: approximately 684.99 MB scanned with no findings in Vite output, unpacked package/ASAR, installer, NUPKG, ZIP, or nested release archives.
- `pnpm security:scan`, staged scanning, ignore-boundary assertions, frozen install, build, make, and `git diff --check` all passed.

## Required history sanitisation before publication

Do this only after the remediated working tree has been reviewed, committed, and pushed to the still-private remote. Coordinate the force-push with every collaborator. Use a fresh mirror clone so local T3 checkpoint refs and ignored files cannot be published accidentally.

```powershell
py -m pip install --user git-filter-repo
winget install Gitleaks.Gitleaks

$privateRepo = '<PRIVATE_GIT_URL>'
$mirror = Join-Path $env:TEMP 'cortex-public-sanitized.git'
$replacements = Join-Path $env:TEMP 'cortex-deployment-id-replacements.txt'

git clone --mirror $privateRepo $mirror
Set-Location $mirror

$refs = git rev-list --all
$ids = git grep -h -o -E '(price|prod|bpc)_[A-Za-z0-9]{12,}|client_[A-Za-z0-9]{20,}|https://[A-Za-z0-9.-]+\.workers\.dev' $refs 2>$null
$ids | Sort-Object -Unique | ForEach-Object { "literal:$($_)==><removed-deployment-id>" } | Set-Content -LiteralPath $replacements

git filter-repo --force --replace-text $replacements
gitleaks git . --log-opts='--all' --redact=100 --no-banner

$remaining = git grep -I -l -E '(price|prod|bpc)_[A-Za-z0-9]{12,}|client_[A-Za-z0-9]{20,}|database_id[[:space:]]*=[[:space:]]*"[0-9a-fA-F-]{36}"|https://[A-Za-z0-9.-]+\.workers\.dev' $(git rev-list --all) 2>$null
if ($remaining) { throw 'Deployment identifiers remain in rewritten history.' }

git push --mirror $privateRepo
```

After the force-push, re-clone from the private remote, rerun every command in the verification section, confirm GitHub Actions is green, and only then change repository visibility.

## Final verdict

**NOT SAFE TO PUBLISH**

Current source and generated artifacts satisfy the credential-isolation architecture, and no credential rotation is required. Publication is blocked only by the historical Stripe catalogue identifiers in the private remote. After the coordinated rewrite, fresh-clone verification, and green CI, the verdict becomes **SAFE TO PUBLISH** without additional source changes.
