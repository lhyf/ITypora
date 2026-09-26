import { defineConfig } from 'vite';
import { vditorPatch } from './scripts/vditor-patch.mjs';

export default defineConfig({ base: './', plugins: [vditorPatch()], build: { rollupOptions: { input: ['index.html'] } } });
