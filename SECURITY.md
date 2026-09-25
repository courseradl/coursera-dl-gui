# Security Policy

## Supported versions

Security fixes are provided for the latest published release and the current `main` branch.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| `main` | Yes, pre-release |
| Older releases | No |

Users should update to the latest release before reporting an issue that may already have been resolved.

## Reporting a vulnerability

Please report suspected vulnerabilities privately by emailing [hello@mubashar.dev](mailto:hello@mubashar.dev) with the subject `Coursera DL security report`.

Do not disclose an unresolved vulnerability in a public issue, pull request, discussion, or social media post.

A useful report includes:

- A description of the vulnerability and its potential impact.
- The affected version, commit, operating system, and architecture.
- Reproduction steps or a minimal proof of concept.
- Any relevant logs with credentials and personal information removed.
- Suggested mitigations, if available.

You should receive an acknowledgment within three business days. After triage, the maintainer will share whether the issue is accepted, request additional information if necessary, and coordinate a remediation and disclosure timeline when applicable.

## Protecting credentials and user data

Coursera authentication cookies, especially `CAUTH`, provide access to an account and must be treated like passwords.

- Never include real cookies, passwords, access tokens, downloaded course material, or personal data in a report.
- Replace sensitive values with clearly marked placeholders.
- If a credential is accidentally exposed, revoke the affected session immediately by signing out of Coursera and changing the account password when appropriate.
- Do not test against accounts or systems you do not own or have explicit permission to access.

The application is designed to process authentication data locally. Any behavior that unexpectedly transmits, logs, exposes, or persists sensitive authentication data beyond the intended local session should be reported as a security issue.

## In-scope security issues

Examples include:

- Exposure or unintended logging of authentication cookies or personal data.
- Unsafe local storage or cleanup of session credentials.
- Authentication bypasses or session confusion between users.
- Arbitrary command execution, path traversal, or unsafe file writes.
- Malicious course metadata causing code execution or access outside the selected download directory.
- Vulnerable dependencies with a demonstrated impact on this application.
- Release artifact, updater, or signing-chain vulnerabilities.

## Out-of-scope reports

The following are generally outside this project's security scope:

- Vulnerabilities in Coursera or other third-party services that do not originate in this application.
- Account restrictions or rate limits caused by automated use.
- Social engineering, phishing, denial-of-service testing, or testing that disrupts third-party systems.
- Reports that require using stolen credentials or accessing content without authorization.
- Issues affecting unsupported releases when they cannot be reproduced on the latest version.

Third-party vulnerabilities should be reported directly to the affected provider through its official security channel.

## Coordinated disclosure

Please allow reasonable time to investigate and release a fix before public disclosure. The project will credit reporters who request recognition, unless anonymity is preferred or the report violates this policy.

Submitting a report does not authorize destructive testing, privacy violations, service disruption, or access to data belonging to others.
