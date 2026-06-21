import {
	MIN_DELAY_MS,
	RATE_LIMIT_COOLDOWN_SECONDS,
	DEFAULT_RETRY_AFTER_SECONDS,
	isProtectedLicense,
	getSteamSessionId,
	matchesProtectedTitlePattern,
	shouldProtectHiddenGem,
} from './utils.js';
import type {
	DecisionReason,
	ItemDecision,
	RemovalMessage,
	StartRemovalMessage,
} from './types.js';

const METADATA_TIMEOUT_MS = 5000;

const sleep = async (ms: number) => new Promise<void>(resolve => {
	setTimeout(resolve, ms);
});

type HiddenGemMetadata = {
	isFree: boolean;
	reviewScoreDescription: string;
	reviewCount: number;
};

type ReviewReport = {
	mode: 'DRY_RUN' | 'EXECUTE';
	totalCandidates: number;
	processed: number;
	items: ItemDecision[];
};

type MetadataContext = {
	packageToAppCache: Map<string, number | undefined>;
	appMetadataCache: Map<number, HiddenGemMetadata | undefined>;
};

function buildLinkMap(): Map<string, HTMLAnchorElement> {
	const allRemoveLinks = document.querySelectorAll<HTMLAnchorElement>('a[href^="javascript:RemoveFreeLicense"]');
	const linkMap = new Map<string, HTMLAnchorElement>();

	for (const link of allRemoveLinks) {
		const match = /RemoveFreeLicense\(\s*(?<packageId>\d+),\s*'.*?'\s*\)/v.exec(link.href);
		if (match?.groups?.packageId !== undefined) {
			linkMap.set(match.groups.packageId, link);
		}
	}

	return linkMap;
}

function createDashboard(): HTMLDivElement {
	const dashboard = document.createElement('div');
	dashboard.id = 'sww-dashboard';
	dashboard.style.cssText = `
		position: fixed; bottom: 30px; right: 30px;
		background: #171a21; color: #c6d4df;
		padding: 20px; border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0,0,0,0.9);
		font-family: Arial, sans-serif; z-index: 999999;
		border: 1px solid #2a475e; width: 440px;
	`;
	document.body.append(dashboard);
	return dashboard;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#39;');
}

function extractTitle(link: HTMLAnchorElement, packageId: string): string {
	const row = link.closest('tr');
	const text = row?.querySelector('td')?.textContent?.trim() ?? row?.textContent?.trim() ?? '';
	return text.length > 0 ? text : `Package ${packageId}`;
}

function countReason(report: ReviewReport, reason: DecisionReason): number {
	return report.items.filter(item => item.reason === reason).length;
}

function updateUi(
	dashboard: HTMLDivElement,
	report: ReviewReport,
	currentId: string | undefined,
	statusMessage = '',
): void {
	const percent = report.totalCandidates === 0
		? '100.0'
		: ((report.processed / report.totalCandidates) * 100).toFixed(1);
	const deletedCount = countReason(report, 'DELETE');
	const errorCount = countReason(report, 'ERROR');
	const skippedCount = report.items.length - deletedCount - errorCount;
	const modeLabel = report.mode === 'DRY_RUN' ? 'Dry Run (no deletions)' : 'Execute (deletions enabled)';

	const reasonCounts = [
		'SKIP_ALLOWLIST_ID',
		'SKIP_ALLOWLIST_PATTERN',
		'SKIP_PROTECTED_KEYWORD',
		'SKIP_HIDDEN_GEM',
		'SKIP_METADATA_UNAVAILABLE',
		'SKIP_RATE_LIMIT',
		'SKIP_NOT_ON_PAGE',
	] satisfies DecisionReason[];

	const reasonsHtml = reasonCounts
		.map(reason => `<li>${reason}: ${countReason(report, reason)}</li>`)
		.join('');

	const itemsHtml = report.items
		.map(item => `
			<li style="margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #2a475e;">
				<div><strong>${escapeHtml(item.packageId)}</strong> — ${escapeHtml(item.reason)}</div>
				<div style="font-size: 11px; color: #8f98a0;">${escapeHtml(item.title)}</div>
				${item.details === undefined ? '' : `<div style="font-size: 11px; color: #e5a822;">${escapeHtml(item.details)}</div>`}
			</li>
		`)
		.join('');

	dashboard.innerHTML = `
		<h3 style="margin: 0 0 10px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
		<div style="margin-bottom: 10px; padding: 8px; border-radius: 4px; border: 1px solid #2a475e; background: rgba(102, 192, 244, 0.12); font-size: 13px;">
			<strong>Mode:</strong> ${modeLabel}
		</div>
		${statusMessage}
		<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
			<span><strong>Progress</strong></span>
			<span>${report.processed}/${report.totalCandidates} (${percent}%)</span>
		</div>
		<div style="width: 100%; background: #000; height: 10px; border-radius: 6px; overflow: hidden; border: 1px solid #333;">
			<div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #1a9bdc, #66c0f4); transition: width 0.2s ease-out;"></div>
		</div>
		<div style="font-size: 12px; color: #8f98a0; margin: 10px 0;">
			Current ID: ${currentId === undefined ? '---' : escapeHtml(currentId)}
		</div>
		<div style="display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px; margin-bottom: 10px; font-size: 12px;">
			<div>Total candidates: ${report.totalCandidates}</div>
			<div>${report.mode === 'DRY_RUN' ? 'Would delete' : 'Deleted'}: ${deletedCount}</div>
			<div>Skipped: ${skippedCount}</div>
			<div>Errors: ${errorCount}</div>
		</div>
		<div style="font-size: 12px; margin-bottom: 8px;">
			<strong>Skipped by reason</strong>
			<ul style="margin: 4px 0 0 16px; padding: 0;">${reasonsHtml}</ul>
		</div>
		<div style="font-size: 12px;">
			<strong>Per-item decisions</strong>
			<ul style="margin: 6px 0 0 0; padding: 0 0 0 14px; max-height: 180px; overflow-y: auto;">${itemsHtml}</ul>
		</div>
	`;
}

