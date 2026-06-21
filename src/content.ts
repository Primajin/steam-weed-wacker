import {
	MIN_DELAY_MS,
	RATE_LIMIT_COOLDOWN_SECONDS,
	DEFAULT_RETRY_AFTER_SECONDS,
	formatTime,
	isProtectedLicense,
	getSteamSessionId,
} from './utils.js';

const sleep = async (ms: number) => new Promise<void>(resolve => {
	setTimeout(resolve, ms);
});

function buildLinkMap(): Map<string, HTMLAnchorElement> {
	const allRemoveLinks = document.querySelectorAll<HTMLAnchorElement>('a[href^="javascript:RemoveFreeLicense"]');
	const linkMap = new Map<string, HTMLAnchorElement>();

	for (const link of allRemoveLinks) {
		const match = /RemoveFreeLicense\(\s*(?<packageId>\d+),\s*'.*?'\s*\)/v.exec(link.href);
		if (match?.groups?.packageId !== undefined) {
			linkMap.set(match.groups.packageId, link);
		}
	}

	return linkMap;
}

function createDashboard(): HTMLDivElement {
	const dashboard = document.createElement('div');
	dashboard.id = 'sww-dashboard';
	dashboard.style.cssText = `
		position: fixed; bottom: 30px; right: 30px;
		background: #171a21; color: #c6d4df;
		padding: 20px; border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0,0,0,0.9);
		font-family: Arial, sans-serif; z-index: 999999;
		border: 1px solid #2a475e; min-width: 340px;
	`;
	document.body.append(dashboard);
	return dashboard;
}

function updateUi(
	dashboard: HTMLDivElement,
	done: number,
	total: number,
	totalRealTargets: number,
	realTargetsDone: number,
	totalActiveDuration: number,
	currentId: string | undefined,
	extraWaitSecs = 0,
	statusMessage = '',
): void {
	const percent = ((done / total) * 100).toFixed(1);
	const remainingRealItems = totalRealTargets - realTargetsDone;
	const avgTimePerItem =
		realTargetsDone > 0 ? totalActiveDuration / realTargetsDone : MIN_DELAY_MS / 1000;

	const etaSeconds = (remainingRealItems * avgTimePerItem) + extraWaitSecs;
	const etaString = done < total ? formatTime(etaSeconds) : 'Completed';

	dashboard.innerHTML = `
		<h3 style="margin: 0 0 15px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
		${statusMessage}
		<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
			<span><strong>Progress:</strong></span>
			<span>${done} / ${total} (${percent}%)</span>
		</div>
		<div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
			<span><strong>ETA:</strong></span>
			<span style="color: #e5a822;">~ ${etaString}</span>
		</div>
		<div style="width: 100%; background: #000; height: 12px; border-radius: 6px; overflow: hidden; border: 1px solid #333;">
			<div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #1a9bdc, #66c0f4); transition: width 0.3s ease-out;"></div>
		</div>
		<div style="font-size: 11px; color: #8f98a0; margin-top: 15px; display: flex; justify-content: space-between;">
			<span>Speed: ${realTargetsDone > 0 ? (1 / avgTimePerItem).toFixed(2) : '---'} it/s</span>
			<span>ID: ${currentId ?? '---'}</span>
		</div>
	`;
}

