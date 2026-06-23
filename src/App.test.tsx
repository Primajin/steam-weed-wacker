import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
} from 'vitest';
import {
	render,
	screen,
	fireEvent,
	waitFor,
	cleanup,
} from '@testing-library/react';
import App from './App.js';

// Prevent window.close() from destroying the jsdom document between tests.
vi.spyOn(globalThis, 'close').mockImplementation(() => undefined);

// Helper: make chrome.storage.local.set call its callback immediately.
function mockStorageSet() {
	(chrome.storage.local.set as ReturnType<typeof vi.fn>).mockImplementation((_data: unknown, callback?: () => void) => {
		callback?.();
	});
}

// Helper: make chrome.storage.local.remove call its callback immediately.
function mockStorageRemove() {
	(chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockImplementation((_key: unknown, callback?: () => void) => {
		callback?.();
	});
}

// Helper: make chrome.storage.local.get call its callback with provided data.
function mockStorageGet(data: Record<string, unknown>) {
	(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation((_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
		callback(data);
	});
}

// Helper: make chrome.tabs.query return provided tabs.
function mockTabsQuery(tabs: Array<{id?: number}>) {
	(chrome.tabs.query as ReturnType<typeof vi.fn>).mockImplementation((_query: unknown, callback: (tabs: Array<{id?: number}>) => void) => {
		callback(tabs);
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(globalThis, 'close').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
});

describe('App rendering', () => {
	it('renders the main heading', () => {
		render(<App />);
		expect(screen.getByRole('heading', {level: 2})).toBeInTheDocument();
	});

	it('renders the dry run checkbox checked by default', () => {
		render(<App />);
		expect(screen.getByRole('checkbox')).toBeChecked();
	});

	it('shows the Start Dry Run button when dry run is enabled', () => {
		render(<App />);
		expect(screen.getByRole('button', {name: /start dry run/iv})).toBeInTheDocument();
	});

	it('shows the Start Cleanup button when dry run is disabled', () => {
		render(<App />);
		fireEvent.click(screen.getByRole('checkbox'));
		expect(screen.getByRole('button', {name: /start cleanup/iv})).toBeInTheDocument();
	});
});

describe('App: Save IDs button', () => {
	it('saves parsed IDs and shows a status message', async () => {
		mockStorageSet();
		render(<App />);

		fireEvent.change(screen.getByPlaceholderText(/12345/v), {target: {value: '730\n570'}});
		fireEvent.click(screen.getByRole('button', {name: /save ids/iv}));

		await waitFor(() => {
			expect(screen.getByText(/saved 2 package id\(s\)/iv)).toBeInTheDocument();
		});
		expect(chrome.storage.local.set).toHaveBeenCalled();
	});
});

describe('App: Load IDs button', () => {
	it('loads saved IDs and populates the textarea', async () => {
		mockStorageGet({
			trashPackageIds: ['12345', '67890'],
			protectedPackageIds: '',
			protectedTitlePatterns: '',
			dryRunMode: false,
		});
		render(<App />);

		fireEvent.click(screen.getByRole('button', {name: /load ids/iv}));

		await waitFor(() => {
			expect(screen.getByText(/loaded 2 package id\(s\)/iv)).toBeInTheDocument();
		});
		expect(screen.getByPlaceholderText(/12345/v)).toHaveValue('12345\n67890');
	});

	it('loads an empty list when no IDs have been saved', async () => {
		mockStorageGet({});
		render(<App />);
		fireEvent.click(screen.getByRole('button', {name: /load ids/iv}));
		await waitFor(() => {
			expect(screen.getByText(/loaded 0 package id\(s\)/iv)).toBeInTheDocument();
		});
	});
});

describe('App: Clear button', () => {
	it('clears the textarea and shows a status message', async () => {
		mockStorageRemove();
		render(<App />);

		fireEvent.change(screen.getByPlaceholderText(/12345/v), {target: {value: '730'}});
		fireEvent.click(screen.getByRole('button', {name: /clear/iv}));

		await waitFor(() => {
			expect(screen.getByText(/cleared saved package ids/iv)).toBeInTheDocument();
		});
		expect(screen.getByPlaceholderText(/12345/v)).toHaveValue('');
	});
});

describe('App: Start button', () => {
	it('shows an error when the trash list is empty', async () => {
		render(<App />);
		fireEvent.click(screen.getByRole('button', {name: /start dry run/iv}));
		await waitFor(() => {
			expect(screen.getByText(/please enter at least one package id/iv)).toBeInTheDocument();
		});
	});

	it('opens the Steam licenses tab when no matching tab is open', async () => {
		mockStorageSet();
		mockTabsQuery([]);
		(chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
		render(<App />);

		fireEvent.change(screen.getByPlaceholderText(/12345/v), {target: {value: '730'}});
		fireEvent.click(screen.getByRole('button', {name: /start dry run/iv}));

		await waitFor(() => {
			expect(screen.getByText(/opened steam licenses page/iv)).toBeInTheDocument();
		});
		expect(chrome.tabs.create).toHaveBeenCalledWith(expect.objectContaining({url: 'https://store.steampowered.com/account/licenses/'}));
	});

	it('sends a START_REMOVAL message when a matching tab is open', async () => {
		mockStorageSet();
		mockTabsQuery([{id: 42}]);
		(chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		render(<App />);

		fireEvent.change(screen.getByPlaceholderText(/12345/v), {target: {value: '730'}});
		fireEvent.click(screen.getByRole('button', {name: /start dry run/iv}));

		await waitFor(() => {
			expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
				42,
				expect.objectContaining({type: 'START_REMOVAL', ids: ['730']}),
			);
		});
	});

	it('shows an error when sending to the Steam tab fails', async () => {
		mockStorageSet();
		mockTabsQuery([{id: 42}]);
		(chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('tab gone'));
		render(<App />);

		fireEvent.change(screen.getByPlaceholderText(/12345/v), {target: {value: '730'}});
		fireEvent.click(screen.getByRole('button', {name: /start dry run/iv}));

		await waitFor(() => {
			expect(screen.getByText(/could not reach the steam tab/iv)).toBeInTheDocument();
		});
	});
});

describe('App: Copy All Page IDs button', () => {
	it('populates the textarea with IDs from the Steam tab', async () => {
		mockTabsQuery([{id: 10}]);
		(chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ids: ['111', '222']});
		render(<App />);

		fireEvent.click(screen.getByRole('button', {name: /copy all page ids/iv}));

		await waitFor(() => {
			expect(screen.getByText(/loaded 2 id\(s\) from the steam licenses page/iv)).toBeInTheDocument();
		});
		expect(screen.getByPlaceholderText(/12345/v)).toHaveValue('111\n222');
	});

	it('opens the Steam licenses tab when no matching tab is open', async () => {
		mockTabsQuery([]);
		(chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
		render(<App />);

		fireEvent.click(screen.getByRole('button', {name: /copy all page ids/iv}));

		await waitFor(() => {
			expect(screen.getByText(/opened steam licenses page.*load ids/iv)).toBeInTheDocument();
		});
	});

	it('shows an error when the Steam tab is unreachable', async () => {
		mockTabsQuery([{id: 10}]);
		(chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('gone'));
		render(<App />);

		fireEvent.click(screen.getByRole('button', {name: /copy all page ids/iv}));

		await waitFor(() => {
			expect(screen.getByText(/could not reach the steam tab/iv)).toBeInTheDocument();
		});
	});
});

describe('App: Python import', () => {
	it('shows an error when the JSON textarea is empty', async () => {
		render(<App />);
		fireEvent.click(screen.getByRole('button', {name: /import data from python script/iv}));
		await waitFor(() => {
			expect(screen.getByText(/please paste your json content first/iv)).toBeInTheDocument();
		});
	});

	it('shows an error for invalid JSON', async () => {
		render(<App />);
		fireEvent.change(screen.getByPlaceholderText(/paste the full content/iv), {target: {value: 'not valid json'}});
		fireEvent.click(screen.getByRole('button', {name: /import data from python script/iv}));
		await waitFor(() => {
			expect(screen.getByText(/json parsing failed/iv)).toBeInTheDocument();
		});
	});

	it('classifies TRASH items as trash IDs and PEARL/KEEP/HAM items as pearls', async () => {
		mockStorageSet();
		render(<App />);

		const validJson = JSON.stringify({
			11: {status: 'TRASH'},
			22: {status: 'PEARL'},
			33: {status: 'KEEP'},
			44: {status: 'HAM'},
			55: {status: 'TRASH'},
		});
		fireEvent.change(screen.getByPlaceholderText(/paste the full content/iv), {target: {value: validJson}});
		fireEvent.click(screen.getByRole('button', {name: /import data from python script/iv}));

		await waitFor(() => {
			expect(screen.getByText(/python import done: 2 trash ids loaded, 3 pearls/iv)).toBeInTheDocument();
		});

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const storageCallArg = expect.objectContaining({
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			trashPackageIds: expect.arrayContaining(['11', '55']),
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			pythonImportedPearls: expect.arrayContaining(['22', '33', '44']),
		});
		expect(chrome.storage.local.set).toHaveBeenCalledWith(storageCallArg, expect.any(Function));
	});
});

describe('auto-load on mount', () => {
	it('loads saved IDs from storage when the popup opens', async () => {
		const getMock = vi.mocked(chrome.storage.local.get);
		getMock.mockImplementation(((_keys: unknown, cb: (r: Record<string, unknown>) => void) => {
			cb({
				trashPackageIds: ['11111', '22222'],
				protectedPackageIds: '730',
				protectedTitlePatterns: 'Half-Life',
				dryRunMode: false,
			});
		}));

		render(<App />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText(/12345/v)).toHaveValue('11111\n22222');
		});
		expect(screen.getByPlaceholderText('730 570')).toHaveValue('730');
	});
});

describe('button disabled state', () => {
	it('start button is disabled while a tab message is in-flight', async () => {
		const tabsQueryMock = vi.mocked(chrome.tabs.query);
		// Never resolves so we can inspect the disabled state
		// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/promise-function-async, @typescript-eslint/strict-void-return -- never-resolving mock
		tabsQueryMock.mockImplementation(() => new Promise<chrome.tabs.Tab[]>(() => {}));

		const getMock = vi.mocked(chrome.storage.local.get);
		getMock.mockImplementation(((_keys: unknown, cb: (r: Record<string, unknown>) => void) => {
			cb({trashPackageIds: ['12345'], dryRunMode: true});
		}));

		const setMock = vi.mocked(chrome.storage.local.set);
		setMock.mockImplementation(((_data: unknown, cb?: () => void) => {
			cb?.();
		}));

		render(<App />);
		await waitFor(() => {
			expect(screen.getByPlaceholderText(/12345/v)).toHaveValue('12345');
		});

		const startBtn = screen.getByRole('button', {name: /start dry run/iv});
		fireEvent.click(startBtn);

		expect(startBtn).toBeDisabled();
	});
});
