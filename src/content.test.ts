import {
	describe,
	it,
	expect,
	beforeEach,
	vi,
} from 'vitest';
import {
	ACCOUNT_TABLE_ROW_HEIGHT_PX,
	injectPerformanceStyles,
	buildLinkMap,
	escapeHtml,
	extractTitle,
	recordDecision,
	computeEtaStats,
	getAppIdFromRow,
	resolveAppIdForPackage,
	getHiddenGemMetadata,
	evaluateHiddenGemProtection,
} from './content.js';
import type {DecisionReason, ItemDecision} from './types.js';
import type {
	ReviewReport,
	MetadataContext,
	RequestContext,
	EtaStats,
} from './content.js';

describe('ACCOUNT_TABLE_ROW_HEIGHT_PX', () => {
	it('is a positive integer', () => {
		expect(ACCOUNT_TABLE_ROW_HEIGHT_PX).toBeGreaterThan(0);
		expect(Number.isSafeInteger(ACCOUNT_TABLE_ROW_HEIGHT_PX)).toBe(true);
	});
});

describe('injectPerformanceStyles', () => {
	beforeEach(() => {
		document.head.innerHTML = '';
	});

	it('injects a style element with id sww-performance-styles', () => {
		injectPerformanceStyles();
		expect(document.querySelector('#sww-performance-styles')).not.toBeNull();
	});

	it('injected style targets .accountTable', () => {
		injectPerformanceStyles();
		const style = document.querySelector<HTMLStyleElement>('#sww-performance-styles');
		expect(style?.textContent).toContain('.accountTable');
	});

	it('injected style includes content-visibility: auto', () => {
		injectPerformanceStyles();
		const style = document.querySelector<HTMLStyleElement>('#sww-performance-styles');
		expect(style?.textContent).toContain('content-visibility: auto');
	});

	it('injected style includes contain-intrinsic-size with the row height constant', () => {
		injectPerformanceStyles();
		const style = document.querySelector<HTMLStyleElement>('#sww-performance-styles');
		expect(style?.textContent).toContain(`contain-intrinsic-size: 0 ${ACCOUNT_TABLE_ROW_HEIGHT_PX}px`);
	});

	it('appends the style to document.head', () => {
		injectPerformanceStyles();
		const style = document.head.querySelector('#sww-performance-styles');
		expect(style).not.toBeNull();
	});

	it('does not inject a second style element when called multiple times', () => {
		injectPerformanceStyles();
		const countAfterFirst = document.head.querySelectorAll('style[id="sww-performance-styles"]').length;
		injectPerformanceStyles();
		const countAfterSecond = document.head.querySelectorAll('style[id="sww-performance-styles"]').length;
		expect(countAfterFirst).toBe(1);
		expect(countAfterSecond).toBe(1);
	});
});

describe('buildLinkMap', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('returns an empty map when there are no remove links', () => {
		expect(buildLinkMap().size).toBe(0);
	});

	it('maps a package ID to its anchor element', () => {
		const link = document.createElement('a');
		// eslint-disable-next-line no-script-url
		link.href = 'javascript:RemoveFreeLicense(12345, \'My Game\')';
		document.body.append(link);
		const map = buildLinkMap();
		expect(map.has('12345')).toBe(true);
		expect(map.get('12345')).toBe(link);
	});

	it('maps multiple package IDs', () => {
		for (const id of ['11', '22', '33']) {
			const link = document.createElement('a');
			link.href = `javascript:RemoveFreeLicense(${id}, 'Game')`;
			document.body.append(link);
		}

		const map = buildLinkMap();
		expect(map.size).toBe(3);
		expect(map.has('11')).toBe(true);
		expect(map.has('22')).toBe(true);
		expect(map.has('33')).toBe(true);
	});

	it('ignores anchor elements that do not match the RemoveFreeLicense pattern', () => {
		const link = document.createElement('a');
		link.href = 'https://store.steampowered.com/app/12345';
		document.body.append(link);
		expect(buildLinkMap().size).toBe(0);
	});
});

describe('escapeHtml', () => {
	it('escapes ampersands', () => {
		expect(escapeHtml('a & b')).toBe('a &amp; b');
	});

	it('escapes less-than and greater-than signs', () => {
		expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
	});

	it('escapes double quotes', () => {
		expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
	});

	it('escapes single quotes', () => {
		expect(escapeHtml('it\'s')).toBe('it&#39;s');
	});

	it('returns unchanged string when no special characters are present', () => {
		expect(escapeHtml('Hello World')).toBe('Hello World');
	});

	it('escapes all special characters in a combined string', () => {
		expect(escapeHtml('<a href="x">it\'s a & b</a>')).toBe('&lt;a href=&quot;x&quot;&gt;it&#39;s a &amp; b&lt;/a&gt;');
	});
});

