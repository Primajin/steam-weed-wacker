/** Minimum delay between API requests (ms). */
export const MIN_DELAY_MS = 1000;

/** Must stay in sync with the `delayInMinutes` value in background.ts. */
export const RATE_LIMIT_COOLDOWN_SECONDS = 3600;

/** Fallback wait time when the server omits a Retry-After header. */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** Keywords that identify protected licenses (DLC, soundtracks, etc.). */
export const PROTECTED_KEYWORDS = ['dlc', 'soundtrack', 'expansion', 'season pass'];

export type HiddenGemReviewLabelLiteral = 'very positive' | 'overwhelmingly positive';

export const HIDDEN_GEM_REVIEW_LABELS: HiddenGemReviewLabelLiteral[] = ['very positive', 'overwhelmingly positive'];
export const DEFAULT_HIDDEN_GEM_MIN_REVIEWS = 500;

/**
 Formats a number of seconds into a human-readable string, e.g. "1h 2m 3s".
 Returns "Almost Done..." for zero or negative values.
 */
export function formatTime(totalSeconds: number): string {
	if (totalSeconds <= 0) {
		return 'Almost Done...';
	}

	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = Math.ceil(totalSeconds % 60);
	const parts: string[] = [];
	if (h > 0) {
		parts.push(`${h}h`);
	}

	if (m > 0 || h > 0) {
		parts.push(`${m}m`);
	}

	parts.push(`${s}s`);
	return parts.join(' ');
}

/**
 Returns true when the license row text looks like a DLC, soundtrack or
 other protected content that should not be removed automatically.
 */
export function isProtectedLicense(elementText: string): boolean {
	const text = elementText.toLowerCase();
	return PROTECTED_KEYWORDS.some(keyword => text.includes(keyword));
}

export function parseProtectedIds(input: string): string[] {
	return input
		.split(/[\s,]+/v)
		.map(chunk => chunk.trim())
		.filter(chunk => chunk.length > 0);
}

export function parseProtectedTitlePatterns(input: string): RegExp[] {
	return input
		.split(/\r?\n/v)
		.map(line => line.trim())
		.filter(line => line.length > 0)
		.map(line => parseProtectedTitlePattern(line));
}

function parseProtectedTitlePattern(line: string): RegExp {
	const regexMatch = /^\/(?<source>.+)\/(?<flags>[dgimsuy]*)$/v.exec(line);
	if (regexMatch?.groups !== undefined) {
		const {source, flags} = regexMatch.groups;
		try {
			return new RegExp(source, flags.length > 0 ? flags : 'i');
		} catch {
			console.warn(`Invalid protected title regex "${line}". Falling back to a no-match regex.`);
			// eslint-disable-next-line regexp/no-useless-assertions
			return /$a/v;
		}
	}

	return new RegExp(escapeRegex(line), 'iv');
}

export function matchesProtectedTitlePattern(title: string, patterns: RegExp[]): boolean {
	for (const pattern of patterns) {
		try {
			if (pattern.test(title)) {
				return true;
			}
		} catch {
			// Ignore malformed regex patterns at match-time and keep processing.
		}
	}

	return false;
}

function escapeRegex(value: string): string {
	const specialChars = new Set(['\\', '^', '$', '.', '|', '?', '*', '+', '(', ')', '[', ']', '{', '}']);
	let escaped = '';
	for (const character of value) {
		escaped += specialChars.has(character) ? `\\${character}` : character;
	}

	return escaped;
}

export function shouldProtectHiddenGem(
	isFree: boolean,
	reviewScoreDescription: string | undefined,
	reviewCount: number | undefined,
	minReviews = DEFAULT_HIDDEN_GEM_MIN_REVIEWS,
): boolean {
	if (!isFree || reviewScoreDescription === undefined || reviewCount === undefined) {
		return false;
	}

	const normalizedLabel = reviewScoreDescription.toLowerCase();
	if (!isHiddenGemReviewLabel(normalizedLabel)) {
		return false;
	}

	return reviewCount >= minReviews;
}

function isHiddenGemReviewLabel(value: string): value is HiddenGemReviewLabelLiteral {
	return (HIDDEN_GEM_REVIEW_LABELS as readonly string[]).includes(value);
}

/**
 Extracts the Steam session ID from an inline <script> tag on the page.
 Only searches scripts without a `src` attribute (Manifest V3 isolation workaround).
 Returns null when the ID cannot be found.
 */
export function getSteamSessionId(): string | undefined {
	const scripts = document.querySelectorAll<HTMLScriptElement>('script:not([src])');
	for (const script of scripts) {
		const match = /g_sessionID\s*=\s*"(?<sessionId>[^"]+)"/v.exec(script.textContent ?? '');
		if (match?.groups?.sessionId !== undefined) {
			return match.groups.sessionId;
		}
	}

	return undefined;
}