async function fetchJsonWithTimeout(url: string): Promise<Response> {
	const controller = new AbortController();
	const timeoutHandle = setTimeout(() => {
		controller.abort();
	}, METADATA_TIMEOUT_MS);
	try {
		return await fetch(url, {signal: controller.signal});
	} finally {
		clearTimeout(timeoutHandle);
	}
}

function getAppIdFromRow(link: HTMLAnchorElement): number | undefined {
	const row = link.closest('tr');
	const appLink = row?.querySelector<HTMLAnchorElement>('a[href*="/app/"]');
	if (appLink?.href === undefined) {
		return undefined;
	}

	const match = /\/app\/(?<appId>\d+)/v.exec(appLink.href);
	if (match?.groups?.appId === undefined) {
		return undefined;
	}

	const appId = Number(match.groups.appId);
	return Number.isSafeInteger(appId) && appId > 0 ? appId : undefined;
}

async function resolveAppIdForPackage(
	packageId: string,
	link: HTMLAnchorElement,
	context: MetadataContext,
): Promise<{appId?: number; rateLimited: boolean}> {
	if (context.packageToAppCache.has(packageId)) {
		return {appId: context.packageToAppCache.get(packageId), rateLimited: false};
	}

	const appIdFromRow = getAppIdFromRow(link);
	if (appIdFromRow !== undefined) {
		context.packageToAppCache.set(packageId, appIdFromRow);
		return {appId: appIdFromRow, rateLimited: false};
	}

	try {
		const response = await fetchJsonWithTimeout(`https://store.steampowered.com/api/packagedetails?packageids=${packageId}`);
		if (response.status === 429) {
			return {rateLimited: true};
		}

		if (!response.ok) {
			context.packageToAppCache.set(packageId, undefined);
			return {rateLimited: false};
		}

		const payload = await response.json() as Record<string, {success?: boolean; data?: {apps?: Array<{id?: number}>}}>;
		const appId = payload[packageId]?.data?.apps?.[0]?.id;
		const normalizedAppId = Number.isSafeInteger(appId) && appId !== undefined && appId > 0 ? appId : undefined;
		context.packageToAppCache.set(packageId, normalizedAppId);
		return {appId: normalizedAppId, rateLimited: false};
	} catch {
		context.packageToAppCache.set(packageId, undefined);
		return {rateLimited: false};
	}
}

