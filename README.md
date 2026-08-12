<div align="center">

<img src="./apps/desktop/assets/brand/icon-256.png" width="112" alt="Cortex ToolBox icon" />

# Cortex ToolBox

### Build, audit, repair and package FiveM resources from one local desktop workbench

Analyse scripts, edit manifests, repair vehicle metadata, map resource relationships, design siren patterns and export release-ready packages without sending project files to a cloud service.

[![Latest Release](https://img.shields.io/github/v/release/IEver3st/Cortex-Toolbox?display_name=tag&sort=semver)](https://github.com/IEver3st/Cortex-Toolbox/releases/latest)
[![Release Downloads](https://img.shields.io/github/downloads/IEver3st/Cortex-Toolbox/total?label=release%20downloads)](https://github.com/IEver3st/Cortex-Toolbox/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?logo=windows)](https://github.com/IEver3st/Cortex-Toolbox/releases/latest)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron)](https://www.electronjs.org/)
[![Licence](https://img.shields.io/github/license/IEver3st/Cortex-Toolbox)](./LICENSE)

[Download Cortex](https://github.com/IEver3st/Cortex-Toolbox/releases/latest) · [Report a problem](https://github.com/IEver3st/Cortex-Toolbox/issues/new) · [View changelog](./CHANGELOG.md) · [Security](./SECURITY.md)

**Free tools for people who make things.**

</div>

<!--
Add one strong application screenshot beneath this comment.

Recommended path:
docs/media/cortex-toolbox-overview.png

Then use:
![Cortex ToolBox workspace](./docs/media/cortex-toolbox-overview.png)
-->

## Overview

Cortex ToolBox is a free-to-use, source-available Windows desktop application for FiveM resource developers and GTA V asset authors.

It brings the repetitive and failure-prone parts of resource development into one workspace:

- inspect and edit `fxmanifest.lua`;
- audit resources without executing their code;
- analyse Lua, JavaScript and TypeScript relationships;
- generate and repair linked vehicle metadata;
- build siren patterns and fleet chevrons;
- package clean, release-ready ZIP archives.

Cortex is local-first. Resource parsing, static analysis, validation and file generation run on the machine. Files are changed only after a reviewed change plan is approved.

## Why Cortex

A FiveM resource rarely fails in only one place.

A renamed model can break relationships across several metadata files. A manifest can reference a path that no longer exists. An event may be registered in one script and triggered from another. A release archive may contain development files, stale packages or no valid payload at all.

Cortex treats the resource as a connected system rather than a loose folder of files.

```text
Open workspace
      │
      ├── Parse manifest and project structure
      ├── Scan scripts and build a relationship graph
      ├── Validate assets and linked metadata
      ├── Review proposed repairs
      └── Package a verified release
```

## Workbench

### Development workflow

| Module       | Purpose                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| **Index**    | Parse and safely edit `fxmanifest.lua` and legacy `__resource.lua` files |
| **Sentinel** | Audit manifests, paths, secrets, asset hygiene and release risks         |
| **Probe**    | Analyse Lua, JavaScript and TypeScript without executing project code    |
| **Wire**     | Explore functions, events, exports, commands and caller relationships    |
| **Bundle**   | Build a clean ZIP package behind a release-validation gate               |

### Vehicle and creative tools

| Module              | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| **Chassis**         | Generate, import, edit and validate complete vehicle metadata bundles     |
| **Align**           | Diagnose and repair model names, siren IDs, light IDs and modkit bindings |
| **Pulse**           | Design 24-channel, 32-step siren patterns with live playback              |
| **Chevron Builder** | Create mirrored emergency and fleet warning panels with PNG export        |

### Experimental systems

| Module         | Purpose                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| **Extensions** | Inspect plugin manifests and requested permissions without executing extension code |

Experimental Extensions support in version 1.0 is intentionally limited to inspection and permission review. Workspace, archive, external-tool and network access are not exposed to extension code.

## Core capabilities

### Manifest editing with reviewed writes

Index converts FiveM manifests into a structured editor while retaining source ranges for each declaration.

It supports:

- client, server and shared scripts;
- `files` and `data_file` entries;
- dependencies;
- `ui_page`;
- scalar manifest fields;
- legacy resource migration.

Every write is staged as a change plan. Cortex previews the proposed result, calculates its SHA-256 hash and writes only after approval.

### Static resource analysis

Probe analyses supported scripts locally and extracts:

- functions;
- registered and emitted events;
- exports;
- commands;
- NUI callbacks;
- `SendNUIMessage` actions;
- dependencies;
- caller relationships.

Recognised FiveM patterns include:

```text
RegisterNetEvent
AddEventHandler
TriggerServerEvent
TriggerClientEvent
onNet
emitNet
RegisterNUICallback
SendNUIMessage
```

The resulting graph powers Wire, where contracts can be traced across client, server and shared scripts alongside an embedded CodeMirror editor.

### Resource auditing

Sentinel checks the workspace without executing its code.

Examples of detectable issues include:

- missing `fx_version`;
- missing `game`;
- legacy `__resource.lua`;
- unresolved manifest references;
- suspicious loop behaviour;
- missing waits;
- risky event usage;
- potentially unused assets;
- private keys, API keys, password assignments and AWS tokens.

Findings include severity, evidence, remediation guidance and a rule identifier. Project-specific suppressions are supported where a result is intentional.

### Vehicle metadata generation and repair

Chassis works across the linked GTA V vehicle metadata set:

```text
vehicles.meta
handling.meta
carcols.meta
carvariations.meta
vehiclelayouts.meta
```

It can:

- generate complete metadata bundles;
- import existing files;
- apply handling presets;
- expose detailed field editing;
- validate numeric ranges and enumerations;
- check cross-file relationships;
- attach a Pulse siren pattern;
- export the resulting bundle.

Align focuses on relationships that commonly break after files are renamed or combined. It proposes reviewed repairs for model identifiers, handling references, siren IDs, light IDs and modkit bindings, then revalidates the files after changes are applied.

### Release packaging

Bundle walks the workspace and constructs a proposed release package.

Before export, it:

- calculates SHA-256 hashes for package entries;
- excludes Cortex metadata and known development artefacts;
- ignores existing archives and lock files;
- detects stream folders;
- enforces configurable archive limits;
- blocks packaging when required manifest fields or payload files are missing.

The generated ZIP is therefore based on an explicit package plan rather than a blind directory archive.

### Siren pattern design

Pulse provides a grid sequencer for FiveM siren lighting:

- 24 channels;
- 32 time steps;
- configurable BPM;
- per-channel colours;
- live play, pause and reset;
- keyboard navigation;
- local draft persistence;
- `carcols.meta`-compatible XML export.

### Chevron generation

Chevron Builder creates mirrored warning panels for emergency, highway and fleet vehicles.

Available controls include:

- V, chevron and horizontal layouts;
- stripe width and angle;
- panel colours;
- finish and reflective settings;
- overlay text;
- day, headlamp and mask previews;
- PNG export.

Presets are included for fire apparatus, rescue command, ambulance, law-enforcement and roadworks layouts.

## Workspace model

Cortex can open:

1. a typed Cortex project containing `cortex.project.json`; or
2. an existing FiveM resource folder containing, or capable of receiving, a manifest.

Supported project types include:

```text
vehicle
clothing
prop
weapon
script
mixed
```

New Cortex projects can create the following local support structure:

```text
.cortex/
├── backups/
├── cache/
├── previews/
├── indexes/
└── logs/
```

The application maintains recent workspaces, remembers the last active paths and can reopen the previous workspace when available.

## Installation

Cortex ToolBox currently targets Windows 10 and Windows 11.

1. Open the [latest release](https://github.com/IEver3st/Cortex-Toolbox/releases/latest).
2. Download the Windows setup executable.
3. Run the installer.
4. Launch Cortex.
5. Open an existing FiveM resource or create a Cortex project.

> [!NOTE]
> Some releases may be unsigned when repository signing credentials are not configured. Windows can display an additional warning for unsigned installers. Verify that the installer came from this repository and compare its published SHA-256 checksum when available.

## Privacy and safety

Cortex is designed around reviewed, local operations.

- Resource files are analysed locally.
- Project code is not executed during static analysis.
- The Electron renderer uses context isolation with Node integration disabled.
- A strict Content Security Policy is applied.
- Proposed file changes are shown before writing.
- File results are protected by SHA-256 verification.
- Diagnostic text is redacted for common tokens, passwords and secrets.
- Public builds do not contain a GitHub reporting token by default.
- Extension code is not executed in version 1.0.

See [SECURITY.md](./SECURITY.md) for supported versions and private vulnerability reporting.

## Public-source configuration

Local desktop tools work without production credentials. Copy the tracked example files only when you need local overrides:

- `.env.example` or `apps/desktop/.env.example` for main-process desktop configuration;
- `apps/cortex-cloud/.dev.vars.example` for local Worker sandbox/test configuration.

Never commit the copied files. Cloudflare provider/Stripe/webhook credentials are Worker secrets; billing, WorkOS, and Cloudflare resource IDs are deployment configuration. Production Electron builds receive only the intentionally public WorkOS client coordinate and Worker URL through GitHub variables. See [Cortex Cloud deployment](./apps/cortex-cloud/DEPLOYMENT.md) and the [public release checklist](./docs/security/PUBLIC_RELEASE_CHECKLIST.md).

Run `pnpm security:scan` before opening a pull request. The pre-commit hook scans staged files, and CI runs both the repository scanner and Gitleaks.

## Personalisation

Cortex provides configurable settings for:

- light, dark and system appearance;
- theme presets and custom palettes;
- interface scale and density;
- editor font, size, ligatures and contrast;
- module visibility;
- sidebar ordering and category labels;
- reduced motion;
- external tool paths;
- release channel and update behaviour.

Preferences are stored locally and normalised when loaded so older settings can be migrated forward.

## Updates and release channels

Cortex supports three channels:

| Channel       | Purpose                                                       |
| ------------- | ------------------------------------------------------------- |
| `stable`      | Normal public releases                                        |
| `beta`        | Pre-release builds with a separate app identity and installer |
| `development` | Local development builds with updates disabled                |

Packaged Windows builds can check GitHub Releases when updating is enabled. Cortex downloads the Squirrel installer, checks it against the release's published SHA-256 checksum and asks before opening it.

Tagged pushes matching `v*` run the release workflow, which tests the monorepo, packages Windows artefacts, generates checksums and an SBOM, then publishes the GitHub release.

## Architecture

Cortex is structured as a pnpm monorepo.

```text
Cortex-Toolbox/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── main/          # Electron main process, IPC and services
│       │   ├── preload/       # Restricted context bridge
│       │   ├── renderer/      # React interface and workbench modules
│       │   └── shared/        # Contracts, module catalogue and branding
│       ├── assets/brand/      # Stable, beta and development identities
│       ├── e2e/               # Playwright desktop tests
│       └── makers/            # Windows packaging
├── packages/
│   ├── core/                  # Result types, safe writes, queues and paths
│   ├── project-schema/        # Typed projects and migrations
│   ├── resource-parser/       # Manifests, audits, file trees and packaging
│   ├── script-analysis/       # Lua, JavaScript and TypeScript analysis
│   ├── vehicle-meta/          # Metadata schemas, generation and repair
│   ├── format-adapters/       # Built-in and external conversion capabilities
│   ├── plugin-sdk/            # Plugin manifests and permission schemas
│   └── ui/                    # Shared interface primitives
├── examples/
│   └── complete-resource/     # Test and demonstration resource
├── scripts/
├── CHANGELOG.md
├── SECURITY.md
├── TRADEMARKS.md
└── LICENSE
```

### Desktop stack

| Layer                | Technology                               |
| -------------------- | ---------------------------------------- |
| Desktop runtime      | Electron 43                              |
| Frontend             | React 19 and TypeScript                  |
| Routing              | React Router                             |
| State                | Zustand and TanStack Query               |
| Editor               | CodeMirror 6                             |
| Interface primitives | Radix UI                                 |
| Styling              | Tailwind CSS 4 and CSS custom properties |
| Notifications        | Sonner                                   |
| Unit testing         | Vitest                                   |
| End-to-end testing   | Playwright                               |
| Packaging            | Electron Forge and Squirrel              |
| Monorepo             | pnpm workspaces                          |

## Development

### Requirements

- Node.js `>=24 <25`
- pnpm `>=10`
- Windows for producing and testing Windows distributables

The repository pins pnpm `10.33.0`.

### Clone and install

```powershell
git clone https://github.com/IEver3st/Cortex-Toolbox.git
cd Cortex-Toolbox
pnpm install
```

### Start the stable development build

```powershell
pnpm dev
```

### Start the beta channel locally

```powershell
pnpm dev:beta
```

### Build

```powershell
pnpm build
pnpm package
```

### Create distributables

```powershell
pnpm make
```

For the beta channel:

```powershell
pnpm make:beta
```

The current makers produce a Windows Squirrel installer, ZIP package and NUPKG artefact.

### Quality checks

```powershell
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm format:check
```

### Environment configuration

Copy the desktop environment template:

```powershell
Copy-Item apps/desktop/.env.example apps/desktop/.env.local
```

Environment overrides can configure:

- logging;
- the release channel;
- the GitHub update repository;
- an optional issue-reporting token;
- the optional YTD tool path;
- archive size limits.

Never commit reporting tokens or embed private credentials in public installers.

## Contributing

Contributions are welcome, particularly when they improve correctness, explainability or support for real FiveM resource structures.

A useful contribution should:

1. include a reproducible resource or synthetic fixture;
2. add or update automated tests;
3. preserve preview-before-write behaviour;
4. keep framework-specific assumptions configurable;
5. explain any new diagnostic rule and its remediation;
6. avoid executing untrusted workspace code.

Before implementing a substantial module, open an issue so its scope and integration can be reviewed.

## Reporting problems

For a useful bug report, include:

- Cortex version and release channel;
- Windows version;
- project type;
- the affected module;
- a minimal reproducible resource;
- expected and actual behaviour;
- redacted diagnostic output;
- whether the issue occurs in a clean workspace.

Do not publish secrets, paid assets or proprietary resources in an issue.

## Licence

Cortex ToolBox is source-available under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

You may use, study, modify and share the software for noncommercial purposes, subject to the terms and required notices in that licence. Commercial use—including selling, paid hosting, bundling it into a paid product or service, or using it to provide commercial benefit—requires separate written permission from the copyright holder.

The Cortex name, Cortex ToolBox name, logos, icons and official branding are not licensed as part of the source code. See the [trademark and branding policy](./TRADEMARKS.md) before publishing a fork or redistribution.

This licensing change does not revoke rights already granted for earlier releases; those releases remain available under the licences that accompanied them.

## Disclaimer

Cortex ToolBox is an independent community project. It is not affiliated with or endorsed by Rockstar Games, Take-Two Interactive or Cfx.re.

FiveM, Grand Theft Auto V and related names and assets belong to their respective owners.

---

<div align="center">

Built to make evidence visible, changes reviewable and releases rather less temperamental.

</div>
