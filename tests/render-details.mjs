import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'itypora-details-'));
const all=await fs.readFile('examples/Markdown兼容性与显示测试.md','utf8');
const sample='---\ntitle: Render audit\n---\n\n'+all.slice(all.indexOf('## 09.'),all.indexOf('## 12.'))+'\n'+all.slice(all.indexOf('## 18.'),all.indexOf('## 21.'))+'\n> [!NOTE]\n\nInline ![small](./markdown-test-assets/sample.png) tail\n\n`https://example.com`\n';
const file=path.join(profile,'sample.md');await fs.writeFile(file,sample);await fs.cp('examples/markdown-test-assets',path.join(profile,'markdown-test-assets'),{recursive:true});
const app=await electron.launch(process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:[`--user-data-dir=${profile}`]}:{args:['.'],env:{...process.env,ITYPORA_TEST_USER_DATA:profile}});
try{
 const page=await app.firstWindow();await expect(page.locator('#write')).toBeVisible();
 const invoke=id=>app.evaluate(({Menu,BrowserWindow},id)=>new Promise(resolve=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.ipc.once('action-complete',resolve);const item=Menu.getApplicationMenu().getMenuItemById(id);item.click(item,w);}),id);
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);await invoke('open');
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(process.env.APPDATA,'Typora/themes/matcha.css'));await invoke('import-theme');
 for(const mode of ['ir','wysiwyg']){
  await page.evaluate(mode=>window.desktop.savePreferences({mode}),mode);
  const bare=page.locator('#write li').filter({hasText:'裸链接扩展'});
  await expect(bare.locator('a, .vditor-ir__link')).toHaveCount(1);
  const mail=page.locator('#write li').filter({hasText:'邮箱链接'});
  await expect(mail.locator('a, .vditor-ir__link')).toHaveText('test@example.com');
  const ordinary=page.locator('#write li').filter({hasText:'普通链接'}).locator('a,.vditor-ir__link');
  const reference=page.locator('#write .itypora-reference-link').filter({hasText:'引用式示例'});
  await expect(reference).toHaveCSS('color',await ordinary.evaluate(el=>getComputedStyle(el).color));
  await expect(page.locator('#write [data-type="link-ref"]').filter({hasText:'引用式示例'})).toHaveAttribute('title','引用式链接标题');
  await expect(page.locator('#write [title="这是链接标题"]')).toHaveCount(1);
  for(const img of await page.locator('#write .itypora-image-only img').all()){
   if(!(await img.getAttribute('src')).includes('sample.png')&&!(await img.getAttribute('src')).includes('%E4%B8%AD'))continue;
   expect(await img.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('p').getBoundingClientRect();return Math.abs(r.left+r.width/2-p.left-p.width/2);})).toBeLessThan(2);
  }
  await expect(page.locator('#write p').filter({hasText:'Inline '}).locator('img')).toHaveCSS('display','inline');
  const html=page.locator('#write [data-type="html-block"] .vditor-ir__preview p, #write [data-type="html-block"] .vditor-wysiwyg__preview p').filter({hasText:'HTML 段落'});
  await expect(html.locator('code')).toHaveCSS('display','inline');
  expect(await html.evaluate(el=>getComputedStyle(el).fontFamily)).toBe(await page.locator('#write').evaluate(el=>getComputedStyle(el).fontFamily));
  await expect(page.locator('#write .md-meta-block')).toHaveCSS('border-radius','12px');
  const toc=page.locator('#write .md-toc');await expect(toc).toHaveCSS('border-radius','14px');
  await expect(toc.locator('.md-toc-content')).toHaveCSS('padding-left','0px');
  const target=toc.locator('[data-itypora-target-id]').filter({hasText:'10. 图片'});await target.click();
  await expect(page.locator('#write h2').filter({hasText:'10. 图片'})).toBeInViewport();
  await expect(page.locator('#write .md-alert')).toHaveCount(1);
  const code=page.locator('#write .hljs-keyword').first();
  expect(await code.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(217, 83, 79)');
  await invoke('source');await sourceEditor(page).toHaveValue(sample);await invoke('source');
  const paragraph=page.locator('#write > p').filter({hasText:'这是锚点目标'});
  await paragraph.evaluate(el=>{el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});await page.keyboard.insertText(' 审计编辑');
  // An edit makes Vditor rebuild the TOC from its outline markup; it must still show one line per entry.
  const rebuilt=async()=>{
   await expect.poll(()=>toc.locator('.md-toc-inner').first().evaluate(el=>el.dataset.targetId===el.dataset.ityporaTargetId)).toBe(true);
   await expect(toc.locator('svg')).toHaveCount(0);
   expect(await toc.locator('.md-toc-item').evaluateAll(items=>Math.max(...items.map(el=>el.getBoundingClientRect().height)))).toBeLessThan(40);
  };
  await rebuilt();await invoke('save');
  const saved=await fs.readFile(file,'utf8');for(const token of ['test@example.com','https://example.com','[example-reference]','"引用式链接标题"','[!NOTE]','[^simple]','<code>inline code</code>','审计编辑'])expect(saved).toContain(token);
  expect(saved).toMatch(/\[toc\]/i);
  expect(/itypora-(?:autolink|task-content|callout-source|target-id)|md-toc-inner|<svg/.test(saved)).toBe(false);
  await page.waitForTimeout(1000);await invoke('format:undo');await expect(paragraph).not.toContainText('审计编辑');await rebuilt();
  await invoke('source');await sourceEditor(page).fill(sample);await invoke('source');
  console.log(`PASS ${mode}: link semantics, image flow, HTML typography, theme hooks, TOC navigation and source`);
 }
}catch(e){await (await app.firstWindow()).screenshot({path:'test-results/render-details-failure.png'});throw e;}
finally{await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close();const rel=path.relative(await fs.realpath(os.tmpdir()),await fs.realpath(profile));if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unsafe cleanup');await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
