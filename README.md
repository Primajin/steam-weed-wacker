# Steam Weed Wacker

A safety-first Chrome extension for cleaning up unwanted Steam licenses from your account page.

Steam Weed Wacker helps you take a large list of free-package IDs, compare them against the licenses currently shown on your Steam account, and then either preview or execute a cleanup workflow with multiple layers of protection.

## Why this project exists

If you have claimed lots of free packages over time, your Steam licenses page can become crowded with trials, promos, delisted freebies, and other account clutter. Steam Weed Wacker is built to help sort through that noise while reducing the risk of removing something valuable by mistake.

The project is inspired by package data from [SteamDB Free Packages](https://steamdb.info/freepackages/), and the repository description sums it up well: this is the counter-app companion to that workflow.

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

## Safety-first design

This project is clearly built around avoiding accidental removals.

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
  Parses IDs and patterns, detects protected content, formats ETA text, extracts the Steam session ID, and evaluates hidden-gem rules.

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
- A Chromium-based browser that supports Manifest V3 extensions

### Setup

```bash
npm install
```

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

1. Build or otherwise prepare the extension bundle.
2. Load the extension into your browser as an unpacked extension.
3. Open your Steam licenses page:
   `https://store.steampowered.com/account/licenses/`
4. Open the Steam Weed Wacker popup.
5. Paste candidate package IDs from SteamDB or click **Copy All Page IDs**.
6. Add any protected IDs or title patterns.
7. Leave **Dry Run** enabled and start a test pass.
8. Review the results in the on-page dashboard.
9. Only then disable dry run if you intentionally want to execute removals.

### Recommended safe workflow

- Start with a small batch.
- Use dry run first every time.
- Protect known keepers before running.
- Review hidden-gem skips instead of forcing deletion.
- Expect cooldown delays on larger runs.

## Permissions used

From `manifest.json`, the extension uses:

- `notifications` — to alert you about rate-limit pauses and resume windows
- `storage` — to save package IDs, protection settings, caches, and imported data
- `alarms` — to schedule cooldown notifications
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

## License

This project is released under **The Unlicense**. See [`LICENSE`](./LICENSE) for details.

## Acknowledgements

- [SteamDB Free Packages](https://steamdb.info/freepackages/) for the package discovery workflow that inspired this tool
- Steam account license management pages, which this extension automates carefully and defensively

---

If you want, I can also create a second pass that adds badges, screenshots/GIF placeholders, and a more polished “developer setup + load unpacked extension” section.