// eslint-disable-next-line complexity
async function removeTrashLicenses(trashPackageIds: string[]): Promise<void> {
	const trashSet = new Set(trashPackageIds);
	const linkMap = buildLinkMap();
	const targets = [...trashSet];
	const totalTargets = targets.length;

	if (totalTargets === 0) {
		// eslint-disable-next-line no-alert
		alert('Your trash list is empty!');
		return;
	}

	const totalRealTargets = targets.filter(id => linkMap.has(id)).length;
	let realTargetsDone = 0;
	let totalActiveDuration = 0;

	const dashboard = createDashboard();
	updateUi(dashboard, 0, totalTargets, totalRealTargets, realTargetsDone, totalActiveDuration, undefined);

	let processedCount = 0;

	for (const currentPackageId of targets) {
		processedCount++;

		if (!linkMap.has(currentPackageId)) {
			updateUi(
				dashboard,
				processedCount,
				totalTargets,
				totalRealTargets,
				realTargetsDone,
				totalActiveDuration,
				currentPackageId,
				0,
				`<div style="background: rgba(102, 192, 244, 0.1); border: 1px solid #2a475e; padding: 6px; border-radius: 4px; color: #8f98a0; margin-bottom: 15px; text-align: center; font-size: 13px;">
					ℹ️ ID ${currentPackageId} not on page &rarr; Skipped
				</div>`,
			);
			continue;
		}

		const link = linkMap.get(currentPackageId)!;

		// Skip DLC, soundtracks and other protected licenses
		const row = link.closest('tr');
		if (row && isProtectedLicense(row.textContent ?? '')) {
			updateUi(
				dashboard,
				processedCount,
				totalTargets,
				totalRealTargets,
				realTargetsDone,
				totalActiveDuration,
				currentPackageId,
				0,
				`<div style="background: rgba(164, 208, 7, 0.1); border: 1px solid #a4d007; padding: 6px; border-radius: 4px; color: #a4d007; margin-bottom: 15px; text-align: center; font-size: 13px;">
					🛡️ ID ${currentPackageId} looks protected (DLC/Soundtrack) &rarr; Skipped
				</div>`,
			);
			continue;
		}

		const sessionId = getSteamSessionId();
		if (sessionId === undefined) {
			dashboard.innerHTML = `
				<h3 style="margin: 0 0 15px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
				<div style="background: rgba(229, 64, 34, 0.2); border: 1px solid #e54022; padding: 10px; border-radius: 4px; color: #e54022; text-align: center; font-weight: bold;">
					❌ Could not find Steam session ID.<br>Please reload the page and try again.
				</div>
			`;
			return;
		}

		const formData = new URLSearchParams();
		formData.append('sessionid', sessionId);
		formData.append('packageid', currentPackageId);

		let isDone = false;

		while (!isDone) {
			try {
				const startTimestamp = performance.now();

				// eslint-disable-next-line no-await-in-loop
				const response = await fetch('https://store.steampowered.com/account/removelicense', {
					method: 'POST',
					body: formData,
				});

				if (response.ok) {
					let data: {success: number} | undefined;
					try {
						// eslint-disable-next-line no-await-in-loop
						data = await response.json() as {success: number};
					} catch (error) {
						console.error('Could not parse response as JSON.', error);
						data = {success: 0};
					}

					if (data?.success === 1) {
						// EResult 1 = OK
						isDone = true;
						if (row) {
							row.style.display = 'none';
						}

						const elapsedMs = performance.now() - startTimestamp;
						const timeToWait = Math.max(0, MIN_DELAY_MS - elapsedMs);

						if (processedCount < totalTargets && timeToWait > 0) {
							// eslint-disable-next-line no-await-in-loop
							await sleep(timeToWait);
						}

						totalActiveDuration += (elapsedMs + timeToWait) / 1000;
						realTargetsDone++;
						updateUi(dashboard, processedCount, totalTargets, totalRealTargets, realTargetsDone, totalActiveDuration, currentPackageId);
					} else if (data?.success === 84) {
						// EResult 84 = Rate Limit Exceeded
						console.warn(`🛑 Rate limit exceeded (EResult 84) for ID ${currentPackageId}! Pausing for 1 hour.`);
						void chrome.runtime.sendMessage({type: 'NOTIFY_BAN'});

						for (let i = RATE_LIMIT_COOLDOWN_SECONDS; i > 0; i--) {
							updateUi(
								dashboard,
								processedCount - 1,
								totalTargets,
								totalRealTargets,
								realTargetsDone,
								totalActiveDuration,
								currentPackageId,
								i,
								`<div style="background: rgba(229, 64, 34, 0.2); border: 1px solid #e54022; padding: 10px; border-radius: 4px; color: #e54022; margin-bottom: 15px; text-align: center; font-weight: bold; font-size: 13px;">
									🛑 Rate limit exceeded (Code 84)!<br>Pausing for 1 hour...<br>Waiting ${i} more seconds.
								</div>`,
							);
							// eslint-disable-next-line no-await-in-loop
							await sleep(1000);
						}

						updateUi(dashboard, processedCount - 1, totalTargets, totalRealTargets, realTargetsDone, totalActiveDuration, currentPackageId);
					} else {
						// Some other Steam error code
						console.error(`❌ Steam backend error for ID ${currentPackageId} (Code: ${data?.success})`);
						isDone = true;
					}
				} else if (response.status === 429) {
					// Classic edge rate limit
					const retryAfterHeader = response.headers.get('Retry-After');
					let waitTime = Number(retryAfterHeader ?? '');
					if (!Number.isFinite(waitTime) || waitTime <= 0) {
						waitTime = DEFAULT_RETRY_AFTER_SECONDS;
					}

					for (let i = waitTime; i > 0; i--) {
						updateUi(
							dashboard,
							processedCount - 1,
							totalTargets,
							totalRealTargets,
							realTargetsDone,
							totalActiveDuration,
							currentPackageId,
							i,
							`<div style="background: rgba(229, 168, 34, 0.2); border: 1px solid #e5a822; padding: 10px; border-radius: 4px; color: #e5a822; margin-bottom: 15px; text-align: center; font-weight: bold;">
								⚠️ Network limit (429)!<br>Waiting ${i} seconds...
							</div>`,
						);
						// eslint-disable-next-line no-await-in-loop
						await sleep(1000);
					}

					updateUi(dashboard, processedCount - 1, totalTargets, totalRealTargets, realTargetsDone, totalActiveDuration, currentPackageId);
				} else {
					console.error(`❌ HTTP error for ID ${currentPackageId} (Status: ${response.status})`);
					isDone = true;
				}
			} catch (error) {
				console.error(`❌ Network error for ID ${currentPackageId}:`, error);
				// eslint-disable-next-line no-await-in-loop
				await sleep(5000);
			}
		}
	}

	dashboard.innerHTML = `
		<h3 style="margin: 0 0 15px 0; color: #66c0f4; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">🧹 Steam Auto-Cleanup</h3>
		<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #2a475e; color: #a4d007; font-weight: bold; text-align: center; font-size: 16px;">
			✅ Process complete! <br><br>
			<span style="font-size: 13px; color: #c6d4df; font-weight: normal;">
				Processed ${totalTargets} ID(s) in total.<br>Reload the page (F5).
			</span>
		</div>
	`;
}

// Listen for messages from the popup to start the cleanup
chrome.runtime.onMessage.addListener((request: {type: string; ids?: string[]}) => {
	if (request.type === 'START_CLEANUP' && Array.isArray(request.ids)) {
		void removeTrashLicenses(request.ids);
	}
});
