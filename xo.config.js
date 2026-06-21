import eslintReact from '@eslint-react/eslint-plugin';

/** @type {import('xo').FlatXoConfig} */
// Global ignores must be a standalone config item (no other keys)
const xoConfig = [
	{ignores: ['dist/**', 'coverage/**', 'README.md']},
	// @eslint-react natively supports ESLint 10 — the ESLint-10-compatible
	// alternative to eslint-plugin-react, as noted in the XO v3.0.0 release notes.
	// TypeScript support is built into XO 3 automatically via eslint-config-xo.
	// Scoped to JSX/TSX only — code-path rules break on non-JS files (e.g. Markdown).
	{
		...eslintReact.configs['recommended-typescript'],
		files: ['**/*.{jsx,tsx}'],
	},
	{
		languageOptions: {
			globals: {
				chrome: 'readonly',
			},
		},
		rules: {
			// React component files conventionally use PascalCase
			'unicorn/filename-case': ['error', {cases: {kebabCase: true, pascalCase: true}}],
			// Extension popups are not public web pages — OGP tags are irrelevant
			'@html-eslint/require-open-graph-protocol': 'off',
		},
	},
	{
		files: ['**/*.test.ts', '**/*.test.tsx', '**/test-setup.ts'],
		rules: {
			// Side-effect imports are intentional in test setup/fixture files
			'import-x/no-unassigned-import': 'off',
			// Allow importing devDependencies in test files
			'n/no-unpublished-import': 'off',
		},
	},
];

export default xoConfig;