describe('extractTitle', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('decodes a Base64-encoded ASCII title from the href', () => {
		// "Nothing In Elevator" → btoa → Tm90aGluZyBJbiBFbGV2YXRvcg==
		document.body.innerHTML = `
			<table><tbody><tr>
				<td>12 Apr, 2026</td>
				<td><a href="javascript:RemoveFreeLicense(1,'Tm90aGluZyBJbiBFbGV2YXRvcg==')">Remove</a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('a')!;
		expect(extractTitle(link, '1')).toBe('Nothing In Elevator');
	});

	it('falls back to raw href value when it is not valid Base64', () => {
		// Plain string with a space — atob throws, so raw value is returned
		document.body.innerHTML = `
			<table><tbody><tr>
				<td>12 Apr, 2026</td>
				<td><a href="javascript:RemoveFreeLicense(1,'My Awesome Game')">Remove</a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('a')!;
		expect(extractTitle(link, '1')).toBe('My Awesome Game');
	});

	it('falls back to the second td when the href title is empty', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td>12 Apr, 2026</td>
				<td>Second Cell <a href="javascript:RemoveFreeLicense(2,'')">Remove</a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('a')!;
		expect(extractTitle(link, '2')).toBe('Second Cell Remove');
	});

	it('returns "Package <id>" when the href title is empty and the row text is whitespace', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td>   </td>
				<td><a href="javascript:RemoveFreeLicense(3,'')">   </a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('a')!;
		expect(extractTitle(link, '3')).toBe('Package 3');
	});

	it('returns "Package <id>" when the link has no closest tr and the href title is empty', () => {
		const link = document.createElement('a');
		// eslint-disable-next-line no-script-url
		link.href = 'javascript:RemoveFreeLicense(42,\'\')';
		document.body.append(link);
		expect(extractTitle(link, '42')).toBe('Package 42');
	});
});

function makeReport() {
	const skipCounts: Partial<Record<DecisionReason, number>> = {};
	const items: ItemDecision[] = [];
	return {
		mode: 'EXECUTE' as const,
		totalCandidates: 10,
		processed: 0,
		startedAt: 0,
		rateLimitCount: 0,
		rateLimitTotalWaitMs: 0,
		deletedCount: 0,
		errorCount: 0,
		skipCounts,
		items,
		lastRenderAt: 0,
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

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeMetadataContext(overrides?: Partial<MetadataContext>): MetadataContext {
	return {
		packageToAppCache: new Map(),
		appMetadataCache: new Map(),
		...overrides,
	};
}

// NOTE: content.test.ts already has a local makeReport() at line 184 (used by recordDecision tests).
// This helper is named makeFullReport to avoid a name collision. It accepts overrides and defaults
// startedAt to performance.now() so ETA calculations get a realistic elapsed time.
function makeFullReport(overrides?: Partial<ReviewReport>): ReviewReport {
	return {
		mode: 'DRY_RUN',
		totalCandidates: 10,
		processed: 0,
		startedAt: performance.now(),
		rateLimitCount: 0,
		rateLimitTotalWaitMs: 0,
		deletedCount: 0,
		errorCount: 0,
		skipCounts: {},
		items: [],
		lastRenderAt: 0,
		...overrides,
	};
}

function makeCtx(overrides?: Partial<RequestContext>): RequestContext {
	return {
		dashboard: document.createElement('div'),
		report: makeFullReport(),
		...overrides,
	};
}

/** Creates an anchor element with no DOM context (no surrounding tr). */
function makeOrphanLink(packageId: string): HTMLAnchorElement {
	const link = document.createElement('a');
	// eslint-disable-next-line no-script-url
	link.href = `javascript:RemoveFreeLicense(${packageId},'Game')`;
	return link;
}

/** Creates a fetch Response with a JSON body. */
function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {'Content-Type': 'application/json'},
	});
}

