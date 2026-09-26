import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Ctrl+/ keeps the caret (or the visible part of the document) in place in both
// directions, and returning from source mode without edits does not re-render.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-sync-'));
const fixture = path.resolve('examples/Markdown兼容性与显示测试.md');
const sample = path.join(temporary, 'sample.md');
await fs.copyFile(fixture, sample);
await fs.cp(path.join(path.dirname(fixture), 'markdown-test-assets'), path.join(temporary, 'markdown-test-assets'), { recursive: true });
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${path.join(temporary, 'profile')}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: path.join(temporary, 'profile') } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1190, 900));
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', () => resolve());
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, sample);
  const source = sourceEditor(page).locator, editor = sourceEditor(page);
  // The source caret's height below the top of the scroll area, its line and the text before it.
  const sourceCaret = () => page.evaluate(() => {
    const cm = document.querySelector('#source-editor .CodeMirror').CodeMirror, scroller = cm.getScrollerElement(), info = cm.getScrollInfo();
    const cursor = cm.getCursor(), value = cm.getValue(), offset = cm.indexFromPos(cursor);
    const clamped = info.top <= 0 || info.top >= info.height - info.clientHeight - 1;
    return { y: cm.cursorCoords(cursor, 'window').top - scroller.getBoundingClientRect().top, clamped, before: value.slice(0, offset), line: cm.getLine(cursor.line) };
  });
  // Puts the rendered caret after `after` in the first element under `selector` containing `text`, 300px below the top.
  const placePreview = (selector, text, after) => page.evaluate(({ selector, text, after }) => {
    const write = document.querySelector('#write');
    const element = [...write.querySelectorAll(selector)].find(e => e.textContent.includes(text) && !e.closest('.vditor-ir__preview, .vditor-wysiwyg__preview, [contenteditable="false"]'));
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (node.data.includes(after) && !node.parentElement.closest('.vditor-ir__preview, .vditor-wysiwyg__preview')) break;
    const range = document.createRange(); range.setStart(node, node.data.indexOf(after) + after.length); range.collapse(true);
    write.focus({ preventScroll: true }); getSelection().removeAllRanges(); getSelection().addRange(range);
    const top = write.getBoundingClientRect().top;
    write.scrollTop += range.getClientRects()[0].top - top - 300;
    return range.getClientRects()[0].top - top;
  }, { selector, text, after });
  const previewCaret = () => page.evaluate(() => {
    const write = document.querySelector('#write'), range = getSelection().getRangeAt(0);
    const block = [...write.children].find(child => child.contains(range.startContainer));
    const before = document.createRange(); before.setStart(block, 0); before.setEnd(range.startContainer, range.startOffset);
    const rect = range.getClientRects()[0] || range.startContainer.parentElement.getBoundingClientRect();
    const clamped = write.scrollTop <= 0 || write.scrollTop >= write.scrollHeight - write.clientHeight - 1;
    return { before: before.toString().replace(/​/g, ''), block: block.textContent, y: rect.top - write.getBoundingClientRect().top, clamped, active: document.activeElement === write };
  });

  for (const mode of ['ir', 'wysiwyg']) {
    await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
    await menu('open');
    await expect(page.locator('#document-name')).toHaveText('sample.md');
    await expect(page.locator('#write svg[aria-roledescription]')).toHaveCount(8, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Rendered → source: the caret follows the text it was after, at the same height.
    for (const [selector, text, after] of [['p', '这是第二段正文', '一个段落'], ['li', '有序列表第二步', '有序列表第二'], ['td', '混合样式', '混合'], ['h2', '15. Mermaid 时序图', 'Mermaid'], ['p', '说明尾部内容', '如果能看到']]) {
      const y = await placePreview(selector, text, after);
      await menu('source');
      await expect(source).toBeVisible();
      await expect.poll(editor.focused).toBe(true);
      const caret = await sourceCaret();
      expect(caret.before.endsWith(after), `${mode} ${text}: source caret after "${caret.before.slice(-20)}"`).toBe(true);
      expect(caret.line, `${mode} ${text}`).toContain(text);
      if (!caret.clamped) expect(Math.abs(caret.y - y), `${mode} ${text}: height ${caret.y} vs ${y}`).toBeLessThan(30);
      await menu('source');
      await expect(source).toBeHidden();
    }

    // Source → rendered.
    for (const [text, after] of [['这是第一段普通正文', '观察中文字体'], ['4. 第四步', '第四'], ['第三行额外缩进', '第三行'], ['## 18. 脚注', '脚注'], ['下面的结果全部留空', '实际观察']]) {
      await menu('source');
      const y = await page.evaluate(({ text, after }) => {
        const cm = document.querySelector('#source-editor .CodeMirror').CodeMirror, value = cm.getValue();
        const offset = value.indexOf(after, value.indexOf(text)) + after.length, position = cm.posFromIndex(offset);
        cm.focus(); cm.setCursor(position);
        const scroller = cm.getScrollerElement(), top = () => cm.cursorCoords(position, 'window').top - scroller.getBoundingClientRect().top;
        cm.scrollTo(null, cm.getScrollInfo().top + top() - 300);
        return top();
      }, { text, after });
      await menu('source');
      await expect(source).toBeHidden();
      const caret = await previewCaret();
      const plain = after.replace(/^\d+\. |^#+ /, '');
      expect(caret.before.endsWith(plain), `${mode} ${text}: preview caret after "${caret.before.slice(-20)}"`).toBe(true);
      expect(caret.block.replace(/\s/g, '')).toContain(text.replace(/^\d+\. |^#+ /, '').replace(/\s/g, ''));
      expect(caret.active).toBe(true);
      if (!caret.clamped) expect(Math.abs(caret.y - y), `${mode} ${text}: height ${caret.y} vs ${y}`).toBeLessThan(30);
    }

    // Without a caret in view, the first visible block stays at the top.
    await page.evaluate(() => {
      const write = document.querySelector('#write'), heading = [...write.querySelectorAll('h2')].find(h => h.textContent.includes('13. Mermaid'));
      write.focus({ preventScroll: true }); getSelection().collapse(write.firstElementChild, 0);
      write.scrollTop += heading.getBoundingClientRect().top - write.getBoundingClientRect().top;
    });
    await menu('source');
    expect((await sourceCaret()).line).toContain('## 13. Mermaid');
    await menu('source');

    // Returning without edits keeps the rendered document; edits re-render it once.
    const diagram = await page.locator('#write svg[aria-roledescription]').first().evaluate(svg => { svg.dataset.kept = 'yes'; return true; });
    expect(diagram).toBe(true);
    await menu('source'); await menu('source');
    await expect(page.locator('#write svg[data-kept="yes"]')).toHaveCount(1);
    await menu('source');
    await editor.select((await editor.value()).indexOf('这是第一段普通正文') + 9);
    await page.keyboard.insertText('【源码编辑】');
    const started = Date.now();
    await menu('source');
    expect(Date.now() - started, `${mode} re-render after a source edit`).toBeLessThan(2000);
    await expect(page.locator('#write p').filter({ hasText: '【源码编辑】' })).toHaveCount(1);
    await expect(page.locator('#write svg[data-kept="yes"]')).toHaveCount(0);
    await expect(page.locator('#write svg[aria-roledescription]')).toHaveCount(8);
    expect((await previewCaret()).before.endsWith('【源码编辑】')).toBe(true);
    await menu('save');
    const saved = await fs.readFile(sample, 'utf8');
    expect(saved).toBe((await fs.readFile(fixture, 'utf8')).replace('这是第一段普通正文', '这是第一段普通正文【源码编辑】'));
    await fs.copyFile(fixture, sample);
    console.log(`PASS ${mode}: caret and scroll follow Ctrl+/ both ways, visible block kept, no re-render without edits, source edits rendered and saved`);
  }
  expect(errors).toEqual([]);
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
