import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-drop-'));
const data = path.join(temporary, 'profile');
const first = path.join(temporary, '中文 拖入 #% 文档.MD');
const second = path.join(temporary, '第二份.markdown');
const third = path.join(temporary, '第三份.mdown');
const text = path.join(temporary, '纯文本.txt');
const original = '\uFEFF# 拖入文档\r\n\r\n原始 **内容**。\r\n\r\n![本地图片](pixel.png)\r\n';
await fs.mkdir(data);
await fs.writeFile(first, original);
await fs.writeFile(second, '# 第二份\n\n第二份正文\n');
await fs.writeFile(third, '# 第三份\n\n第三份正文\n');
await fs.writeFile(text, '纯文本正文\n');
await fs.writeFile(path.join(temporary, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aElQAAAAASUVORK5CYII=', 'base64'));
await fs.mkdir('test-results', { recursive: true });
const executablePath = process.argv[2];
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${data}`] }
  : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: data } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  const session = await page.context().newCDPSession(page);
  // CDP supplies disk-backed native Files, exercising webUtils and the real IPC.
  const drop = async (files, target = '#write') => {
    const box = await page.locator(target).boundingBox();
    if (!box) throw new Error(`Hidden drop target: ${target}`);
    const x = box.x + Math.min(box.width / 2, 80);
    const y = box.y + Math.min(box.height / 2, 40);
    const data = { items: [], files, dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await session.send('Input.dispatchDragEvent', { type, x, y, data });
    }
  };
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', () => resolve());
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  const dialogs = async (response, saveCanceled = false) => app.evaluate(({ dialog }, options) => {
    globalThis.dropPrompts = 0;
    dialog.showMessageBox = async () => { globalThis.dropPrompts++; return { response: options.response }; };
    dialog.showSaveDialog = async () => ({ canceled: options.saveCanceled });
    dialog.showOpenDialog = async () => { throw new Error('A drop must not show the file picker'); };
  }, { response, saveCanceled });
  const replaced = async file => {
    await expect(page.locator('#document-name')).toHaveText(path.basename(file));
    await expect(page.locator('#dirty-dot')).toBeHidden();
  };
  const promptFinished = async () => {
    await expect.poll(() => app.evaluate(() => globalThis.dropPrompts)).toBe(1);
    await expect.poll(() => page.evaluate(() => document.querySelector('#source-editor .CodeMirror').CodeMirror.getOption('readOnly'))).toBe(false);
  };

  await dialogs(2);
  // The regular open channel must continue to reject arbitrary renderer paths.
  const restricted = await page.evaluate(async file => {
    try { await window.desktop.open(file); return false; } catch { return true; }
  }, first);
  expect(restricted).toBe(true);
  await drop([first]);
  await replaced(first);
  await expect(page.locator('#write')).toContainText('拖入文档');
  await expect.poll(() => page.locator('#write img').first().evaluate(image => image.naturalWidth)).toBe(1);
  await expect.poll(async () => JSON.parse(await fs.readFile(path.join(data, 'recent.json'), 'utf8'))[0]).toBe(first);
  await menu('save');
  expect(await fs.readFile(first, 'utf8')).toBe(original);
  console.log('PASS: native drop opens a Chinese path with spaces, # and %, resolves local images, remembers it and preserves BOM/CRLF');

  // File navigation is prevented and unsupported/multiple files leave text alone.
  const entry = page.url();
  await drop([path.join(temporary, 'pixel.png')]);
  await expect(page.locator('#toast')).toContainText('请拖入 Markdown 或文本文件');
  await replaced(first);
  expect(page.url()).toBe(entry);
  await drop([first, second]);
  await expect(page.locator('#toast')).toContainText('请一次拖入一个');
  await replaced(first);
  const forged = await page.evaluate(async () => {
    try { await window.desktop.openDropped(new File(['# 假文件'], 'fake.md')); return false; } catch { return true; }
  });
  expect(forged).toBe(true);
  await replaced(first);
  // A text-only drag still reaches the editor rather than the document opener.
  expect(await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.setData('text/plain', '正文');
    const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer });
    document.querySelector('.statusbar').dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(false);
  console.log('PASS: invalid/multiple drops and forged Files are rejected; text drags and the restricted open channel are preserved');

  // Typing then immediately dropping must flush Vditor's debounced input.
  await page.locator('#write p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('拖入前即时输入');
  await dialogs(0);
  await drop([second]);
  await replaced(second);
  expect(await fs.readFile(first, 'utf8')).toContain('拖入前即时输入');
  expect(await app.evaluate(() => globalThis.dropPrompts)).toBe(1);
  console.log('PASS: save-before-drop includes immediate rendered-editor input');

  await menu('source');
  await sourceEditor(page).fill('# 未保存修改\n\n需要保留');
  await dialogs(2);
  await drop([third], '#source-editor .CodeMirror');
  await promptFinished();
  await sourceEditor(page).toHaveValue('# 未保存修改\n\n需要保留');
  await expect(page.locator('#document-name')).toHaveText(path.basename(second));
  await expect(page.locator('#dirty-dot')).toBeVisible();
  await dialogs(1);
  await drop([third], '#source-editor .CodeMirror');
  await replaced(third);
  await sourceEditor(page).toHaveValue('# 第三份\n\n第三份正文\n');
  expect(await fs.readFile(second, 'utf8')).toBe('# 第二份\n\n第二份正文\n');
  console.log('PASS: source-mode drops respect cancel and discard without altering the old file');

  await sourceEditor(page).fill('# 同文件待保存\n\n保存后重读');
  await dialogs(0);
  await drop([third], '#source-editor .CodeMirror');
  await promptFinished();
  await expect(page.locator('#dirty-dot')).toBeHidden();
  await sourceEditor(page).toHaveValue('# 同文件待保存\n\n保存后重读');
  expect(await fs.readFile(third, 'utf8')).toBe('# 同文件待保存\n\n保存后重读');
  console.log('PASS: dropping the same file saves first, then reads the saved contents');

  await menu('new');
  await sourceEditor(page).fill('# 新建未保存文档');
  await dialogs(0, true);
  await drop([second], '#source-editor .CodeMirror');
  await promptFinished();
  await sourceEditor(page).toHaveValue('# 新建未保存文档');
  await expect(page.locator('#document-name')).toHaveText('未命名');
  await expect(page.locator('#dirty-dot')).toBeVisible();
  await dialogs(1);
  await drop([second], '.statusbar');
  await replaced(second);
  console.log('PASS: canceled Save As preserves an untitled draft; files can also be dropped on the status bar');

  await page.evaluate(() => window.desktop.savePreferences({ mode: 'wysiwyg' }));
  await menu('source');
  await expect(page.locator('.vditor-wysiwyg #write')).toBeVisible();
  await drop([first]);
  await replaced(first);
  await expect(page.locator('.vditor-wysiwyg #write')).toContainText('拖入文档');
  await menu('sidebar');
  await drop([text], '.sidebar');
  await replaced(text);
  await expect(page.locator('#write')).toContainText('纯文本正文');
  await menu('appearance');
  await expect(page.locator('#preferences')).toBeVisible();
  await drop([second], '#preferences');
  await replaced(second);
  await expect(page.locator('#preferences')).toBeHidden();
  console.log('PASS: WYSIWYG mode, sidebar and preferences drops all use the document opening flow');

  const invalid = path.join(temporary, 'UTF16.md');
  const oversized = path.join(temporary, 'oversized.md');
  await fs.writeFile(invalid, Buffer.from([0xff, 0xfe, 65, 0]));
  await fs.writeFile(oversized, Buffer.alloc(10 * 1024 * 1024 + 1, 65));
  await drop([invalid]);
  await expect(page.locator('#toast')).toContainText('二进制或 UTF-16');
  await replaced(second);
  await drop([oversized]);
  await expect(page.locator('#toast')).toContainText('10 MB');
  await replaced(second);
  await drop([third]);
  await replaced(third);
  await expect(page.locator('#write h1')).toContainText('同文件待保存');
  expect(page.url()).toBe(entry);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/drop-open.png' });
  console.log('PASS: file validation errors preserve the current document and later drops still work; no renderer errors');
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  const root = await fs.realpath(os.tmpdir());
  const real = await fs.realpath(temporary);
  if (path.relative(root, real).startsWith('..')) throw new Error('Unsafe test cleanup path');
  await fs.rm(real, { recursive: true, force: true });
}
