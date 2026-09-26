# coursera-dl-gui

> **Coursera DL GUI** is a modern, high-performance desktop application engineered for personal archiving and local backups of Coursera learning materials. Designed to replace brittle, legacy command-line scripts, it provides an intuitive, robust graphical interface paired with a lightweight native engine across Windows, macOS, and Linux.

---

## Overview

**Coursera DL** simplifies the process of creating offline personal archives of courses you have legitimately enrolled in. Built on top of the **Tauri** framework with a native **Rust** backend and a responsive **React** frontend, it ensures minimal resource footprint, rock-solid stability, and complete user privacy.

---

## System Architecture & Features

- **Modern Desktop UI**: A clean, human-readable graphical user interface (GUI) built with a custom color scheme inspired by digital education templates.
- **Rust-Powered Core**: Engineered with Tauri and Rust for native memory efficiency and a minimal system footprint.
- **Secure Cookie Authentication**: Processes data entirely on the user's local machine using account session cookies. No hardcoded or transmitted remote credentials.
- **Human-Mimicking Smart Throttling**: Configured with automated random delays and pacing adjustments between module downloads to avoid request grouping.
- **Comprehensive Content Archiving**: Safely archives video segments, lecture slides, and course PDFs to a customizable local target folder.

---

## Step-by-Step Usage Flow

Follow this sequential guide to back up your course content:

1. **Step 1**: Open your standard web browser and log into your legitimate Coursera account.
2. **Step 2**: Open the browser's developer tools (`Inspect Element`), navigate to the network/application storage tab, and securely copy your account session cookies (`CAUTH` / session tokens).
3. **Step 3**: Launch the **Coursera DL** desktop application on your system.
4. **Step 4**: Paste your session cookies securely into the app's local authentication profile card.
5. **Step 5**: Select your active, enrolled course modules from the layout pane, choose a local output storage directory, and click **"Start Archiving"**.

---

## Quick Installation

Install or update **Coursera DL** instantly using the automated command-line installer:

### macOS / Linux
```bash
curl -fsSL https://courseradl.github.io/install.sh | bash
```

### Windows (PowerShell)
```powershell
irm https://courseradl.github.io/install.ps1 | iex
```

---

## Development & Environment Setup

### Prerequisites

Ensure the following tools are installed on your workstation:
- **Rust Toolchain**: [rustup](https://rustup.rs/) (Stable channel)
- **Node.js runtime**: [Node.js (LTS)](https://nodejs.org/) or [pnpm](https://pnpm.io/)
- **Platform C Compilers & Build Tools**: Follow the official [Tauri Prerequisites Guide](https://tauri.app/start/prerequisites/).

### 1. Clone the Repository

```bash
git clone https://github.com/courseradl/coursera-dl-gui.git
cd coursera-dl-gui
```

### 2. Install Frontend Dependencies

Using `pnpm`:
```bash
pnpm install
```

Or using `npm`:
```bash
npm install
```

### 3. Run Locally in Development Mode

Using `pnpm`:
```bash
pnpm tauri dev
```

Or using `npm`:
```bash
npm run tauri dev
```

### 4. Build & Package for Production

To compile native release binaries and platform installers:

Using `pnpm`:
```bash
pnpm tauri build
```

Or using `npm`:
```bash
npm run tauri build
```

The compiled binaries will be output to `src-tauri/target/release/bundle/`.

---

## Community

Please read the [contributing guidelines](CONTRIBUTING.md) before submitting an issue or pull request. All community participation is governed by the project's [Code of Conduct](CODE_OF_CONDUCT.md). Report suspected vulnerabilities privately according to the [Security Policy](SECURITY.md).

---

## ⚠️ Legal Disclaimer & Warranty Limitation
This software is an unofficial, community-driven personal archival tool. It is strictly intended for personal, educational, offline use and the preservation of learning materials that the end-user already holds legitimate, active, and authorized access to view. The developer does not condone, encourage, or facilitate digital piracy, copyright circumvention, mass redistribution, or commercialization of data. Use of automated tools may violate the target platform's terms of service. 

This application is licensed under the GNU General Public License v3.0 (GPL-3.0). As specified in Sections 15 and 16 of the GPL-3.0, this software is provided 'as is' without warranty of any kind, either expressed or implied. The author and contributors assume absolutely no liability or responsibility for any platform-side account restrictions, access bans, token revocations, data loss, or legal actions resulting from the use or misuse of this codebase.
