import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-sidebar-'));
const profile = path.join(temporary, 'profile'), folder = path.join(temporary, 'documents');
await fs.mkdir(folder);
const markdown = Array.from({ length: 100 }, (_, i) => `${'#'.repeat(i % 6 + 1)} Heading ${i + 1}\n\nParagraph ${i + 1}.\n`).join('\n');
await Promise.all(Array.from({ length: 100 }, (_, i) => fs.writeFile(path.join(folder, `document-${String(i).padStart(3, '0')}.md`), i === 0 ? markdown : '# Document\n')));
const executablePath = process.argv[2];
let app;
const errors = [];
async function launch() {
  app = await electron.launch(executablePath ? { executablePath, args: [`--user-data-dir=${profile}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: profile } });
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible(); return page;
}
const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
  const window = BrowserWindow.getAllWindows()[0];
  const item = Menu.getApplicationMenu().getMenuItemById(command);
  window.webContents.ipc.once('action-complete', resolve); item.click(item, window);
}), id);
async function scrollWithoutBar(page, selector) {
  const region = page.locator(selector);
  await expect(region).toHaveCSS('scrollbar-width', 'none');
  expect(await region.evaluate(element => getComputedStyle(element, '::-webkit-scrollbar').display)).toBe('none');
  expect(await region.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await region.hover(); await page.mouse.wheel(0, 500);
  await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
}
const width = page => page.locator('#sidebar').evaluate(element => Math.round(element.getBoundingClientRect().width));
async function dragTo(page, target) {
  const handle = await page.locator('#sidebar-resizer').boundingBox();
  const current = await width(page);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + target - current, handle.y + 100, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => width(page)).toBe(target);
  await expect(page.locator('body')).not.toHaveClass(/resizing-sidebar/);
}
try {
  let page = await launch();
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, folder);
  await menu('folder'); await menu('files');
  await expect(page.locator('.file-item')).toHaveCount(100);
  await scrollWithoutBar(page, '#file-list');
  await dragTo(page, 380);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(620, 560));
  await expect.poll(() => width(page)).toBeLessThanOrEqual(300);
  expect(await page.locator('.main').evaluate(element => element.clientWidth)).toBeGreaterThanOrEqual(320);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 800));
  await expect.poll(() => width(page)).toBe(380);
  await page.locator('#sidebar-resizer').focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => width(page)).toBe(390);
  const handle = await page.locator('#sidebar-resizer').boundingBox();
  await page.mouse.move(handle.x + 4, handle.y + 100); await page.mouse.down(); await page.mouse.move(handle.x + 84, handle.y + 100);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect.poll(() => width(page)).toBe(390);
  await expect(page.locator('body')).not.toHaveClass(/resizing-sidebar/);
  await page.locator('#sidebar-resizer').dblclick(); await expect.poll(() => width(page)).toBe(240);
  await dragTo(page, 355);
  await menu('sidebar'); await expect(page.locator('#sidebar-resizer')).toBeHidden();
  await menu('sidebar'); await expect.poll(() => width(page)).toBe(355);
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, path.join(folder, 'document-000.md'));
  await menu('open'); await menu('outline');
  await expect(page.locator('#outline button')).toHaveCount(100);
  await scrollWithoutBar(page, '#outline');
  await expect(page.locator('#dirty-dot')).toBeHidden();
  await fs.mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/sidebar-resized.png' });
  await app.close(); app = undefined;
  page = await launch(); await expect(page.locator('#sidebar')).toBeVisible();
  await expect.poll(() => width(page)).toBe(355);
  expect(errors).toEqual([]);
  console.log('PASS: file/outline wheel scrolling without bars; pointer resize, keyboard, cancel, reset, window bounds, hide/show, restart persistence; document unchanged');
} finally {
  if (app) await app.close();
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
}
