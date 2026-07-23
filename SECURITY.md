# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Reporting a vulnerability

Please report security issues privately instead of opening a public GitHub issue.

1. Open a [private security advisory](https://github.com/IEver3st/CRT/security/advisories/new) on this repository.
2. Include a clear description, affected versions, reproduction steps, and impact.
3. Redact secrets, private resource files, and personal paths from any attachments.

We aim to acknowledge reports within a few business days. We will coordinate disclosure timing with you before publishing a fix.

## Scope

In scope:

- Cortex ToolBox desktop application code in this repository
- Update download integrity and installer verification
- IPC boundaries between the Electron main process, preload bridge, and renderer
- Diagnostics and GitHub report submission redaction

Out of scope:

- Third-party FiveM server or resource code you analyze with Cortex
- Misconfigurations in your local environment or custom `.env.local` files
- Issues in upstream dependencies unless they create a direct Cortex exploit path

## Safe defaults

- Never commit `.env`, `.env.local`, report tokens, or signing certificates.
- Public release builds should not embed `CORTEX_GITHUB_REPORT_TOKEN`.
- Packaged Windows installers should be distributed only through verified GitHub release assets with published SHA-256 checksums.
