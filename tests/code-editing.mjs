import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-code-editing-'));
const fixture = await fs.readFile('examples/Markdown兼容性与显示测试.md', 'utf8');
const sample = fixture.slice(fixture.indexOf('下面是包含多个段落'), fixture.indexOf('## 05.')) + '\n' +
 fixture.slice(fixture.indexOf('## 10.'), fixture.indexOf('### Python')) + '\n\n最后一段。\n';
const file = path.join(temporary, 'sample.md'); await fs.writeFile(file, sample);
await fs.cp('examples/markdown-test-assets', path.join(temporary, 'markdown-test-assets'), {recursive:true});
const app = await electron.launch(process.argv[2] ? {executablePath:path.resolve(process.argv[2]),args:[`--user-data-dir=${temporary}`]} : {args:['.'],env:{...process.env,ITYPORA_TEST_USER_DATA:temporary}});
try {
 const page = await app.firstWindow(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page.locator('#write')).toBeVisible();
 const invoke=id=>app.evaluate(({Menu,BrowserWindow},id)=>new Promise(resolve=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.ipc.once('action-complete',resolve);const i=Menu.getApplicationMenu().getMenuItemById(id);i.click(i,w);}),id);
 await app.evaluate(({dialog,BrowserWindow},file)=>{BrowserWindow.getAllWindows()[0].setSize(1100,900);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);await invoke('open');
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(process.env.APPDATA,'Typora/themes/matcha.css'));await invoke('import-theme');
 const source=sourceEditor(page);
 // Syntax is drawn by the overlay copy while it matches the source, otherwise by CSS Highlights.
 const painted=()=>page.evaluate(()=>CSS.highlights.size+document.querySelectorAll('#write .itypora-code-overlay [class*="hljs-"]').length);
 for(const mode of ['ir','wysiwyg']){
  await page.evaluate(mode=>window.desktop.savePreferences({mode,codeLineNumbers:false}),mode);
  const code=page.locator('#write .itypora-code-editor > code:not(.itypora-code-overlay)').filter({hasText:'function greet'});
  await expect(code).toBeVisible();
  await expect(page.locator('#write .itypora-image-error')).toHaveCount(2);
  const missing=page.locator('#write .itypora-image-error').filter({hasText:'这是故意缺失的图片'});
  await expect(missing).toContainText('intentionally-missing.png');
  const echo=page.locator('#write .itypora-code-editor').filter({hasText:'echo "Hello ITypora"'});
  const spacing=await echo.evaluate(pre=>{const c=pre.querySelector('code'),r=c.getBoundingClientRect(),p=pre.getBoundingClientRect();return {offset:r.left-p.left,padding:parseFloat(getComputedStyle(pre).paddingLeft),code:c.textContent,margin:getComputedStyle(pre).marginTop};});
  expect(Math.abs(spacing.offset-spacing.padding)).toBeLessThan(1); expect(spacing.code).toBe('echo "Hello ITypora"\n');
  expect(parseFloat(spacing.margin)).toBeGreaterThan(0);
  await echo.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/code-editing-${mode}-list.png`});
  await missing.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/code-editing-${mode}-missing.png`});
  await code.click();
  expect(await code.evaluate(el=>[...el.closest('[data-type="code-block"]').querySelectorAll(':scope > pre')].filter(p=>p.getBoundingClientRect().height>0).length)).toBe(1);
  await expect.poll(painted).toBeGreaterThan(0);
  const before=await code.textContent();
  await code.evaluate(el=>{el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.keyboard.insertText('// 原位编辑\n');await expect(code).toHaveText('// 原位编辑\n'+before);
  await page.keyboard.press('Tab');await page.keyboard.insertText('/* tab */');
  await expect(code).toContainText('    /* tab */');
  await page.keyboard.press('Enter');await expect(code).toContainText('/* tab */\n');
  await expect(code).toContainText('console.log(greet(user));');
  await invoke('save');let saved=await fs.readFile(file,'utf8');expect(saved).toContain('// 原位编辑\n    /* tab */');expect(saved).toContain('function greet');expect(saved).toContain('intentionally-missing.png');
  expect(/itypora-code|itypora-image|vditor-copy|▧/.test(saved)).toBe(false);
  await page.waitForTimeout(1000);
  const edited=await code.textContent();
  await code.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.keyboard.insertText('// UNDO_PROBE');await expect(code).toContainText('UNDO_PROBE');
  await page.waitForTimeout(1000);await invoke('format:undo');await expect(code).toHaveText(edited);
  await invoke('format:redo');await expect(code).toContainText('UNDO_PROBE');
  await page.screenshot({path:`test-results/code-editing-${mode}-active.png`});
  const long='```js\n'+Array.from({length:100},(_,i)=>`console.log(${i});`).join('\n')+'\n```\n';
  await invoke('source');await source.fill(long);await invoke('source');
  const longCode=page.locator('#write .itypora-code-editor > code:not(.itypora-code-overlay)');await expect(longCode).toBeVisible();
  expect(await longCode.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(1000);
  expect(await longCode.evaluate(el=>{const p=el.parentElement;return p.scrollHeight-p.clientHeight;})).toBeLessThan(2);
  await page.evaluate(()=>window.desktop.savePreferences({codeLineNumbers:true}));
  await expect(page.locator('#write .itypora-code-gutter')).toHaveAttribute('data-lines',/99\n100$/);
  const gutter=page.locator('#write .itypora-code-gutter');
  expect(await gutter.evaluate(el=>{const c=el.parentElement.querySelector('code');return el.getBoundingClientRect().right-c.getBoundingClientRect().left-parseFloat(getComputedStyle(c).paddingLeft);})).toBeLessThanOrEqual(1);
  await invoke('source');await source.toHaveValue(long);await source.fill(sample.replace('intentionally-missing.png','sample.png'));await invoke('source');
  await expect(page.locator('#write .itypora-image-error')).toHaveCount(1);
  await invoke('source');await source.fill(sample);await invoke('source');
  console.log(`PASS ${mode}: one editable frame, syntax colors, list spacing, missing source, Tab/edit/save/undo/redo, 100-line auto height and line numbers`);
 }
 await page.evaluate(()=>window.desktop.savePreferences({theme:'night',codeLineNumbers:true}));
 const dark=page.locator('#write .itypora-code-editor').filter({hasText:'function greet'});
 await dark.locator('code:not(.itypora-code-overlay)').click();await expect.poll(painted).toBeGreaterThan(0);
 const keyword=page.locator('#write .vditor-wysiwyg__preview .hljs-keyword').first();
 await expect.poll(async()=>{const color=await keyword.evaluate(el=>getComputedStyle(el).color);const overlay=await dark.locator('.itypora-code-overlay .hljs-keyword').first().evaluate(el=>getComputedStyle(el).color).catch(()=>'');return overlay===color||page.locator('#itypora-code-highlights').textContent().then(css=>css.includes(color));}).toBe(true);
 expect(await dark.locator('.itypora-code-gutter').evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.parentElement.querySelector('code').getBoundingClientRect().top))).toBeLessThan(1);
 await page.screenshot({path:'test-results/code-editing-dark-active.png'});
 await invoke('source');await source.toHaveValue(sample);
 expect(errors).toEqual([]);
}catch(e){const p=await app.firstWindow();await p.screenshot({path:'test-results/code-editing-failure.png'});throw e;}
finally{await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close();const rel=path.relative(await fs.realpath(os.tmpdir()),await fs.realpath(temporary));if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unsafe cleanup');await fs.rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
