import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// Local images resolve against the document as in Typora: beside it, above its
// folder (a book's chapters/ch01.md showing ../assets/ch01/a.png) and absolute
// paths. Edited blocks and exports keep every path as written.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-image-paths-'));
const png = path.resolve('examples/markdown-test-assets/sample.png');
for (const folder of ['book/assets/ch01', 'book/chapters', 'elsewhere']) await fs.mkdir(path.join(temporary, folder), { recursive: true });
await fs.copyFile(png, path.join(temporary, 'book/assets/ch01/图 1.png'));
await fs.copyFile(png, path.join(temporary, 'book/chapters/beside.png'));
await fs.copyFile(png, path.join(temporary, 'elsewhere/abs.png'));
const absolute = path.join(temporary, 'elsewhere/abs.png');
const doc = path.join(temporary, 'book/chapters/ch01.md');
const images = { 上级目录: '<../assets/ch01/图 1.png>', 同级: 'beside.png', 绝对路径: absolute.replace(/\\/g, '/'), 系统路径: absolute, 文件网址: pathToFileURL(absolute).href };
const text = ['# 章节', '', ...Object.entries(images).flatMap(([alt, src]) => [`![${alt}](${src})`, '']), '<img src="../assets/ch01/图 1.png" width="120">', '', '![缺失](../assets/ch01/missing.png)', '', '正文', ''].join('\n');
await fs.writeFile(doc, text);
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${path.join(temporary, 'profile')}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: path.join(temporary, 'profile') } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  const invoke = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', () => resolve());
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  const dialogs = (open, save) => app.evaluate(({ dialog }, [open, save]) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [open] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: save });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, [open, save]);
  const loaded = () => page.locator('#write img').evaluateAll(list => Object.fromEntries(list.map(image => [image.alt || image.getAttribute('width'), image.complete && image.naturalWidth > 0])));
  for (const mode of ['ir', 'wysiwyg']) {
    await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
    const html = path.join(temporary, `${mode}.html`);
    await dialogs(doc, html); await invoke('open');
    await expect.poll(loaded).toEqual({ 上级目录: true, 同级: true, 绝对路径: true, 系统路径: true, 文件网址: true, 120: true, 缺失: false });
    await expect(page.locator('#write .itypora-image-error')).toHaveCount(1);
    if (mode === 'wysiwyg') await expect(page.locator('#write .itypora-image-source')).toHaveText('![缺失](../assets/ch01/missing.png)');

    // The export embeds them; a missing one keeps its path.
    await invoke('export-html');
    const exported = await fs.readFile(html, 'utf8');
    expect(exported.match(/src="data:image\/png;base64,/g)).toHaveLength(6);
    expect(exported).toContain('src="../assets/ch01/missing.png"');
    expect(exported).not.toContain('itypora-asset:');

    // Typing after each image writes its block again: the path stays as written.
    for (const alt of Object.keys(images)) {
      await page.evaluate(alt => {
        const block = document.querySelector(`#write img[alt="${alt}"]`).closest('p');
        const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
        block.closest('[contenteditable]').focus(); getSelection().removeAllRanges(); getSelection().addRange(range);
      }, alt);
      await page.keyboard.insertText('尾');
    }
    await expect(page.locator('#write p').filter({ hasText: '尾' })).toHaveCount(Object.keys(images).length);
    await invoke('save');
    const saved = await fs.readFile(doc, 'utf8');
    for (const [alt, src] of Object.entries(images)) expect(saved, `${mode}: ${alt}`).toContain(`![${alt}](${src})尾`);
    expect(saved).not.toContain('itypora-asset:');
    await fs.writeFile(doc, text);
    console.log(`PASS ${mode}: images beside, above and outside the document's folder, by absolute path and file URL; export embeds them; edited blocks keep the paths`);
  }
  expect(errors).toEqual([]);
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