async function getHiddenGemMetadata(
	appId: number,
	context: MetadataContext,
): Promise<{metadata?: HiddenGemMetadata; rateLimited: boolean}> {
	if (context.appMetadataCache.has(appId)) {
		return {metadata: context.appMetadataCache.get(appId), rateLimited: false};
	}

	try {
		const appDetailsResponse = await fetchJsonWithTimeout(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=is_free,type`);
		if (appDetailsResponse.status === 429) {
			return {rateLimited: true};
		}

		if (!appDetailsResponse.ok) {
			context.appMetadataCache.set(appId, undefined);
			return {rateLimited: false};
		}

		const appDetailsPayload = await appDetailsResponse.json() as Record<string, {success?: boolean; data?: {is_free?: boolean; type?: string}}>;
		const appData = appDetailsPayload[String(appId)]?.data;
		if (appData?.is_free !== true || appData.type !== 'game') {
			const metadata = {
				isFree: appData?.is_free === true,
				reviewScoreDescription: '',
				reviewCount: 0,
			};
			context.appMetadataCache.set(appId, metadata);
			return {metadata, rateLimited: false};
		}

		const reviewsResponse = await fetchJsonWithTimeout(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0&filter=summary`);
		if (reviewsResponse.status === 429) {
			return {rateLimited: true};
		}

		if (!reviewsResponse.ok) {
			context.appMetadataCache.set(appId, undefined);
			return {rateLimited: false};
		}

		const reviewPayload = await reviewsResponse.json() as {query_summary?: {review_score_desc?: string; total_reviews?: number}};
		const summary = reviewPayload.query_summary;
		const reviewScoreDescription = summary?.review_score_desc?.trim();
		const reviewCount = summary?.total_reviews;
		if (reviewScoreDescription === undefined || reviewScoreDescription.length === 0 || reviewCount === undefined) {
			context.appMetadataCache.set(appId, undefined);
			return {rateLimited: false};
		}

		const metadata: HiddenGemMetadata = {
			isFree: true,
			reviewScoreDescription,
			reviewCount,
		};
		context.appMetadataCache.set(appId, metadata);
		return {metadata, rateLimited: false};
	} catch {
		context.appMetadataCache.set(appId, undefined);
		return {rateLimited: false};
	}
}

async function evaluateHiddenGemProtection(
	packageId: string,
	link: HTMLAnchorElement,
	context: MetadataContext,
): Promise<{reason?: DecisionReason; details?: string}> {
	const appResolution = await resolveAppIdForPackage(packageId, link, context);
	if (appResolution.rateLimited) {
		return {reason: 'SKIP_RATE_LIMIT', details: 'Store metadata endpoint is rate-limited.'};
	}

	if (appResolution.appId === undefined) {
		return {reason: 'SKIP_METADATA_UNAVAILABLE', details: 'Could not map package to app metadata safely.'};
	}

	const metadataResult = await getHiddenGemMetadata(appResolution.appId, context);
	if (metadataResult.rateLimited) {
		return {reason: 'SKIP_RATE_LIMIT', details: 'Review metadata endpoint is rate-limited.'};
	}

	if (metadataResult.metadata === undefined) {
		return {reason: 'SKIP_METADATA_UNAVAILABLE', details: 'Missing review metadata (fail-safe skip).'};
	}

	if (shouldProtectHiddenGem(
		metadataResult.metadata.isFree,
		metadataResult.metadata.reviewScoreDescription,
		metadataResult.metadata.reviewCount,
	)) {
		return {
			reason: 'SKIP_HIDDEN_GEM',
			details: `${metadataResult.metadata.reviewScoreDescription} (${metadataResult.metadata.reviewCount} reviews).`,
		};
	}

	return {};
}

async function deletePackageWithRetry(
	packageId: string,
	sessionId: string,
	dashboard: HTMLDivElement,
	report: ReviewReport,
	currentId: string,
): Promise<{reason: DecisionReason; details?: string}> {
	const formData = new URLSearchParams();
	formData.append('sessionid', sessionId);
	formData.append('packageid', packageId);

	while (true) {
		try {
			const startedAt = performance.now();
			// eslint-disable-next-line no-await-in-loop
			const response = await fetch('https://store.steampowered.com/account/removelicense', {
				method: 'POST',
				body: formData,
			});

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
					for (let i = RATE_LIMIT_COOLDOWN_SECONDS; i > 0; i--) {
						updateUi(
							dashboard,
							report,
							currentId,
							`<div style="background: rgba(229, 64, 34, 0.2); border: 1px solid #e54022; padding: 8px; border-radius: 4px; color: #e54022; margin-bottom: 10px; text-align: center; font-size: 12px;">
								🛑 Rate limit exceeded (Code 84). Waiting ${i}s before retry.
							</div>`,
						);
						// eslint-disable-next-line no-await-in-loop
						await sleep(1000);
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

				for (let i = waitTime; i > 0; i--) {
					updateUi(
						dashboard,
						report,
						currentId,
						`<div style="background: rgba(229, 168, 34, 0.2); border: 1px solid #e5a822; padding: 8px; border-radius: 4px; color: #e5a822; margin-bottom: 10px; text-align: center; font-size: 12px;">
							⚠️ HTTP 429. Waiting ${i}s before retry.
						</div>`,
					);
					// eslint-disable-next-line no-await-in-loop
					await sleep(1000);
				}

				continue;
			}

			return {reason: 'ERROR', details: `HTTP ${response.status}.`};
		} catch (error) {
			console.error(`Network error while deleting ${packageId}`, error);
			// eslint-disable-next-line no-await-in-loop
			await sleep(5000);
		}
	}
}

