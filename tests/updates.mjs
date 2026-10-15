import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { sourceEditor } from './source-editor.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-updates-'));
const executable = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const app = await electron.launch({
  ...(executable ? { executablePath: path.resolve(executable) } : {}),
  args: executable ? [`--user-data-dir=${temporary}`] : ['.'],
  env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary }
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  const version = await app.evaluate(({ app }) => app.getVersion());
  await app.evaluate(({ net, shell, dialog }) => {
    globalThis.updateTest = { requests: [], dialogs: [], opened: [], response: 0, release: { tag_name: 'v1000.0.0', draft: false, prerelease: false }, realFetch: net.fetch };
    net.fetch = async (url, options) => {
      const test = globalThis.updateTest;
      test.requests.push({ url, credentials: options.credentials });
      if (test.hold) await new Promise(resolve => { test.resume = resolve; });
      if (test.failure) throw new Error('offline');
      return Response.json(test.release, { status: test.status || 200 });
    };
    dialog.showMessageBox = async (_owner, options) => {
      globalThis.updateTest.dialogs.push(options);
      return { response: globalThis.updateTest.response };
    };
    shell.openExternal = async url => { globalThis.updateTest.opened.push(url); };
  });
  const click = () => app.evaluate(({ Menu }) => { const item = Menu.getApplicationMenu().getMenuItemById('check-updates'); item.click(); });
  const idle = () => expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('check-updates').enabled)).toBe(true);
  const state = () => app.evaluate(() => ({ requests: globalThis.updateTest.requests, dialogs: globalThis.updateTest.dialogs, opened: globalThis.updateTest.opened }));
  expect((await state()).requests).toHaveLength(0);
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label.includes('帮助')).submenu.items.some(item => item.id === 'check-updates'))).toBe(true);

  await click(); await idle();
  let result = await state();
  expect(result.dialogs.at(-1).message).toContain('1000.0.0');
  expect(result.dialogs.at(-1).detail).toContain(`当前版本：${version}`);
  expect(result.opened).toEqual(['https://github.com/lhyf/ITypora/releases/tag/v1000.0.0']);
  console.log('PASS: Help checks GitHub on demand, compares versions and opens the release download page');

  await app.evaluate(() => { globalThis.updateTest.response = 1; });
  await click(); await idle();
  expect((await state()).opened).toHaveLength(1);
  for (const tag of [`v${version}`, 'v0.0.0']) {
    await app.evaluate((_electron, tag) => { globalThis.updateTest.release.tag_name = tag; }, tag);
    await click(); await idle();
    result = await state();
    expect(result.dialogs.at(-1).message).toBe('当前已是最新版本');
    expect(result.dialogs.at(-1).buttons).toEqual(['确定']);
  }
  console.log('PASS: dismissing an update, equal versions and older remote releases do not open a browser');

  for (const [status, expected] of [[404, '暂时没有可用'], [429, '限制'], [503, 'HTTP 503']]) {
    await app.evaluate((_electron, status) => { globalThis.updateTest.status = status; }, status);
    await click(); await idle();
    const last = (await state()).dialogs.at(-1);
    expect(last.message + last.detail).toContain(expected);
  }
  await app.evaluate(() => { globalThis.updateTest.status = 200; globalThis.updateTest.failure = true; });
  await click(); await idle();
  expect((await state()).dialogs.at(-1).detail).toContain('网络连接');
  console.log('PASS: missing releases, GitHub rate limits, server and network failures show useful messages');

  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.send('action', 'source'); });
  await sourceEditor(page).fill('# 检查更新期间仍可编辑');
  await app.evaluate(() => { globalThis.updateTest.failure = false; globalThis.updateTest.hold = true; });
  const before = await state();
  await click();
  await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('check-updates').label)).toBe('正在检查更新…');
  await click();
  await sourceEditor(page).fill('# 未保存的修改不会丢失');
  expect((await state()).requests).toHaveLength(before.requests.length + 1);
  await app.evaluate(() => globalThis.updateTest.resume());
  await idle();
  await sourceEditor(page).toHaveValue('# 未保存的修改不会丢失');
  await expect(page.locator('#dirty-dot')).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: duplicate checks are suppressed and editing continues without losing unsaved content');

  if (process.argv.includes('--live')) {
    await app.evaluate(({ net }) => { net.fetch = globalThis.updateTest.realFetch; });
    const before = (await state()).dialogs.length;
    await click();
    await expect.poll(async () => (await state()).dialogs.length, { timeout: 20000 }).toBe(before + 1);
    await idle();
    result = await state();
    expect(result.dialogs.at(-1).message).not.toBe('检查更新失败');
    console.log('PASS: real Electron network request to the GitHub latest release API:', result.dialogs.at(-1).detail);
  }
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  const root = await fs.realpath(os.tmpdir()), real = await fs.realpath(temporary);
  if (path.relative(root, real).startsWith('..')) throw new Error('Unsafe test cleanup path');
  await fs.rm(real, { recursive: true, force: true });
}
