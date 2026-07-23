# Cortex ToolBox

Cortex ToolBox is a free, native desktop workbench for building, auditing, packaging, and editing [FiveM](https://fivem.net/) resources and GTA V mod assets. It is built with Electron, React, TypeScript, and a collection of local-analysis packages so your files stay on your machine unless you explicitly choose otherwise.

> **Tagline:** Free tools for people who make things.

---

## Table of contents

- [What it does](#what-it-does)
- [Workbench modules](#workbench-modules)
    - [Workflow tools](#workflow-tools)
    - [Creative tools](#creative-tools)
    - [System extensions](#system-extensions)
- [Project and workspace model](#project-and-workspace-model)
- [Settings and personalization](#settings-and-personalization)
- [Auto-updates and release channels](#auto-updates-and-release-channels)
- [Security, privacy, and diagnostics](#security-privacy-and-diagnostics)
- [Architecture overview](#architecture-overview)
- [Development](#development)
- [License](#license)

---

## What it does

Cortex gives FiveM and GTA V asset authors a single, keyboard-friendly desktop surface for the repetitive, error-prone parts of resource development:

- Open, create, and migrate resource folders as typed Cortex projects.
- Audit manifests, scripts, and asset hygiene without running code.
- Analyze Lua, JavaScript, and TypeScript resources to map events, exports, commands, and caller relationships.
- Structure, preview, and export clean ZIP packages with release-gate checks.
- Generate, validate, merge, and repair linked `vehicles.meta`, `handling.meta`, `carcols.meta`, `carvariations.meta`, and `vehiclelayouts.meta` files.
- Design 24-channel, 32-step siren patterns with live playback and `carcols` export.
- Build mirrored emergency/fleet chevron panels with exact geometry and PNG export.
- Inspect third-party plugin manifests and requested permissions in an experimental Extensions preview. Extension code does not run in Cortex 1.0.

Everything is driven from a compact, typography-first UI with a left-hand Activity Rail, tabbed workspace, command palette, and settings surface.

---

## Workbench modules

Modules are the tools you see in the sidebar and tab bar. Each one can be enabled or disabled in Settings, and most settings persist across restarts. The catalog lives in `apps/desktop/src/shared/modules.ts` and is grouped into **Primary workflow**, **Creative tools**, and **System**.

### Workflow tools

#### Index

Edit `fxmanifest.lua` (and legacy `__resource.lua`) with safe, reviewed writes and declaration helpers.

- Parses manifests into a structured view with source ranges for every entry.
- Edits client, server, shared scripts, `files`, dependencies, `data_file` entries, `ui_page`, and scalar fields.
- All writes go through a change-plan: Cortex previews the diff, hashes the result, and only writes after you approve it.
- Catches unsupported keys and missing required fields before they become a broken resource.

#### Sentinel

Validate paths, manifests, hygiene, and release risks without executing code.

- Scans the workspace file tree against the parsed manifest.
- Detects missing `fx_version`, missing `game`, legacy `__resource.lua` usage, and unresolved manifest references.
- Flags potentially sensitive strings such as private keys, API keys, password assignments, and AWS tokens.
- Supports per-project rule suppressions.
- Findings include severity, explanation, remediation, and a documentation rule ID.

#### Probe

Find loop abuse, missing waits, risky events, and potentially unused assets.

- Runs static analysis on Lua, JavaScript, and TypeScript files.
- Extracts symbols: functions, events, exports, commands, and dependencies.
- Identifies event listeners (`RegisterNetEvent`, `AddEventHandler`, `onNet`, `.on`), emissions (`TriggerServerEvent`, `TriggerClientEvent`, `emitNet`), NUI callbacks, and `SendNUIMessage` actions.
- Builds a resource graph of files, functions, events, exports, commands, and caller edges.
- Reports summary counts for scripts, lines, events, exports, commands, and code pieces.

#### Wire

Map functions, events, exports, commands, and callers with an embedded editor.

- Visualizes the resource graph extracted by Probe.
- Embedded CodeMirror editor for reading and editing supported text files.
- Helps trace contracts across client, server, and shared scripts.

#### Bundle

Structure resource files, generate a manifest, preview, and export a clean ZIP.

- Walks the workspace and proposes package entries with SHA-256 hashes.
- Filters out `.cortex` metadata, lock files, existing archives, and known non-payload files.
- Runs a release gate that blocks packaging if the manifest is missing, `fx_version` or `game` are absent, or no payload files are present.
- Supports stream-folder detection and configurable archive size limits.

### Creative tools

#### Chassis

Generate, import, validate, merge, and edit linked GTA V vehicle metadata.

- Produces complete meta bundles: `vehicles.meta`, `handling.meta`, `carcols.meta`, `carvariations.meta`, `vehiclelayouts.meta`.
- Supports handling presets (street, sport, emergency, etc.) and fine-grained field editing.
- Validates against the schema pack, including numeric ranges, enums, and cross-file relational constraints.
- Imports existing files, applies edits in memory, and exports the resulting bundle.
- Can include a Pulse siren pattern when linked.

#### Align

Diagnose and repair renamed models, siren IDs, light IDs, and modkit bindings.

- Detects cross-file mismatches between `vehicles.meta`, `handling.meta`, `carcols.meta`, and `carvariations.meta`.
- Proposes repair candidates with before/after diffs.
- Supports manual review, skipping, and one-click apply for safe repairs.
- Revalidates files after repair so you can see how many issues remain.

#### Pulse

Design 24-channel, 32-step light patterns with live playback and `carcols` export.

- Grid-based sequencer with 24 siren channels and 32 time steps.
- Configurable BPM, siren ID, and per-channel colors.
- Live play/pause/reset with keyboard navigation.
- Saves drafts locally and exports to `carcols.meta`-compatible XML.

#### Chevron Builder

Build mirrored emergency, highway, and fleet warning panels with exact geometry and PNG export.

- Presets for fire apparatus, rescue command, ambulance, law enforcement, and chapter-8 roadworks.
- Supports V, chevron, and horizontal layouts.
- Configurable angle, stripe width, colors, finish type, reflective settings, and overlay text.
- Day, headlamp, and mask preview modes; PNG export.

### System extensions

#### Extensions

Inspect workspace-scoped plugin manifests in an experimental preview.

- Loads plugins from a dedicated folder.
- Validates plugin manifests against a strict schema.
- Shows declared permissions and stores preview grants for future runtime support.
- Does not execute extension code or expose workspace, archive, external-tool, or network capabilities to plugins in version 1.0.
- Appears only after Experimental tools is enabled and the preview module is installed in Settings.

---

## Project and workspace model

Cortex is workspace-based. A workspace is either:

- A **Cortex project** folder containing a `cortex.project.json` file.
- A **temporary** view of any FiveM resource folder that has (or can get) a manifest.

Project types include `vehicle`, `clothing`, `prop`, `weapon`, `script`, and `mixed`. When a project is created, Cortex writes `cortex.project.json` and scaffolding folders under `.cortex/backups`, `.cortex/cache`, `.cortex/previews`, `.cortex/indexes`, and `.cortex/logs`.

The app keeps a recent-workspaces list, remembers last-opened paths, and reopens the last workspace on launch when possible. You can reveal any workspace in your OS file explorer directly from the UI.

---

## Settings and personalization

Settings are stored locally with `electron-store` and normalized on read so older preference files are migrated forward. The settings surface is organized into:

- **General** : interface scale, pointer cursor, and UI density.
- **Appearance** : light/dark/system mode, theme preset, palette selection, and custom palettes.
- **Editor** : editor font size, code font, ligatures, and contrast protections.
- **Modules** : enable or disable individual workbench modules.
- **Sidebar** : navigation density, category labels, and custom module ordering.
- **Accessibility** : reduced motion and text contrast safeguards.
- **External tools** : path to the optional YTD extraction tool.
- **Privacy and data** : explains local-only operation and how diagnostics are handled.
- **Report a Problem** : submit a GitHub issue with attached diagnostic events.
- **About** : version, license, release branch, and auto-update controls.

Themes and color tokens are centralized in `apps/desktop/src/renderer/styles.css` and applied through CSS custom properties.

---

## Auto-updates and release channels

Cortex supports three release channels:

- `stable`
- `beta` : separate app bundle ID, icon, and installer name
- `development` : local builds; updates are disabled

Windows packaged builds can check GitHub releases when enabled via `CORTEX_ENABLE_AUTO_UPDATE`. Cortex downloads the Squirrel installer, verifies it against the release's published SHA-256 checksum, and then offers to open it. Auto-update controls live in Settings > About, and the Activity Rail shows download or install actions as the update advances.

In-app updates are disabled on macOS and Linux in version 1.0. Those platforms receive release artifacts but must install updates manually.

---

## Security, privacy, and diagnostics

- **Local-first:** Resource parsing, script analysis, and vehicle meta validation run locally. No cloud service is required to use the app.
- **Sandboxed renderer:** The Electron renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and a strict Content Security Policy.
- **Extensions preview:** Plugin manifests are validated and requested grants can be reviewed, but plugin code is not executed in version 1.0.
- **Safe file writes:** All text edits are staged through a change plan with SHA-256 verification. Files are only modified after review.
- **Diagnostics:** The main process captures log events and renderer errors locally. A maintainer-configured build can submit reports to GitHub from Settings > Feedback. Tokens, passwords, and secrets are redacted from diagnostics and report text before submission. Public builds do not embed a reporting token and show the feature as unavailable unless one is supplied securely at runtime.

See [SECURITY.md](SECURITY.md) for supported versions and how to report vulnerabilities privately.

---

## Architecture overview

```
cortex/
├── apps/desktop          # Electron + React application
│   ├── src/main          # Main process (IPC, services, file I/O)
│   ├── src/renderer      # React UI, components, modules
│   ├── src/shared        # Contracts, modules catalog, branding
│   └── src/preload       # Context-bridge preload script
└── packages
    ├── core              # Result types, safe writes, job queue, path helpers
    ├── project-schema    # Typed Cortex project files and migrations
    ├── resource-parser   # Manifest parsing, file tree scanning, audit, packaging
    ├── script-analysis   # Lua/JS/TS symbol and reference extraction
    ├── vehicle-meta      # GTA V vehicle metadata schema, validation, repair, generation
    ├── format-adapters   # Capability registry for external and built-in converters
    ├── plugin-sdk        # Plugin manifest and permission schemas
    └── ui                # Shared UI primitives (if any)
```

The renderer uses:

- **React 19** with `react-router-dom` for tab routing.
- **Zustand** for local stores and **TanStack Query** for server-state (IPC-backed) queries.
- **CodeMirror 6** for text editing.
- **Radix UI** primitives for accessible dialogs and menus.
- **Tailwind CSS 4** and custom CSS variables for theming.
- **Lucide** icons.
- **Sonner** for toast notifications.

The main process exposes a typed IPC layer defined in `apps/desktop/src/shared/contracts.ts`. All channels are registered in `apps/desktop/src/main/ipc.ts` and consumed through the preload API in `apps/desktop/src/preload/index.ts`.

---

## Development

### Requirements

- Node.js `>=24 <25`
- pnpm `>=10` (project uses `pnpm@10.33.0`)

### Install dependencies

```bash
pnpm install
```

### Run the desktop app in development

```bash
pnpm dev
```

### Run the beta channel locally

```bash
pnpm dev:beta
```

### Build the renderer and package the Electron app

```bash
pnpm build
pnpm package
```

### Make distributables

```bash
pnpm make        # stable
pnpm make:beta   # beta
```

The current makers produce Windows Squirrel setup/ZIP/NUPKG artifacts, a macOS ZIP, and Linux ZIP/DEB/RPM artifacts. DMG and AppImage packages are not produced in version 1.0.

### Quality commands

```bash
pnpm test        # unit tests with Vitest
pnpm test:e2e    # Playwright end-to-end tests
pnpm lint        # ESLint
pnpm typecheck   # TypeScript --noEmit across packages
pnpm format      # Prettier
pnpm icons       # Regenerate application icons from source assets
```

### Environment overrides

Copy `apps/desktop/.env.example` to `apps/desktop/.env.local` to configure logging, release channel, the GitHub update repository, an optional report token, the optional YTD tool path, and archive size limits. `CORTEX_GITHUB_REPOSITORY` is the short repository name (`CRT`), not a GitHub URL. Never commit report tokens or bake them into public installers.

### Releasing

Tagged pushes (`v*`) trigger the [Release workflow](.github/workflows/release.yml), which runs tests, packages installers for Windows/macOS/Linux, generates checksums and SBOMs, and publishes a GitHub release. Beta tags should include `beta` in the tag name (for example `v0.2.0-beta.1`).

---

## License

Cortex ToolBox is released under the [GNU General Public License v3.0 or later](LICENSE).

```
Copyright (C) Cortex contributors
```

See `LICENSE` for the full license text.
