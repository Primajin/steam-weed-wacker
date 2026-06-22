# Content.ts Performance & Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix eight known issues in `src/content.ts` that cause UI jank, excessive storage writes, infinite retry loops, and lack of user control on long runs (hundreds of IDs).

**Architecture:** All changes are confined to `src/content.ts` and `src/types.ts`. No new files. Each task is self-contained and the build + lint must pass after every commit.

**Tech Stack:** TypeScript, Vite, Vitest, xo (ESLint wrapper), Chrome Extension MV3 APIs.

---

## File Map

| File | What changes |
|---|---|
| `src/content.ts` | All logic changes (counters, throttle, stop, batch-save, retry limits, storage errors, timeout constant) |
| `src/types.ts` | No changes needed |
| `src/content.test.ts` | New tests for exported helpers |

---

## Task 1: Live counters on ReviewReport + remove O(n²) allocations

Replaces `countReason` (9 O(n) scans per render) and `toReversed()` (full array copy per render) with O(1) counter reads and index arithmetic.

**Files:**
- Modify: `src/content.ts`
- Modify: `src/content.test.ts`

- [ ] **Step 1: Update `ReviewReport` type — add live counter fields**

In `src/content.ts`, replace the `ReviewReport` type:

```typescript
type ReviewReport = {
	mode: 'DRY_RUN' | 'EXECUTE';
	totalCandidates: number;
	processed: number;
	startedAt: number;
	rateLimitCount: number;
	rateLimitTotalWaitMs: number;
	deletedCount: number;
	errorCount: number;
	skipCounts: Partial<Record<SkipReason, number>>;
	items: ItemDecision[];
};
```

- [ ] **Step 2: Update report initialisation in `removeTrashLicenses`**

```typescript
const report: ReviewReport = {
	mode: dryRun ? 'DRY_RUN' : 'EXECUTE',
	totalCandidates: targets.length,
	processed: 0,
	startedAt: performance.now(),
	rateLimitCount: 0,
	rateLimitTotalWaitMs: 0,
	deletedCount: 0,
	errorCount: 0,
	skipCounts: {},
	items: [],
};
```

- [ ] **Step 3: Add a helper that increments the correct counter when a decision is recorded**

Add this function just above `removeTrashLicenses`:

```typescript
function recordDecision(report: ReviewReport, decision: ItemDecision): void {
	report.items.push(decision);
	report.processed++;
	if (decision.reason === 'DELETE') {
		report.deletedCount++;
	} else if (decision.reason === 'ERROR') {
		report.errorCount++;
	} else {
		report.skipCounts[decision.reason as SkipReason] = (report.skipCounts[decision.reason as SkipReason] ?? 0) + 1;
	}
}
```

- [ ] **Step 4: Replace all manual `report.items.push` + `report.processed++` calls with `recordDecision`**

In `removeTrashLicenses`, find all occurrences of the two-line pattern:
```typescript
report.items.push(decision);
report.processed++;
```
and replace with:
```typescript
recordDecision(report, decision);
```

There is one occurrence at the bottom of the main `for` loop and a separate block for the session-ID-missing early return (those push multiple items individually — replace each pair).

For the session-ID block, replace:
```typescript
for (const packageId of targets) {
    report.items.push({
        packageId,
        title: `Package ${packageId}`,
        reason: 'ERROR',
        details: 'Could not find Steam session ID.',
    });
}
report.processed = targets.length;
```
with:
```typescript
for (const packageId of targets) {
    recordDecision(report, {
        packageId,
        title: `Package ${packageId}`,
        reason: 'ERROR',
        details: 'Could not find Steam session ID.',
    });
}
```

- [ ] **Step 5: Replace `countReason` calls in `updateUi` with direct counter reads**

Remove the `countReason` function entirely.

In `updateUi`, replace:
```typescript
const deletedCount = countReason(report, 'DELETE');
const errorCount = countReason(report, 'ERROR');
const skippedCount = report.items.length - deletedCount - errorCount;
```
with:
```typescript
const {deletedCount, errorCount} = report;
const skippedCount = report.items.length - deletedCount - errorCount;
```

Replace the `reasonsHtml` line:
```typescript
const reasonsHtml = SKIP_REASONS
    .map(reason => `<li>${reason}: ${countReason(report, reason)}</li>`)
    .join('');
```
with:
```typescript
const reasonsHtml = SKIP_REASONS
    .map(reason => `<li>${reason}: ${report.skipCounts[reason] ?? 0}</li>`)
    .join('');
```

