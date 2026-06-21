import {useState} from 'react';
import {
	parsePackageIds,
} from './utils.js';
import type {GetPageIdsResponse, StartRemovalMessage} from './types.js';

const TRASH_STORAGE_KEY = 'trashPackageIds';
const PROTECTED_IDS_STORAGE_KEY = 'protectedPackageIds';
const PROTECTED_PATTERNS_STORAGE_KEY = 'protectedTitlePatterns';
const DRY_RUN_STORAGE_KEY = 'dryRunMode';
const PYTHON_PEARLS_STORAGE_KEY = 'pythonImportedPearls';

function App() {
	const [inputIds, setInputIds] = useState('');
	const [protectedIdsInput, setProtectedIdsInput] = useState('');
	const [protectedPatternsInput, setProtectedPatternsInput] = useState('');
	const [isDryRun, setIsDryRun] = useState(true);
	const [status, setStatus] = useState('');
	const [rawJsonImport, setRawJsonImport] = useState('');

	const handleSave = () => {
		const ids = parsePackageIds(inputIds);

		chrome.storage.local.set({
			[TRASH_STORAGE_KEY]: ids,
			[PROTECTED_IDS_STORAGE_KEY]: protectedIdsInput,
			[PROTECTED_PATTERNS_STORAGE_KEY]: protectedPatternsInput,
			[DRY_RUN_STORAGE_KEY]: isDryRun,
		}, () => {
			setStatus(`Saved ${ids.length} package ID(s).`);
		});
	};

	const handleLoad = () => {
		chrome.storage.local.get(
			[
				TRASH_STORAGE_KEY,
				PROTECTED_IDS_STORAGE_KEY,
				PROTECTED_PATTERNS_STORAGE_KEY,
				DRY_RUN_STORAGE_KEY,
			],
			result => {
				const ids = (result[TRASH_STORAGE_KEY] as string[] | undefined) ?? [];
				const savedProtectedIds = (result[PROTECTED_IDS_STORAGE_KEY] as string | undefined) ?? '';
				const savedProtectedPatterns = (result[PROTECTED_PATTERNS_STORAGE_KEY] as string | undefined) ?? '';
				const isDryRunSetting = (result[DRY_RUN_STORAGE_KEY] as boolean | undefined) ?? true;

				setInputIds(ids.join('\n'));
				setProtectedIdsInput(savedProtectedIds);
				setProtectedPatternsInput(savedProtectedPatterns);
				setIsDryRun(isDryRunSetting);
				setStatus(`Loaded ${ids.length} package ID(s).`);
			},
		);
	};

	const handleClear = () => {
		chrome.storage.local.remove(TRASH_STORAGE_KEY, () => {
			setInputIds('');
			setStatus('Cleared saved package IDs.');
		});
	};

	const handleStart = () => {
		const ids = parsePackageIds(inputIds);

		if (ids.length === 0) {
			setStatus('Please enter at least one package ID.');
			return;
		}

		const protectedIds = parsePackageIds(protectedIdsInput);
		const protectedPatternsRaw = protectedPatternsInput
			.split(/\r?\n/v)
			.map(line => line.trim())
			.map(line => line.replace(/,$/v, '').replaceAll(/^["']|["']$/gv, ''))
			.filter(line => line.length > 0);

		chrome.storage.local.set({
			[TRASH_STORAGE_KEY]: ids,
			[PROTECTED_IDS_STORAGE_KEY]: protectedIdsInput,
			[PROTECTED_PATTERNS_STORAGE_KEY]: protectedPatternsInput,
			[DRY_RUN_STORAGE_KEY]: isDryRun,
		}, () => {
			chrome.tabs.query({url: '*://store.steampowered.com/account/licenses/'}, tabs => {
				if (tabs.length > 0 && tabs[0]?.id !== undefined && tabs[0].id !== null) {
					const message: StartRemovalMessage = {
						type: 'START_REMOVAL',
						ids,
						protectedIds,
						protectedPatternsRaw,
						dryRun: isDryRun,
					};
					chrome.tabs.sendMessage(tabs[0].id, message).then(() => {
						setStatus(`Started ${isDryRun ? 'dry run' : 'cleanup'} for ${ids.length} ID(s). Check the Steam licenses page.`);
						window.close();
					}).catch(() => {
						setStatus('Error: Could not reach the Steam tab. Please reload the Steam licenses page (F5) and try again.');
					});
				} else {
					void chrome.tabs.create({url: 'https://store.steampowered.com/account/licenses/'});
					setStatus('Opened Steam licenses page. Re-open the extension to start.');
				}
			});
		});
	};

	const handleCopyPageIds = () => {
		chrome.tabs.query({url: '*://store.steampowered.com/account/licenses/'}, tabs => {
			if (tabs.length > 0 && tabs[0]?.id !== undefined && tabs[0].id !== null) {
				chrome.tabs.sendMessage(tabs[0].id, {type: 'GET_PAGE_IDS'}).then((response: GetPageIdsResponse) => {
					const idList = response.ids.join('\n');
					setInputIds(idList);
					setStatus(`Loaded ${response.ids.length} ID(s) from the Steam licenses page.`);
				}).catch(() => {
					setStatus('Error: Could not reach the Steam tab. Please reload the Steam licenses page (F5) and try again.');
				});
			} else {
				void chrome.tabs.create({url: 'https://store.steampowered.com/account/licenses/'});
				setStatus('Opened Steam licenses page. Re-open the extension to load IDs.');
			}
		});
	};

	const handlePythonImport = () => {
		if (rawJsonImport.trim().length === 0) {
			setStatus('Please paste your JSON content first.');
			return;
		}

		let data: Record<string, {status: string}>;
		try {
			data = JSON.parse(rawJsonImport) as Record<string, {status: string}>;
		} catch (error) {
			setStatus(`JSON parsing failed: ${(error as Error).message}`);
			return;
		}

		const trashIds: string[] = [];
		const pearlIds: string[] = [];

		for (const [pid, info] of Object.entries(data)) {
			if (info.status.includes('TRASH')) {
				trashIds.push(pid);
			} else if (
				info.status.includes('PEARL')
				|| info.status.includes('KEEP')
				|| info.status.includes('HAM')
			) {
				pearlIds.push(pid);
			}
		}

		setInputIds(trashIds.join('\n'));

		chrome.storage.local.set({
			[TRASH_STORAGE_KEY]: trashIds,
			[PYTHON_PEARLS_STORAGE_KEY]: pearlIds,
		}, () => {
			setStatus(`Python import done: ${trashIds.length} trash IDs loaded, ${pearlIds.length} pearls permanently protected.`);
			setRawJsonImport('');
		});
	};

	return (
		<div style={{
			width: 360, padding: 16, fontFamily: 'Arial, sans-serif', background: '#171a21', color: '#c6d4df', minHeight: 300,
		}}>
			<h2 style={{
				margin: '0 0 12px 0', color: '#66c0f4', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1,
			}}>
				🧹 Steam Weed Wacker
			</h2>

			<div style={{marginBottom: 15, borderBottom: '1px solid #2a475e', paddingBottom: 15}}>
				<label style={{
					display: 'block', fontSize: 12, color: '#66c0f4', marginBottom: 5, fontWeight: 'bold',
				}}>
					🐍 Python Progress Import (trash_check_progress.json)
				</label>
				<textarea
					placeholder='Paste the full content of your JSON file here...'
					value={rawJsonImport}
					onChange={event => {
						setRawJsonImport(event.target.value);
					}}
					rows={3}
					style={{
						width: '100%',
						boxSizing: 'border-box',
						background: '#141f2c',
						border: '1px solid #2a475e',
						color: '#c6d4df',
						borderRadius: 4,
						padding: 6,
						fontSize: 11,
						fontFamily: 'monospace',
						resize: 'vertical',
					}}
				/>
				<button onClick={handlePythonImport} style={{...btnStyle('#a4d007'), marginTop: 5, width: '100%'}}>
					📥 Import data from Python script
				</button>
			</div>

			<p style={{fontSize: 12, color: '#8f98a0', margin: '0 0 10px 0'}}>
				Paste your trash package IDs below (one per line or comma-separated).
				You can get these from{' '}
				<a
					href='https://steamdb.info/freepackages/'
					target='_blank'
					rel='noreferrer'
					style={{color: '#66c0f4'}}
				>
					SteamDB Free Packages
				</a>
				.
			</p>

			<textarea
				value={inputIds}
				onChange={event => {
					setInputIds(event.target.value);
				}}
				placeholder='12345&#10;67890&#10;...'
				rows={8}
				style={{
					width: '100%',
					boxSizing: 'border-box',
					background: '#1b2838',
					border: '1px solid #2a475e',
					color: '#c6d4df',
					borderRadius: 4,
					padding: 8,
					fontSize: 13,
					resize: 'vertical',
					fontFamily: 'monospace',
				}}
			/>

			<label
				htmlFor='protected-ids'
				style={{
					display: 'block', fontSize: 12, marginTop: 10, marginBottom: 4, color: '#8f98a0',
				}}
			>
				Protected IDs (never touch)
			</label>
			<textarea
				id='protected-ids'
				value={protectedIdsInput}
				onChange={event => {
					setProtectedIdsInput(event.target.value);
				}}
				placeholder='730&#10;570'
				rows={3}
				style={{
					width: '100%',
					boxSizing: 'border-box',
					background: '#1b2838',
					border: '1px solid #2a475e',
					color: '#c6d4df',
					borderRadius: 4,
					padding: 8,
					fontSize: 13,
					resize: 'vertical',
					fontFamily: 'monospace',
				}}
			/>

			<label
				htmlFor='protected-patterns'
				style={{
					display: 'block', fontSize: 12, marginTop: 10, marginBottom: 4, color: '#8f98a0',
				}}
			>
				Protected title patterns (one per line, plain text or /regex/)
			</label>
			<textarea
				id='protected-patterns'
				value={protectedPatternsInput}
				onChange={event => {
					setProtectedPatternsInput(event.target.value);
				}}
				placeholder={'Half Life\n/^World of/iu'}
				rows={4}
				style={{
					width: '100%',
					boxSizing: 'border-box',
					background: '#1b2838',
					border: '1px solid #2a475e',
					color: '#c6d4df',
					borderRadius: 4,
					padding: 8,
					fontSize: 13,
					resize: 'vertical',
					fontFamily: 'monospace',
				}}
			/>

			<label
				htmlFor='dry-run'
				style={{
					display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 10, color: '#c6d4df',
				}}
			>
				<input
					id='dry-run'
					type='checkbox'
					checked={isDryRun}
					onChange={event => {
						setIsDryRun(event.target.checked);
					}}
				/>
				Dry Run (no deletions)
			</label>

			<div style={{
				display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap',
			}}>
				<button onClick={handleStart} style={btnStyle('#1a9bdc')}>
					▶ {isDryRun ? 'Start Dry Run' : 'Start Cleanup'}
				</button>
				<button onClick={handleCopyPageIds} style={btnStyle('#2a475e')}>
					📋 Copy All Page IDs
				</button>
				<button onClick={handleSave} style={btnStyle('#2a475e')}>
					💾 Save IDs
				</button>
				<button onClick={handleLoad} style={btnStyle('#2a475e')}>
					📂 Load IDs
				</button>
				<button onClick={handleClear} style={btnStyle('#6b3535')}>
					🗑 Clear
				</button>
			</div>

			{status.length > 0 && (
				<p style={{
					fontSize: 12, color: '#a4d007', marginTop: 10, borderTop: '1px solid #2a475e', paddingTop: 8,
				}}>
					{status}
				</p>
			)}
		</div>
	);
}

function btnStyle(bg: string): React.CSSProperties {
	return {
		flex: 1,
		minWidth: 80,
		background: bg,
		color: '#fff',
		border: 'none',
		borderRadius: 4,
		padding: '7px 10px',
		cursor: 'pointer',
		fontSize: 12,
		fontWeight: 'bold',
	};
}

export default App;
