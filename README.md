# coursera-dl-gui

> **Coursera DL GUI** is a modern, high-performance desktop application engineered for personal archiving and local backups of Coursera learning materials. Designed to replace brittle, legacy command-line scripts, it provides an intuitive, robust graphical interface paired with a lightweight native engine across Windows, macOS, and Linux.

---

## Overview

**Coursera DL** simplifies the process of creating offline personal archives of courses you have legitimately enrolled in. Built on top of the **Tauri** framework with a native **Rust** backend and a responsive **React** frontend, it ensures minimal resource footprint, rock-solid stability, and complete user privacy.

---

## System Architecture & Features

- **Modern Desktop UI**: A clean, human-readable graphical user interface (GUI) built with a custom color scheme inspired by digital education templates.
- **Rust-Powered Core**: Engineered with Tauri and Rust for native memory efficiency and a minimal system footprint.
- **Direct Login & Flexible Authentication**: Sign in directly via a secure built-in Coursera window without manual cookie extraction, or optionally import Netscape `cookies.txt` / session cookies.
- **Human-Mimicking Smart Throttling**: Configured with automated random delays and pacing adjustments between module downloads to avoid request grouping.
- **Comprehensive Content Archiving**: Safely archives video segments, lecture slides, and course PDFs to a customizable local target folder.

---

## Step-by-Step Usage Flow

### Method 1: Direct Login (Recommended — No Cookie Extraction Required)

1. **Launch Coursera DL** on your desktop.
2. Click **"Login with Coursera"**.
3. A secure built-in login window will open. Enter your Coursera credentials or sign in using your preferred authentication provider (Google, Apple, SSO, etc.).
4. Once authenticated, the app automatically captures the session, closes the login window, and synchronizes your enrolled courses.

### Method 2: Manual Cookie Login (Alternative)

If you prefer using an existing browser session or need offline cookie authentication:
1. Log in to your Coursera account in your web browser (Chrome, Edge, Brave, etc.).
2. Export your session cookies in Netscape format using an extension such as *Cookie-Editor* or *Get cookies.txt LOCALLY* (or locate your `CAUTH` token).
3. In **Coursera DL**, expand **"Login using Coursera cookies"**.
4. Paste the cookies into the text area and click **"Login with cookies"**.

### Archiving Your Courses

1. Select your desired enrolled courses and modules from the course library.
2. Choose your preferred local output storage folder.
3. Click **"Start Archiving"** to download high-quality videos, slides, and learning materials.

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
