import { _electron as electron, expect } from '@playwright/test';
import electronPath from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { sourceEditor } from './source-editor.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-open-file-'));
const profile = path.join(temporary, 'profile');
const file = path.join(temporary, '中文 冷启动 #% 文档.md');
const second = path.join(temporary, '运行中再次打开.markdown');
const third = path.join(temporary, '排队打开.mdown');
const original = '# 默认编辑器冷启动\r\n\r\n正文与 **粗体**。\r\n\r\n![本地图片](pixel.png)\r\n';
await fs.writeFile(file, original);
await fs.writeFile(second, '# 第二个文档\n\n运行中打开\n');
await fs.writeFile(third, '# 排队文档\n');
await fs.writeFile(path.join(temporary, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aElQAAAAASUVORK5CYII=', 'base64'));
await fs.mkdir('test-results', { recursive: true });
const executablePath = process.argv[2] && path.resolve(process.argv[2]);
const project = path.resolve('.');
const env = { ...process.env, ITYPORA_TEST_USER_DATA: profile };
const args = target => executablePath ? [`--user-data-dir=${profile}`, target] : [project, target];
let app;
const errors = [];
const launch = async target => {
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: args(target), cwd: temporary, env });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  return page;
};
const openAgain = target => new Promise((resolve, reject) => {
  // Match Playwright's launch defaults, including Linux CI's sandbox setup.
  const child = spawn(executablePath || electronPath, ['--no-sandbox', ...args(target)], { cwd: temporary, env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let diagnostics = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', text => { diagnostics = (diagnostics + text).slice(-8000); });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Second instance did not exit')); }, 15000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('close', (code, signal) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Second instance exited with ${signal || code}\n${diagnostics}`)); });
});
const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
  const window = BrowserWindow.getAllWindows()[0];
  window.webContents.ipc.once('action-complete', () => resolve());
  const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
}), id);
try {
  let page = await launch(path.basename(file));
  await expect(page.locator('#document-name')).toHaveText(path.basename(file));
  await expect(page.locator('#write h1')).toContainText('默认编辑器冷启动');
  await expect.poll(() => page.locator('#write img').evaluate(image => image.naturalWidth)).toBe(1);
  await expect(page.locator('.sidebar')).toBeHidden();
  await menu('save');
  expect(await fs.readFile(file, 'utf8')).toBe(original);
  console.log('PASS: a fresh cold launch opens the OS document argument, including Unicode/spaces/#/%, relative images and CRLF');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await openAgain(second);
  await expect(page.locator('#document-name')).toHaveText(path.basename(second));
  await expect(page.locator('#write h1')).toContainText('第二个文档');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false);
  console.log('PASS: a real second process forwards its document to the existing window and restores it');

  await menu('source');
  await sourceEditor(page).fill('# 未保存内容');
  await app.evaluate(({ dialog }) => { globalThis.openPrompts = 0; dialog.showMessageBox = async () => { globalThis.openPrompts++; return { response: 2 }; }; });
  await openAgain(file);
  await expect.poll(() => app.evaluate(() => globalThis.openPrompts)).toBe(1);
  await sourceEditor(page).toHaveValue('# 未保存内容');
  await expect(page.locator('#document-name')).toHaveText(path.basename(second));
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  await openAgain(file);
  await expect(page.locator('#document-name')).toHaveText(path.basename(file));
  expect(await fs.readFile(second, 'utf8')).toBe('# 未保存内容');
  console.log('PASS: native file opens respect cancellation and save the current document before replacing it');

  await sourceEditor(page).fill('# 模态窗口期间的修改');
  await app.evaluate(({ dialog }) => {
    globalThis.openPrompts = 0;
    dialog.showMessageBox = () => {
      globalThis.openPrompts++;
      if (globalThis.openPrompts === 1) return new Promise(resolve => { globalThis.resumeOpen = () => resolve({ response: 2 }); });
      return Promise.resolve({ response: 1 });
    };
  });
  await openAgain(second);
  await expect.poll(() => app.evaluate(() => globalThis.openPrompts)).toBe(1);
  await openAgain(third);
  await app.evaluate(() => globalThis.resumeOpen());
  await expect(page.locator('#document-name')).toHaveText(path.basename(third));
  await sourceEditor(page).toHaveValue('# 排队文档\n');
  console.log('PASS: additional file-open requests wait while an unsaved-changes prompt is pending');

  // Finder-style events use the same authorization and opening flow.
  await app.evaluate(({ app }, file) => app.emit('open-file', { preventDefault() {} }, file), file);
  await expect(page.locator('#document-name')).toHaveText(path.basename(file));
  await menu('source');
  await menu('sidebar');
  await app.close(); app = null;
  page = await launch(second);
  await expect(page.locator('#document-name')).toHaveText(path.basename(second));
  await expect(page.locator('#write h1')).toContainText('未保存内容');
  await expect(page.locator('.sidebar')).toBeVisible();
  console.log('PASS: reopening after a complete exit opens the selected document and preserves the existing sidebar preference');
  await app.close(); app = null;
  page = await launch(path.join(temporary, '不存在.md'));
  await expect(page.locator('#toast')).toContainText('无法打开 不存在.md');
  await openAgain(file);
  await expect(page.locator('#document-name')).toHaveText(path.basename(file));
  await expect(page.locator('#write h1')).toContainText('默认编辑器冷启动');
  expect(errors).toEqual([]);
  await expect(page.locator('#toast')).toBeHidden({ timeout: 10000 });
  await page.screenshot({ path: 'test-results/open-file.png' });
  console.log('PASS: missing startup files report an error without blocking later opens; no renderer errors');
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
    await app.close();
  }
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
}
