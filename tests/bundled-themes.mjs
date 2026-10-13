import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const manifest = await fs.readFile('resources/themes/manifest.json', 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
if (!manifest?.themes.length) {
  console.log('SKIP: generate a local bundle with npm run themes:bundle before this test');
  process.exit(0);
}
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-bundled-themes-'));
const documentPath = path.join(temporary, '主题验证.md');
const original = '# 主题验证\n\n中文正文与 **粗体**、[链接](https://example.com)。\n\n- [x] 已完成任务\n- [ ] 待办任务\n\n> 引用正文\n\n```java\npublic class Example {}\n```\n\n| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |\n';
await fs.writeFile(documentPath, original);
await fs.mkdir('test-results', { recursive: true });
const options = process.argv[2]
  ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${temporary}`] }
  : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary } };
let app;
const errors = [], network = [];
const launch = async () => {
  app = await electron.launch(options);
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  return page;
};
const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
  const window = BrowserWindow.getAllWindows()[0];
  window.webContents.ipc.once('action-complete', () => resolve());
  const item = Menu.getApplicationMenu().getMenuItemById(command);
  if (!item) throw new Error(`Missing menu: ${command}`);
  item.click(item, window);
}), id);
try {
  let page = await launch();
  const ids = await page.evaluate(async () => {
    const snapshot = await window.desktop.preferencesCommand('get');
    if (snapshot.themeErrors.length) throw new Error(snapshot.themeErrors.join('\n'));
    return snapshot.themes.map(theme => theme.id);
  });
  expect(ids.length).toBe(manifest.themes.length + 3);
  for (const theme of manifest.themes) expect(ids).toContain(theme.id);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, documentPath);
  await menu('open');
  for (const theme of manifest.themes) {
    for (const mode of ['ir', 'wysiwyg']) {
      await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
      await menu(`theme:${theme.id}`);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('itypora-theme'))).toBe(theme.id);
      await expect(page.locator('#write h1')).toContainText('主题验证');
      await expect(page.locator('#write table')).toHaveCount(1);
      await expect(page.locator('#write input[type="checkbox"]')).toHaveCount(2);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => [...document.fonts].filter(font => font.status === 'error').map(font => font.family))).toEqual([]);
      if (mode === 'ir') await page.screenshot({ path: `test-results/bundled-${theme.fileName.slice(0, -4)}.png` });
      await menu('source');
      await sourceEditor(page).toHaveValue(original);
      await expect(page.locator('#dirty-dot')).toBeHidden();
      await menu('source');
    }
    await menu('save');
    expect(await fs.readFile(documentPath, 'utf8')).toBe(original);
    console.log(`PASS: ${theme.fileName} switches in IR, WYSIWYG and source mode, loads fonts offline and preserves the document`);
  }
  await menu('appearance');
  const names = await page.locator('#current-theme option').allTextContents();
  for (const theme of manifest.themes) expect(names).toContain(theme.fileName.slice(0, -4));
  await expect(page.locator('#theme-errors')).toBeHidden();
  await page.screenshot({ path: 'test-results/bundled-theme-options.png' });
  await page.locator('#close').click();
  const selected = manifest.themes.find(theme => theme.fileName === 'matcha-dark.css') || manifest.themes[0];
  await menu(`theme:${selected.id}`);
  await app.close(); app = null;
  page = await launch();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('itypora-theme'))).toBe(selected.id);
  const restarted = await page.evaluate(async () => {
    const snapshot = await window.desktop.preferencesCommand('get');
    return { ids: snapshot.themes.map(theme => theme.id), errors: snapshot.themeErrors };
  });
  expect(restarted.ids.sort()).toEqual(ids.sort());
  expect(restarted.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  console.log(`PASS: all ${manifest.themes.length} bundled themes appear in preferences and keep stable IDs/selection after restart; no network requests or renderer errors`);
} finally {
  if (app) await app.close();
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe test cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
}
