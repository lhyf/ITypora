import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-find-scroll-'));
const fixture = path.join(temporary, 'long.md');
const markdown = '# 搜索和滚动\n\n' + Array.from({ length: 90 }, (_, i) => `${i % 30 === 0 ? '定位词 ' : ''}第 ${i + 1} 段正文，用于检查长文档定位。\n`).join('\n');
await fs.writeFile(fixture, markdown);
await fs.mkdir('test-results', { recursive: true });
const app = await electron.launch({ args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: path.join(temporary, 'profile') } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', resolve);
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  await app.evaluate(({ dialog, BrowserWindow }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async () => ({ response: 1 });
    BrowserWindow.getAllWindows()[0].setContentSize(1200, 760);
    BrowserWindow.getAllWindows()[0].focus();
  }, fixture);
  await menu('open');
  const query = page.locator('#find-query'), result = page.locator('#find-result');
  const bar = page.locator('#document-scrollbar');
  const source = sourceEditor(page);
  // CDP key events do not invoke native menu accelerators on Windows. Verify
  // their bindings, then exercise the same commands through the native menu.
  expect(await app.evaluate(({ Menu }) => ['find', 'find-next', 'find-previous'].map(id => Menu.getApplicationMenu().getMenuItemById(id).accelerator))).toEqual(['CmdOrCtrl+F', 'F3', 'Shift+F3']);
  const scrollInfo = mode => page.evaluate(mode => {
    if (mode === 'source') {
      const cm = document.querySelector('#source-editor .CodeMirror').CodeMirror, info = cm.getScrollInfo();
      return { top: info.top, range: info.height - info.clientHeight };
    }
    const write = document.querySelector('#write');
    return { top: write.scrollTop, range: write.scrollHeight - write.clientHeight };
  }, mode);

  for (const mode of ['ir', 'wysiwyg', 'source']) {
    if (mode === 'wysiwyg') {
      await page.evaluate(() => window.desktop.savePreferences({ mode: 'wysiwyg' }));
      await expect(page.locator('.vditor-wysiwyg > #write')).toBeVisible();
    } else if (mode === 'source') await menu('source');
    await menu('find');
    await expect(query).toBeFocused();
    await query.fill('定位词');
    await expect(result).toHaveText('1 / 3');
    let [ordinal, total] = (await result.textContent()).split(' / ').map(Number);
    expect([ordinal, total]).toEqual([1, 3]);
    const moved = async (forward, perform) => {
      ordinal = (ordinal - 1 + (forward ? 1 : -1) + total) % total + 1;
      await perform(); await expect(result).toHaveText(`${ordinal} / ${total}`);
    };
    await moved(true, () => query.press('Enter'));
    await expect(query).toBeFocused();
    for (let i = 0; i < total; i++) await moved(true, () => query.press('Enter'));
    await moved(false, () => query.press('Shift+Enter'));
    await moved(true, () => menu('find-next'));
    await moved(false, () => menu('find-previous'));
    await moved(true, () => page.getByRole('button', { name: '下一个', exact: true }).click());
    await moved(false, () => page.getByRole('button', { name: '上一个', exact: true }).click());
    if (mode === 'source') {
      const [start, end] = await source.selection();
      expect(markdown.slice(start, end)).toBe('定位词');
    }
    await query.fill('没有此关键词'); await expect(result).toHaveText('0 / 0');
    await query.fill(''); await expect(result).toBeEmpty();
    await query.press('Escape'); await expect(page.locator('.findbar')).toBeHidden();

    await expect(bar).toBeVisible();
    // Native/editor scrolling must move the right-edge thumb too.
    await page.evaluate(mode => {
      if (mode === 'source') document.querySelector('#source-editor .CodeMirror').CodeMirror.scrollTo(null, 0);
      else document.querySelector('#write').scrollTop = 0;
    }, mode);
    await expect.poll(() => bar.evaluate(el => el.scrollTop)).toBe(0);
    await page.locator(mode === 'source' ? '.CodeMirror-scroll' : '#write').hover();
    await page.mouse.wheel(0, 450);
    await expect.poll(async () => (await scrollInfo(mode)).top).toBeGreaterThan(100);
    await expect.poll(async () => Math.abs(await bar.evaluate(el => el.scrollTop) - (await scrollInfo(mode)).top)).toBeLessThan(2);

    // Drag the real native thumb down the track, without changing scrollTop in JS.
    await page.evaluate(mode => {
      if (mode === 'source') document.querySelector('#source-editor .CodeMirror').CodeMirror.scrollTo(null, 0);
      else document.querySelector('#write').scrollTop = 0;
    }, mode);
    await expect.poll(() => bar.evaluate(el => el.scrollTop)).toBe(0);
    const box = await bar.boundingBox();
    expect(Math.abs(box.x + box.width - await page.locator('.editor-surface').evaluate(el => el.getBoundingClientRect().right))).toBeLessThan(1);
    const thumb = await bar.evaluate(el => Math.max(20, el.clientHeight ** 2 / el.scrollHeight));
    await page.mouse.move(box.x + box.width / 2, box.y + thumb / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4, { steps: 15 });
    await page.mouse.up();
    await expect.poll(async () => { const info = await scrollInfo(mode); return info.top / info.range; }).toBeGreaterThan(0.9);
    await page.screenshot({ path: `test-results/find-scroll-${mode}.png` });
    console.log(`PASS ${mode}: Ctrl+F, Enter/Shift+Enter, F3/Shift+F3, wrapping, focus, empty/missing query, wheel sync and native thumb drag`);
  }
  await source.fill('# 短文档\n\n只有一段。');
  await expect(bar).toBeHidden();
  await menu('source'); await expect(bar).toBeHidden();
  await menu('source'); await source.fill(markdown); await expect(bar).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(650, 500));
  await expect.poll(async () => Math.abs(await bar.evaluate(el => el.scrollHeight - el.clientHeight) - (await scrollInfo('source')).range)).toBeLessThan(2);
  await menu('source');
  await page.evaluate(() => window.desktop.savePreferences({ theme: 'night', typewriter: true }));
  await expect(bar).toBeVisible();
  await expect.poll(async () => Math.abs(await bar.evaluate(el => el.scrollHeight - el.clientHeight) - (await scrollInfo('wysiwyg')).range)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/find-scroll-night-narrow.png' });
  // Search across inline formatting and code tokens, literally and without
  // introducing markup or edits into the document being saved.
  await menu('source');
  const formatted = '# Hello heLLo\n\n跨越**粗体**内容。\n\n`RE.G[1]`\n\n```js\nconst token = "RE.G[1]";\n```\n\n| 表头 |\n| --- |\n| RE.G[1] |\n';
  await source.fill(formatted);
  await menu('source');
  await menu('save');
  for (const mode of ['wysiwyg', 'ir']) {
    await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
    await expect(page.locator(`.vditor-${mode} > #write`)).toBeVisible();
    await menu('find');
    for (const [term, count] of [['跨越粗体内容', 1], ['RE.G[1]', 3], ['hello', 2]]) {
      await query.fill(term); await expect(result).toHaveText(`1 / ${count}`);
      await expect(query).toBeFocused();
      expect(await page.evaluate(() => CSS.highlights.get('document-matches').size)).toBe(count);
    }
  }
  await expect(page.locator('#dirty-dot')).toBeHidden();
  await menu('save'); expect(await fs.readFile(fixture, 'utf8')).toBe(formatted);
  await query.press('Escape');
  expect(await page.evaluate(() => CSS.highlights.has('document-matches'))).toBe(false);
  expect(errors).toEqual([]);
  console.log('PASS: short/long edits, resize, dark theme, typewriter, inline/code/table search, case-insensitive literal queries, unchanged Markdown and highlight cleanup');
} catch (error) {
  const page = await app.firstWindow();
  console.log(await page.evaluate(() => { const bar = document.querySelector('#document-scrollbar'), write = document.querySelector('#write'); return { bar: { top: bar.scrollTop, height: bar.clientHeight, scrollHeight: bar.scrollHeight, spacer: bar.innerHTML, rect: bar.firstElementChild.getBoundingClientRect().toJSON() }, write: { top: write.scrollTop, height: write.clientHeight, scrollHeight: write.scrollHeight } }; }));
  await page.screenshot({ path: 'test-results/find-scroll-failure.png' }).catch(() => {});
  console.error('Renderer errors:', errors); throw error;
} finally {
  await app.close();
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
}
