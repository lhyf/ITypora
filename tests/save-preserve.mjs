import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Editing and saving must rewrite only the edited blocks of the loaded Markdown.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-save-'));
const fixture = path.resolve('examples/Markdown兼容性与显示测试.md');
const original = await fs.readFile(fixture, 'utf8');
const sample = path.join(temporary, 'sample.md');
const crlfPath = path.join(temporary, 'crlf.md');
const crlf = '﻿# 标题\r\n\r\n第一段。\r\n\r\n| a | b |\r\n| --- | --- |\r\n| `x \\| y` | 2 |\r\n\r\n* 星号列表\r\n* 第二项\r\n';
await fs.cp(path.join(path.dirname(fixture), 'markdown-test-assets'), path.join(temporary, 'markdown-test-assets'), { recursive: true }).catch(() => {});
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${path.join(temporary, 'profile')}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: path.join(temporary, 'profile') } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', () => resolve());
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  const open = async file => {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, file);
    await menu('open');
    await expect(page.locator('#document-name')).toHaveText(path.basename(file));
    await page.waitForTimeout(1500);
  };
  // Types at the end of the last editable text in the first matching element.
  const type = async (selector, includes, text, remove = 0) => {
    const found = await page.evaluate(async ({ selector, includes, text, remove }) => {
      const element = [...document.querySelectorAll(`#write ${selector}`)].find(e => e.textContent.includes(includes) || e.querySelector(`img[alt="${includes}"]`));
      if (!element) return false;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let last = null;
      while (walker.nextNode()) if (walker.currentNode.textContent.trim() && !walker.currentNode.parentElement.closest('[contenteditable="false"], .vditor-ir__marker, .vditor-ir__preview, .vditor-wysiwyg__preview')) last = walker.currentNode;
      const range = document.createRange();
      if (last) { range.setStart(last, last.textContent.replace(/\s+$/, '').length); range.collapse(true); } else { range.selectNodeContents(element); range.collapse(false); }
      element.closest('[contenteditable]').focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      document.execCommand('insertText', false, text);
      await new Promise(resolve => setTimeout(resolve, 700));
      for (let i = 0; i < remove; i++) { document.execCommand('delete'); await new Promise(resolve => setTimeout(resolve, 700)); }
      return true;
    }, { selector, includes, text, remove });
    expect(found, `${selector} ${includes}`).toBe(true);
  };
  const definitions = () => page.evaluate(() => [...document.querySelector('#write').children].map((child, index) => /link-ref-defs-block|footnotes-block/.test(child.dataset.type || '') ? index : -1).filter(index => index >= 0).join());
  // Removes the lines from the one containing `first` through the one containing `last`.
  const cut = (text, first, last) => {
    const lines = text.split('\n'), start = lines.findIndex(line => line.includes(first)), end = lines.findIndex((line, i) => i >= start && line.includes(last));
    expect(start >= 0 && end >= start, `${first} … ${last}`).toBe(true);
    return { rest: [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n'), block: lines.slice(start, end + 1).join('\n') };
  };

  for (const mode of ['ir', 'wysiwyg']) {
    await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
    await fs.writeFile(sample, original);
    await open(sample);
    const placed = await definitions();
    await type('p', '这是第一段普通正文', 'X', 1);
    await menu('save');
    expect(await fs.readFile(sample, 'utf8'), `${mode} revert`).toBe(original);

    await type('p', '这是第一段普通正文', '【改1】');
    await type('p', '这句话应显示在下一行', '【改2】');
    await type('td', '混合样式', '【改3】');
    await type('[data-type="code-block"]', '第一行缩进代码', '【改4】');
    await type('p', '中文空格路径测试', '【改5】');
    await type('[data-type="footnotes-block"] p', '这是脚注正文', '【改6】');
    expect(await definitions(), `${mode} definitions stay in place`).toBe(placed);
    await menu('save');
    let saved = await fs.readFile(sample, 'utf8'), expected = original;
    // The edited indented code block is written back fenced.
    const fenced = '```\n第一行缩进代码\n第二行缩进代码\n    第三行额外缩进【改4】\n```\n';
    expect(saved).toContain(fenced);
    saved = saved.replace(fenced, '第一行缩进代码\n第二行缩进代码\n    第三行额外缩进\n');
    const table = cut(saved, '| 场景', '| 长内容');
    expect(table.block).toContain('混合样式【改3】');
    expect(table.block).toMatch(/\|\s*代码中的竖线\s*\|\s*`a \\\| b`\s*\|/);
    expected = cut(expected, '| 场景', '| 长内容').rest
      .replace('    第一行缩进代码\n    第二行缩进代码\n        第三行额外缩进\n', '第一行缩进代码\n第二行缩进代码\n    第三行额外缩进\n')
      .replace('以及破折号——。', '以及破折号——。【改1】')
      .replace('但仍属于同一个段落。', '但仍属于同一个段落。【改2】')
      .replace('包含 **粗体** 和 `code`。', '包含 **粗体** 和 `code`。【改6】');
    expected = expected.replace('![中文空格路径测试](<./markdown-test-assets/中文 图片.png>)', '![中文空格路径测试](<./markdown-test-assets/中文 图片.png>)【改5】');
    expect(table.rest, `${mode} untouched blocks`).toBe(expected);
    console.log(`PASS ${mode}: reverted edits keep the file, edits rewrite only their blocks, definitions stay in place`);
  }

  await page.evaluate(() => window.desktop.savePreferences({ mode: 'ir' }));
  await fs.writeFile(crlfPath, crlf);
  await open(crlfPath);
  await type('p', '第一段', '改');
  await menu('save');
  expect(await fs.readFile(crlfPath, 'utf8')).toBe(crlf.replace('第一段。', '第一段。改'));
  console.log('PASS: byte order mark, CRLF and untouched list markers survive an edit');
  expect(errors).toEqual([]);
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
