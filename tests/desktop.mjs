import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-desktop-'));
const data = path.join(temporary, 'profile');
const documentPath = path.join(temporary, '中文测试.md');
const themePath = path.join(temporary, 'test-theme.css');
const original = '# 测试文档\r\n\r\n原始 **内容**。\r\n\r\n- [ ] 待办任务\r\n\r\n| 列一 | 列二 |\r\n| --- | --- |\r\n| 值一 | 值二 |\r\n\r\n![本地图片](pixel.png)\r\n';
await fs.mkdir(data);
await fs.writeFile(documentPath, original);
await fs.writeFile(themePath, '#write h1 { color: rgb(120, 30, 160); } :root { --text-color: rgb(70, 60, 50); }');
await fs.writeFile(path.join(temporary, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aElQAAAAASUVORK5CYII=', 'base64'));
await fs.mkdir('test-results', { recursive: true });
const app = await electron.launch({ args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: data } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.log('renderer:', message.text()); });
  const menu = async (id) => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && !w.webContents.isDestroyed() && w.webContents.getURL().endsWith('/index.html'));
    const item = Menu.getApplicationMenu().getMenuItemById(command);
    if (!item) throw new Error('Missing menu: ' + command);
    window.webContents.ipc.once('action-complete', () => resolve()); item.click(item, window);
  }), id);
  const preferencesPage = async () => { const prefs = page; await expect(prefs.locator('#setting-mode')).toBeAttached(); return prefs; };
  const editMode = async (mode) => { await menu('preferences'); const prefs = await preferencesPage(); await prefs.locator('[data-section="editor"]').click(); await prefs.locator('#setting-mode').selectOption(mode); await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('itypora-preferences')).mode)).toBe(mode); await prefs.getByRole('button', { name: '关闭偏好设置', exact: true }).click(); };
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#write')).toHaveText('');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.vditor-toolbar')).toBeHidden();
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.length)).toBe(process.platform === 'darwin' ? 8 : 7);
  await page.screenshot({ path: 'test-results/desktop-paper.png' });
  console.log('PASS: offline editor startup');

  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, documentPath);
  await menu('open');
  await expect(page.locator('#document-name')).toHaveText('中文测试.md');
  await expect(page.locator('#write h1')).toContainText('测试文档');
  await expect.poll(() => page.locator('#write img').first().evaluate((image) => image.naturalWidth)).toBe(1);
  console.log('PASS: document-relative local image rendering');
  await menu('save');
  await expect.poll(() => fs.readFile(documentPath, 'utf8')).toBe(original);
  expect(await fs.readFile(documentPath, 'utf8')).toBe(original);
  console.log('PASS: UTF-8/CRLF open-save byte preservation');

  await menu('source');
  await sourceEditor(page).toHaveValue(original.replaceAll('\r\n', '\n'));
  await editMode('wysiwyg'); await menu('source');
  await expect(page.locator('#write h1')).toContainText('测试文档');
  await editMode('ir');
  await menu('save');
  expect(await fs.readFile(documentPath, 'utf8')).toBe(original);
  console.log('PASS: mode switching preserves untouched original Markdown');

  await menu('source');
  await sourceEditor(page).fill('# 修改后的标题\n\n正文与 **粗体**\n\n- [x] 已完成\n');
  await expect(page.locator('#dirty-dot')).toBeVisible();
  await menu('source');
  await expect(page.locator('#write h1')).toContainText('修改后的标题');
  await menu('save');
  await expect(page.locator('#dirty-dot')).toBeHidden();
  expect(await fs.readFile(documentPath, 'utf8')).toContain('# 修改后的标题');
  console.log('PASS: source editing and native save');

  // Typing then immediately saving must not race the editor's input debounce.
  await page.locator('#write p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('即时输入');
  await menu('save');
  await expect.poll(() => fs.readFile(documentPath, 'utf8')).toContain('即时输入');
  console.log('PASS: immediate save flushes debounced editor input');

  await menu('source');
  await sourceEditor(page).fill('# 重开当前文件\n\n保存后重新读取');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await menu('open');
  await sourceEditor(page).toHaveValue('# 重开当前文件\n\n保存后重新读取');
  await menu('source');
  console.log('PASS: reopening current file reads after saving pending changes');

  await fs.writeFile(documentPath, '# 外部修改\n');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  await menu('save');
  await page.waitForTimeout(200);
  expect(await fs.readFile(documentPath, 'utf8')).toBe('# 外部修改\n');
  console.log('PASS: external edits are protected by conflict cancellation');

  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, themePath);
  await menu('appearance');
  let prefs = await preferencesPage();
  await prefs.locator('#import-theme').click();
  await expect(prefs.locator('#current-theme option').filter({ hasText: 'test-theme' })).toHaveCount(1);
  await prefs.locator('#close').click();
  await expect(page.locator('#write h1')).toHaveCSS('color', 'rgb(120, 30, 160)');
  console.log('PASS: imported Typora #write theme applies to document');

  await menu('appearance');
  prefs = await preferencesPage();
  await prefs.locator('#current-theme').selectOption('night');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await prefs.locator('#close').click();
  await page.screenshot({ path: 'test-results/desktop-night.png' });

  const copyPath = path.join(temporary, '另存为.md');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, copyPath);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('action', 'save-as'));
  await expect(page.locator('#document-name')).toHaveText('另存为.md');
  await expect.poll(() => fs.readFile(copyPath, 'utf8')).toContain('重开当前文件');
  console.log('PASS: native Save As writes a separate document');

  await menu('source');
  await sourceEditor(page).fill('# 未保存草稿\n\n需要保护的内容');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false }); });
  await menu('new');
  await sourceEditor(page).toHaveValue('# 未保存草稿\n\n需要保护的内容');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await sourceEditor(page).toHaveValue('# 未保存草稿\n\n需要保护的内容');
  await expect.poll(async () => {
    try { return JSON.parse(await fs.readFile(path.join(data, 'recovery.json'), 'utf8')).content; } catch { return ''; }
  }).toBe('# 未保存草稿\n\n需要保护的内容');
  console.log('PASS: unsaved-document cancellation and recovery checkpoint');
  expect(errors).toEqual([]);
  console.log('PASS: no renderer exceptions');
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }).catch(() => {});
  await app.close();
  const root = await fs.realpath(os.tmpdir());
  const real = await fs.realpath(temporary);
  if (path.relative(root, real).startsWith('..')) throw new Error('Unsafe test cleanup path');
  await fs.rm(real, { recursive: true, force: true });
}
