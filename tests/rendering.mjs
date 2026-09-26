import { _electron as electron, expect } from '@playwright/test';
import { sourceEditor } from './source-editor.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-rendering-'));
const fixture = path.resolve('examples/Markdown兼容性与显示测试.md');
const original = await fs.readFile(fixture, 'utf8');
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${temporary}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: temporary } });
const errors = [], requests = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => requests.push(r.url()));
  await expect(page.locator('#write')).toBeVisible();
  await app.evaluate(async ({BrowserWindow,dialog,clipboard,ClipboardItem}, file) => {
    globalThis.renderClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))));
    BrowserWindow.getAllWindows()[0].setSize(1100,900);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
    dialog.showMessageBox=async()=>({response:1});
  },fixture);
  const invoke = id => app.evaluate(({Menu,BrowserWindow},name)=>new Promise(resolve=>{
    const win=BrowserWindow.getAllWindows()[0];win.webContents.ipc.once('action-complete',resolve);
    const item=Menu.getApplicationMenu().getMenuItemById(name);item.click(item,win);
  }),id);
  const source=sourceEditor(page);
  const diagrams=page.locator('#write .md-diagram-panel > svg');
  const ready=async()=>{
    await expect(diagrams).toHaveCount(8,{timeout:30000});
    await expect(page.locator('#write mjx-container')).toHaveCount(10);
    await expect(page.locator('#write .diagram-error, #write .vditor-reset--error')).toHaveCount(0);
  };
  const screenshot=async(mode,name,heading)=>{
    await page.locator('#write h2').filter({hasText:heading}).evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.screenshot({path:`test-results/rendering-${mode}-${name}.png`});
  };
  const checkTableWidth = async () => {
    const table = page.locator('#write table').filter({hasText:'星号粗体'});
    const bounds = await table.evaluate(el => {
      const row = el.rows[0].getBoundingClientRect(), box = el.getBoundingClientRect();
      return { row: row.width, available: el.clientWidth, offset: row.left - box.left, overflow: el.scrollWidth - el.clientWidth };
    });
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    expect(bounds.row).toBeGreaterThan(bounds.available - 5);
    expect(bounds.offset).toBeLessThanOrEqual(3);
  };
  await invoke('open');
  for (const mode of ['ir','wysiwyg']) {
    if (mode === 'wysiwyg') await page.evaluate(()=>window.desktop.savePreferences({mode:'wysiwyg'}));
    await ready();
    await checkTableWidth();
    await screenshot(mode,'inline-table','03. 行内格式');
    await expect(page.locator('#write h1, #write h2, #write h3, #write h4, #write h5, #write h6')).toHaveCount(50);
    for (const cell of await page.locator('#write [align]').all()) expect(await cell.evaluate(el=>getComputedStyle(el).textAlign)).toBe(await cell.getAttribute('align'));
    const sized=page.locator('#write img[width="240"]');
    await expect(sized).toHaveCount(1);
    await expect.poll(()=>sized.evaluate(el=>el.naturalWidth)).toBe(480);
    expect(await sized.evaluate(el=>el.getBoundingClientRect().width)).toBe(240);
    await expect(page.locator('#write img').filter({visible:true})).toHaveCount(3);
    await expect(page.locator('#write .itypora-image-error')).toHaveCount(2);
    const html=page.locator('#write p').filter({hasText:'HTML 对照：'});
    await expect(html.locator('mark')).toHaveText('高亮文本');
    await expect(html.locator('sub')).toHaveText('2'); await expect(html.locator('sup')).toHaveText('2');
    await expect(html.locator('u')).toHaveText('下划线'); await expect(html.locator('kbd')).toHaveCount(2);
    await expect(page.locator('#write [colspan="2"]')).toHaveCount(1);
    await expect(page.locator('#write [rowspan="2"]')).toHaveCount(1);
    await expect(page.locator('#write .md-alert')).toHaveCount((original.match(/^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gm)||[]).length);
    await expect(page.locator('#write [data-type="footnotes-ref"]')).toHaveCount(3);
    await expect(page.locator('#write [data-type="toc-block"]')).toHaveCount(1);
    expect(await page.locator('#write strong').filter({hasText:'检查点：'}).count()).toBeGreaterThan(10);
    const mixedTable=page.locator('#write table').filter({hasText:'这一格包含较长的中文文本'});
    expect(await mixedTable.evaluate(el=>el.scrollWidth <= el.clientWidth+1)).toBe(true);
    const anchor=page.locator(mode==='ir' ? '#write .vditor-ir__link' : '#write a').filter({hasText:'跳转到英文锚点样例'});
    const url=page.url(); await anchor.click();
    await expect(page.locator('#write h3').filter({hasText:'anchor-target'})).toBeInViewport(); expect(page.url()).toBe(url);
    const code=page.locator('#write .md-fences').filter({hasText:'function greet'}).first();
    await code.hover(); await code.locator('.vditor-copy [role="button"]').click();
    await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toContain('function greet');
    await screenshot(mode,'table','08. 表格'); await screenshot(mode,'math','12. 数学');
    await screenshot(mode,'flow','13. Mermaid'); await screenshot(mode,'er','14. Mermaid');
    const firstId=await diagrams.first().getAttribute('id');
    await page.evaluate(()=>window.desktop.savePreferences({theme:'night'}));
    await expect.poll(()=>diagrams.first().getAttribute('id')).not.toBe(firstId);
    await ready();
    await screenshot(mode,'dark-er','14. Mermaid');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,760));
    await checkTableWidth();
    const wideTable=page.locator('#write table').filter({hasText:'docs/compatibility/markdown-rendering-sample.md'});
    expect(await wideTable.evaluate(el=>{el.scrollLeft=el.scrollWidth; return el.scrollLeft;})).toBeGreaterThan(0);
    expect(await diagrams.evaluateAll(elements=>elements.every(el=>el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width+1))).toBe(true);
    // Chromium counts the end padding after a full-width (Typora 98vw) gantt chart
    // as scrollable overflow; assert that no content actually leaves the column.
    expect(await page.locator('#write').evaluate(el=>{const right=el.getBoundingClientRect().left+el.clientWidth+1;const clipped=child=>{for(let a=child.parentElement;a&&a!==el;a=a.parentElement)if(getComputedStyle(a).overflowX!=='visible')return true;return false;};return [...el.querySelectorAll('*')].every(child=>child.getBoundingClientRect().right<=right||clipped(child));})).toBe(true);
    await screenshot(mode,'narrow','08. 表格');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,900));
    await page.evaluate(()=>window.desktop.savePreferences({theme:'paper'}));
    // Display-only operations must never normalize or dirty the original file.
    await invoke('source'); await source.toHaveValue(original); await expect(page.locator('#dirty-dot')).toBeHidden();
    await invoke('source'); await ready();
    // A normal edit must retain HTML source, links, diagrams, math and metadata.
    const paragraph=page.locator('#write > p').filter({hasText:'这是第一段普通正文。'}).first();
    await paragraph.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);el.closest('[contenteditable]').focus();getSelection().removeAllRanges();getSelection().addRange(r);});
    await page.keyboard.insertText(' 渲染回归标记');
    await invoke('source');
    const edited=await source.value();
    for(const token of ['<img src="./markdown-test-assets/sample.png"','width="240"','<mark>高亮文本</mark>','<kbd>Ctrl</kbd>','<!--','title: ITypora','[^simple]','erDiagram','\\begin{bmatrix}','渲染回归标记']) expect(edited).toContain(token);
    await source.fill(original); await invoke('source'); await ready();
    console.log(`PASS ${mode}: fixture, 8 diagrams, 10 formulas, HTML/image dimensions, alignment, theme refresh, narrow layout, lossless mode/theme changes and edited source`);
  }
  // Exercise malformed diagram isolation, recovery, nested inline HTML and inert HTML.
  await invoke('source');
  const edge='Before\n\n<u>outer <kbd>key</kbd></u> A<br>B\n\n**注意：**后文 `**代码：**` \\*\\*转义：\\*\\*\n\n<img src="./markdown-test-assets/sample.png" width="240" onerror="window.htmlExecuted=true">\n\n```mermaid\nflowchart TD\nA[broken\n```\n\n```mermaid\nflowchart LR\nA-->B\n```\n\nAfter';
  await source.fill(edge); await invoke('source');
  await expect(page.locator('#write .diagram-error')).toHaveCount(1,{timeout:30000});
  await expect(diagrams).toHaveCount(1,{timeout:30000});
  await expect(page.locator('#write u kbd')).toHaveText('key');
  await expect(page.locator('#write strong')).toHaveText('注意：');
  await expect(page.locator('#write img[onerror]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.htmlExecuted)).toBeUndefined();
  await invoke('source'); await source.fill(edge.replace('A[broken','A[fixed]')); await invoke('source');
  await expect(diagrams).toHaveCount(2,{timeout:30000}); await expect(page.locator('#write .diagram-error')).toHaveCount(0);
  // Optional verification against the user's actual Typora theme, never modify it.
  const themePath=path.join(process.env.APPDATA || '', 'Typora/themes/matcha-dark.css');
  if (await fs.access(themePath).then(()=>true,()=>false)) {
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},themePath);
    await invoke('import-theme');
    await invoke('source'); await source.fill(original); await invoke('source'); await ready();
    await checkTableWidth();
    await screenshot('matcha','inline-table','03. 行内格式');
    await screenshot('matcha','er','14. Mermaid'); await screenshot('matcha','code','11. 行内代码');
    await screenshot('matcha','callouts','06. 引用');
    const code=page.locator('#write .md-fences').first();
    await expect(code).toHaveCSS('border-radius','14px');
    await expect(code.locator(':scope > code:not(.itypora-code-overlay)')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    for(const label of await page.locator('#write .language-mermaid foreignObject p').all()) await expect(label).toHaveCSS('margin-top','0px');
    expect(await page.locator('#write .md-alert').first().evaluate(el=>getComputedStyle(el).borderRadius)).toBe('14px');
    console.log('PASS actual Matcha dark theme code blocks, callouts and diagram styling');
  }
  expect(errors).toEqual([]);
  expect(requests.filter(url=>!url.includes('intentionally-missing')&&!url.includes('example.com/itypora-test-image'))).toEqual([]);
  expect(await fs.readFile(fixture,'utf8')).toBe(original);
  console.log('PASS malformed diagram recovery, HTML sanitization and fixture unchanged');
} catch(error) {
  console.error({errors,requests}); const page=await app.firstWindow(); console.error('Toast',await page.locator('#toast').textContent());
  await page.screenshot({path:'test-results/rendering-failure.png'});throw error;
} finally {
  await app.evaluate(async ({dialog,clipboard})=>{dialog.showMessageBox=async()=>({response:1}); if(globalThis.renderClipboard)await clipboard.write(globalThis.renderClipboard);}).catch(()=>{});await app.close();
  const rel=path.relative(await fs.realpath(os.tmpdir()),await fs.realpath(temporary));
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unsafe cleanup');await fs.rm(temporary,{recursive:true,force:true});
}
