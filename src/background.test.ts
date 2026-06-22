import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
} from 'vitest';

// Background.ts registers two listeners at module scope.
// We capture them from the chrome mock that was installed in test-setup.ts,
// then exercise each listener directly.

await import('./background.js');

// Retrieve the two listener callbacks registered during module evaluation.
const onMessageCallback = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as ((request: {type: string}) => void) | undefined;
const onAlarmCallback = (chrome.alarms.onAlarm.addListener as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as ((alarm: {name: string}) => void) | undefined;

describe('background: onMessage listener', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('is registered on chrome.runtime.onMessage', () => {
		expect(onMessageCallback).toBeTypeOf('function');
	});

	it('creates a ban-alert notification and starts the cooldown alarm on NOTIFY_BAN', () => {
		onMessageCallback!({type: 'NOTIFY_BAN'});

		expect(chrome.notifications.create).toHaveBeenCalledOnce();
		expect(chrome.notifications.create).toHaveBeenCalledWith(
			'steam-ban-alert',
			expect.objectContaining({title: 'Steam Backend Limit Reached'}),
		);

		expect(chrome.alarms.create).toHaveBeenCalledOnce();
		expect(chrome.alarms.create).toHaveBeenCalledWith(
			'banCooldown',
			expect.objectContaining({delayInMinutes: 60}),
		);
	});

	it('does nothing for unrecognised message types', () => {
		onMessageCallback!({type: 'UNKNOWN_TYPE'});
		expect(chrome.notifications.create).not.toHaveBeenCalled();
		expect(chrome.alarms.create).not.toHaveBeenCalled();
	});
});

describe('background: onAlarm listener', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('is registered on chrome.alarms.onAlarm', () => {
		expect(onAlarmCallback).toBeTypeOf('function');
	});

	it('creates a resume notification when the banCooldown alarm fires', () => {
		onAlarmCallback!({name: 'banCooldown'});

		expect(chrome.notifications.create).toHaveBeenCalledOnce();
		expect(chrome.notifications.create).toHaveBeenCalledWith(
			'steam-resume-alert',
			expect.objectContaining({title: 'Cooldown finished!'}),
		);
	});

	it('does nothing for unrelated alarm names', () => {
		onAlarmCallback!({name: 'someOtherAlarm'});
		expect(chrome.notifications.create).not.toHaveBeenCalled();
	});
});
