# AGENTS.md

Cortex ToolBox is a local-first FiveM resource desktop workbench. Monorepo: `apps/desktop` (Electron 43 + React 19 + Vite + TypeScript) and `apps/cortex-cloud` (Cloudflare Worker + D1). All analysis and file generation run on device and write only through reviewed change plans with SHA-256 verification.

## Runtime and tooling

- Node `>=24 <25`, pnpm `>=10` (pinned `10.33.0`). Use `pnpm install --frozen-lockfile`. Do not use npm or yarn.
- Workspaces are `apps/*` and `packages/*` (`pnpm-workspace.yaml`). Packages are `@cortex/*`.
- Desktop: `pnpm dev` (stable) and `pnpm dev:beta` (separate beta identity); package with `pnpm make` and `pnpm make:beta`. Cloud uses Wrangler in `apps/cortex-cloud`.

## Validation

Run before PR and after meaningful changes:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm format:check` and `pnpm security:scan` (also enforced by pre-commit hook and CI)

CI is `.github/workflows/checks.yml` on `ubuntu-latest`. Release validation is `pnpm release:check` and `pnpm release -- <version> <channel>` which dispatches GitHub Actions; do not build or upload artifacts from the maintainer machine.

## Architecture invariants

- Module catalog is `apps/desktop/src/shared/modules.ts` (`moduleIdSchema`: `index`, `sentinel`, `probe`, `wire`, `bundle`, `chassis`, `align`, `pulse`, `chevron`, `extensions`). Do not add modules without updating the catalog, `modules.test.ts`, and routing.
- Design tokens are centralized in `apps/desktop/src/renderer/styles.css` (`--cortex-*`, Everforest palette, green accent `#a7c080`). Do not duplicate token files; custom palettes go through `shared/theme-schema.ts` and `renderer/lib/themes*`.
- Brand identities live in `apps/desktop/assets/brand/` (`icon.png` stable, `icon-beta.png` beta, `icon-dev.png` development). Channel mapping is `src/shared/branding.ts`; icon generation is `scripts/generate-icons.mjs` run by Forge `generateAssets`.
- Renderer is isolated: `contextIsolation` on, `nodeIntegration` off, strict CSP. Never execute workspace or resource code during analysis; Probe and Sentinel parse statically.
- IPC contracts are `src/shared/contracts.ts` and `src/main/ipc.ts`. Update flow is `updates:*` via `main/update-service.ts` (GitHub Releases with SHA-256); reports are `reports:*` via `components/BugReportForm.tsx` and require `CORTEX_GITHUB_REPORT_TOKEN`.

## Product and design invariants

- Native desktop developer tool, not a SaaS dashboard: flat, calm, compact, typography-driven. Reject card grids, nested bubble containers, gradients, glows, glassmorphism, decorative animation, pill badges, and excessive radius. Validation and repair views are full-width split workbenches, not narrow centered documents.
- Green accent is sparing: primary actions, active nav and tabs, installed and success states only. Status uses inline dot plus colored text, never chips.
- Shell framing is top-left inset with right and bottom flush to the window (`--cortex-shell-inset`, `--cortex-shell-radius`). Prefer structural layout fixes over cosmetic radius or color tweaks.
- Module pages have no title or description header banners. `PageHeader` in `components/UiPrimitives.tsx` is toolbar-only (context plus actions); content starts directly with toolbars or workbenches.
- Sidebar has category headers only for Primary workflow and Creative tools. Collapsed state uses thin line dividers. Secondary chrome and inline edit affordances are icon-only with no button backgrounds.
- Settings follows Cursor style: back to app, search, categorized left nav, card panels. Theme palette is dropdown only with no horizontal strip. Hide main workspace toolbar chrome while in Settings. The no-workspace Overview must not duplicate capability install or enable controls from Settings.
- Prefer custom in-app form controls over native OS widgets such as Windows `<select>`; use simple progress bars for download and update feedback. Design documentation covers only color and palette tokens, not layouts, typography scales, or component patterns.
- Preserve existing behavior when redesigning. Use real workspace data, never placeholder metrics. Every user setting persists across restarts through local storage with migration and normalization.

## Repository rules

- Local-first and privacy: do not send project files to a cloud service. Cloud credentials, Stripe, WorkOS, and D1 resource IDs are deployment configuration or Cloudflare and GitHub secrets. Never commit `.env`, `.env.*`, `.dev.vars`, credentials, or signing material. Public builds receive only intentionally public WorkOS client and Worker URL via GitHub variables. See `SECURITY.md` and `apps/cortex-cloud/DEPLOYMENT.md`.
- Generated and ignored paths: `artifacts/`, `out/`, `dist/`, `.vite/`, `.cortex/`, `coverage/`, `test-results/`, `playwright-report/`, `node_modules/`, `.wrangler/`. Do not recreate `DESIGN.md` or `docs/`; they were intentionally removed. Audit findings may emit `docs/rules/{ruleId}.md` paths as metadata only; do not write those files to disk.
- Keep the repository lean: do not add docs, gitignore entries, or AI and Playwright tooling artifacts unless explicitly requested.
- Every generated or repaired file has a preview and a SHA-256 verified write. Keep changes local and reversible with backups under `.cortex/`.

## Specialized work

- For product UI use `frontend-design` or `product-ui-orchestrator` with `interface-design` as lead visual authority; inspect the real target in `apps/desktop` before changing.
- For FiveM resource, manifest, vehicle metadata, or NUI work use `fivem-orchestrator` and cross-check `README.md` Workbench and `apps/desktop/PRODUCT.md` before adding framework assumptions.
- For user-facing prose load `unslop` and keep voice reliable, confident, and elegant. Do not use em dashes.
