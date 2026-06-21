import type {ProtectedTitlePattern} from './utils.js';

export type DecisionReason =
	| 'DELETE'
	| 'SKIP_ALLOWLIST_ID'
	| 'SKIP_ALLOWLIST_PATTERN'
	| 'SKIP_PROTECTED_KEYWORD'
	| 'SKIP_HIDDEN_GEM'
	| 'SKIP_METADATA_UNAVAILABLE'
	| 'SKIP_RATE_LIMIT'
	| 'SKIP_NOT_ON_PAGE'
	| 'ERROR';

export type StartRemovalMessage = {
	type: 'START_REMOVAL';
	ids: string[];
	protectedIds: number[];
	protectedPatternsRaw: string[];
	protectedPatterns: ProtectedTitlePattern[];
	dryRun: boolean;
};

export type LegacyStartCleanupMessage = {
	type: 'START_CLEANUP';
	ids: string[];
};

export type RemovalMessage = StartRemovalMessage | LegacyStartCleanupMessage;

export type ItemDecision = {
	packageId: string;
	title: string;
	reason: DecisionReason;
	details?: string;
};
