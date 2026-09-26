import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-table-dialog-'));
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${temporary}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary } });
const errors = [];
try {
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible();
  const invoke = async id => {
    await expect.poll(() => app.evaluate(({ Menu }, name) => Menu.getApplicationMenu().getMenuItemById(name)?.enabled, id)).toBe(true);
    await app.evaluate(({ Menu, BrowserWindow }, name) => new Promise(resolve => {
      const window = BrowserWindow.getAllWindows()[0]; window.webContents.ipc.once('action-complete', resolve);
      const item = Menu.getApplicationMenu().getMenuItemById(name); item.click(item, window);
    }), id);
  };
  const dialog = page.locator('#table-dialog'), source = sourceEditor(page);
  const text = 'Before\n\nReplace me\n\nAfter';
  async function prepare(mode) {
    if (await source.locator.isHidden()) await invoke('source');
    await source.fill(text);
    if (mode === 'source') {
      const start = text.indexOf('Replace me'); await source.select(start, start + 10);
    } else {
      await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
      await invoke('source');
      await expect(page.locator(mode === 'ir' ? '.vditor-ir #write' : '.vditor-wysiwyg #write')).toBeVisible();
      await page.locator('#write p').filter({ hasText: 'Replace me' }).evaluate(el => {
        el.closest('[contenteditable]').focus(); const range = document.createRange(); range.selectNodeContents(el);
        getSelection().removeAllRanges(); getSelection().addRange(range);
      });
    }
  }
  async function contents(mode) { return mode === 'source' ? source.value() : page.locator('#write').innerHTML(); }
  for (const mode of ['source', 'ir', 'wysiwyg']) {
    await prepare(mode);
    const before = await contents(mode);
    await invoke('format:table'); await expect(dialog).toBeVisible();
    await expect(page.locator('#table-columns')).toBeFocused();
    await expect(page.locator('#table-columns')).toHaveValue('3');
    await expect(page.locator('#table-rows')).toHaveValue('4');
    expect(await contents(mode)).toBe(before);
    await page.locator('#table-cancel').click(); await expect(dialog).toBeHidden();
    expect(await contents(mode)).toBe(before);
    if (mode === 'source') expect(await source.selection()).toEqual([8,18]);
    else expect(await page.evaluate(() => getSelection().toString())).toContain('Replace me');
    await invoke('format:table'); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
    expect(await contents(mode)).toBe(before);
    await invoke('format:table');
    for (const value of ['', '0', '-2', '2.5', '51']) {
      await page.locator('#table-columns').fill(value); await page.locator('#table-confirm').click();
      await expect(dialog).toBeVisible(); expect(await contents(mode)).toBe(before);
    }
    await page.locator('#table-columns').fill('3'); await page.locator('#table-rows').fill('0'); await page.locator('#table-confirm').click(); await expect(dialog).toBeVisible();
    await page.locator('#table-rows').fill('4');
    if (mode === 'source') {
      const paper = await page.locator('.editor-surface').evaluate(el => getComputedStyle(el).backgroundColor);
      await expect(dialog).toHaveCSS('background-color', paper);
      await page.screenshot({ path: 'test-results/table-dialog-light.png' });
    }
    await page.locator('#table-rows').press('Enter'); await expect(dialog).toBeHidden();
    if (mode === 'source') {
      const actual = await source.value();
      expect(actual).not.toContain('Replace me');
      const lines = actual.split('\n').filter(line => line.startsWith('|'));
      expect(lines).toHaveLength(5); expect(lines[1]).toBe('| --- | --- | --- |');
      expect(actual.indexOf('|')).toBeGreaterThan(actual.indexOf('Before')); expect(actual.lastIndexOf('|')).toBeLessThan(actual.indexOf('After'));
    } else {
      await expect(page.locator('#write th')).toHaveCount(3); await expect(page.locator('#write tr')).toHaveCount(4);
      await expect(page.locator('#write')).not.toContainText('Replace me');
      await expect(page.locator('#write > p').first()).toHaveText('Before'); await expect(page.locator('#write > p').last()).toHaveText('After');
    }
    await invoke('format:undo');
    if (mode === 'source') await source.toHaveValue(text);
    else { await expect(page.locator('#write table')).toHaveCount(0); await expect(page.locator('#write')).toContainText('Replace me'); }
    await invoke('format:redo');
    if (mode === 'source') await source.toHaveValue(/\| --- \| --- \| --- \|/);
    else await expect(page.locator('#write tr')).toHaveCount(4);

    // Verify another size and the minimum one-cell table.
    for (const [columns, rows] of [[2, 6], [1, 1]]) {
      await prepare(mode); await invoke('format:table');
      await page.locator('#table-columns').fill(String(columns)); await page.locator('#table-rows').fill(String(rows)); await page.locator('#table-confirm').click();
      await expect(dialog).toBeHidden();
      if (mode === 'source') expect((await source.value()).split('\n').filter(line => line.startsWith('|'))).toHaveLength(rows + 1);
      else { await expect(page.locator('#write th')).toHaveCount(columns); await expect(page.locator('#write tr')).toHaveCount(rows); }
    }
    console.log(`PASS: ${mode} table dialog, defaults, cancel/Esc, validation, selection, requested dimensions and undo/redo`);
  }
  await page.evaluate(() => window.desktop.savePreferences({ theme: 'night' }));
  await invoke('format:table');
  await expect(dialog).toHaveCSS('background-color', 'rgb(37, 43, 41)');
  await page.locator('#table-columns').fill('3'); await page.locator('#table-rows').fill('4'); await page.locator('#table-columns').focus();
  await page.screenshot({ path: 'test-results/table-dialog-dark.png' });
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
} catch (error) {
  console.error('Renderer errors:', errors); const page = await app.firstWindow(); console.error('Toast:', await page.locator('#toast').textContent());
  await page.screenshot({ path: 'test-results/table-dialog-failure.png' }); throw error;
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {}); await app.close();
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe cleanup'); await fs.rm(temporary, { recursive: true, force: true });
}
