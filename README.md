# Steam Weed Wacker

![TypeScript](https://img.shields.io/badge/TypeScript-dominant-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-4285f4?logo=googlechrome&logoColor=white)
![License: Unlicense](https://img.shields.io/badge/license-Unlicense-lightgrey)

A safety-first Chrome extension for cleaning up unwanted Steam licenses from your account page.

Steam Weed Wacker helps you take large lists of free-package IDs, compare them against the licenses currently shown on your Steam account, and then either preview or execute a cleanup workflow with multiple layers of protection.

> Built for careful cleanup — not reckless deletion.

---

## Table of Contents

- [Why this project exists](#why-this-project-exists)
- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Safety-first design](#safety-first-design)
- [How it works](#how-it-works)
- [Feature highlights](#feature-highlights)
- [Tech stack](#tech-stack)
- [Language composition](#language-composition)
- [Project structure](#project-structure)
- [Installation](#installation)
- [Load the extension in Chrome](#load-the-extension-in-chrome)
- [Available scripts](#available-scripts)
- [Using the extension](#using-the-extension)
- [Permissions used](#permissions-used)
- [Testing](#testing)
- [Important notes and cautions](#important-notes-and-cautions)
- [Roadmap ideas](#roadmap-ideas)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Why this project exists

If you have claimed lots of free packages over time, your Steam licenses page can become crowded with trials, promos, delisted freebies, and other account clutter. Steam Weed Wacker is designed to help sort through that noise while reducing the risk of removing something valuable by mistake.

The project is inspired by package data from [SteamDB Free Packages](https://steamdb.info/freepackages/), and the original repository description captures the spirit well: this is the companion cleanup tool for that workflow.

## What it does

- Loads package IDs you want to review or remove
- Reads the licenses currently visible on `https://store.steampowered.com/account/licenses/`
- Matches your target package IDs against the page
- Supports a **dry run mode** so you can preview outcomes before deleting anything
- Lets you define **protected package IDs** that must never be touched
- Lets you define **protected title patterns** using plain text or regular expressions
- Automatically skips likely protected content such as DLC, soundtracks, expansions, and season passes
- Uses Steam metadata and review data to protect promising free games as **hidden gems**
- Imports prior classification data from an external Python workflow
- Detects and avoids retrying **zombie licenses** that Steam appears to ignore after an earlier deletion attempt
- Shows progress, status, skip reasons, ETA, and per-item decisions in a live dashboard
- Handles rate limiting with cooldowns, retries, and browser notifications

## Screenshots

> Replace these placeholders with real screenshots or GIFs from the extension.

### Popup UI

```text
[ Screenshot Placeholder ]
Steam Weed Wacker popup
- package ID input
- protected IDs
- protected title patterns
- dry run toggle
- Python JSON import
```

### Live cleanup dashboard

```text
[ Screenshot Placeholder ]
Injected on-page dashboard
- progress bar
- ETA
- skip reasons
- per-item decision log
- stop button
```

### Suggested GIF ideas

- Dry run walkthrough from popup to dashboard
- Safe cleanup of a small batch
- Rate-limit notification and cooldown handling

## Safety-first design

This project is intentionally built around preventing accidental removals.

Steam Weed Wacker includes several guardrails:

1. **Dry run by default** — the popup starts in non-destructive mode.
2. **Protected IDs** — explicit package allowlist for titles you never want removed.
3. **Protected title patterns** — protect games by name or regex rules.
4. **Keyword safeguards** — built-in protection for likely non-game or add-on content.
5. **Hidden gem detection** — protects free games with strong review signals.
6. **Fail-safe metadata handling** — if required metadata cannot be retrieved, the extension skips the item instead of risking deletion.
7. **Zombie detection** — if Steam previously reported success but the license still exists, the item is permanently skipped to avoid wasting more attempts.
8. **Rate-limit awareness** — pauses when Steam pushes back and resumes only after cooldown windows.

## How it works

The extension is a Manifest V3 browser extension built with React, TypeScript, and Vite.

### Core flow

1. Open the extension popup.
2. Paste package IDs from SteamDB or load them from the Steam licenses page.
3. Optionally add protected IDs and protected title patterns.
4. Keep **Dry Run** enabled for a safe preview.
5. Start the run.
6. The content script evaluates every requested package ID against what is currently visible on the Steam licenses page.
7. Each item is classified as delete, skip, or error.
8. If execution mode is enabled, the extension sends the Steam removal request only after all safeguards pass.

### Runtime pieces

- **Popup UI (`src/App.tsx`)**  
  The control center for entering package IDs, saving/loading state, importing Python results, toggling dry-run mode, and starting the workflow.

- **Content script (`src/content.ts`)**  
  Runs on the Steam licenses page, builds the candidate map, evaluates protections, performs removal requests, and renders the live progress dashboard.

- **Background service worker (`src/background.ts`)**  
  Handles notifications and cooldown alarms when Steam rate limits the workflow.

- **Utility helpers (`src/utils.ts`)**  
  Parse IDs and patterns, detect protected content, format ETA text, extract the Steam session ID, and evaluate hidden-gem rules.

## Feature highlights

### 1. Dry run mode
Dry run mode lets you simulate a cleanup without deleting anything. Items that would be removed are still marked in the report, so you can validate your list before switching to execution mode.

### 2. Protected IDs and patterns
You can protect specific package IDs and also define title-based rules. Title protection accepts:

- Plain text lines
- Regex patterns like `/^World of/iu`

This gives you both a simple allowlist and a more flexible pattern-based safeguard.

### 3. Hidden gem protection
The extension goes beyond string matching. For eligible items, it resolves package metadata and checks store review information. Free games with strong positive review signals and enough review volume are protected automatically.

### 4. Python import support
The popup includes a JSON import path for `trash_check_progress.json`. That allows you to reuse results from an external Python classification workflow and permanently protect previously identified “pearls.”

### 5. Live dashboard
During processing, the extension injects a dashboard into the Steam licenses page with:

- overall progress
- current item
- ETA and processing speed
- number of deletions, skips, and errors
- skip breakdown by reason
- a scrolling per-item decision list
- a stop button

### 6. Rate-limit handling
Steam Weed Wacker handles both HTTP `429` responses and Steam-specific cooldown behavior. It waits, updates the dashboard, and triggers browser notifications so the workflow is less error-prone during long runs.

## Tech stack

- **TypeScript**
- **React**
- **Vite**
- **Chrome Extensions Manifest V3**
- **Vitest** for testing
- **XO / ESLint** for linting and code quality

## Language composition

Current repository language breakdown:

- TypeScript: dominant language
- JavaScript
- HTML

This matches the project structure: a TypeScript-heavy extension with a React popup UI and HTML entry point.

## Project structure

```text
.
├── docs/
├── public/
│   └── icons/
├── src/
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── background.ts
│   ├── background.test.ts
│   ├── constants.ts
│   ├── content.ts
│   ├── content.test.ts
│   ├── main.tsx
│   ├── test-setup.ts
│   ├── types.ts
│   ├── utils.ts
│   └── utils.test.ts
├── index.html
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Installation

### Prerequisites

- Node.js
- npm
- Google Chrome or another Chromium-based browser with Manifest V3 support

### Setup

```bash
npm install
npm run build
```

This installs dependencies and produces the build output you can load into your browser.

## Load the extension in Chrome

After building the project, load it as an unpacked extension:

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** in the top-right corner
3. Click **Load unpacked**
4. Select the project’s built extension directory
5. Confirm the extension appears in your installed extensions list
6. Pin the extension for easier access if desired
7. Open your Steam licenses page:
   `https://store.steampowered.com/account/licenses/`
8. Click the extension icon to open Steam Weed Wacker

> If the popup cannot reach the Steam tab, reload the Steam licenses page and try again.

## Available scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run lint:fix
npm run test
npm run test:watch
npm run test:coverage
```

### Script reference

- `npm run dev` — start the Vite development server
- `npm run build` — run TypeScript compilation and produce a production build
- `npm run preview` — preview the built app
- `npm run lint` — run code quality checks
- `npm run lint:fix` — auto-fix supported lint issues
- `npm run test` — run the test suite once
- `npm run test:watch` — run tests in watch mode
- `npm run test:coverage` — generate coverage output

## Using the extension

### Basic workflow

1. Load the extension into your browser.
2. Open your Steam licenses page:
   `https://store.steampowered.com/account/licenses/`
3. Open the Steam Weed Wacker popup.
4. Paste candidate package IDs from SteamDB or click **Copy All Page IDs**.
5. Add any protected IDs or title patterns.
6. Leave **Dry Run** enabled and start a test pass.
7. Review the results in the on-page dashboard.
8. Only then disable dry run if you intentionally want to execute removals.

### Recommended safe workflow

- Start with a small batch.
- Use dry run first every time.
- Protect known keepers before running.
- Review hidden-gem skips instead of forcing deletion.
- Expect cooldown delays on larger runs.

### JSON import workflow

If you already have results from an external Python classification script:

1. Copy the contents of `trash_check_progress.json`
2. Paste the JSON into the popup’s import area
3. Click **Import data from Python script**
4. The extension will:
   - load trash IDs into the main input
   - preserve “pearl” / keep-worthy entries as permanently protected IDs in local storage

## Permissions used

From `manifest.json`, the extension uses:

- `notifications` — alert you about rate-limit pauses and resume windows
- `storage` — save package IDs, protection settings, caches, and imported data
- `alarms` — schedule cooldown notifications
- host access to Steam store and login domains

## Testing

The repository includes tests for key behavior, including popup logic, background handling, content-script behavior, and utilities.

Run the suite with:

```bash
npm test
```

Or generate coverage with:

```bash
npm run test:coverage
```

## Important notes and cautions

- This project interacts with your real Steam account page.
- Use it carefully and review every run before enabling deletions.
- Dry run exists for a reason — keep it on until you are fully confident in your inputs.
- Steam platform behavior may change over time, which can affect selectors, request formats, or license-removal behavior.
- Some licenses may not behave consistently, which is why the extension includes zombie detection and fail-safe skips.
- No automation tool can remove all risk; human review is still essential.

## Roadmap ideas

Potential future improvements:

- Real screenshots and animated demo GIFs
- One-click import from SteamDB exports or copied tables
- Exportable cleanup reports
- More advanced pattern management UI
- Batch presets for known-safe package categories
- Better historical reporting and run summaries

## License

This project is released under **The Unlicense**. See [`LICENSE`](./LICENSE) for details.

## Acknowledgements

- [SteamDB Free Packages](https://steamdb.info/freepackages/) for the package discovery workflow that inspired this tool
- The Steam account license page, which this extension automates carefully and defensively

---

If you want, I can also do a final polish pass to add:

- a shorter GitHub-social preview intro
- a “Contributing” section
- a “Known limitations” section
- more exact build-output wording once the extension load path is confirmed