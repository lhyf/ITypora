import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-formatting-'));
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${temporary}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible();
  const invoke = async id => {
    await expect.poll(() => app.evaluate(({ Menu }, name) => Menu.getApplicationMenu().getMenuItemById(name)?.enabled, id)).toBe(true);
    await app.evaluate(({ Menu, BrowserWindow }, name) => new Promise(resolve => {
      const window = BrowserWindow.getAllWindows()[0];
      window.webContents.ipc.once('action-complete', () => resolve());
      const item = Menu.getApplicationMenu().getMenuItemById(name); item.click(item, window);
    }), id);
  };
  const editor = sourceEditor(page);
  async function source(text) {
    if (await editor.locator.isHidden()) await invoke('source');
    await editor.fill(text);
  }
  async function position(start, end = start) { await editor.select(start, end); }
  const value = () => page.evaluate(async () => (await window.desktop.preferencesCommand('get')).settings);
  async function markdown() {
    const inSource = await editor.locator.isVisible();
    if (!inSource) await invoke('source');
    const result = await editor.value();
    if (!inSource) await invoke('source');
    return result;
  }
  // Native source commands target only the selected text and have a working undo step.
  await source('Before text after'); await position(7,11); await invoke('format:highlight');
  await editor.toHaveValue('Before ==text== after');
  await invoke('format:undo'); await editor.toHaveValue('Before text after');
  await invoke('format:redo'); await editor.toHaveValue('Before ==text== after');
  const table = '| A | B |\n| --- | --- |\n| first | second |\n';
  await source(table); await position(table.indexOf('second')); await invoke('format:table-column-before');
  await editor.toHaveValue(/\| A \|  \| B \|/);
  await source('## Heading\n\nTail'); await position(5); await invoke('format:heading-up');
  await editor.toHaveValue('# Heading\n\nTail');
  await source('paragraph'); await position(3);
  await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('format:table-row-after').enabled)).toBe(false);

  for (const mode of ['ir', 'wysiwyg']) {
    await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
    await expect.poll(async () => (await value()).mode).toBe(mode);
    async function rich(text, selector = 'p', selectText = false) {
      await source(text); await invoke('source');
      await expect(page.locator(mode === 'ir' ? '.vditor-ir #write' : '.vditor-wysiwyg #write')).toBeVisible();
      await page.locator(text ? '#write ' + selector : '#write').first().evaluate((el, select) => {
        el.closest('[contenteditable]').focus();
        const range = document.createRange(); range.selectNodeContents(el); if (!select) range.collapse(true);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      }, selectText);
    }
    await rich('Heading\n\nUnchanged **tail**.'); await invoke('format:h2');
    await expect(page.locator('#write h2')).toContainText('Heading');
    await invoke('format:heading-up'); await expect(page.locator('#write h1')).toContainText('Heading');
    await invoke('format:paragraph'); await expect(page.locator('#write h1')).toHaveCount(0);
    expect(await markdown()).toContain('Unchanged **tail**.');

    await rich('Selected\n\nUntouched.', 'p', true); await invoke('format:highlight');
    await expect(page.locator('#write mark')).toContainText('Selected');
    await invoke('format:undo'); await expect(page.locator('#write mark')).toHaveCount(0);
    await invoke('format:redo'); await expect(page.locator('#write mark')).toContainText('Selected');
    await page.locator('#write mark').first().evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await invoke('format:highlight'); await expect(page.locator('#write mark')).toHaveCount(0);
    expect(await markdown()).toContain('Untouched.');

    for (const [command, match] of [['underline', '<u>Selected</u>'], ['superscript', '^Selected^'], ['subscript', '~Selected~'], ['inline-math', '$Selected$'], ['math', '$$'], ['code', '```'], ['alert:NOTE', '[!NOTE]'], ['footnote', '[^note1]'], ['link-reference', '[ref1]']]) {
      await rich('Selected\n\nUntouched.', 'p', true); await invoke('format:' + command);
      if (command === 'math' || command === 'inline-math') await expect(page.locator('#write mjx-container').first()).toBeAttached();
      const result = await markdown(); expect(result, `${mode} ${command}`).toContain(match); expect(result).toContain('Untouched.');
      expect(result).not.toContain('ITyporaCaret');
    }
    await rich(table, 'tbody td:nth-child(2)'); await invoke('format:table-align-right');
    expect(await markdown()).toMatch(/---:/);
    await rich(table, 'tbody td:nth-child(2)'); await invoke('format:table-column-before');
    await expect(page.locator('#write th')).toHaveCount(3);
    await rich(table, 'tbody td:nth-child(2)'); await invoke('format:table-row-after');
    await expect(page.locator('#write tbody tr')).toHaveCount(2);
    await rich(table, 'tbody td:nth-child(2)'); await invoke('format:table-column-delete');
    await expect(page.locator('#write th')).toHaveCount(1);
    await rich('- [ ] Todo\n\nTail', 'li'); await invoke('format:task-done');
    expect(await markdown()).toMatch(/\[[xX]\]/);
    await rich('```js\nconst a = 1;\n```\n\nTail', '[data-type="code-block"] code'); await invoke('format:code-language:python');
    expect(await markdown()).toContain('```python');
    await rich('```js\nconst a = 1;\n```\n\nTail', '[data-type="code-block"] code'); await invoke('format:code-unfence');
    const unfenced = await markdown(); expect(unfenced).toContain('const a = 1;'); expect(unfenced).not.toContain('```');
    await rich('- First\n- Second', 'li:nth-child(2)'); await invoke('format:indent');
    await expect(page.locator('#write li li')).toHaveCount(1);
    await invoke('format:outdent'); await expect(page.locator('#write li li')).toHaveCount(0);
    await rich('Before\n\nAfter'); await invoke('format:insert-after'); await page.keyboard.insertText('Inserted');
    const inserted = await markdown(); expect(inserted.indexOf('Inserted')).toBeGreaterThan(inserted.indexOf('Before')); expect(inserted.indexOf('Inserted')).toBeLessThan(inserted.indexOf('After'));
    await rich('# Title\n\nBody', 'h1'); await invoke('format:yaml');
    expect(await markdown()).toMatch(/^---\ntitle:/);
    await rich('# Title\n\nBody', 'p'); await invoke('format:toc');
    expect((await markdown()).toLowerCase()).toContain('[toc]');
    await rich('Label\n\nTail', 'p', true); await invoke('format:image');
    expect(await markdown()).toContain('![Label](image.png)');
    await rich(''); await invoke('format:table'); await page.locator('#table-confirm').click(); await expect(page.locator('#write table')).toHaveCount(1);
    await rich(''); await invoke('format:math'); await expect(page.locator('#write mjx-container').first()).toBeAttached();
    console.log(`PASS: ${mode} headings, inline styles, undo/redo, formulas, alerts, references, tables, tasks, code, YAML and TOC`);
  }
  expect(errors).toEqual([]);
} catch (error) {
  const page = await app.firstWindow();
  console.error('Renderer errors:', errors);
  console.error('Toast:', await page.locator('#toast').textContent());
  await page.screenshot({ path: 'test-results/formatting-failure.png' });
  throw error;
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(temporary));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe cleanup');
  await fs.rm(temporary, { recursive: true, force: true });
}
