import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-preferences-'));
let app;
const errors = [];
async function launch() { app = await electron.launch({ args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary } }); const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message)); await expect(page.locator('#write')).toBeVisible(); return page; }
async function preferences(page) { await page.evaluate(() => window.desktop.openPreferences('appearance')); const prefs = page; await expect(prefs.locator('#current-theme')).toBeVisible(); return prefs; }
const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
  const window = BrowserWindow.getAllWindows()[0];
  window.webContents.ipc.once('action-complete', () => resolve());
  const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
}), id);
const widthRatio = (page, selector) => page.locator(selector).evaluate(el => el.getBoundingClientRect().width / el.closest('.editor-surface').clientWidth);
try {
  let page = await launch(); let prefs = await preferences(page);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await expect(page.locator('.workspace')).toBeHidden();
  await expect(page.locator('#preferences')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const closeBounds = await page.locator('#close').boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(closeBounds.x).toBeGreaterThan(viewport.width - 100);
  expect(closeBounds.y).toBeLessThan(64);
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light'; });
  await prefs.locator('#current-theme').selectOption('sepia');
  await expect(prefs.locator('[data-setting="separateDark"], #dark-theme, #light-theme')).toHaveCount(0);
  const themeFiles = (await fs.readdir(path.join(temporary, 'themes'))).filter(name => name.endsWith('.css'));
  expect((await prefs.locator('#current-theme option').allTextContents()).sort()).toEqual(themeFiles.map(name => name.slice(0, -4)).sort());
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(page.locator('#preferences')).toHaveCSS('background-color', 'rgb(248, 243, 231)');
  await expect(page.locator('#search')).toHaveCSS('background-color', 'rgb(248, 243, 231)');
  await page.screenshot({ path: 'test-results/preferences-inline-sepia.png' });
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark'; });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(prefs.locator('#current-theme')).toHaveValue('sepia');
  await expect(page.locator('#preferences')).toHaveCSS('background-color', 'rgb(248, 243, 231)');
  await prefs.locator('#current-theme').selectOption({ value: 'night' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('#preferences')).toHaveCSS('background-color', 'rgb(37, 43, 41)');
  await expect(page.locator('#preferences')).toHaveCSS('color', 'rgb(200, 208, 200)');
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light'; });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(prefs.locator('#current-theme')).toHaveValue('night');
  await menu('theme:sepia');
  await expect(prefs.locator('#current-theme')).toHaveValue('sepia');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await prefs.locator('#close').click();
  await expect(page.locator('#write')).toBeVisible();
  await page.locator('#write').click(); await page.keyboard.insertText('偏好设置切换期间的未保存正文');
  prefs = await preferences(page);
  await prefs.locator('[data-section="editor"]').click();
  const width = prefs.locator('#setting-width'), customWidth = prefs.locator('#setting-custom-width');
  await expect(width).toHaveValue('0');
  await expect(customWidth).toBeHidden();
  await width.selectOption('760');
  await expect(page.locator('#write')).toHaveCSS('max-width', '760px');
  await width.selectOption('0');
  await expect.poll(() => page.locator('#write').evaluate(el => el.style.maxWidth)).toBe('');
  await expect(page.locator('#source-editor')).not.toHaveClass(/itypora-width/);
  await width.selectOption('custom');
  await expect(customWidth).toBeVisible();
  await expect(customWidth).toBeFocused();
  await expect(page.locator('#write')).toHaveCSS('max-width', '960px');
  for (const invalid of ['', '499']) {
    await customWidth.fill(invalid); await customWidth.press('Tab');
    expect(await customWidth.evaluate(el => el.checkValidity())).toBe(false);
    expect((await page.evaluate(() => window.desktop.preferencesCommand('get'))).settings.width).toBe('960');
  }
  for (const valid of ['500', '1801', '3200', '8192', '1048']) {
    await customWidth.fill(valid); await customWidth.press('Enter');
    await expect(page.locator('#write')).toHaveCSS('max-width', `${valid}px`);
    await expect(page.locator('#source-editor')).toHaveCSS('--itypora-source-width', `${valid}px`);
    await expect(width).toHaveValue('custom');
    await expect(customWidth).toHaveValue(valid);
  }
  // Custom values survive reopening, and both presets and theme defaults remain usable.
  await width.selectOption('960');
  await expect(customWidth).toBeHidden();
  await expect(page.locator('#write')).toHaveCSS('max-width', '960px');
  await width.selectOption('custom');
  await customWidth.fill('1048'); await customWidth.press('Tab');
  await expect(page.locator('#write')).toHaveCSS('max-width', '1048px');
  await prefs.locator('#close').click();
  prefs = await preferences(page);
  await prefs.locator('[data-section="editor"]').click();
  await expect(width).toHaveValue('custom');
  await expect(customWidth).toHaveValue('1048');
  await page.screenshot({ path: 'test-results/preferences-custom-width.png' });
  await prefs.locator('#setting-mode').selectOption('wysiwyg');
  await expect(page.locator('.vditor-wysiwyg #write')).toContainText('未保存正文');
  await expect(page.locator('#write')).toHaveCSS('max-width', '1048px');
  await expect(page.locator('#dirty-dot')).not.toHaveAttribute('hidden', '');
  // Percentages are relative to the editor, respond to resizing and persist across modes.
  await width.selectOption('percent');
  await expect(customWidth).toHaveValue('80');
  await expect(prefs.locator('#width-unit')).toHaveText('%');
  await expect(page.locator('#write')).toHaveCSS('max-width', '80%');
  for (const invalid of ['', '0', '101']) {
    await customWidth.fill(invalid); await customWidth.press('Tab');
    expect(await customWidth.evaluate(el => el.checkValidity())).toBe(false);
    expect((await page.evaluate(() => window.desktop.preferencesCommand('get'))).settings.width).toBe('80%');
  }
  for (const valid of ['1', '100', '87.5']) {
    await customWidth.fill(valid); await customWidth.press('Enter');
    await expect(page.locator('#write')).toHaveCSS('max-width', `${valid}%`);
    await expect(page.locator('#source-editor')).toHaveCSS('--itypora-source-width', `${valid}%`);
  }
  await page.screenshot({ path: 'test-results/preferences-percent-width.png' });
  await prefs.locator('#close').click();
  // Emulate viewport sizes so the 4K check also runs on smaller CI displays.
  const viewportSession = await page.context().newCDPSession(page);
  try {
    for (const [width, height] of [[3840, 2160], [1440, 900], [1000, 800]]) {
      await viewportSession.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await expect.poll(() => widthRatio(page, '#write')).toBeCloseTo(0.875, 2);
      if (width === 3840) expect((await page.locator('#write').boundingBox()).width).toBeGreaterThan(1800);
    }
  } finally {
    await viewportSession.send('Emulation.clearDeviceMetricsOverride');
    await viewportSession.detach();
  }
  await menu('sidebar');
  await expect.poll(() => widthRatio(page, '#write')).toBeCloseTo(0.875, 2);
  await menu('sidebar');
  await menu('source');
  await expect.poll(() => widthRatio(page, '#source-editor .CodeMirror-lines')).toBeCloseTo(0.875, 2);
  await menu('source');
  prefs = await preferences(page);
  await prefs.locator('[data-section="editor"]').click();
  await prefs.locator('#setting-mode').selectOption('ir');
  await expect(page.locator('.vditor-ir #write')).toHaveCSS('max-width', '87.5%');
  await width.selectOption('custom');
  await expect(customWidth).toHaveValue('960');
  await expect(prefs.locator('#width-unit')).toHaveText('px');
  await expect(customWidth).not.toHaveAttribute('max', '100');
  await expect(page.locator('#write')).toHaveCSS('max-width', '960px');
  await width.selectOption('percent');
  await customWidth.fill('87.5'); await customWidth.press('Enter');
  await expect(page.locator('#write')).toHaveCSS('max-width', '87.5%');
  await width.selectOption('0');
  await expect(customWidth).toBeHidden();
  await expect.poll(() => page.locator('#write').evaluate(el => el.style.maxWidth)).toBe('');
  await expect(page.locator('#source-editor')).not.toHaveClass(/itypora-width/);
  await width.selectOption('percent');
  await customWidth.fill('87.5'); await customWidth.press('Enter');
  await expect(page.locator('#write')).toHaveCSS('max-width', '87.5%');
  await prefs.locator('[data-section="appearance"]').click();
  await prefs.locator('[data-setting="showCount"]').uncheck();
  await expect(page.locator('#word-count')).toBeHidden();
  await prefs.locator('summary').click();
  await prefs.locator('#custom-css').fill('#write { color: rgb(101, 44, 156); }');
  await prefs.locator('#save-css').click();
  await expect(page.locator('#write')).toHaveCSS('color', 'rgb(101, 44, 156)');
  await prefs.locator('#custom-css').fill('#write {'); await prefs.locator('#save-css').click();
  await expect(prefs.locator('#message')).toHaveClass('error');
  await expect(page.locator('#write')).toHaveCSS('color', 'rgb(101, 44, 156)');
  await prefs.locator('#search').fill('Tab'); await expect(prefs.locator('[data-setting="tabSize"]')).toBeVisible();
  await expect(prefs.locator('#current-theme')).toBeHidden();
  const folder = path.join(temporary, 'themes');
  await fs.writeFile(path.join(folder, 'folder-theme.css'), ':root { --bg-color: rgb(240, 248, 242); } #write h1 { color: teal }');
  await prefs.locator('[data-section="appearance"]').click();
  await prefs.locator('#refresh-themes').click();
  await expect(prefs.locator('#current-theme option').filter({ hasText: 'folder-theme' })).toHaveCount(1);
  await prefs.locator('#current-theme').selectOption({ label: 'folder-theme' });
  await expect(page.locator('.editor-surface')).toHaveCSS('background-color', 'rgb(240, 248, 242)');
  await expect(page.locator('#preferences')).toHaveCSS('background-color', 'rgb(240, 248, 242)');
  // Reloading an imported theme must update the open page without reopening it.
  await fs.writeFile(path.join(folder, 'folder-theme.css'), 'body { background: rgb(31, 35, 39); color: rgb(222, 226, 230); }');
  await prefs.locator('#refresh-themes').click();
  await expect(page.locator('#preferences')).toHaveCSS('background-color', 'rgb(31, 35, 39)');
  await expect(page.locator('#preferences')).toHaveCSS('color', 'rgb(222, 226, 230)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(620, 600));
  expect(await page.locator('#preferences').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.locator('#preferences main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await prefs.locator('[data-section="editor"]').click();
  await expect(customWidth).toBeVisible();
  expect(await page.locator('#preferences main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/preferences-custom-width-narrow.png' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 800));
  await prefs.locator('[data-section="appearance"]').click();
  await prefs.locator('#preferences main').evaluate(el => { el.scrollTop = 0; });
  await page.mouse.move(10, 10);
  await page.screenshot({ path: 'test-results/preferences-inline-dark.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#preferences')).toBeHidden();
  await expect(page.locator('#write')).toContainText('未保存正文');
  await expect(page.locator('#dirty-dot')).toBeVisible();
  // Opening preferences must preserve source selection, scrolling, and undo history.
  await menu('source');
  await expect(page.locator('#source-editor .CodeMirror-lines')).toHaveCSS('max-width', '87.5%');
  const source = sourceEditor(page);
  const text = Array.from({ length: 100 }, (_, i) => `第 ${i + 1} 行正文`).join('\n');
  await source.fill(text);
  await source.select(20, 28); await source.scrollTop(500);
  const state = async () => ({ selection: await source.selection(), scroll: await source.scrollTop() });
  const before = await state();
  expect(before.scroll).toBeGreaterThan(0);
  await menu('preferences');
  await menu('preferences');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await page.keyboard.press('Escape');
  await expect.poll(source.focused).toBe(true);
  expect(await state()).toEqual(before);
  await source.toHaveValue(text);
  await page.keyboard.insertText('替换文字');
  await menu('preferences');
  await page.locator('#close').click();
  await menu('format:undo');
  await source.toHaveValue(text);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  await app.close(); app = undefined;
  page = await launch(); prefs = await preferences(page);
  await expect(prefs.locator('#current-theme')).toHaveValue('file:folder-theme.css');
  await expect(page.locator('.editor-surface')).toHaveCSS('background-color', 'rgb(31, 35, 39)');
  await expect(page.locator('#preferences')).toHaveCSS('background-color', 'rgb(31, 35, 39)');
  await expect(page.locator('#write')).toHaveCSS('color', 'rgb(101, 44, 156)');
  await expect(page.locator('#word-count')).toBeHidden();
  await prefs.locator('[data-section="editor"]').click();
  await expect(prefs.locator('#setting-width')).toHaveValue('percent');
  await expect(prefs.locator('#setting-custom-width')).toHaveValue('87.5');
  await expect(prefs.locator('#width-unit')).toHaveText('%');
  await expect(page.locator('#write')).toHaveCSS('max-width', '87.5%');
  expect(errors).toEqual([]);
  console.log('PASS: directory theme selection, system appearance independence, menu synchronization, in-window preferences, uncapped pixel and responsive percentage widths, validation, unsaved text, custom CSS validation, directory reload, search and restart persistence');
} finally {
  if (app) { await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {}); await app.close(); }
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
}
