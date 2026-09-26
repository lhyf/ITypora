import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-theme-rendering-'));
const fixture = await fs.readFile('examples/Markdown兼容性与显示测试.md', 'utf8');
const sample = fixture.slice(fixture.indexOf('## 05.'), fixture.indexOf('## 09.'));
const file = path.join(temporary, 'rendering.md');
await fs.writeFile(file, sample);
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${temporary}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary } });
const errors = [];
let localThemeLoaded = false;
try {
  const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await expect(page.locator('#write')).toBeVisible();
  await app.evaluate(({BrowserWindow,dialog}, file) => {
    BrowserWindow.getAllWindows()[0].setSize(1100,900);
    dialog.showOpenDialog = async()=>({canceled:false,filePaths:[file]});
    dialog.showMessageBox = async()=>({response:1});
  }, file);
  const invoke = id => app.evaluate(({Menu,BrowserWindow},name)=>new Promise(resolve=>{
    const win=BrowserWindow.getAllWindows()[0]; win.webContents.ipc.once('action-complete',resolve);
    const item=Menu.getApplicationMenu().getMenuItemById(name); item.click(item,win);
  }),id);
  await invoke('open');
  const source = sourceEditor(page);
  for (const theme of ['matcha', 'matcha-dark']) {
    const themePath = path.join(process.env.APPDATA || '', `Typora/themes/${theme}.css`);
    if (!await fs.access(themePath).then(()=>true,()=>false)) { console.log(`SKIP unavailable local theme: ${theme}`); continue; }
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},themePath);
    await invoke('import-theme');
    localThemeLoaded = true;
    for (const mode of ['ir','wysiwyg']) {
      await page.evaluate(mode=>window.desktop.savePreferences({mode}),mode);
      await expect(page.locator('#write input[type="checkbox"]')).toHaveCount(6);
      const done = page.locator('#write .itypora-task-content').filter({hasText:'已勾选样例'});
      await expect(done).toHaveCSS('text-decoration-line','line-through');
      const unchecked = page.locator('#write .itypora-task-content').filter({hasText:'子任务样例 B'});
      await expect(unchecked).toHaveCSS('text-decoration-line','none');
      expect(await done.evaluate(el=>getComputedStyle(el).color)).toBe(await done.evaluate(el=>{
        const probe=document.createElement('span');probe.style.color='var(--c-text-3)';el.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;
      }));
      const checkbox = page.locator('#write input[type="checkbox"]').first();
      await expect(checkbox).toHaveCSS('font-size','16px');
      const links = page.locator(mode==='ir'?'#write .vditor-ir__link':'#write a').filter({hasText:'示例链接'});
      expect(await links.evaluate(el=>getComputedStyle(el).color)).toBe(await links.evaluate(el=>{
        const probe=document.createElement('span');probe.style.color='var(--c-accent-strong)';el.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;
      }));
      const labels = ['笔记','小窍门','划重点','留意','当心'];
      const titles = page.locator('#write .md-alert-text-container');
      await expect(titles).toHaveCount(5);
      for (let i=0;i<labels.length;i++) {
        expect(await titles.nth(i).evaluate(el=>getComputedStyle(el,'::after').content)).toBe(`"${labels[i]}"`);
        await expect(titles.nth(i).locator('svg')).toHaveCount(1);
      }
      const hr = await page.locator('#write hr').first().evaluate(el=>{
        const style=getComputedStyle(el);return {display:style.display,left:parseFloat(style.marginLeft),right:parseFloat(style.marginRight)};
      });
      expect(hr.display).toBe('block');expect(Math.abs(hr.left-hr.right)).toBeLessThan(1);expect(hr.left).toBeGreaterThan(100);
      const table=page.locator('#write table').filter({hasText:'这一格包含较长的中文文本'});
      const widths=await table.evaluate(el=>[...el.rows[0].cells].map(c=>c.getBoundingClientRect().width));
      expect(widths[1]).toBeGreaterThan(widths[0]*2);expect(widths[1]).toBeGreaterThan(widths[2]*2);
      await expect(table.locator('tbody tr').nth(1)).toHaveCSS('border-top-style','none');
      await expect(table.locator('tbody tr').nth(1).locator('td').first()).toHaveCSS('border-top-style','dashed');
      expect(await table.locator('s,del').evaluate(el=>getComputedStyle(el).color)).toBe(await done.evaluate(el=>getComputedStyle(el).color));
      for (const [name,heading] of [['tasks','05.'],['alerts','06.'],['rules','07.'],['tables','08.']]) {
        await page.locator('#write h2').filter({hasText:heading}).evaluate(el=>el.scrollIntoView({block:'start'}));
        await page.screenshot({path:`test-results/theme-${theme}-${mode}-${name}.png`});
      }
      await invoke('source');await source.toHaveValue(sample);await expect(page.locator('#dirty-dot')).toBeHidden();
      // Source mode carries Typora's CodeMirror classes, so the theme's source-mode rules apply.
      const look = await page.evaluate(()=>{
        const editor=document.querySelector('#typora-source .CodeMirror'), size=el=>parseFloat(getComputedStyle(el).fontSize);
        const heading=[...document.querySelectorAll('#typora-source .CodeMirror-line.cm-header2')][0], strong=document.querySelector('#typora-source .cm-strong');
        return {
          heading: heading && size(heading)/size(editor), marker: heading?.querySelector('.cm-header')?.textContent, formatting: document.querySelectorAll('#typora-source .cm-formatting-header, #typora-source .cm-formatting-strong').length,
          strong: strong && [strong.textContent.startsWith('**'), getComputedStyle(strong).fontWeight],
          font: getComputedStyle(editor).fontFamily === getComputedStyle(document.querySelector('.editor-surface')).fontFamily,
          numbers: [...document.querySelectorAll('#typora-source .CodeMirror-linenumber')].filter(n=>getComputedStyle(n).visibility==='visible').length
        };
      });
      expect(look).toEqual({heading:1.4, marker:'## 05. 任务列表', formatting:0, strong:[true,'700'], font:true, numbers:1});
      await invoke('source');
      await checkbox.check();
      await expect(page.locator('#write .itypora-task-content').first()).toHaveCSS('text-decoration-line','line-through');
      const task=page.locator('#write .itypora-task-content').filter({hasText:'包含子任务的父任务'});
      await task.locator('..').locator(':scope > input').check();
      await expect(unchecked).toHaveCSS('text-decoration-line','none');
      await task.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);el.closest('[contenteditable=true]').focus();getSelection().removeAllRanges();getSelection().addRange(r);});
      await page.keyboard.insertText(' 编辑验证');
      await invoke('save');
      const saved=await fs.readFile(file,'utf8');
      expect(saved).toMatch(/- \[[xX]\] +待办样例/);expect(saved).toContain('父任务 编辑验证');
      expect(saved).toMatch(/- \[ \] +子任务样例 B/);
      for (const type of ['NOTE','TIP','IMPORTANT','WARNING','CAUTION']) expect(saved).toContain(`[!${type}]`);
      expect(saved).not.toMatch(/itypora-|<svg|md-alert-text|✏️ Note/);
      expect(saved.match(/- \[[ xX]\]/g)).toHaveLength(6);
      await invoke('source');await source.fill(sample);await invoke('save');await invoke('source');
      console.log(`PASS ${theme}/${mode}: tasks, alerts, links, centered rules, intrinsic table columns, checkbox/edit/save source`);
    }
  }
  for (const mode of ['ir','wysiwyg']) {
    await page.evaluate(mode=>window.desktop.savePreferences({mode}),mode);
    const edge='- [x] Loose checked\n\n- [ ] Loose open\n\n> [!NOTE] Custom Note\n> Body\n';
    await invoke('source');await source.fill(edge);await invoke('source');await invoke('save');
    const loose=page.locator('#write .vditor-task > p').first();
    await expect(loose).toHaveCSS('text-decoration-line','line-through');
    if (localThemeLoaded) await expect(loose.locator('input')).toHaveCSS('position','absolute');
    const task=page.locator('#write .vditor-task > p').last();
    await task.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);el.closest('[contenteditable=true]').focus();getSelection().removeAllRanges();getSelection().addRange(r);});
    await page.keyboard.insertText(' changed');await expect(page.locator('#dirty-dot')).toBeVisible();await invoke('save');
    expect(await fs.readFile(file,'utf8')).toContain('Custom Note');
    expect(await fs.readFile(file,'utf8')).toMatch(/- \[ \] +Loose open changed/);
    await invoke('format:undo');
    await expect(page.locator('#write .vditor-task').last()).not.toContainText('changed');
    await invoke('format:redo');
    await expect(page.locator('#write .vditor-task').last()).toContainText('changed');
    console.log(`PASS ${mode}: loose tasks, custom alert title, edit and undo/redo`);
  }
  expect(errors).toEqual([]);
} catch(error) {
  await (await app.firstWindow()).screenshot({path:'test-results/theme-rendering-failure.png'});throw error;
} finally {
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close();
  const rel=path.relative(await fs.realpath(os.tmpdir()),await fs.realpath(temporary));
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unsafe cleanup');
  await fs.rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
