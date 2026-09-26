import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { vditorPatch } from './scripts/vditor-patch.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({ base: './', define: { __APP_VERSION__: JSON.stringify(version) }, plugins: [vditorPatch()], build: { rollupOptions: { input: ['index.html'] } } });
