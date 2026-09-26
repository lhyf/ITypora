import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Double-clicking a diagram or an image opens it enlarged; a single click still
// shows its Markdown. Uses real mouse input, since the difference is timing.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-zoom-'));
const fixture = path.resolve('examples/Markdown兼容性与显示测试.md');
const sample = path.join(temporary, 'sample.md');
await fs.copyFile(fixture, sample);
await fs.cp(path.join(path.dirname(fixture), 'markdown-test-assets'), path.join(temporary, 'markdown-test-assets'), { recursive: true });
const app = await electron.launch(process.argv[2] ? { executablePath: path.resolve(process.argv[2]), args: [`--user-data-dir=${path.join(temporary, 'profile')}`] } : { args: ['.'], env: { ...process.env, ITYPORA_TEST_USER_DATA: path.join(temporary, 'profile') } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#write')).toBeVisible({ timeout: 30000 });
  // Sets the window's content size, first undoing a maximized or full-screen state.
  const resize = (width, height) => app.evaluate(({ BrowserWindow }, [width, height]) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isFullScreen()) window.setFullScreen(false);
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(width, height);
  }, [width, height]);
  await resize(1190, 900);
  const menu = id => app.evaluate(({ Menu, BrowserWindow }, command) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.ipc.once('action-complete', () => resolve());
    const item = Menu.getApplicationMenu().getMenuItemById(command); item.click(item, window);
  }), id);
  const enabled = id => app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).enabled, id);
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1 }); }, sample);
  // A real theme, so the enlarged copy must carry theme rules scoped to #write.
  const theme = path.join(process.env.APPDATA || '', 'Typora/themes/matcha.css');
  if (await fs.access(theme).then(() => true, () => false)) {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, theme);
    await menu('import-theme');
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, sample);
  } else console.log('SKIP Matcha theme: not installed');

  const viewer = page.locator('.zoom-viewer'), stage = viewer.locator('.zoom-viewer__stage'), level = viewer.locator('.zoom-viewer__level');
  const percent = async () => Number((await level.textContent()).replace('%', ''));
  // Size and place of the enlarged picture, and its natural size.
  const shown = () => page.evaluate(() => {
    const content = document.querySelector('.zoom-viewer__content > *'), rect = content.getBoundingClientRect();
    const box = content.viewBox?.baseVal;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, natural: box?.width || content.naturalWidth, stage: [innerWidth, innerHeight] };
  });
  const center = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 200) }; };

  for (const mode of ['ir', 'wysiwyg']) {
    await page.evaluate(mode => window.desktop.savePreferences({ mode }), mode);
    await menu('open');
    await expect(page.locator('#write svg[aria-roledescription]')).toHaveCount(8, { timeout: 30000 });
    const diagram = page.locator('#write svg[aria-roledescription="er"]');
    const block = page.locator('#write [data-type="code-block"]').filter({ has: page.locator('svg[aria-roledescription="er"]') });
    const sourceShown = () => mode === 'ir' ? block.evaluate(el => el.classList.contains('vditor-ir__node--expand')) : block.locator('.vditor-wysiwyg__pre').evaluate(el => getComputedStyle(el).display !== 'none');
    await diagram.evaluate(el => el.scrollIntoView({ block: 'center' }));
    // The caret sits in a paragraph before the double-click.
    const caret = () => page.evaluate(() => { const s = getSelection(); return s.rangeCount ? [s.anchorNode.textContent.slice(0, 20), s.anchorOffset] : null; });
    await page.evaluate(() => {
      const paragraph = [...document.querySelectorAll('#write p')].find(p => p.textContent.includes('这是第一段普通正文'));
      document.querySelector('#write').focus({ preventScroll: true }); getSelection().collapse(paragraph.firstChild, 3);
    });
    const before = await caret();

    // Double-click: the viewer opens, the Markdown stays hidden, nothing changes.
    let point = await center(diagram);
    await page.mouse.dblclick(point.x, point.y);
    await expect(viewer).toBeVisible();
    await expect(viewer).toHaveAttribute('aria-label', '图表查看器');
    await page.waitForTimeout(400);
    expect(await sourceShown(), `${mode}: Markdown shown by a double-click`).toBe(false);
    expect(await enabled('format:bold')).toBe(false);
    await expect(stage).toBeFocused();

    // The copy looks like the original: same computed styles, markers resolved to the copy.
    const same = await page.evaluate(() => {
      const original = document.querySelector('#write svg[aria-roledescription="er"]'), copy = document.querySelector('.zoom-viewer svg');
      const names = ['fill', 'stroke', 'stroke-width', 'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'opacity', 'margin-top', 'padding-left', 'text-align'];
      const a = [...original.querySelectorAll('*')], b = [...copy.querySelectorAll('*')];
      const differences = [];
      a.forEach((element, i) => {
        if (element.closest('style')) return;
        const x = getComputedStyle(element), y = getComputedStyle(b[i]);
        for (const name of names) if (x.getPropertyValue(name) !== y.getPropertyValue(name)) differences.push(`${element.tagName} ${name}: ${x.getPropertyValue(name)} / ${y.getPropertyValue(name)}`);
      });
      const markers = [...copy.querySelectorAll('[marker-end], [marker-start]')].map(e => e.getAttribute('marker-end') || e.getAttribute('marker-start'));
      return { count: [a.length, b.length], differences: differences.slice(0, 5), markers: markers.length > 0 && markers.every(m => m.includes('#itypora-zoom-') && copy.querySelector(m.slice(m.indexOf('#'), -1).replace(/["']/g, ''))), ids: new Set([...document.querySelectorAll('[id]')].map(e => e.id)).size === document.querySelectorAll('[id]').length };
    });
    expect(same.count[0]).toBe(same.count[1]);
    expect(same.differences, `${mode}: styles of the copy`).toEqual([]);
    expect(same.markers, `${mode}: markers point into the copy`).toBe(true);
    expect(same.ids, `${mode}: ids stay unique`).toBe(true);

    // Opens fitted and centered in the window.
    let view = await shown();
    const fit = await percent();
    expect(Math.abs(view.left + view.width / 2 - view.stage[0] / 2)).toBeLessThan(2);
    expect(view.height).toBeLessThanOrEqual(view.stage[1] - 64 - 48 + 1);
    expect(Math.abs(view.width / view.natural * 100 - fit)).toBeLessThan(1);
    await page.screenshot({ path: `test-results/zoom-${mode}-fit.png` });

    // Wheel zooms around the pointer: the point under it stays put.
    const target = { x: view.left + view.width * 0.3, y: view.top + view.height * 0.4 };
    const at = v => [(target.x - v.left) / v.width, (target.y - v.top) / v.height];
    const spot = at(view);
    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(percent).toBeGreaterThan(fit * 1.5);
    view = await shown();
    const after = at(view);
    expect(Math.abs(after[0] - spot[0]) * view.width).toBeLessThan(1.5);
    expect(Math.abs(after[1] - spot[1]) * view.height).toBeLessThan(1.5);
    // Sharp at this size: the vector is laid out larger, not scaled as a bitmap.
    expect(await page.evaluate(() => Number(document.querySelector('.zoom-viewer svg').getAttribute('width')))).toBeCloseTo(view.width, 0);
    await page.screenshot({ path: `test-results/zoom-${mode}-zoomed.png` });

    // Dragging pans by the pointer's movement.
    const start = await shown();
    await page.mouse.move(600, 450); await page.mouse.down(); await page.mouse.move(480, 380, { steps: 5 }); await page.mouse.up();
    view = await shown();
    expect(Math.abs(view.left - start.left + 120)).toBeLessThan(1);
    expect(Math.abs(view.top - start.top + 70)).toBeLessThan(1);

    // Keys: 1 is actual size, 0 fits, + and - step, arrows pan.
    await page.keyboard.press('1'); await expect(level).toHaveText('100%');
    expect(Math.abs((await shown()).width - view.natural)).toBeLessThan(1);
    await page.keyboard.press('0'); await expect(level).toHaveText(`${fit}%`);
    await page.keyboard.press('+'); expect(await percent()).toBeGreaterThan(fit);
    await page.keyboard.press('-'); await page.keyboard.press('-'); expect(await percent()).toBeLessThan(fit);
    const left = (await shown()).left; await page.keyboard.press('ArrowLeft');
    expect((await shown()).left - left).toBeCloseTo(60, 0);
    // Toolbar buttons.
    await viewer.getByRole('button', { name: '适应窗口' }).click(); await expect(level).toHaveText(`${fit}%`);
    await viewer.getByRole('button', { name: '放大' }).click(); expect(await percent()).toBeGreaterThan(fit);
    await viewer.getByRole('button', { name: '实际大小' }).click(); await expect(level).toHaveText('100%');
    // Double-click in the viewer: closer look, then the whole picture again.
    await viewer.getByRole('button', { name: '适应窗口' }).click();
    await page.mouse.dblclick(600, 450); expect(await percent()).toBeGreaterThan(fit);
    await page.mouse.dblclick(600, 450); await expect(level).toHaveText(`${fit}%`);
    // A fitted view refits when the window changes size.
    await resize(900, 700);
    await expect.poll(async () => (await shown()).stage[0]).toBe(900);
    await expect.poll(percent).toBeLessThan(fit);
    view = await shown();
    expect(Math.abs(view.left + view.width / 2 - 450)).toBeLessThan(2);
    await resize(1190, 900);
    await expect.poll(percent).toBe(fit);

    // Esc closes; the caret and the document are as before.
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    expect(await caret()).toEqual(before);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('write');
    expect(await sourceShown()).toBe(false);
    await expect(page.locator('#dirty-dot')).toBeHidden();
    expect(await enabled('format:bold')).toBe(true);

    // A single click still shows the Markdown, after a short pause.
    point = await center(diagram);
    await page.mouse.click(point.x, point.y);
    await expect.poll(sourceShown, { timeout: 2000 }).toBe(true);
    await expect(viewer).toHaveCount(0);

    // A slow double-click (the Markdown already shown) still opens the viewer.
    await page.evaluate(() => { const p = [...document.querySelectorAll('#write p')].find(p => p.textContent.includes('这是第一段普通正文')); getSelection().collapse(p.firstChild, 3); });
    await page.mouse.click(10, 10); // leave the diagram block
    await diagram.evaluate(el => el.scrollIntoView({ block: 'center' }));
    point = await center(diagram);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down(); await page.mouse.up();
    await expect.poll(sourceShown, { timeout: 2000 }).toBe(true);
    await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: '关闭' }).click();
    await expect(viewer).toHaveCount(0);

    // Menu commands close the viewer first.
    await page.mouse.click(10, 10);
    await diagram.evaluate(el => el.scrollIntoView({ block: 'center' }));
    point = await center(diagram);
    await page.mouse.dblclick(point.x, point.y);
    await expect(viewer).toBeVisible();
    await menu('source');
    await expect(viewer).toHaveCount(0);
    await expect(page.locator('#source-editor')).toBeVisible();
    await menu('source');

    // Images open the same way (Vditor's own preview cannot be closed under the CSP).
    const image = page.locator('#write img[src*="sample.png"]').first();
    await image.evaluate(el => el.scrollIntoView({ block: 'center' }));
    point = await center(image);
    await page.mouse.dblclick(point.x, point.y);
    await expect(viewer).toHaveAttribute('aria-label', '图片查看器');
    await expect(page.locator('.vditor-img')).toHaveCount(0);
    const natural = await image.evaluate(el => el.naturalWidth);
    view = await shown();
    expect(view.natural).toBe(natural);
    // Images are not enlarged past their own size to fit.
    expect(await percent()).toBeLessThanOrEqual(100);
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    // Formulas: a display one, and an inline one MathJax draws in three pieces.
    for (const [kind, index, pieces] of [['display', 4, 1], ['inline', 1, 3]]) {
      const formula = page.locator('#write mjx-container').nth(index);
      await page.mouse.click(10, 10);
      await formula.evaluate(el => el.scrollIntoView({ block: 'center' }));
      // The formula's node grows when its TeX is shown.
      const node = () => formula.evaluate(el => { const r = el.closest('.vditor-ir__node, .vditor-wysiwyg__block').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      const size = await node();
      const piece = await formula.locator('svg').first().boundingBox();
      await page.mouse.dblclick(piece.x + piece.width / 2, piece.y + piece.height / 2);
      await expect(viewer).toHaveAttribute('aria-label', '公式查看器');
      await page.waitForTimeout(400);
      expect(await node(), `${mode} ${kind}: TeX shown by a double-click`).toEqual(size);
      const copy = await page.evaluate(() => {
        const copy = document.querySelector('.zoom-viewer__content > *'), parts = [...copy.querySelectorAll(':scope > svg')].map(svg => svg.getBoundingClientRect());
        const centers = parts.map(r => r.top + r.height / 2);
        return { pieces: parts.length, oneLine: Math.max(...centers) - Math.min(...centers) < Math.max(...parts.map(r => r.height)), hidden: copy.querySelectorAll('mjx-assistive-mml').length };
      });
      expect(copy, `${mode} ${kind}`).toEqual({ pieces, oneLine: true, hidden: 0 });
      // Glyphs keep the document's formula color (they are drawn through <use>).
      const expected = (await formula.evaluate(el => getComputedStyle(el.querySelector('use')).fill)).match(/\d+/g).map(Number);
      const png = await viewer.locator('.zoom-viewer__content').screenshot();
      const ink = await page.evaluate(async data => {
        const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, counts = new Map();
        // The most common dark color: solid glyph strokes.
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 360) { const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`; counts.set(key, (counts.get(key) || 0) + 1); }
        return [...counts].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
      }, png.toString('base64'));
      expect(Math.max(...ink.map((value, i) => Math.abs(value - expected[i]))), `${mode} ${kind}: glyph color ${ink} vs ${expected}`).toBeLessThan(12);
      // Actual size matches the document.
      await page.keyboard.press('1');
      const widths = await page.evaluate(i => [document.querySelectorAll('#write mjx-container')[i], document.querySelector('.zoom-viewer__content > *')].map(el => [...el.querySelectorAll(':scope > svg')].reduce((sum, svg) => sum + svg.getBoundingClientRect().width, 0)), index);
      expect(Math.abs(widths[0] - widths[1])).toBeLessThan(1);
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
      expect(await node()).toEqual(size);
      // A single click still shows the TeX.
      const again = await formula.locator('svg').first().boundingBox();
      await page.mouse.click(again.x + again.width / 2, again.y + again.height / 2);
      await expect.poll(node, { timeout: 2000 }).not.toEqual(size);
      await expect(viewer).toHaveCount(0);
    }
    await page.mouse.click(10, 10);

    await expect(page.locator('#dirty-dot')).toBeHidden();
    console.log(`PASS ${mode}: double-click opens diagrams, formulas and images enlarged (same look, wheel/drag/keys/buttons, refit, Esc restores caret), single click still shows Markdown, slow double-click, menus close it`);
  }
  expect(await fs.readFile(sample, 'utf8')).toBe(await fs.readFile(fixture, 'utf8'));
  expect(errors).toEqual([]);
} catch (error) {
  await (await app.firstWindow()).screenshot({ path: 'test-results/zoom-failure.png' }).catch(() => {});
  throw error;
} finally {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
  await app.close();
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