describe('computeEtaStats', () => {
	it('returns undefined when nothing has been processed', () => {
		const report = makeFullReport({processed: 0, totalCandidates: 10});
		expect(computeEtaStats(report)).toBeUndefined();
	});

	it('returns stats with no rate limits hit', () => {
		const elapsed = 5000; // ms
		const report = makeFullReport({
			processed: 5,
			totalCandidates: 10,
			startedAt: performance.now() - elapsed,
			rateLimitCount: 0,
			rateLimitTotalWaitMs: 0,
		});
		const result = computeEtaStats(report) as EtaStats;
		expect(result).toBeDefined();
		expect(Number(result.avgItemsPerMin)).toBeGreaterThan(0);
		expect(result.rateLimitBreaksText).toBe('none so far');
		expect(result.etaFormatted).not.toBe('');
	});

	it('includes rate limit breaks text when rate limits were hit', () => {
		const report = makeFullReport({
			processed: 5,
			totalCandidates: 10,
			startedAt: performance.now() - 5000,
			rateLimitCount: 2,
			rateLimitTotalWaitMs: 120_000,
		});
		const result = computeEtaStats(report) as EtaStats;
		expect(result.rateLimitBreaksText).toContain('2 hit');
	});

	it('returns "Almost Done..." ETA when remaining items is 0', () => {
		const report = makeFullReport({
			processed: 10,
			totalCandidates: 10,
			startedAt: performance.now() - 10_000,
			rateLimitCount: 0,
			rateLimitTotalWaitMs: 0,
		});
		const result = computeEtaStats(report) as EtaStats;
		// All items processed — remaining = 0 → ETA should be "Almost Done..."
		expect(result.etaFormatted).toBe('Almost Done...');
	});
});