async function removeTrashLicenses(request: StartRemovalMessage): Promise<void> {
	const protectedIdSet = new Set(request.protectedIds.map(String));
	const targets = [...new Set(request.ids.map(id => id.trim()).filter(id => id.length > 0))];

	if (targets.length === 0) {
		// eslint-disable-next-line no-alert
		alert('Your trash list is empty!');
		return;
	}

	const linkMap = buildLinkMap();
	const report: ReviewReport = {
		mode: request.dryRun ? 'DRY_RUN' : 'EXECUTE',
		totalCandidates: targets.length,
		processed: 0,
		items: [],
	};

	const dashboard = createDashboard();
	updateUi(dashboard, report, undefined);

	const metadataContext: MetadataContext = {
		packageToAppCache: new Map(),
		appMetadataCache: new Map(),
	};

	const sessionId = request.dryRun ? undefined : getSteamSessionId();
	if (!request.dryRun && sessionId === undefined) {
		for (const packageId of targets) {
			report.items.push({
				packageId,
				title: `Package ${packageId}`,
				reason: 'ERROR',
				details: 'Could not find Steam session ID.',
			});
		}

		report.processed = targets.length;
		updateUi(dashboard, report, undefined, `
			<div style="background: rgba(229, 64, 34, 0.2); border: 1px solid #e54022; padding: 8px; border-radius: 4px; color: #e54022; margin-bottom: 10px; text-align: center; font-size: 12px;">
				❌ Could not find Steam session ID. Reload and retry.
			</div>
		`);
		return;
	}

	for (const packageId of targets) {
		const link = linkMap.get(packageId);
		const title = link === undefined ? `Package ${packageId}` : extractTitle(link, packageId);

		let decision: ItemDecision;
		if (link === undefined) {
			decision = {
				packageId,
				title,
				reason: 'SKIP_NOT_ON_PAGE',
				details: 'Package ID is not currently listed on this page.',
			};
		} else if (protectedIdSet.has(packageId)) {
			decision = {
				packageId,
				title,
				reason: 'SKIP_ALLOWLIST_ID',
				details: 'Protected by explicit ID allowlist.',
			};
		} else if (matchesProtectedTitlePattern(title, request.protectedPatterns)) {
			decision = {
				packageId,
				title,
				reason: 'SKIP_ALLOWLIST_PATTERN',
				details: 'Title matched a protected pattern.',
			};
		} else {
			const rowText = link.closest('tr')?.textContent ?? '';
			if (isProtectedLicense(rowText)) {
				decision = {
					packageId,
					title,
					reason: 'SKIP_PROTECTED_KEYWORD',
					details: 'Matched built-in DLC/soundtrack/expansion safeguards.',
				};
			} else {
				// eslint-disable-next-line no-await-in-loop
				const hiddenGem = await evaluateHiddenGemProtection(packageId, link, metadataContext);
				if (hiddenGem.reason !== undefined) {
					decision = {
						packageId,
						title,
						reason: hiddenGem.reason,
						details: hiddenGem.details,
					};
				} else if (request.dryRun) {
					decision = {
						packageId,
						title,
						reason: 'DELETE',
						details: 'Dry run: would send delete request.',
					};
				} else {
					// eslint-disable-next-line no-await-in-loop
					const removalResult = await deletePackageWithRetry(packageId, sessionId!, dashboard, report, packageId);
					decision = {
						packageId,
						title,
						reason: removalResult.reason,
						details: removalResult.details,
					};

					if (removalResult.reason === 'DELETE') {
						const row = link.closest('tr');
						if (row !== null) {
							row.style.display = 'none';
						}
					}
				}
			}
		}

		report.items.push(decision);
		report.processed++;
		updateUi(dashboard, report, packageId);
	}

	updateUi(
		dashboard,
		report,
		undefined,
		`<div style="background: rgba(164, 208, 7, 0.1); border: 1px solid #a4d007; padding: 8px; border-radius: 4px; color: #a4d007; margin-bottom: 10px; text-align: center; font-size: 12px;">
			✅ ${request.dryRun ? 'Dry run complete' : 'Cleanup complete'}.
		</div>`,
	);
}

// Listen for messages from the popup to start the cleanup
chrome.runtime.onMessage.addListener((request: RemovalMessage) => {
	if (request.type === 'START_REMOVAL') {
		void removeTrashLicenses(request);
		return;
	}

	if (request.type === 'START_CLEANUP') {
		void removeTrashLicenses({
			type: 'START_REMOVAL',
			ids: request.ids,
			protectedIds: [],
			protectedPatternsRaw: [],
			protectedPatterns: [],
			dryRun: false,
		});
	}
});
