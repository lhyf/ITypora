import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// File > 导出 > HTML / PDF: a standalone page that looks like the rendered
// document, with working links, and a PDF of it with bookmarks.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-export-'));
const fixture = path.resolve('examples/Markdown兼容性与显示测试.md');
const sample = path.join(temporary, 'sample.md');
await fs.copyFile(fixture, sample);
await fs.cp(path.join(path.dirname(fixture), 'markdown-test-assets'), path.join(temporary, 'markdown-test-assets'), { recursive: true });
const output = path.join(temporary, 'out');
await fs.mkdir(output);
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${path.join(temporary, 'profile')}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: path.join(temporary, 'profile') } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; if (window.isMaximized()) window.unmaximize(); window.setContentSize(1190, 900); });
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', () => resolve());
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  const choose = file => app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, file);
  const saveTo = file => app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => file ? { canceled: false, filePath: file } : { canceled: true }; }, file);
  expect(await app.evaluate(({ Menu }) => ['export-html', 'export-pdf'].map(id => Menu.getApplicationMenu().getMenuItemById(id)?.label))).toEqual(['HTML…', 'PDF…']);
  const theme = path.join(process.env.APPDATA || '', 'Typora/themes/matcha.css');
  if (await fs.access(theme).then(() => true, () => false)) { await choose(theme); await menu('import-theme'); } else console.log('SKIP Matcha theme: not installed');
  await choose(sample);
  const source = sourceEditor(page);
  // Opens an exported page in its own window, as a browser would.
  const view = async file => {
    const count = app.windows().length;
    await app.evaluate(async ({ BrowserWindow }, file) => {
      // Wider by the page's scroll bar (the editor hides its own): the same text width.
      const window = new BrowserWindow({ width: 1205, height: 900, show: true, useContentSize: true, webPreferences: { sandbox: true, contextIsolation: true } });
      await window.loadFile(file);
    }, file);
    await expect.poll(() => app.windows().length).toBe(count + 1);
    const opened = app.windows().at(-1);
    await opened.waitForLoadState();
    return opened;
  };
  // Computed styles of elements found by their text, in the editor or an exported page.
  const styles = target => target.evaluate(() => {
    const names = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding-left', 'border-radius', 'text-align'];
    const find = (selector, text) => [...document.querySelectorAll(`#write ${selector}`)].find(element => element.textContent.includes(text));
    const probes = { heading: ['h2', '03.'], paragraph: ['p', '这是第一段普通正文'], alert: ['.md-alert', '说明：检查提示标题'], cell: ['td', '混合样式'], code: ['pre.md-fences', 'console.log'], inline: ['code', 'code'], toc: ['.md-toc', '目录'], task: ['li.vditor-task', '待办样例'] };
    return Object.fromEntries(Object.entries(probes).map(([key, [selector, text]]) => {
      const element = find(selector, text);
      if (!element) return [key, null];
      const style = getComputedStyle(element);
      return [key, { ...Object.fromEntries(names.map(name => [name, style.getPropertyValue(name)])), width: Math.round(element.getBoundingClientRect().width) }];
    }));
  });

  for (const mode of ['ir', 'wysiwyg']) {
    await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
    await menu('open');
    await expect(page.locator('#write svg[aria-roledescription]')).toHaveCount(8, { timeout: 30000 });
    await page.locator('#write h2').first().evaluate(heading => heading.scrollIntoView());
    const editorStyles = await styles(page);
    const checked = await page.locator('#write input[type="checkbox"]').evaluateAll(inputs => inputs.filter(input => input.checked).length);
    // Typora colors diff lines without a background, in the editor too.
    expect(await page.locator('#write .md-fences .hljs-deletion').first().evaluate(token => getComputedStyle(token).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

    // A cancelled dialog writes nothing.
    await saveTo(null); await menu('export-html');
    expect(await fs.readdir(output)).toEqual([]);

    // HTML: one file, no editing machinery, images embedded.
    const html = path.join(output, `${mode}.html`);
    await saveTo(html); await menu('export-html');
    await expect(page.locator('#toast')).toHaveText(`已导出到 ${html}`);
    const text = await fs.readFile(html, 'utf8');
    expect(text.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(text).toContain('<title>sample</title>');
    const body = text.slice(text.indexOf('<body'));
    expect(text).not.toContain('<script');
    for (const leftover of ['itypora-asset:', 'contenteditable', 'itypora-code-overlay', 'vditor-copy', 'author: 测试用户', '[example-reference]:']) expect(body, `${mode}: ${leftover}`).not.toContain(leftover);
    // Markdown markers; the code block keeps the class its look depends on.
    expect(body).not.toMatch(/vditor-ir__marker(?!--pre)/);
    expect(text.match(/src="data:image\/png;base64,/g)).toHaveLength(3);
    const exported = await view(html);
    await expect(exported.locator('#write svg[aria-roledescription]')).toHaveCount(8);
    await expect(exported.locator('#write mjx-container')).toHaveCount(10);
    expect(await exported.locator('#write img').evaluateAll(images => images.filter(image => image.naturalWidth > 0).length)).toBe(3);
    expect(await exported.locator('#write input[type="checkbox"]').evaluateAll(inputs => inputs.filter(input => input.checked).length)).toBe(checked);
    // Links work: plain, reference, email, table of contents and footnotes both ways.
    const links = await exported.evaluate(() => {
      const target = link => { const id = decodeURIComponent(link.getAttribute('href').slice(1)); return Boolean(document.getElementById(id)); };
      const anchors = [...document.querySelectorAll('#write a[href]')];
      const by = text => anchors.find(link => link.textContent.trim() === text)?.getAttribute('href');
      return {
        plain: by('示例链接'), reference: by('引用式示例'), email: by('test@example.com'),
        toc: [...document.querySelectorAll('#write .md-toc a')].map(target), footnotes: [...document.querySelectorAll('#write sup a, #write .reversefootnote')].map(target)
      };
    });
    expect(links.plain).toBe('https://example.com');
    expect(links.reference).toBe('https://example.com');
    expect(links.email).toBe('mailto:test@example.com');
    expect(links.toc.length).toBeGreaterThan(20);
    expect(links.toc.every(Boolean), `${mode}: table of contents targets`).toBe(true);
    expect(links.footnotes.length).toBeGreaterThanOrEqual(6);
    expect(links.footnotes.every(Boolean), `${mode}: footnote targets`).toBe(true);
    await expect(exported.locator('#write .md-fences .hljs-keyword').first()).toBeVisible();
    // As in Typora's export: <details> holds the Markdown up to </details>, a
    // comment stays a comment, the footnotes gather at the end, diff lines
    // have no background and the editor's block labels are gone.
    const typora = await exported.evaluate(() => {
      const write = document.querySelector('#write'), comments = [];
      const walker = document.createTreeWalker(write, NodeFilter.SHOW_COMMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) comments.push(node.nodeValue.trim());
      return {
        details: [...write.querySelector('details').children].map(child => child.tagName),
        source: ['</details>', '隐藏注释样例'].filter(text => write.innerText.includes(text)), comment: comments.some(text => text.startsWith('隐藏注释样例')),
        last: write.lastElementChild.className, lines: [...write.querySelectorAll('.footnotes-area > .footnote-line')].map(line => line.textContent.replace(/\s+/g, ' ')),
        definitions: write.querySelectorAll('.md-def-name, [data-type="footnotes-block"]').length,
        diff: getComputedStyle(write.querySelector('.hljs-deletion')).backgroundColor,
        labels: [...write.querySelectorAll('div, .vditor-toc')].filter(element => ['"</>"', '"$$"', '"ToC"'].includes(getComputedStyle(element, '::before').content)).length
      };
    });
    expect(typora.details).toEqual(['SUMMARY', 'P', 'UL']);
    expect(typora.source).toEqual([]);
    expect(typora.comment).toBe(true);
    expect(typora.last).toBe('footnotes-area');
    expect(typora.lines).toHaveLength(2);
    expect(typora.lines[0]).toMatch(/^1 这是脚注正文，包含 粗体 和 code。 ↩ ↩$/);
    expect(typora.lines[1]).toMatch(/^2 这是多段脚注的第一段。 ↩这是第二段/);
    expect(typora.definitions).toBe(0);
    expect(typora.diff).toBe('rgba(0, 0, 0, 0)');
    expect(typora.labels).toBe(0);
    await expect(exported.locator('#write details p').first()).toBeHidden();
    await exported.locator('#write details > summary').click();
    await expect(exported.locator('#write details p').first()).toBeVisible();
    // Looks like the editor: the same computed styles and widths.
    await exported.locator('#write h2').first().evaluate(heading => heading.scrollIntoView());
    expect(await styles(exported), `${mode}: exported styles`).toEqual(editorStyles);
    await exported.screenshot({ path: `test-results/export-${mode}.png` });
    await exported.close();

    // PDF: A4 pages with the document's bookmarks and links.
    const pdf = path.join(output, `${mode}.pdf`);
    await saveTo(pdf); await menu('export-pdf');
    await expect(page.locator('#toast')).toHaveText(`已导出到 ${pdf}`);
    const bytes = await fs.readFile(pdf, 'latin1');
    expect(bytes.startsWith('%PDF-')).toBe(true);
    expect((bytes.match(/\/Type\s*\/Page\b/g) || []).length).toBeGreaterThan(15);
    expect(bytes).toContain('/Outlines');
    expect(bytes).toContain('/URI (https://example.com/)');
    // Footnote and table of contents links jump within the document.
    expect((bytes.match(/\/Dest \//g) || []).length).toBeGreaterThan(20);
    expect(bytes).toMatch(/\/MediaBox \[0 0 59[45]\.\d+ 841\.\d+\]/);
    await fs.rm(html); await fs.rm(pdf);
    console.log(`PASS ${mode}: HTML (standalone, clean, same styles, links, contents, footnote area, details, comments, diff) and PDF (A4, bookmarks, links); cancel writes nothing`);
  }

  // Source mode exports the current text without leaving source mode.
  await menu('source');
  await source.select((await source.value()).indexOf('这是第一段普通正文'));
  await page.keyboard.insertText('源码模式导出验证');
  const html = path.join(output, 'source.html');
  await saveTo(html); await menu('export-html');
  const text = await fs.readFile(html, 'utf8');
  expect(text).toContain('源码模式导出验证这是第一段普通正文');
  expect(text.match(/aria-roledescription/g)?.length).toBeGreaterThanOrEqual(8);
  await expect(page.locator('#source-editor')).toBeVisible();
  await expect(page.locator('#editor')).toBeHidden();
  expect(await source.focused()).toBe(true);
  await menu('source');
  await expect(page.locator('#write p').filter({ hasText: '源码模式导出验证' })).toHaveCount(1);
  expect(await fs.readFile(sample, 'utf8')).toBe(await fs.readFile(fixture, 'utf8'));
  console.log('PASS source mode: exports the unsaved text, stays in source mode');
  expect(errors).toEqual([]);
} catch (error) {
  await (await app.firstWindow()).screenshot({ path: 'test-results/export-failure.png' }).catch(() => {});
  throw error;
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
