// Keep Vditor's native text node as the editing surface; never insert spans
// into it (Lute would truncate highlighted HTML). Syntax is drawn by a read-only
// overlay copy of the highlighted preview, or by CSS Highlights (color only)
// whenever the preview is out of sync with the source.
import { assetBase, assetPath } from './asset-url';

let frame = 0;
const highlightNames = new Set<string>();
export function clearCodeHighlights() {
  cancelAnimationFrame(frame);
  for (const name of highlightNames) CSS.highlights.delete(name);
  highlightNames.clear();
}
export function decorateCodeBlocks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-type="code-block"]').forEach(block => {
    const pre = block.querySelector<HTMLElement>(':scope > pre:not(.vditor-ir__preview):not(.vditor-wysiwyg__preview)');
    const code = pre?.querySelector<HTMLElement>(':scope > code:not(.itypora-code-overlay)');
    const preview = block.querySelector<HTMLElement>(':scope > .vditor-ir__preview, :scope > .vditor-wysiwyg__preview');
    const language = [...(code?.classList || [])].find(c => c.startsWith('language-'))?.slice(9) || '';
    const ordinary = Boolean(code && preview && !/^(mermaid|flowchart|echarts|mindmap|plantuml|markmap|abc|graphviz|math|smiles)$/.test(language));
    block.classList.toggle('itypora-code-block', ordinary);
    if (!pre || !code || !preview) return;
    pre.classList.toggle('itypora-code-editor', ordinary); pre.classList.toggle('md-fences', ordinary);
    if (pre.classList.contains('vditor-ir__marker--pre')) pre.classList.toggle('vditor-ir__marker', !ordinary);
    if (!ordinary) return;
    pre.setAttribute('lang', language);
    // Preserve the existing copy action; its textarea always uses native source.
    const menu = preview.querySelector<HTMLElement>(':scope > .vditor-copy');
    if (menu) { pre.querySelector(':scope > .vditor-copy')?.remove(); menu.contentEditable = 'false'; pre.append(menu); }
    const textarea = pre.querySelector('textarea');
    if (textarea) textarea.value = (code.textContent || '').replace(/\n$/, '');
    const numbered = root.classList.contains('itypora-code-line-numbers');
    let gutter = pre.querySelector<HTMLElement>(':scope > .itypora-code-gutter');
    if (numbered) {
      if (!gutter) { gutter = document.createElement('span'); gutter.className = 'itypora-code-gutter'; gutter.contentEditable = 'false'; gutter.setAttribute('aria-hidden', 'true'); pre.append(gutter); }
      // schedulePaint() adds blank rows for wrapped lines once layout is known.
      const count = (code.textContent || '').replace(/\n$/, '').split('\n').length;
      if (!gutter.dataset.lines) gutter.dataset.lines = Array.from({length: count}, (_, i) => String(i + 1)).join('\n');
      const style = getComputedStyle(pre);
      gutter.style.top = style.paddingTop; gutter.style.left = style.paddingLeft;
      pre.style.setProperty('--itypora-code-gutter', (String(count).length + 1) + 'ch');
    } else { gutter?.remove(); pre.style.removeProperty('--itypora-code-gutter'); }
  });
  if (!resized.has(root)) {
    resized.add(root);
    // Wrapped code lines move when the column width changes; renumber them.
    let width = 0;
    new ResizeObserver(() => { if (root.clientWidth !== width) { width = root.clientWidth; schedulePaint(root); } }).observe(root);
  }
  schedulePaint(root);
}

const resized = new WeakSet<HTMLElement>();
// Typora's CodeMirror markdown mode colors only the fence lines of a nested
// block (cm-comment); highlight.js marks the whole fenced block as hljs-code.
function splitMarkdownFences(preview: HTMLElement) {
  preview.querySelectorAll<HTMLElement>('.hljs-code').forEach(span => {
    const text = span.textContent || '';
    if (!/^(`{3,}|~{3,})/.test(text) || !text.includes('\n') || span.childElementCount) return;
    const lines = text.split('\n');
    const nodes: Node[] = [];
    lines.forEach((line, i) => {
      if (i) nodes.push(document.createTextNode('\n'));
      if (i === 0 || (i === lines.length - 1 && /^\s*(`{3,}|~{3,})\s*$/.test(line))) {
        const fence = document.createElement('span'); fence.className = 'hljs-code'; fence.textContent = line; nodes.push(fence);
      } else if (line) nodes.push(document.createTextNode(line));
    });
    span.replaceWith(...nodes);
  });
}

