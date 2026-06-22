import {
	describe,
	it,
	expect,
	beforeEach,
} from 'vitest';
import {
	ACCOUNT_TABLE_ROW_HEIGHT_PX,
	injectPerformanceStyles,
	buildLinkMap,
	escapeHtml,
	extractTitle,
	recordDecision,
} from './content.js';
import type {DecisionReason, ItemDecision} from './types.js';

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

	it('returns the text of the first td when the link is inside a table row', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td>My Awesome Game</td>
				<td><a href="javascript:RemoveFreeLicense(1,'x')">Remove</a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('a')!;
		expect(extractTitle(link, '1')).toBe('My Awesome Game');
	});

	it('uses the first td text content as the title', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td>First Cell</td>
				<td>Second Cell <a href="javascript:RemoveFreeLicense(2,'x')">Remove</a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('a')!;
		// ExtractTitle reads the first td, which is "First Cell"
		expect(extractTitle(link, '2')).toBe('First Cell');
	});

	it('returns "Package <id>" when the row text is entirely whitespace', () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td>   </td>
				<td><a href="javascript:RemoveFreeLicense(3,'x')">   </a></td>
			</tr></tbody></table>
		`;
		const link = document.querySelector<HTMLAnchorElement>('a')!;
		// First td trims to '' and row text is all whitespace — falls back to fallback.
		expect(extractTitle(link, '3')).toBe('Package 3');
	});

	it('returns "Package <id>" when the link has no closest tr', () => {
		const link = document.createElement('a');
		// eslint-disable-next-line no-script-url
		link.href = 'javascript:RemoveFreeLicense(42,\'x\')';
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
