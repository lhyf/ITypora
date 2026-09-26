import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-packaged-'));
const executablePath = process.argv[2] || path.resolve('release/win-unpacked/Itypora.exe');
const app = await electron.launch({ executablePath, args: [`--user-data-dir=${temporary}`] });
try {
  const page = await app.firstWindow();
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.vditor-toolbar')).toBeHidden();
  await expect(page.locator('#vditor-icon-bold')).toHaveCount(1);
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
  const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
  expect(await app.evaluate(({ app }) => app.getVersion())).toBe(version);
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', () => resolve());
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.resolve('tests/fixtures/参考文档.md'));
  await menu('open');
  await expect(page.locator('#write h1')).toContainText('写作与思考');
  if (process.argv[3]) {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.resolve(process.argv[3]));
    await menu('import-theme');
    await expect(page.locator('.editor-surface')).toHaveCSS('background-color', 'rgb(250, 247, 239)');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#toast')).toBeHidden({ timeout: 10000 });
  }
  await page.screenshot({ path: 'test-results/packaged-windows.png' });
  const nativeCapture = await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const handle = window.getNativeWindowHandle().readUInt32LE(0);
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1200, height: 960 } });
    const source = sources.find(source => source.id.split(':')[1] === String(handle));
    return source?.thumbnail.toPNG().toString('base64');
  });
  if (nativeCapture) await fs.writeFile('test-results/packaged-native-window.png', Buffer.from(nativeCapture, 'base64'));
  await menu('appearance');
  const prefs = page;
  await expect(prefs.locator('#current-theme')).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  const selectedTheme = await prefs.locator('#current-theme').inputValue();
  await expect(prefs.locator('[data-setting="separateDark"], #dark-theme')).toHaveCount(0);
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark'; });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('itypora-theme'))).toBe(selectedTheme);
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light'; });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('itypora-theme'))).toBe(selectedTheme);
  await prefs.screenshot({ path: 'test-results/packaged-preferences.png' });
  console.log(`PASS: packaged Windows ${version} starts, opens Markdown, loads theme, in-window preferences and manual theme selection`);
} finally {
  await app.close();
  const root = await fs.realpath(os.tmpdir());
  const real = await fs.realpath(temporary);
  if (path.relative(root, real).startsWith('..')) throw new Error('Unsafe cleanup');
  await fs.rm(real, { recursive: true, force: true });
}