- [ ] **Step 6: Remove `toReversed()` — use index arithmetic in the virtual renderer**

In `updateUi`, remove the line:
```typescript
const reversedItems = report.items.toReversed();
```
Change `const totalItems = reversedItems.length;` to:
```typescript
const totalItems = report.items.length;
```

In `renderVisibleItems`, replace the `listElement.innerHTML = reversedItems.slice(...)...` block with:
```typescript
listElement.style.top = `${startIndex * ITEM_ROW_HEIGHT}px`;
listElement.innerHTML = Array.from({length: endIndex - startIndex}, (_, offset) => {
    const item = report.items[totalItems - 1 - (startIndex + offset)]!;
    return `
        <li style="height: ${ITEM_ROW_HEIGHT}px; box-sizing: border-box; padding-bottom: 6px; border-bottom: 1px solid #2a475e; overflow: hidden;">
            <div><strong>${escapeHtml(item.packageId)}</strong> — ${escapeHtml(item.reason)}</div>
            <div style="font-size: 11px; color: #8f98a0;">${escapeHtml(item.title)}</div>
            ${item.details === undefined ? '' : `<div style="font-size: 11px; color: #e5a822;">${escapeHtml(item.details)}</div>`}
        </li>
    `;
}).join('');
```

- [ ] **Step 7: Export `recordDecision` and write tests**

Add `export` to `recordDecision`.

In `src/content.test.ts`, add:
```typescript
import {
    // existing imports...
    recordDecision,
} from './content.js';
import type {ItemDecision} from './types.js';

function makeReport() {
    return {
        mode: 'EXECUTE' as const,
        totalCandidates: 10,
        processed: 0,
        startedAt: 0,
        rateLimitCount: 0,
        rateLimitTotalWaitMs: 0,
        deletedCount: 0,
        errorCount: 0,
        skipCounts: {},
        items: [] as ItemDecision[],
    };
}

describe('recordDecision', () => {
    it('pushes item and increments processed', () => {
        const report = makeReport();
        recordDecision(report, {packageId: '1', title: 'A', reason: 'DELETE'});
        expect(report.items).toHaveLength(1);
        expect(report.processed).toBe(1);
    });

    it('increments deletedCount for DELETE', () => {
        const report = makeReport();
        recordDecision(report, {packageId: '1', title: 'A', reason: 'DELETE'});
        expect(report.deletedCount).toBe(1);
        expect(report.errorCount).toBe(0);
    });

    it('increments errorCount for ERROR', () => {
        const report = makeReport();
        recordDecision(report, {packageId: '1', title: 'A', reason: 'ERROR'});
        expect(report.errorCount).toBe(1);
        expect(report.deletedCount).toBe(0);
    });

    it('increments the correct skipCounts entry for skip reasons', () => {
        const report = makeReport();
        recordDecision(report, {packageId: '1', title: 'A', reason: 'SKIP_ZOMBIE'});
        recordDecision(report, {packageId: '2', title: 'B', reason: 'SKIP_ZOMBIE'});
        recordDecision(report, {packageId: '3', title: 'C', reason: 'SKIP_HIDDEN_GEM'});
        expect(report.skipCounts.SKIP_ZOMBIE).toBe(2);
        expect(report.skipCounts.SKIP_HIDDEN_GEM).toBe(1);
        expect(report.skipCounts.SKIP_ALLOWLIST_ID).toBeUndefined();
    });
});
```

- [ ] **Step 8: Run tests and build**

```bash
npm test -- --reporter=verbose 2>&1 | tail -30
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -10
```

Expected: all tests pass, build succeeds, no new lint errors.

- [ ] **Step 9: Commit**

```bash
git add src/content.ts src/content.test.ts
git commit -m "perf: replace O(n²) render with live counters and index arithmetic"
```

---

## Task 2: Render throttle (250 ms)

Prevents `updateUi` from firing more than 4 times per second during the main loop, while preserving immediate renders for countdowns and the final completion message.

**Files:**
- Modify: `src/content.ts`

- [ ] **Step 1: Add throttle constant and `lastRenderAt` to `ReviewReport`**

Add near the top constants:
```typescript
const RENDER_THROTTLE_MS = 250;
```

Add to `ReviewReport` type:
```typescript
lastRenderAt: number;
```

Add to report initialisation in `removeTrashLicenses`:
```typescript
lastRenderAt: 0,
```

- [ ] **Step 2: Throttle the per-item `updateUi` call in the main loop**

