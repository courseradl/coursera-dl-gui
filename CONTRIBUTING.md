# Contributing to Coursera DL

Thank you for helping improve Coursera DL. Contributions may include bug reports, documentation, design improvements, tests, and code changes.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before contributing

- Search existing issues and pull requests before opening a duplicate.
- Keep proposals focused on personal, authorized archival use.
- Do not submit features intended to bypass access controls, redistribute course material, scrape content at abusive scale, or evade platform restrictions.
- Never include real Coursera cookies, credentials, access tokens, personal data, or downloaded course content in issues, commits, logs, screenshots, or test fixtures.

For a substantial feature or architectural change, open an issue first so its scope and approach can be discussed before implementation.

## Development setup

Install the following prerequisites:

- A current stable Rust toolchain
- Bun
- The platform dependencies listed in the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

Clone and prepare the project:

```bash
git clone https://github.com/courseradl/coursera-dl-gui.git
cd coursera-dl-gui
bun install
```

Run the desktop application in development mode:

```bash
bun tauri dev
```

The frontend is in `src/`, and the Rust/Tauri backend is in `src-tauri/src/`.

## Making changes

1. Create a branch from the latest `main`.
2. Keep each change focused and avoid unrelated formatting or refactoring.
3. Follow the conventions already used in nearby code.
4. Add or update tests when behavior changes.
5. Update user-facing documentation when required.
6. Do not commit generated build output, local configuration, cookies, or downloaded course files.

Use clear commit messages, for example:

```text
fix: capture parent-domain Coursera cookies
feat: add download queue filtering
docs: clarify Linux setup
```

The `--release` commit suffix triggers the release workflow and is reserved for maintainers.

## Validation

Run the relevant checks before opening a pull request.

Frontend:

```bash
bun run build
```

Rust backend:

```bash
cd src-tauri
cargo check
cargo test --lib
```

For changes affecting desktop integration, also run the application locally on your platform and describe what you tested.

## Bug reports

A useful bug report includes:

- Operating system and architecture
- Coursera DL version or commit
- Reproduction steps
- Expected and actual behavior
- Relevant logs with secrets and personal information removed

Do not paste authentication cookies into an issue. Cookie values grant access to an account and must be treated like passwords.

## Pull requests

Pull requests should:

- Explain the problem and the chosen solution.
- Link related issues when applicable.
- List validation performed.
- Include screenshots or recordings for visible UI changes.
- Avoid mixing unrelated changes.
- Preserve compatibility across macOS, Windows, and Linux unless the limitation is clearly documented.

Maintainers may request changes for security, maintainability, platform compatibility, legal scope, or user experience.

## Releases and changelog

Release versions come from the first entry in `changelogs/changelogs.json`. The GitHub Actions release workflow copies that version into the application manifests and creates the matching `vX.Y.Z` tag.

Contributors should describe notable user-facing changes in their pull request. Maintainers will prepare the final changelog entry and release commit.

## License

By contributing, you agree that your contribution will be licensed under the repository's [GNU General Public License v3.0](LICENSE).
