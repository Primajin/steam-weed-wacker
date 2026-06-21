import {
	describe,
	it,
	expect,
	beforeEach,
	vi,
} from 'vitest';
import {
	formatTime,
	isProtectedLicense,
	getSteamSessionId,
	PROTECTED_KEYWORDS,
	parseProtectedIds,
	parseProtectedTitlePatterns,
	matchesProtectedTitlePattern,
	shouldProtectHiddenGem,
	DEFAULT_HIDDEN_GEM_MIN_REVIEWS,
} from './utils.js';

describe('formatTime', () => {
	it('returns "Almost Done..." for zero seconds', () => {
		expect(formatTime(0)).toBe('Almost Done...');
	});

	it('returns "Almost Done..." for negative seconds', () => {
		expect(formatTime(-10)).toBe('Almost Done...');
	});

	it('formats seconds only', () => {
		expect(formatTime(45)).toBe('45s');
	});

	it('formats minutes and seconds', () => {
		expect(formatTime(90)).toBe('1m 30s');
	});

	it('formats hours, minutes and seconds', () => {
		expect(formatTime(3661)).toBe('1h 1m 1s');
	});

	it('formats zero minutes when hours are present', () => {
		expect(formatTime(3600)).toBe('1h 0m 0s');
	});
});

describe('isProtectedLicense', () => {
	it('returns false for a regular game name', () => {
		expect(isProtectedLicense('My Cool Game')).toBe(false);
	});

	it('returns true for a DLC entry', () => {
		expect(isProtectedLicense('My Cool Game DLC')).toBe(true);
	});

	it('returns true for a soundtrack entry', () => {
		expect(isProtectedLicense('My Cool Game Soundtrack')).toBe(true);
	});

	it('returns true for an expansion entry', () => {
		expect(isProtectedLicense('My Cool Game Expansion Pack')).toBe(true);
	});

	it('returns true for a season pass entry', () => {
		expect(isProtectedLicense('My Cool Game Season Pass')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(isProtectedLicense('ULTIMATE DLC BUNDLE')).toBe(true);
	});

	it('covers all PROTECTED_KEYWORDS', () => {
		for (const keyword of PROTECTED_KEYWORDS) {
			expect(isProtectedLicense(`Game ${keyword} Extra`)).toBe(true);
		}
	});
});

describe('getSteamSessionId', () => {
	beforeEach(() => {
		document.head.innerHTML = '';
		document.body.innerHTML = '';
	});

	it('returns undefined when no scripts are on the page', () => {
		expect(getSteamSessionId()).toBeUndefined();
	});

	it('returns undefined when an inline script does not contain the session ID', () => {
		const script = document.createElement('script');
		script.textContent = 'var someOtherVar = "hello";';
		document.head.append(script);
		expect(getSteamSessionId()).toBeUndefined();
	});

	it('extracts the session ID from an inline script', () => {
		const script = document.createElement('script');
		script.textContent = 'var g_sessionID = "abc123def";';
		document.head.append(script);
		expect(getSteamSessionId()).toBe('abc123def');
	});

	it('ignores external scripts with a src attribute', () => {
		const script = document.createElement('script');
		script.src = 'https://store.steampowered.com/public/javascript/main.js';
		document.head.append(script);
		expect(getSteamSessionId()).toBeUndefined();
	});

	it('finds the session ID in a script with surrounding whitespace', () => {
		const script = document.createElement('script');
		script.textContent = '\n\t\tvar g_sessionID  =  "spaced_id_456";\n\t';
		document.head.append(script);
		expect(getSteamSessionId()).toBe('spaced_id_456');
	});
});

describe('parseProtectedIds', () => {
	it('parses comma/newline/space separated IDs', () => {
		expect(parseProtectedIds('730, 570\n440 570')).toEqual(['730', '570', '440', '570']);
	});

	it('drops empty values', () => {
		expect(parseProtectedIds('abc,   , \n -1, 0, 42')).toEqual(['abc', '-1', '0', '42']);
	});
});

describe('parseProtectedTitlePatterns', () => {
	it('parses plain-text patterns', () => {
		const patterns = parseProtectedTitlePatterns('Half Life\nWorld of');
		expect(patterns[0]?.test('half life 2')).toBe(true);
		expect(patterns[1]?.test('the world of tanks')).toBe(true);
	});

	it('parses regex syntax and preserves flags', () => {
		const [pattern] = parseProtectedTitlePatterns('/^World of/i');
		expect(pattern?.test('World of Tanks')).toBe(true);
		expect(pattern?.test('The World of Tanks')).toBe(false);
	});

	it('returns a no-match fallback regex and warns when regex is invalid', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const [pattern] = parseProtectedTitlePatterns('/[invalid/');
		expect(pattern?.test('/[invalid/')).toBe(false);
		expect(warnSpy).toHaveBeenCalledOnce();
		warnSpy.mockRestore();
	});
});

describe('matchesProtectedTitlePattern', () => {
	it('matches contains rules case-insensitively', () => {
		const patterns = parseProtectedTitlePatterns('half life');
		expect(matchesProtectedTitlePattern('Half Life 2', patterns)).toBe(true);
	});

	it('matches regex rules against original title', () => {
		const patterns = parseProtectedTitlePatterns('/^World of/i');
		expect(matchesProtectedTitlePattern('World of Tanks', patterns)).toBe(true);
		expect(matchesProtectedTitlePattern('The World of Tanks', patterns)).toBe(false);
	});
});

describe('shouldProtectHiddenGem', () => {
	it('protects very positive free titles above threshold', () => {
		expect(shouldProtectHiddenGem(true, 'Very Positive', DEFAULT_HIDDEN_GEM_MIN_REVIEWS + 10)).toBe(true);
	});

	it('does not protect paid titles', () => {
		expect(shouldProtectHiddenGem(false, 'Overwhelmingly Positive', 999_999)).toBe(false);
	});

	it('does not protect titles below review threshold', () => {
		expect(shouldProtectHiddenGem(true, 'Very Positive', DEFAULT_HIDDEN_GEM_MIN_REVIEWS - 1)).toBe(false);
	});

	it('does not protect titles without known sentiment', () => {
		expect(shouldProtectHiddenGem(true, 'Mixed', 20_000)).toBe(false);
	});
});
