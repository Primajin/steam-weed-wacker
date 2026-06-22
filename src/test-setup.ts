import '@testing-library/jest-dom';
import {vi} from 'vitest';

// Stub the Chrome extension API globally so content.ts (which calls
// chrome.runtime.onMessage.addListener at module scope) can be imported in tests.
vi.stubGlobal('chrome', {
	runtime: {
		onMessage: {addListener: vi.fn()},
		sendMessage: vi.fn(),
	},
	storage: {
		local: {
			get: vi.fn(),
			set: vi.fn(),
			remove: vi.fn(),
		},
	},
	tabs: {
		query: vi.fn(),
		sendMessage: vi.fn(),
		create: vi.fn(),
	},
	notifications: {
		create: vi.fn(),
	},
	alarms: {
		create: vi.fn(),
		onAlarm: {addListener: vi.fn()},
	},
});
