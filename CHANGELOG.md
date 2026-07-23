# Changelog

All notable changes to Cortex ToolBox are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-23

### Added

- Initial public release of Cortex ToolBox, a native desktop workbench for FiveM resource and GTA V asset development.
- Workflow modules: Index, Sentinel, Probe, Wire, and Bundle.
- Creative modules: Chassis, Align, Pulse, and Chevron Builder.
- Experimental Extensions preview for inspecting plugin manifests without executing extension code.
- Local-first project and workspace model with typed `cortex.project.json` files.
- Settings for appearance, editor, modules, sidebar, accessibility, and external tools.
- Windows auto-update support with GitHub release checks and SHA-256 installer verification.
- Optional in-app bug and feature reporting to GitHub when a maintainer token is configured at build time.

### Security

- Sandboxed Electron renderer with context isolation and a strict Content Security Policy.
- Safe file writes through reviewed change plans with SHA-256 verification.
- Diagnostics and report text redact tokens, passwords, and secrets before submission.

[1.0.0]: releases/tag/v1.0.0
