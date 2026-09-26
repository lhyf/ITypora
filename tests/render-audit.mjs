// Capture every section, including overflow pages, rather than sampling a few headings.
import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const label=process.argv[2]||'after';
if(!/^[a-z-]+$/.test(label))throw Error('Invalid label');
const folder=path.resolve('test-results/render-audit',label);await fs.mkdir(folder,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'itypora-audit-'));
const file=path.resolve('examples/Markdown兼容性与显示测试.md');
const original=await fs.readFile(file);
const app=await electron.launch({args:['.'],env:{...process.env,ITYPORA_TEST_USER_DATA:profile}});
try {
 const page=await app.firstWindow();await expect(page.locator('#write')).toBeVisible();
 const invoke=id=>app.evaluate(({Menu,BrowserWindow},id)=>new Promise(resolve=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.ipc.once('action-complete',resolve);const item=Menu.getApplicationMenu().getMenuItemById(id);item.click(item,w);}),id);
 await app.evaluate(({BrowserWindow,dialog},file)=>{BrowserWindow.getAllWindows()[0].setSize(1100,900);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);
 await invoke('open');
 const combinations=process.argv.includes('--all')?['matcha:ir','matcha:wysiwyg','matcha-dark:ir','matcha-dark:wysiwyg']:['matcha:ir'];
 const records=[];
 for(const combination of combinations){
  const [theme,mode]=combination.split(':');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(process.env.APPDATA,'Typora/themes',theme+'.css'));
  await invoke('import-theme');await page.evaluate(mode=>window.desktop.savePreferences({mode}),mode);
  await expect(page.locator('#write .md-diagram-panel > svg')).toHaveCount(8,{timeout:30000});
  await expect(page.locator('#toast')).toBeHidden({timeout:10000});
  await page.evaluate(()=>document.fonts.ready);await page.locator('#write').evaluate(el=>el.blur());
  const metrics=await page.locator('#write').evaluate(root=>{
   const blocks=[...root.children];
   const section=(n)=>{const a=blocks.findIndex(el=>el.tagName==='H2'&&el.textContent.includes(n+'.'));const b=blocks.findIndex((el,i)=>i>a&&el.tagName==='H2'&&/^\d{2}\./.test(el.textContent.trim().replace(/^#+\s*/,'')));return blocks.slice(a,b<0?undefined:b);};
   const html=n=>section(n).map(el=>el.outerHTML).join('\n');
   return {links:html('09'),images:html('10'),footnotes:html('18'),toc:html('19'),meta:blocks[0].outerHTML,code:[...root.querySelectorAll('.md-fences')].slice(0,3).map(el=>el.outerHTML),sections:blocks.filter(el=>el.tagName==='H2'&&/^\d{2}\./.test(el.textContent.trim().replace(/^#+\s*/,''))).map(el=>el.textContent.trim().replace(/^#+\s*/,''))};
  });
  await fs.writeFile(path.join(folder,`${theme}-${mode}-dom.json`),JSON.stringify(metrics,null,2));
  const sections=await page.locator('#write').evaluate(root=>{
   root.scrollTop=0;const rect=root.getBoundingClientRect();
   const title=el=>el.textContent.trim().replace(/^#+\s*/,'');
   const hs=[...root.querySelectorAll(':scope > h2')].filter(el=>/^\d{2}\./.test(title(el)));
   return [{title:'00. 元数据与说明',start:0,end:hs[0].getBoundingClientRect().top-rect.top,height:root.clientHeight},...hs.map((el,i)=>({title:title(el),start:el.getBoundingClientRect().top-rect.top,end:i+1<hs.length?hs[i+1].getBoundingClientRect().top-rect.top:root.scrollHeight,height:root.clientHeight}))];
  });
  for(const s of sections){
   const images=[];
   for(let top=s.start,part=1;top<s.end;top+=s.height-50,part++){
    await page.locator('#write').evaluate((el,top)=>el.scrollTop=top,top);
    const name=`${theme}-${mode}-${s.title.slice(0,2)}-${part}.png`;
    await page.locator('#write').screenshot({path:path.join(folder,name)});images.push(name);
   }
   records.push({theme,mode,title:s.title,images});
  }
  await invoke('source');expect(await sourceEditor(page).value()).toBe(original.toString('utf8'));await invoke('source');
  console.log(`Captured ${combination}: ${sections.length} sections, source unchanged`);
 }
 await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify({fixture:file,sha256:crypto.createHash('sha256').update(original).digest('hex'),records},null,2));
 const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 await fs.writeFile(path.join(folder,'index.html'),`<!doctype html><meta charset="utf-8"><title>Itypora 逐节检查 ${label}</title><style>body{font:16px system-ui;background:#eee;margin:24px}img{max-width:100%;display:block;margin:12px 0}details{background:white;padding:16px;margin:12px 0}summary{cursor:pointer}</style><h1>Itypora 逐节检查：${label}</h1><p>实际 Itypora 截图；不是 Typora 截图，也不表示逐像素一致。</p>${records.map(r=>`<details><summary>${escape(r.theme+' / '+r.mode+' / '+r.title)}</summary>${r.images.map(src=>`<img loading="lazy" src="${src}">`).join('')}</details>`).join('')}`);
 if(label==='after'){
  const beforeFile=path.resolve('test-results/render-audit/before/manifest.json');
  const before=await fs.readFile(beforeFile,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(before){
   const pairs=records.filter(r=>r.theme==='matcha'&&r.mode==='ir').map(r=>({after:r,before:before.records.find(b=>b.theme===r.theme&&b.mode===r.mode&&b.title===r.title)})).filter(r=>r.before);
   await fs.writeFile(path.resolve('test-results/render-audit/compare.html'),`<!doctype html><meta charset="utf-8"><title>Itypora 修复前后对照</title><style>body{font:16px system-ui;background:#eee;margin:24px}details{background:white;padding:16px;margin:12px 0}summary{cursor:pointer}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;display:block;margin:12px 0}h2{font-size:16px;position:sticky;top:0;background:white;padding:8px}</style><h1>Itypora 修复前后对照</h1><p>两侧均为 Itypora：左侧是本轮修复前，右侧是修复后。不是 Typora 自动截图或逐像素差分。</p><p><a href="after/index.html">查看浅色/深色、两种编辑模式的完整截图</a></p>${pairs.map(({before,after})=>`<details><summary>${escape(after.title)}</summary><div class="pair"><section><h2>修复前 · Itypora</h2>${before.images.map(src=>`<img loading="lazy" src="before/${src}">`).join('')}</section><section><h2>修复后 · Itypora</h2>${after.images.map(src=>`<img loading="lazy" src="after/${src}">`).join('')}</section></div></details>`).join('')}`);
  }
 }
 expect(await fs.readFile(file)).toEqual(original);
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close();const rel=path.relative(await fs.realpath(os.tmpdir()),await fs.realpath(profile));if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unsafe cleanup');await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