In `removeTrashLicenses`, replace:
```typescript
recordDecision(report, decision);
updateUi(dashboard, report, packageId);
```
with:
```typescript
recordDecision(report, decision);
const now = performance.now();
if (now - report.lastRenderAt >= RENDER_THROTTLE_MS) {
    updateUi(dashboard, report, packageId);
    report.lastRenderAt = now;
}
```

All other `updateUi` calls (countdown loops, completion, session-ID error) are left unchanged — they render immediately regardless of throttle.

- [ ] **Step 3: Build and lint**

```bash
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/content.ts
git commit -m "perf: throttle dashboard re-renders to 250ms during main loop"
```

---

## Task 3: Stop button + double-start guard

Adds a ⏹ Stop button to the dashboard and a module-level `isRunning` flag that prevents parallel runs.

**Files:**
- Modify: `src/content.ts`

- [ ] **Step 1: Add module-level `isRunning` flag**

After the `sleep` definition, add:
```typescript
let isRunning = false;
```

- [ ] **Step 2: Wrap `removeTrashLicenses` invocation in `registerMessageListeners` with guard**

In `registerMessageListeners`, replace:
```typescript
chrome.runtime.onMessage.addListener((request: StartRemovalMessage) => {
    if (request.type === 'START_REMOVAL' && Array.isArray(request.ids)) {
        void removeTrashLicenses(request);
    }
});
```
with:
```typescript
chrome.runtime.onMessage.addListener((request: StartRemovalMessage) => {
    if (request.type === 'START_REMOVAL' && Array.isArray(request.ids)) {
        if (isRunning) {
            return;
        }

        isRunning = true;
        void removeTrashLicenses(request).finally(() => {
            isRunning = false;
        });
    }
});
```

- [ ] **Step 3: Add Stop button to the dashboard header HTML in `updateUi`**

In `updateUi`, replace the `<h3>` line:
```typescript
<h3 style="margin: 0 0 10px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
```
with:
```typescript
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
    <h3 style="margin: 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
    <button id="sww-stop-btn" style="background: #6b3535; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px; font-weight: bold;">⏹ Stop</button>
</div>
```

- [ ] **Step 4: Wire the Stop button click handler after each `innerHTML` assignment in `updateUi`**

After the `dashboard.innerHTML = ...` assignment (before the `scrollContainer` query), add:
```typescript
const stopButton = dashboard.querySelector<HTMLButtonElement>('#sww-stop-btn');
if (stopButton !== null) {
    stopButton.addEventListener('click', () => {
        isRunning = false;
    });
}
```

- [ ] **Step 5: Check `isRunning` at the top of the main for loop**

In `removeTrashLicenses`, at the very start of the `for (const packageId of targets)` loop body, add:
```typescript
if (!isRunning) {
    break;
}
```

- [ ] **Step 6: Show "Stopped" vs "Complete" in the final render**

After the for loop ends, replace the final `updateUi` call:
```typescript
updateUi(
    dashboard,
    report,
    undefined,
    `<div style="background: rgba(164, 208, 7, 0.1); border: 1px solid #a4d007; padding: 8px; border-radius: 4px; color: #a4d007; margin-bottom: 10px; text-align: center; font-size: 12px;">
        ✅ ${dryRun ? 'Dry run complete' : 'Cleanup complete'}.
    </div>`,
);
```
with:
```typescript
const wasStopped = !isRunning;
updateUi(
    dashboard,
    report,
    undefined,
    wasStopped
        ? `<div style="background: rgba(229, 168, 34, 0.1); border: 1px solid #e5a822; padding: 8px; border-radius: 4px; color: #e5a822; margin-bottom: 10px; text-align: center; font-size: 12px;">
            ⏹ Stopped after ${report.processed} of ${report.totalCandidates} items.
        </div>`
        : `<div style="background: rgba(164, 208, 7, 0.1); border: 1px solid #a4d007; padding: 8px; border-radius: 4px; color: #a4d007; margin-bottom: 10px; text-align: center; font-size: 12px;">
            ✅ ${dryRun ? 'Dry run complete' : 'Cleanup complete'}.
        </div>`,
);
```

Note: `isRunning` is `false` here because it was either stopped by the user or will be set `false` by the `.finally()` — but `.finally()` runs after `removeTrashLicenses` returns, so `isRunning` is still `true` at this point when the run completed normally. Use the local flag instead:

Replace both the `break` check and the final check to use a local `let stopped = false`:

At the top of `removeTrashLicenses` body (before the `for` loop):
```typescript
let stopped = false;
```