function schedulePaint(root: HTMLElement) {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!root.isConnected) return;
    const colors = new Map<string, Range[]>();
    root.querySelectorAll<HTMLElement>('.itypora-code-block').forEach(block => {
      const pre = block.querySelector<HTMLElement>('.itypora-code-editor')!;
      const source = pre.querySelector<HTMLElement>(':scope > code:not(.itypora-code-overlay)')!;
      const preview = block.querySelector<HTMLElement>(':scope > .vditor-ir__preview > code, :scope > .vditor-wysiwyg__preview > code');
      if (!preview) return;
      if (/^(markdown|md)$/i.test(pre.getAttribute('lang') || '')) splitMarkdownFences(preview);
      const text = source.textContent || '';
      const nodes: Text[] = [], walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      const point = (offset: number): [Node, number] => {
        for (const node of nodes) { if (offset <= node.length) return [node, offset]; offset -= node.length; }
        return [source, source.childNodes.length];
      };
      // Highlights paint color only. Typora's themes also use bold/italic
      // tokens, so draw the highlighted copy over the transparent source while
      // both texts match (e.g. not during IME composition or a stale preview).
      const copy = preview.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.vditor-linenumber__rows, .vditor-copy').forEach(el => el.remove());
      const synced = (copy.textContent || '').replace(/\n$/, '') === text.replace(/\n$/, '');
      let overlay = pre.querySelector<HTMLElement>(':scope > .itypora-code-overlay');
      if (synced) {
        if (!overlay) {
          overlay = document.createElement('code'); overlay.className = 'itypora-code-overlay';
          overlay.setAttribute('aria-hidden', 'true'); overlay.contentEditable = 'false'; pre.append(overlay);
        }
        if (overlay.innerHTML !== copy.innerHTML) overlay.innerHTML = copy.innerHTML;
        const place = { top: source.offsetTop + 'px', left: source.offsetLeft + 'px', width: source.offsetWidth + 'px' };
        for (const [key, value] of Object.entries(place)) if (overlay.style[key as 'top'] !== value) overlay.style[key as 'top'] = value;
      } else overlay?.remove();
      pre.classList.toggle('itypora-code-overlaid', synced);
      // Number the first visual row of each source line, like CodeMirror.
      const gutter = pre.querySelector<HTMLElement>(':scope > .itypora-code-gutter');
      if (gutter) {
        const rows: string[] = []; let offset = 0;
        text.replace(/\n$/, '').split('\n').forEach((line, i) => {
          let visual = 1;
          if (line) {
            const range = document.createRange(); range.setStart(...point(offset)); range.setEnd(...point(offset + line.length));
            visual = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size || 1;
          }
          rows.push(String(i + 1), ...Array<string>(visual - 1).fill(''));
          offset += line.length + 1;
        });
        const value = rows.join('\n');
        if (gutter.dataset.lines !== value) gutter.dataset.lines = value;
      }
      if (synced) return;
      preview.querySelectorAll<HTMLElement>('span[class*="hljs-"]').forEach(token => {
        const before = document.createRange(); before.selectNodeContents(preview); before.setEndBefore(token);
        const start = before.toString().length, value = token.textContent || '';
        if (!value || text.slice(start, start + value.length) !== value) return;
        const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(start + value.length));
        const color = getComputedStyle(token).color;
        if (!colors.has(color)) colors.set(color, []);
        colors.get(color)!.push(range);
      });
    });
    for (const name of highlightNames) CSS.highlights.delete(name);
    highlightNames.clear();
    let style = document.querySelector<HTMLStyleElement>('#itypora-code-highlights');
    if (!style) { style = document.createElement('style'); style.id = 'itypora-code-highlights'; document.head.append(style); }
    const rules: string[] = [];
    for (const [color, ranges] of colors) {
      const name = 'itypora-code-' + highlightNames.size;
      highlightNames.add(name); CSS.highlights.set(name, new Highlight(...ranges));
      rules.push(`::highlight(${name}) { color: ${color}; }`);
    }
    style.textContent = rules.join('\n');
  });
}

export function decorateFailedImages(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('img').forEach(img => {
    if (img.closest('.language-mermaid')) return;
    const failed = img.complete && img.naturalWidth === 0;
    const native = img.closest<HTMLElement>('[data-type="img"]');
    if (native) { native.classList.toggle('itypora-image-error', failed); return; }
    // HTML previews keep their source marker; only wrap native Markdown images.
    if (img.closest('[data-type="html-inline"], [data-type="html-block"]')) return;
    let wrapper = img.closest<HTMLElement>('.itypora-image-fallback');
    if (!failed) { if (wrapper) wrapper.replaceWith(img); return; }
    if (!wrapper) {
      wrapper = document.createElement('span'); wrapper.className = 'itypora-image-fallback itypora-image-error';
      img.before(wrapper); wrapper.append(img);
      const label = document.createElement('span'); label.className = 'itypora-image-source'; label.contentEditable = 'false'; wrapper.append(label);
    }
    let src = img.getAttribute('src') || '';
    if (src.startsWith(assetBase)) {
      src = assetPath(src);
      // Lute drops the ./ of a path beside the document.
      if (!/^(?:\.|[\\/]|[a-z]:|file:)/i.test(src)) src = './' + src;
      try { src = decodeURI(src); } catch { /* An invalid escape is shown verbatim. */ }
    }
    const title = img.title ? ` "${img.title.replace(/"/g, '\\"')}"` : '';
    const value = `![${(img.alt || '').replace(/\]/g, '\\]')}](${/\s/.test(src) ? '<' + src + '>' : src}${title})`;
    const label = wrapper.querySelector('.itypora-image-source')!;
    if (label.textContent !== value) label.textContent = value;
  });
}
