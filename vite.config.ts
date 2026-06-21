import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {crx} from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
	plugins: [
		react(),
		crx({manifest, liveReload: false}),
	],
	server: {
		port: 5173,
		strictPort: true,
		// Disabling HMR prevents crxjs from injecting its WebSocket/port client
		// scripts into the extension, eliminating console errors about disconnected
		// ports and undefined __LIVE_RELOAD__ when the dev server is not running.
		hmr: false,
	},
});