Change the loop-start check to:
```typescript
if (!isRunning) {
    stopped = true;
    break;
}
```

Change the final render to use `stopped`:
```typescript
updateUi(
    dashboard,
    report,
    undefined,
    stopped
        ? `<div style="background: rgba(229, 168, 34, 0.1); border: 1px solid #e5a822; padding: 8px; border-radius: 4px; color: #e5a822; margin-bottom: 10px; text-align: center; font-size: 12px;">
            ⏹ Stopped after ${report.processed} of ${report.totalCandidates} items.
        </div>`
        : `<div style="background: rgba(164, 208, 7, 0.1); border: 1px solid #a4d007; padding: 8px; border-radius: 4px; color: #a4d007; margin-bottom: 10px; text-align: center; font-size: 12px;">
            ✅ ${dryRun ? 'Dry run complete' : 'Cleanup complete'}.
        </div>`,
);
```

- [ ] **Step 7: Build and lint**

```bash
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -10
```

Expected: clean. Fix any multiline-ternary lint errors by ensuring the ternary spans multiple lines with proper indentation.

- [ ] **Step 8: Commit**

```bash
git add src/content.ts
git commit -m "feat: add Stop button and double-start guard to dashboard"
```

---

## Task 4: Batch `savePersistentContext` + increase metadata timeout

Reduces storage write frequency from once-per-item to once-per-10-items, and bumps the metadata request timeout from 5 s to 12 s.

**Files:**
- Modify: `src/content.ts`

- [ ] **Step 1: Increase `METADATA_TIMEOUT_MS`**

Change:
```typescript
const METADATA_TIMEOUT_MS = 5000;
```
to:
```typescript
const METADATA_TIMEOUT_MS = 12_000;
```

- [ ] **Step 2: Add batch save constant and counter to `ReviewReport`**

Add constant:
```typescript
const SAVE_BATCH_SIZE = 10;
```

Add to `ReviewReport` type:
```typescript
processedSinceLastSave: number;
```

Add to report initialisation:
```typescript
processedSinceLastSave: 0,
```

- [ ] **Step 3: Replace per-item save with batched save in `removeTrashLicenses`**

Find the existing save call that fires after every metadata evaluation:
```typescript
// Persist the updated caches after each metadata evaluation
// eslint-disable-next-line no-await-in-loop
await savePersistentContext(metadataContext);
```

Remove it entirely. Instead, after `recordDecision(report, decision);`, add:
```typescript
report.processedSinceLastSave++;
if (report.processedSinceLastSave >= SAVE_BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await savePersistentContext(metadataContext);
    report.processedSinceLastSave = 0;
}
```

- [ ] **Step 4: Add a final save after the loop completes**

After the for loop (before the final `updateUi`), add:
```typescript
await savePersistentContext(metadataContext);
```

This ensures any unsaved entries from the last partial batch are persisted.

- [ ] **Step 5: Build and lint**

```bash
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src/content.ts
git commit -m "perf: batch metadata cache saves every 10 items; raise metadata timeout to 12s"
```

---

## Task 5: Max network retry limit

Prevents `fetchJsonWithRetry` and `deletePackageWithRetry` from looping forever on persistent network failures.

**Files:**
- Modify: `src/content.ts`

- [ ] **Step 1: Add `MAX_NETWORK_RETRIES` constant**

```typescript
const MAX_NETWORK_RETRIES = 5;
```

- [ ] **Step 2: Add retry counter to `fetchJsonWithRetry`**

Replace the `while (true)` loop in `fetchJsonWithRetry` with a counted loop:

```typescript
async function fetchJsonWithRetry(
	url: string,
	packageId: string,
	ctx: RequestContext,
): Promise<Response> {
	let networkRetries = 0;
	while (true) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const response = await fetchJsonWithTimeout(url);

			if (response.status === 429) {
				const retryAfterHeader = response.headers.get('Retry-After');
				let waitTime = Number(retryAfterHeader ?? '');
				if (!Number.isFinite(waitTime) || waitTime <= 0) {
					waitTime = DEFAULT_RETRY_AFTER_SECONDS;
				}

				ctx.report.rateLimitCount++;
				const endAt = Date.now() + (waitTime * 1000);
				let remaining = waitTime;
				while (remaining > 0) {
					updateUi(
						ctx.dashboard,
						ctx.report,
						packageId,
						`<div style="background: rgba(229, 168, 34, 0.2); border: 1px solid #e5a822; padding: 8px; border-radius: 4px; color: #e5a822; margin-bottom: 10px; text-align: center; font-size: 12px;">
							⚠️ Store API rate-limited (429). Waiting ${remaining}s before retry...
						</div>`,
					);
					// eslint-disable-next-line no-await-in-loop
					await sleep(500);
					ctx.report.rateLimitTotalWaitMs += 500;
					remaining = Math.ceil((endAt - Date.now()) / 1000);
				}

				networkRetries = 0; // successful contact — reset network retry counter
				continue;
			}

			networkRetries = 0;
			return response;
		} catch (error) {
			networkRetries++;
			console.error(`Network error on Store API call (${url}) [attempt ${networkRetries}/${MAX_NETWORK_RETRIES}]:`, error);
			if (networkRetries >= MAX_NETWORK_RETRIES) {
				throw new Error(`Store API unreachable after ${MAX_NETWORK_RETRIES} attempts: ${url}`);
			}

			// eslint-disable-next-line no-await-in-loop
			await sleep(5000);
		}
	}
}
```

- [ ] **Step 3: Catch the thrown error in callers**

`fetchJsonWithRetry` is called from `resolveAppIdForPackage` and `getHiddenGemMetadata`. Both already have `try/catch` blocks that catch all errors and return `undefined`. The thrown error is caught by those existing handlers — no changes needed.

Verify by reading the catch blocks in both functions: they end with `context.packageToAppCache.set(packageId, undefined); return undefined;` and `context.appMetadataCache.set(appId, undefined); return undefined;` respectively. This is correct — exhausted network retries become a cache-miss, which downstream is treated as SKIP_METADATA_UNAVAILABLE.

- [ ] **Step 4: Add retry counter to `deletePackageWithRetry`**

Replace the `while (true)` + catch in `deletePackageWithRetry`:

```typescript
async function deletePackageWithRetry(
	packageId: string,
	sessionId: string,
	dashboard: HTMLDivElement,
	report: ReviewReport,
): Promise<{reason: DecisionReason; details?: string}> {
	const formData = new URLSearchParams();
	formData.append('sessionid', sessionId);
	formData.append('packageid', packageId);

	let networkRetries = 0;
	while (true) {
		try {
			const startedAt = performance.now();
			// eslint-disable-next-line no-await-in-loop
			const response = await fetch('https://store.steampowered.com/account/removelicense', {
				method: 'POST',
				body: formData,
			});

			networkRetries = 0; // successful contact

			if (response.ok) {
				let payload: {success?: number} = {};
				try {
					// eslint-disable-next-line no-await-in-loop
					payload = await response.json() as {success?: number};
				} catch {
					return {reason: 'ERROR', details: 'Invalid response payload from Steam.'};
				}

				if (payload.success === 1) {
					const elapsedMs = performance.now() - startedAt;
					const waitMs = Math.max(0, MIN_DELAY_MS - elapsedMs);
					if (waitMs > 0) {
						// eslint-disable-next-line no-await-in-loop
						await sleep(waitMs);
					}

					return {reason: 'DELETE'};
				}

				if (payload.success === 84) {
					void chrome.runtime.sendMessage({type: 'NOTIFY_BAN'});
					const endAt = Date.now() + (RATE_LIMIT_COOLDOWN_SECONDS * 1000);
					let remaining = RATE_LIMIT_COOLDOWN_SECONDS;
					while (remaining > 0) {
						updateUi(
							dashboard,
							report,
							packageId,
							`<div style="background: rgba(229, 64, 34, 0.2); border: 1px solid #e54022; padding: 8px; border-radius: 4px; color: #e54022; margin-bottom: 10px; text-align: center; font-size: 12px;">
								🛑 Rate limit exceeded (Code 84). Waiting ${remaining}s before retry.
							</div>`,
						);
						// eslint-disable-next-line no-await-in-loop
						await sleep(500);
						remaining = Math.ceil((endAt - Date.now()) / 1000);
					}

					continue;
				}

				return {reason: 'ERROR', details: `Steam returned code ${String(payload.success ?? 'unknown')}.`};
			}

			if (response.status === 429) {
				const retryAfterHeader = response.headers.get('Retry-After');
				let waitTime = Number(retryAfterHeader ?? '');
				if (!Number.isFinite(waitTime) || waitTime <= 0) {
					waitTime = DEFAULT_RETRY_AFTER_SECONDS;
				}

				const endAt = Date.now() + (waitTime * 1000);
				let remaining = waitTime;
				while (remaining > 0) {
					updateUi(
						dashboard,
						report,
						packageId,
						`<div style="background: rgba(229, 168, 34, 0.2); border: 1px solid #e5a822; padding: 8px; border-radius: 4px; color: #e5a822; margin-bottom: 10px; text-align: center; font-size: 12px;">
							⚠️ HTTP 429. Waiting ${remaining}s before retry.
						</div>`,
					);
					// eslint-disable-next-line no-await-in-loop
					await sleep(500);
					remaining = Math.ceil((endAt - Date.now()) / 1000);
				}

				continue;
			}

			return {reason: 'ERROR', details: `HTTP ${response.status}.`};
		} catch (error) {
			networkRetries++;
			console.error(`Network error while deleting ${packageId} [attempt ${networkRetries}/${MAX_NETWORK_RETRIES}]:`, error);
			if (networkRetries >= MAX_NETWORK_RETRIES) {
				return {reason: 'ERROR', details: `Network unreachable after ${MAX_NETWORK_RETRIES} attempts.`};
			}

			// eslint-disable-next-line no-await-in-loop
			await sleep(5000);
		}
	}
}
```

