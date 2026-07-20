## Learned User Preferences

- Wants serious native desktop developer-tool UI (VS Code, Linear, Raycast style): flat, calm, compact, typography-driven — not SaaS dashboards, card grids, or nested bubble containers.
- Avoid gradients, glows, glassmorphism, decorative animation, pill badges/status chips, and excessive rounded containers on productivity surfaces; use inline dot + colored text for status instead of chips.
- Use green accent sparingly: primary actions, active nav/tabs, installed/success states — not on every icon, border, or surface.
- Main app shell uses top-left inset framing with right/bottom flush to the window; prefer structural layout fixes over cosmetic radius or color tweaks.
- Design documentation should cover only colors, palette tokens, and how to use them — not layouts, typography scales, or component patterns.
- Keep the repo lean: no unnecessary docs, gitignore entries, or AI/Playwright tooling artifacts unless explicitly requested.
- For product UI work, use Slop or product-ui-orchestrator with interface-design as lead visual authority.
- Sidebar category headers only for Primary workflow and Creative tools; collapsed sidebar uses thin line dividers; secondary chrome and inline edit affordances should be icon-only (no button backgrounds).
- Settings page layout should follow Cursor-style patterns: back to app, search, categorized left nav, card-based settings panels; hide main workspace toolbar chrome while in Settings. No-workspace Overview must not duplicate capability install/enable controls from Settings.
- No module title/description header banners; module pages start with content or action toolbars only.
- Preserve all existing functionality when redesigning; use real app data, not placeholders or fake metrics. All user settings must persist across app restarts.
- Prefer custom in-app form controls over native OS widgets (e.g. Windows `<select>` dropdowns); use simple progress bars for download/update feedback.

## Learned Workspace Facts

- Cortex ToolBox is a FiveM resource desktop developer tool; main UI lives in `apps/desktop` (Electron + React).
- Primary shell components: `ActivityRail.tsx` (sidebar), `TitleBar.tsx`, `SettingsView.tsx`, `HomeModuleHub.tsx` (no-workspace overview), `StartView.tsx` (workspace overview).
- Design tokens and global styles are centralized in `apps/desktop/src/renderer/styles.css` (Everforest-style green accent palette).
- `DESIGN.md` and `docs/` were removed during repo cleanup; do not recreate unless asked.
- Audit findings in `packages/resource-parser` may emit `docs/rules/{ruleId}.md` paths as metadata only — no files are loaded from disk.
- Module catalog lives in `apps/desktop/src/shared/modules.ts`; IDs are Index, Sentinel, Probe, Wire, Bundle, Chassis, Align, Pulse, Extensions (migrated from manifest, code-smith, lattice, packbench, metaforge, concord, blinklab).
- `PageHeader` in `UiPrimitives.tsx` is toolbar-only (context + actions); module pages no longer render title/description banners.
- Settings About and Updates are merged into one About section with auto-update controls; `UpdateService` in main process handles GitHub release checks/downloads via `updates:*` IPC channels.
- `ActivityRail` shows an update-download icon between Activity and Settings when an update is ready to download.
- App icons live in `apps/desktop/assets/brand/`: `icon-dev.png` for the developer release branch and `icon.png` for stable; `branding.ts` maps Settings release branch to icon basename.
