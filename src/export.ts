// Export to HTML and PDF, as Typora's File > Export: a standalone page that
// looks like the rendered document with the current theme. The rendered editor
// DOM is copied and stripped of editing machinery (Markdown markers, hidden
// sources, overlays), then saved with the same style sheets and wrapper
// elements, so every rule that draws the editor draws the page. Diagrams and
// formulas are already SVG and the main process embeds local images, so the
// page needs no scripts and no files beside it.
import { diagramsSettled } from './rendering';
import { assetBase } from './asset-url';

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const timeout = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// The page layout of the editor window does not apply to a document.
const exportCss = `
html { background: var(--itypora-export-background); }
body.itypora-export { margin: 0; overflow: visible; }
.itypora-export .editor-surface { min-height: 100vh; }
.itypora-export #editor, .itypora-export .vditor-content, .itypora-export .vditor-ir, .itypora-export .vditor-wysiwyg { height: auto; overflow: visible; }
.itypora-export #write { height: auto !important; min-height: 0 !important; overflow: visible !important; }
.itypora-export #write .md-toc-inner, .itypora-export #write .reversefootnote, .itypora-export #write .md-footnote a { cursor: pointer; text-decoration: none; }
/* Block labels in the margin of the WYSIWYG editor (</>, $$, ToC). */
.itypora-export .vditor-wysiwyg :is(div.vditor-wysiwyg__block, .vditor-toc)::before { content: none; }
/* Markdown inside an HTML element (<details>) keeps the text's line breaks. */
.itypora-export #write [data-type="html-block"] [data-block] { white-space: pre-wrap; }
/* The whole sheet takes the document's background, margins included. */
@page { size: A4; margin: 16mm 18mm; background: var(--itypora-export-background); }
@media print {
  .itypora-export .editor-surface { min-height: 0; }
  .itypora-export #write { padding-top: 0; padding-bottom: 0; }
  .itypora-export #write :is(h1, h2, h3, h4, h5, h6) { break-after: avoid; }
  .itypora-export #write :is(pre, blockquote, table, tr, img, svg, .md-diagram-panel, mjx-container[display="true"], .md-alert, .footnotes-area, .footnote-line) { break-inside: avoid; }
}`;

// Waits until diagrams, formulas, images and fonts in `root` are drawn.
async function settled(root: HTMLElement) {
  await diagramsSettled();
  const deadline = Date.now() + 5000;
  const formulas = () => [...root.querySelectorAll(':is(.vditor-ir__preview, .vditor-wysiwyg__preview) .language-math')];
  while (Date.now() < deadline && formulas().some(math => !math.querySelector('mjx-container, .katex, .katex-display'))) await timeout(50);
  await Promise.all([...root.querySelectorAll('img')].map(image => image.complete ? null : Promise.race([image.decode().catch(() => {}), timeout(5000)])));
  await document.fonts.ready;
  await frame(); await frame();
}

type Definition = { url: string; title: string };
const label = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
const destination = (url: string) => url.startsWith(assetBase) ? url.slice(assetBase.length) : url.replace(/^<(.*)>$/, '$1');

function anchor(doc: Document, href: string, title: string, content: Iterable<Node>) {
  const link = doc.createElement('a');
  link.setAttribute('href', destination(href));
  if (title) link.title = title;
  link.append(...content);
  return link;
}

// Code blocks: the editor draws highlighted text over transparent source text.
// Keep one static, highlighted copy.
function staticCode(root: HTMLElement) {
  const hljs = (window as unknown as { hljs?: { getLanguage(name: string): unknown; highlight(code: string, options: { language: string }): { value: string } } }).hljs;
  root.querySelectorAll<HTMLElement>('.itypora-code-block').forEach(block => {
    const pre = block.querySelector<HTMLElement>('.itypora-code-editor');
    const code = pre?.querySelector<HTMLElement>(':scope > code:not(.itypora-code-overlay)');
    if (!pre || !code) return;
    const text = (code.textContent || '').replace(/\u200b/g, '');
    const preview = block.querySelector<HTMLElement>(':scope > .vditor-ir__preview > code, :scope > .vditor-wysiwyg__preview > code')?.cloneNode(true) as HTMLElement | undefined;
    preview?.querySelectorAll('.vditor-linenumber__rows, .vditor-copy').forEach(element => element.remove());
    const language = pre.getAttribute('lang') || '';
    if (preview && (preview.textContent || '').replace(/\n$/, '') === text.replace(/\n$/, '')) code.innerHTML = preview.innerHTML;
    else if (hljs && language && hljs.getLanguage(language)) code.innerHTML = hljs.highlight(text, { language }).value;
    else code.textContent = text;
    pre.querySelectorAll(':scope > .itypora-code-overlay, :scope > .itypora-code-gutter, :scope > .vditor-copy').forEach(element => element.remove());
    pre.classList.remove('itypora-code-overlaid');
    pre.removeAttribute('style');
    block.querySelectorAll(':scope > .vditor-ir__preview, :scope > .vditor-wysiwyg__preview').forEach(element => element.remove());
  });
}

