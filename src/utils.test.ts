import {
	describe,
	it,
	expect,
	beforeEach,
} from 'vitest';
import {
	formatTime,
	isProtectedLicense,
	getSteamSessionId,
	PROTECTED_KEYWORDS,
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

	it('returns null when no scripts are on the page', () => {
		expect(getSteamSessionId()).toBeUndefined();
	});

	it('returns null when an inline script does not contain the session ID', () => {
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