- [ ] **Step 5: Build and lint**

```bash
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src/content.ts
git commit -m "fix: limit network retries to 5 in fetchJsonWithRetry and deletePackageWithRetry"
```

---

## Task 6: `chrome.storage.local` error handling

Adds `chrome.runtime.lastError` checks to all storage write calls so silent quota failures surface as console errors rather than being swallowed.

**Files:**
- Modify: `src/content.ts`

- [ ] **Step 1: Add error check to `savePersistentContext`**

Replace:
```typescript
async function savePersistentContext(context: MetadataContext): Promise<void> {
	const pkgToAppRaw = Object.fromEntries(context.packageToAppCache);
	const appMetaRaw = Object.fromEntries(context.appMetadataCache);

	await chrome.storage.local.set({
		[CACHE_PKG_TO_APP_KEY]: pkgToAppRaw,
		[CACHE_APP_METADATA_KEY]: appMetaRaw,
	});
}
```
with:
```typescript
async function savePersistentContext(context: MetadataContext): Promise<void> {
	const pkgToAppRaw = Object.fromEntries(context.packageToAppCache);
	const appMetaRaw = Object.fromEntries(context.appMetadataCache);

	await new Promise<void>(resolve => {
		chrome.storage.local.set({
			[CACHE_PKG_TO_APP_KEY]: pkgToAppRaw,
			[CACHE_APP_METADATA_KEY]: appMetaRaw,
		}, () => {
			if (chrome.runtime.lastError) {
				console.error('savePersistentContext failed:', chrome.runtime.lastError.message);
			}

			resolve();
		});
	});
}
```

- [ ] **Step 2: Add error check to the `attemptedDeletions` write in `removeTrashLicenses`**

Find:
```typescript
await chrome.storage.local.set({
    [CACHE_ATTEMPTED_DELETIONS_KEY]: [...attemptedDeletions],
});
```
Replace with:
```typescript
// eslint-disable-next-line no-await-in-loop
await new Promise<void>(resolve => {
    chrome.storage.local.set({[CACHE_ATTEMPTED_DELETIONS_KEY]: [...attemptedDeletions]}, () => {
        if (chrome.runtime.lastError) {
            console.error('attemptedDeletions write failed:', chrome.runtime.lastError.message);
        }

        resolve();
    });
});
```

- [ ] **Step 3: Build and lint**

```bash
npm run build 2>&1 | tail -10
npm run lint 2>&1 | tail -10
```

- [ ] **Step 4: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/content.ts
git commit -m "fix: surface chrome.storage.local write errors via console.error"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Stop button + double-start guard → Task 3
- ✅ Live counters replacing countReason + remove toReversed() → Task 1
- ✅ Batch savePersistentContext every 10 items → Task 4
- ✅ Double-start guard → Task 3 (shared with stop button)
- ✅ Increase METADATA_TIMEOUT_MS → Task 4
- ✅ Render throttle 250ms → Task 2
- ✅ Max retry limit (5) for network errors → Task 5
- ✅ chrome.storage.local error handling → Task 6

**Placeholder scan:** No TBDs or incomplete code blocks found.

**Type consistency:** `ReviewReport` is extended in Task 1 (counters), Task 2 (lastRenderAt), Task 4 (processedSinceLastSave). All later tasks reference the same field names. `recordDecision` is introduced in Task 1 and used in that same task. `MAX_NETWORK_RETRIES` and `SAVE_BATCH_SIZE` constants introduced before use.
