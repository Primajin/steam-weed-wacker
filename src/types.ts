export type DecisionReason =
	| 'DELETE'
	| 'SKIP_ALLOWLIST_ID'
	| 'SKIP_ALLOWLIST_PATTERN'
	| 'SKIP_PROTECTED_KEYWORD'
	| 'SKIP_HIDDEN_GEM'
	| 'SKIP_METADATA_UNAVAILABLE'
	| 'SKIP_RATE_LIMIT'
	| 'SKIP_NOT_ON_PAGE'
	| 'SKIP_ZOMBIE'
	| 'ERROR';

export type StartRemovalMessage = {
	type: 'START_REMOVAL';
	ids: string[];
	protectedIds: string[];
	protectedPatternsRaw: string[];
	dryRun: boolean;
};

export type GetPageIdsMessage = {
	type: 'GET_PAGE_IDS';
};

export type GetPageIdsResponse = {
	ids: string[];
};

export type ItemDecision = {
	packageId: string;
	title: string;
	reason: DecisionReason;
	details?: string;
};
