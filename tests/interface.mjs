import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-interface-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && !w.webContents.isDestroyed() && w.webContents.getURL().endsWith('/index.html'));
    const item = Menu.getApplicationMenu().getMenuItemById(command);
    if (!item) throw new Error('Missing command: ' + command);
    window.webContents.ipc.once('action-complete', () => resolve()); item.click(item, window);
  }), id);
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  await page.locator('#write').click();
  await page.keyboard.insertText('格式操作');
  await menu('format:h2');
  await expect(page.locator('#write h2')).toContainText('格式操作');
  await menu('source');
  await sourceEditor(page).toHaveValue(/## 格式操作/);
  await sourceEditor(page).fill('菜单加粗');
  await sourceEditor(page).select(0, '菜单加粗'.length);
  await menu('format:bold');
  await sourceEditor(page).toHaveValue('**菜单加粗**');
  await menu('format:undo');
  await sourceEditor(page).toHaveValue('菜单加粗');
  await menu('source');
  await page.locator('#write').click();
  await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+Shift+End');
  await menu('format:bold');
  await expect(page.locator('#write strong')).toContainText('菜单加粗');
  console.log('PASS: native heading / rich bold / source bold and undo');

  await app.evaluate(({ dialog }, file) => {
    dialog.showMessageBox = async () => ({ response: 1 });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, path.resolve('tests/fixtures/参考文档.md'));
  await menu('open');
  await expect(page.locator('#write h1')).toContainText('写作与思考');
  await menu('outline');
  await expect(page.locator('#outline')).toBeVisible();
  await expect(page.locator('#outline button')).toHaveCount(4);
  await menu('folder');
  // The mocked file picker intentionally returns a file for the folder command.
  // A failed picker must show an error without replacing the current document.
  await expect(page.locator('#write h1')).toContainText('写作与思考');
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, path.resolve('tests'));
  await menu('folder'); await menu('tree');
  await expect(page.locator('.tree-directory').filter({ hasText: 'fixtures' })).toBeVisible();
  await menu('outline');
  await menu('focus');
  await expect(page.locator('body')).toHaveClass(/focus-mode/);
  await menu('focus'); await menu('typewriter');
  await expect(page.locator('body')).toHaveClass(/typewriter-mode/);
  await menu('typewriter');
  await menu('statusbar'); await expect(page.locator('.statusbar')).toBeHidden();
  await menu('statusbar'); await expect(page.locator('.statusbar')).toBeVisible();
  await menu('find'); await page.locator('#find-query').fill('文档');
  await expect(page.locator('#find-result')).toHaveText(/\d+ \/ [1-9]\d*/);
  await page.getByRole('button', { name: '关闭查找', exact: true }).click();
  console.log('PASS: outline, folder tree, focus / typewriter / status switches and find');

  const themePath = process.argv[2];
  if (themePath) {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.resolve(themePath));
    await menu('import-theme');
    await expect(page.locator('.editor-surface')).toHaveCSS('background-color', 'rgb(250, 247, 239)');
    await expect(page.locator('.sidebar')).toHaveCSS('background-color', 'rgb(243, 239, 227)');
    await expect(page.locator('#write')).toHaveCSS('padding-top', '48px');
    await expect(page.locator('#write')).toHaveCSS('font-family', /Matcha/);
    await expect(page.locator('#write input[type="checkbox"]').first()).toHaveCSS('border-radius', '50%');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "Matcha Text"'))).toBe(true);
    console.log('PASS: local Matcha theme, embedded font, page and sidebar colors');
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(786, 693));
  await expect(page.locator('#toast')).toBeHidden({ timeout: 10000 });
  await menu('sidebar');
  await page.screenshot({ path: 'test-results/itypora-reference-document.png' });
  await menu('outline');
  await page.screenshot({ path: 'test-results/itypora-reference-outline.png' });
  await menu('preferences');
  const prefs = page;
  await prefs.locator('[data-section="appearance"]').click();
  await prefs.locator('[name="font-size"][value="custom"]').check();
  await prefs.locator('#setting-size').fill('18');
  await prefs.locator('#setting-size').press('Tab');
  await expect(page.locator('#write')).toHaveCSS('font-size', '18px');
  await prefs.locator('[name="font-size"][value="auto"]').check();
  await prefs.screenshot({ path: 'test-results/preferences-appearance.png' });
  await prefs.locator('#close').click();
  expect(errors).toEqual([]);
  console.log('PASS: preferences apply and no renderer exceptions');
} catch (error) {
  console.error('Renderer errors:', errors);
  const page = await app.firstWindow();
  await page.screenshot({ path: 'test-results/interface-failure.png' }).catch(() => {});
  throw error;
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
}