// Links: IR draws a link as spans around its Markdown; reference links resolve
// through definitions, which (like Typora) are not part of the exported page.
function links(root: HTMLElement) {
  const doc = root.ownerDocument;
  const definitions = new Map<string, Definition>();
  root.querySelectorAll('[data-type="link-ref-defs-block"] .md-def-link').forEach(definition => {
    const name = definition.querySelector('.md-def-name')?.textContent || '';
    definitions.set(label(name), { url: definition.querySelector('.md-def-url')?.textContent || '', title: definition.querySelector('.md-def-title')?.textContent || '' });
  });
  root.querySelectorAll<HTMLElement>('[data-type="a"]').forEach(node => {
    const text = node.querySelector(':scope > .vditor-ir__link');
    const url = node.querySelector(':scope > .vditor-ir__marker--link')?.textContent || '';
    const title = (node.querySelector(':scope > .vditor-ir__marker--title')?.textContent || '').replace(/^["'(]|["')]$/g, '');
    if (text) node.replaceWith(anchor(doc, url, title, text.childNodes));
  });
  root.querySelectorAll<HTMLElement>('[data-type="link-ref"]').forEach(node => {
    const text = node.querySelector(':scope > .itypora-reference-link, :scope > .vditor-ir__link');
    const marker = node.querySelector(':scope > .vditor-ir__marker--link')?.textContent?.slice(1, -1);
    const content = text ? [...text.childNodes] : [...node.childNodes].filter(child => !(child instanceof Element && child.matches('.vditor-ir__marker')));
    const definition = definitions.get(label(node.dataset.linkLabel || marker || content.map(child => child.textContent).join('')));
    node.replaceWith(definition ? anchor(doc, definition.url, definition.title || node.title, content) : doc.createTextNode(content.map(child => child.textContent).join('')));
  });
  root.querySelectorAll('a[href]').forEach(link => link.setAttribute('href', destination(link.getAttribute('href')!)));
}

// Footnotes, as in Typora's export: references show their number and the
// definitions leave the text for a footnote area at the end, one line each,
// with a link back to every reference.
function footnotes(root: HTMLElement) {
  const doc = root.ownerDocument;
  const numbers = new Map<string, string>(), references = new Map<string, string[]>();
  root.querySelectorAll<HTMLElement>('sup[data-type="footnotes-ref"]').forEach(sup => {
    const name = (sup.dataset.footnotesLabel || '').replace(/^\^/, '');
    if (!numbers.has(name)) numbers.set(name, sup.querySelector('.itypora-footnote-number, .vditor-ir__marker--hide')?.textContent?.trim() || String(numbers.size + 1));
    const number = numbers.get(name)!, seen = references.get(name) || [];
    // Typora's anchors: ref-footnote-1, then ref-footnote-1-1 for the second reference.
    const suffix = `footnote-${number}${seen.length ? `-${seen.length}` : ''}`;
    references.set(name, [...seen, suffix]);
    const link = doc.createElement('a'); link.href = `#dfref-${suffix}`; link.id = `ref-${suffix}`; link.textContent = number;
    for (const name of ['aria-label', 'data-footnotes-label']) sup.removeAttribute(name);
    sup.classList.remove('vditor-tooltipped', 'vditor-tooltipped__s');
    sup.replaceChildren(link);
  });
  const lines: [number, HTMLElement][] = [];
  root.querySelectorAll<HTMLElement>('[data-type="footnotes-def"], li[data-type="footnotes-li"]').forEach(definition => {
    const name = (definition.dataset.marker || '').replace(/^\^/, '') || definition.querySelector('.md-def-name')?.textContent || '';
    const blocks = [...definition.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.style.display !== 'none' && !child.matches('.itypora-footnote-def, .itypora-footnote-def-source, .md-reverse-footnote-area, .vditor-ir__marker'));
    if (!numbers.has(name)) numbers.set(name, String(numbers.size + 1));
    const number = numbers.get(name)!;
    const line = doc.createElement('div'); line.className = 'footnote-line';
    const count = doc.createElement('span'); count.className = 'md-fn-count'; count.textContent = number;
    // The first paragraph is the line; further blocks of a longer footnote follow it.
    const first = blocks[0]?.tagName === 'P' ? blocks.shift()! : null;
    line.append(count, ' ', ...(first ? first.childNodes : []));
    for (const suffix of references.get(name) || []) {
      const back = doc.createElement('a'); back.className = 'reversefootnote'; back.id = `dfref-${suffix}`; back.href = `#ref-${suffix}`; back.title = '回到文档'; back.textContent = '↩';
      line.append(' ', back);
    }
    line.append(...blocks);
    lines.push([Number(number) || Infinity, line]);
  });
  root.querySelectorAll('[data-type="footnotes-block"]').forEach(block => block.remove());
  if (!lines.length) return;
  const area = doc.createElement('div'); area.className = 'footnotes-area';
  area.append(doc.createElement('hr'), ...lines.sort((a, b) => a[0] - b[0]).map(([, line]) => line));
  root.append(area);
}

// HTML blocks, as in Typora's export: like the browser reading the Markdown's
// HTML, an element that one block opens and a later block closes
// (<details> … </details>) holds the blocks between. A comment stays a
// comment; a lone closing tag shows nothing.
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function balance(source: string) {
  const open: string[] = [], closed: string[] = [];
  for (const [, slash, name, empty] of source.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const tag = name.toLowerCase();
    if (slash) { const at = open.lastIndexOf(tag); if (at >= 0) open.length = at; else closed.push(tag); }
    else if (!empty && !voidTags.has(tag)) open.push(tag);
  }
  return { open, closed };
}
function htmlBlocks(root: HTMLElement) {
  const doc = root.ownerDocument;
  const blocks = new Map([...root.querySelectorAll<HTMLElement>('[data-type="html-block"]:not(code)')].map(block => {
    const source = (block.querySelector(':scope > pre > code')?.textContent || '').trim();
    return [block, { source, ...balance(source) }];
  }));
  for (const parent of new Set([...blocks.keys()].map(block => block.parentElement!))) {
    const children = [...parent.children];
    const stack: { tag: string; element: Element }[] = [];
    children.forEach((child, index) => {
      const block = blocks.get(child as HTMLElement);
      if (!block) { stack.at(-1)?.element.append(child); return; }
      for (const tag of block.closed) { const at = stack.map(open => open.tag).lastIndexOf(tag); if (at >= 0) stack.length = at; }
      // The editor shows the source of a block that renders nothing.
      if (child.classList.contains('itypora-html-source')) {
        const comment = /^<!--[\s\S]*-->$/.test(block.source) ? doc.createComment(block.source.slice(4, -3)) : null;
        if (comment) { child.replaceWith(comment); stack.at(-1)?.element.append(comment); } else child.remove();
        return;
      }
      stack.at(-1)?.element.append(child);
      // Only an element that a later block closes takes the blocks after it.
      const closedLater = children.slice(index + 1).flatMap(next => blocks.get(next as HTMLElement)?.closed || []);
      let scope = child.querySelector(':scope > .vditor-ir__preview, :scope > .vditor-wysiwyg__preview');
      for (const tag of block.open) {
        const element = closedLater.includes(tag) ? [...scope?.querySelectorAll(tag) || []].at(-1) : undefined;
        if (!element) break;
        stack.push({ tag, element }); scope = element;
      }
    });
  }
}

// Removes the editor's Markdown markers, hidden sources and editing state.
function strip(root: HTMLElement) {
  root.querySelectorAll('[data-type="yaml-front-matter"], [data-type="link-ref-defs-block"]').forEach(element => element.remove());
  root.querySelectorAll('.vditor-ir__marker, .vditor-ir__marker--hide, [data-type$="-open-marker"], [data-type$="-close-marker"], .vditor-copy, .itypora-linebreak, .itypora-callout-source, .itypora-footnote-def-source, .itypora-autolink-marker, wbr').forEach(element => element.remove());
  // WYSIWYG keeps each source beside its rendering, hidden.
  root.querySelectorAll<HTMLElement>('[style]').forEach(element => { if (element.style.display === 'none' && !element.matches('.itypora-code-editor')) element.remove(); });
  // A missing image shows its Markdown in the editor; the page keeps the image.
  root.querySelectorAll('.itypora-image-fallback').forEach(wrapper => { const image = wrapper.querySelector('img'); if (image) wrapper.replaceWith(image); else wrapper.remove(); });
  root.querySelectorAll('.md-toc [data-itypora-target-id]').forEach(link => { link.setAttribute('href', `#${link.getAttribute('data-itypora-target-id')}`); link.removeAttribute('data-itypora-target-id'); });
  for (const name of ['vditor-ir__node--expand', 'active-paragraph', 'itypora-def-editing', 'itypora-image-error', 'itypora-code-line-numbers']) root.querySelectorAll(`.${name}`).forEach(element => element.classList.remove(name));
  root.classList.remove('itypora-code-line-numbers');
  for (const element of [root, ...root.querySelectorAll('[contenteditable], [spellcheck]')]) { element.removeAttribute('contenteditable'); element.removeAttribute('spellcheck'); }
  for (const name of ['aria-label', 'placeholder', 'style']) root.removeAttribute(name);
  // Vditor's zero-width spaces keep the caret in empty inline nodes.
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue?.includes('\u200b')) node.nodeValue = node.nodeValue.replace(/\u200b/g, '');
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

function styleSheets() {
  const css: string[] = [];
  for (const sheet of document.styleSheets) {
    const owner = sheet.ownerNode;
    // Diagram styles travel inside their SVG; the code highlights are editor-only.
    if (owner instanceof Element && (owner.closest('#app, .zoom-viewer') || owner.id === 'itypora-code-highlights')) continue;
    try { css.push([...sheet.cssRules].map(rule => rule.cssText).join('\n')); } catch { /* A sheet that cannot be read is not the document's. */ }
  }
  return css.join('\n');
}

// A standalone HTML page of the rendered document in `write` (the editor's #write).
export async function exportPage(write: HTMLElement, title: string) {
  await settled(write);
  const page = write.cloneNode(true) as HTMLElement;
  // Checkbox state lives in properties, which a copy does not serialize.
  const inputs = write.querySelectorAll('input'), copies = page.querySelectorAll('input');
  inputs.forEach((input, i) => copies[i]?.toggleAttribute('checked', input.checked));
  staticCode(page);
  htmlBlocks(page);
  links(page);
  footnotes(page);
  strip(page);
  const surface = write.closest('.editor-surface') || document.body;
  const html = document.documentElement;
  const background = getComputedStyle(surface).backgroundColor;
  const chain = (element?: Element | null) => element instanceof HTMLElement ? element.className : '';
  const panel = write.parentElement, content = panel?.parentElement, editor = content?.parentElement;
  const attributes = [
    `lang="${escapeHtml(html.lang || 'zh-CN')}"`, html.className && `class="${escapeHtml(html.className)}"`,
    html.dataset.theme && `data-theme="${escapeHtml(html.dataset.theme)}"`,
    `style="${escapeHtml(`${html.getAttribute('style') || ''}; --itypora-export-background: ${background}`)}"`
  ].filter(Boolean).join(' ');
  return `<!DOCTYPE html>
<html ${attributes}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">
<meta name="generator" content="Itypora">
<title>${escapeHtml(title)}</title>
<style>
${styleSheets()}
</style>
<style>${exportCss}</style>
</head>
<body class="itypora-export">
<section class="${escapeHtml(chain(surface))}"><div id="editor" class="${escapeHtml(chain(editor))}"><div class="${escapeHtml(chain(content))}"><div class="${escapeHtml(chain(panel))}">
${page.outerHTML}
</div></div></div></section>
</body>
</html>
`;
}
