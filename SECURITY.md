# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Reporting a vulnerability

Please report security issues privately instead of opening a public GitHub issue.

1. Open a [private security advisory](/security/advisories/new) on this repository.
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

- Never commit `.env`, `.dev.vars`, credentials, deployment IDs, report tokens, or signing certificates.
- Public release builds should not embed `CORTEX_GITHUB_REPORT_TOKEN`.
- Packaged Windows installers should be distributed only through verified GitHub release assets with published SHA-256 checksums.

## Configuration and credential incidents

Secrets belong in Cloudflare secret storage, GitHub Actions Secrets, or an owner-controlled local environment. Production WorkOS, Stripe catalogue, Cloudflare resource, and endpoint identifiers belong in deployment configuration, not source.

If a credential is accidentally committed:

1. stop sharing or deploying the affected ref;
2. revoke or rotate the credential with the issuing service immediately;
3. report the incident privately through a security advisory;
4. remove the value from the working tree and sanitise every reachable Git ref;
5. force-push only after coordinating with repository owners, then ask every clone owner to re-clone;
6. run `pnpm security:scan` and a full-history Gitleaks scan before resuming publication.

Deleting the latest copy is not sufficient because Git history is permanent once published.