describe('getAppIdFromRow', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('returns undefined when the link has no enclosing tr', () => {
		const link = makeOrphanLink('999');
		document.body.append(link);
		expect(getAppIdFromRow(link)).toBeUndefined();
	});

	it('returns undefined when the row has no /app/ link', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td><a id="t" href="javascript:void(0)">remove</a></td>
				<td><a href="https://store.steampowered.com/bundle/12/">bundle</a></td>
			</tr></tbody></table>
		`;
		expect(getAppIdFromRow(document.querySelector<HTMLAnchorElement>('#t')!)).toBeUndefined();
	});

	it('extracts a numeric app ID from an /app/ link in the same row', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td><a id="t" href="javascript:void(0)">remove</a></td>
				<td><a href="https://store.steampowered.com/app/440/Team_Fortress_2/">TF2</a></td>
			</tr></tbody></table>
		`;
		expect(getAppIdFromRow(document.querySelector<HTMLAnchorElement>('#t')!)).toBe(440);
	});

	it('returns undefined when the app ID in the href is not a valid integer', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td><a id="t" href="javascript:void(0)">remove</a></td>
				<td><a href="https://store.steampowered.com/app/nope/">bad</a></td>
			</tr></tbody></table>
		`;
		expect(getAppIdFromRow(document.querySelector<HTMLAnchorElement>('#t')!)).toBeUndefined();
	});
});

describe('resolveAppIdForPackage', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('returns cached value immediately without fetching', async () => {
		const context = makeMetadataContext({
			packageToAppCache: new Map([['123', 440]]),
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await resolveAppIdForPackage('123', makeOrphanLink('123'), context, makeCtx());

		expect(result).toBe(440);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns cached undefined (e.g. dead package) without fetching', async () => {
		const context = makeMetadataContext({
			packageToAppCache: new Map<string, number | undefined>([['123', undefined]]),
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await resolveAppIdForPackage('123', makeOrphanLink('123'), context, makeCtx());

		expect(result).toBeUndefined();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('resolves app ID from DOM app link without fetching', async () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td><a id="remove" href="javascript:void(0)">remove</a></td>
				<td><a href="https://store.steampowered.com/app/730/">CS2</a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('#remove')!;
		const context = makeMetadataContext();
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await resolveAppIdForPackage('555', link, context, makeCtx());

		expect(result).toBe(730);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(context.packageToAppCache.get('555')).toBe(730);
	});

	it('fetches from API and returns app ID on success', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse({'999': {success: true, data: {apps: [{id: 12345}]}}}),
		);
		const context = makeMetadataContext();

		const result = await resolveAppIdForPackage('999', makeOrphanLink('999'), context, makeCtx());

		expect(result).toBe(12345);
		expect(context.packageToAppCache.get('999')).toBe(12345);
	});

	it('returns "dead" and caches undefined for success:false packages', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse({'999': {success: false}}),
		);
		const context = makeMetadataContext();

		const result = await resolveAppIdForPackage('999', makeOrphanLink('999'), context, makeCtx());

		expect(result).toBe('dead');
		expect(context.packageToAppCache.has('999')).toBe(true);
		expect(context.packageToAppCache.get('999')).toBeUndefined();
	});

	it('returns "error" on network failure and does NOT cache', async () => {
		vi.useFakeTimers();
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

		const context = makeMetadataContext();
		const promise = resolveAppIdForPackage('999', makeOrphanLink('999'), context, makeCtx());
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(result).toBe('error');
		expect(context.packageToAppCache.has('999')).toBe(false);

		vi.useRealTimers();
	});
});

describe('getHiddenGemMetadata', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns cached value without fetching', async () => {
		const cached = {isFree: true, reviewScoreDescription: 'Very Positive', reviewCount: 1000};
		const context = makeMetadataContext({
			appMetadataCache: new Map([[440, cached]]),
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await getHiddenGemMetadata(440, '123', context, makeCtx());

		expect(result).toBe(cached);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns metadata for a free game with review data', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse({
				'440': {success: true, data: {is_free: true, type: 'game'}},
			}))
			.mockResolvedValueOnce(jsonResponse({
				query_summary: {review_score_desc: 'Very Positive', total_reviews: 5000},
			}));

		const context = makeMetadataContext();
		const result = await getHiddenGemMetadata(440, '123', context, makeCtx());

		expect(result).toEqual({isFree: true, reviewScoreDescription: 'Very Positive', reviewCount: 5000});
		expect(context.appMetadataCache.get(440)).toEqual(result);
	});

	it('returns early metadata without reviews for a non-free app', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
			'730': {success: true, data: {is_free: false, type: 'game'}},
		}));

		const context = makeMetadataContext();
		const result = await getHiddenGemMetadata(730, '555', context, makeCtx());

		expect(result).toEqual({isFree: false, reviewScoreDescription: '', reviewCount: 0});
	});

	it('returns undefined and caches undefined when appdetails fetch fails', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', {status: 500}));

		const context = makeMetadataContext();
		const result = await getHiddenGemMetadata(440, '123', context, makeCtx());

		expect(result).toBeUndefined();
		expect(context.appMetadataCache.has(440)).toBe(true);
	});

	it('returns undefined when review summary is missing', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse({
				'440': {success: true, data: {is_free: true, type: 'game'}},
			}))
			.mockResolvedValueOnce(jsonResponse({query_summary: {}}));

		const context = makeMetadataContext();
		const result = await getHiddenGemMetadata(440, '123', context, makeCtx());

		expect(result).toBeUndefined();
	});
});

describe('evaluateHiddenGemProtection', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('returns {} (allow deletion) for a dead package', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			jsonResponse({'123': {success: false}}),
		);
		const context = makeMetadataContext();
		const result = await evaluateHiddenGemProtection('123', makeOrphanLink('123'), context, makeCtx());
		expect(result).toEqual({});
	});

	it('returns {} (allow deletion) when app has no reviews yet', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse({'123': {success: true, data: {apps: [{id: 440}]}}}))
			.mockResolvedValueOnce(jsonResponse({'440': {success: true, data: {is_free: true, type: 'game'}}}))
			.mockResolvedValueOnce(jsonResponse({query_summary: {review_score_desc: 'Very Positive', total_reviews: 0}}));

		const context = makeMetadataContext();
		const result = await evaluateHiddenGemProtection('123', makeOrphanLink('123'), context, makeCtx());
		expect(result).toEqual({});
	});

	it('returns SKIP_HIDDEN_GEM for a free game with very positive reviews above threshold', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse({'123': {success: true, data: {apps: [{id: 440}]}}}))
			.mockResolvedValueOnce(jsonResponse({'440': {success: true, data: {is_free: true, type: 'game'}}}))
			.mockResolvedValueOnce(jsonResponse({
				query_summary: {review_score_desc: 'Very Positive', total_reviews: 600},
			}));

		const context = makeMetadataContext();
		const result = await evaluateHiddenGemProtection('123', makeOrphanLink('123'), context, makeCtx());
		expect(result.reason).toBe('SKIP_HIDDEN_GEM');
		expect(result.details).toContain('Very Positive');
	});

	it('returns SKIP_METADATA_UNAVAILABLE when app ID resolution fails with a network error', async () => {
		vi.useFakeTimers();
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

		const context = makeMetadataContext();
		const promise = evaluateHiddenGemProtection('123', makeOrphanLink('123'), context, makeCtx());
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(result.reason).toBe('SKIP_METADATA_UNAVAILABLE');
		expect(result.details).toMatch(/network error/i);

		vi.useRealTimers();
	});

	it('returns SKIP_METADATA_UNAVAILABLE when metadata fetch returns undefined', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse({'123': {success: true, data: {apps: [{id: 440}]}}}))
			.mockResolvedValueOnce(new Response('', {status: 500})); // appdetails fails

		const context = makeMetadataContext();
		const result = await evaluateHiddenGemProtection('123', makeOrphanLink('123'), context, makeCtx());
		expect(result.reason).toBe('SKIP_METADATA_UNAVAILABLE');
	});
});

