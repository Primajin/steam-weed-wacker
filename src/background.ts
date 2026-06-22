// eslint-disable-next-line unicorn/no-top-level-side-effects
chrome.runtime.onMessage.addListener((request: {type: string}) => {
	if (request.type !== 'NOTIFY_BAN') {
		return;
	}

	void chrome.notifications.create('steam-ban-alert', {
		type: 'basic',
		iconUrl: 'icons/icon128.png',
		title: 'Steam Backend Limit Reached',
		message: 'The Wacker is pausing for 60 minutes. You will be notified when it resumes!',
		priority: 2,
	});

	// Set alarm for 60 minutes
	void chrome.alarms.create('banCooldown', {delayInMinutes: 60});
});

// eslint-disable-next-line unicorn/no-top-level-side-effects
chrome.alarms.onAlarm.addListener(alarm => {
	if (alarm.name === 'banCooldown') {
		void chrome.notifications.create('steam-resume-alert', {
			type: 'basic',
			iconUrl: 'icons/icon128.png',
			title: 'Cooldown finished!',
			message: 'The hour is up. Reload the Steam tab to continue deleting licenses.',
			priority: 2,
		});
	}
});

export {};
