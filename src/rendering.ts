import Vditor from 'vditor';
import DOMPurify from 'dompurify';
import { decorateCodeBlocks, decorateFailedImages } from './code-editing';

const previewSelector = '.vditor-ir__preview, .vditor-wysiwyg__preview';
const scripts = new Map<string, Promise<void>>();
// Separator before the definition copies; must match scripts/vditor-patch.mjs.
const definitionCopies = 'ITyporaDefinitionCopies';
// Vditor's link base for document-relative files (main.ts).
const assetBase = 'itypora-asset://document/';
// GitHub Octicons (MIT), as Typora draws them.
const alertIcons: Record<string, string> = {
  NOTE: 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  TIP: 'M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z',
  IMPORTANT: 'M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  WARNING: 'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  CAUTION: 'M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z'
};
const defaultAlertText: Record<string, string> = { NOTE: '✏️ Note', TIP: '💡 Tip', IMPORTANT: '❗ Important', WARNING: '⚠️ Warning', CAUTION: '🚨 Caution' };

// Presentation spans are not part of Vditor's document model. Restore the native
// DOM before parsing/serialization so editing, clipboard and undo retain Markdown.
// `editor` is 'ir' or 'wysiwyg' for Vditor's own DOM, null for other HTML such as a paste.
function nativeDocument(html: string, editor: 'ir' | 'wysiwyg' | null) {
  if (!/itypora-(?:task-content|callout-source|autolink|code-editor|image-fallback|footnote|linebreak|def-source)|<br|marker--link|<img|<a |<code/.test(html)) return html;
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  root.querySelectorAll('.itypora-footnote-label, .itypora-footnote-def, .itypora-linebreak, .itypora-def-view').forEach(el => el.remove());
  root.querySelectorAll('.itypora-footnote-number, .itypora-footnote-def-source, .itypora-def-source').forEach(el => el.replaceWith(...el.childNodes));
  root.querySelectorAll('.itypora-callout-source + .md-alert-text').forEach(el => el.remove());
  // Native default labels are generated text too; serializing them would add
  // an unwanted custom title (e.g. "[!NOTE] ✏️ Note") to the user's Markdown.
  root.querySelectorAll('.itypora-callout-source').forEach(el => el.remove());
  root.querySelectorAll<HTMLElement>('.itypora-task-content').forEach(el => el.replaceWith(...(el.dataset.space === undefined ? [] : [' ']), ...el.childNodes));
  root.querySelectorAll('.itypora-autolink').forEach(el => el.replaceWith(root.ownerDocument.createTextNode(el.textContent || '')));
  root.querySelectorAll('.itypora-code-editor > .vditor-copy, .itypora-code-gutter, .itypora-code-overlay').forEach(el => el.remove());
  // Chromium can split a block-level <code> into sibling elements when inserting
  // multiline text. Lute reads the first code only; join the native text runs,
  // retaining its <wbr> caret marker before handing the DOM back to the parser.
  root.querySelectorAll('.itypora-code-editor').forEach(pre => {
    const codes = [...pre.querySelectorAll(':scope > code')];
    const first = codes.shift();
    if (!first) return;
    for (const code of codes) { first.append(root.ownerDocument.createTextNode('\n'), ...code.childNodes); code.remove(); }
    first.normalize();
  });
  root.querySelectorAll('.itypora-image-fallback').forEach(el => { const img = el.querySelector('img'); if (img) el.replaceWith(img); });
  if (!editor) return root.innerHTML;
  const ir = editor === 'ir';
  // Lute writes these back incorrectly; give it source it serializes unchanged.
  // A hard break inside a paragraph becomes a soft break unless it is the
  // two-space form.
  const content = (node: Node | null) => Boolean(node && (node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim()));
  root.querySelectorAll('p br').forEach(br => {
    if (br.closest('td, th, pre, code, .vditor-ir__preview, .vditor-wysiwyg__preview, [data-type^="html-"]')) return;
    if (content(br.previousSibling) && content(br.nextSibling)) br.replaceWith('  \n');
  });
  // A link or image destination with whitespace loses its angle brackets. Lute
  // strips the document link base only as a plain prefix, so remove it first.
  const bracket = (value: string) => {
    if (!/\s/.test(value) || /[<>]/.test(value)) return value;
    return `<${value.startsWith(assetBase) ? value.slice(assetBase.length) : value}>`;
  };
  root.querySelectorAll('[data-type="a"] > .vditor-ir__marker--link, [data-type="img"] > .vditor-ir__marker--link').forEach(dest => { dest.textContent = bracket(dest.textContent || ''); });
  if (!ir) {
    root.querySelectorAll('img[src]').forEach(img => img.setAttribute('src', bracket(img.getAttribute('src')!)));
    root.querySelectorAll('a[href]').forEach(a => a.setAttribute('href', bracket(a.getAttribute('href')!)));
  }
  // WYSIWYG code blocks carry a ``` marker even for a ~~~ fence around content
  // with ```, which would close the block early. Use a longer fence.
  if (!ir) root.querySelectorAll<HTMLElement>('[data-type="code-block"][data-marker]').forEach(block => {
    const marker = block.dataset.marker || '```';
    const runs = block.querySelector('.vditor-wysiwyg__pre > code')?.textContent?.match(marker.startsWith('~') ? /~+/g : /`+/g) || [];
    const longest = Math.max(0, ...runs.map(run => run.length));
    if (longest >= marker.length) block.dataset.marker = marker[0].repeat(longest + 1);
  });
  // In a table cell, the IR serializer drops the escape of a pipe inside a code span.
  if (ir) root.querySelectorAll('td [data-type="code"] > code, th [data-type="code"] > code').forEach(code => {
    code.childNodes.forEach(node => { if (node instanceof Text) node.data = node.data.replace(/(^|[^\\])\|/g, '$1\\|'); });
  });
  return root.innerHTML;
}

function decorateInlinePresentation(root: HTMLElement) {
  root.querySelectorAll<HTMLLIElement>('li.vditor-task').forEach(li => {
    const input = li.querySelector(':scope > input[type="checkbox"]');
    if (!input || li.querySelector(':scope > .itypora-task-content')) return;
    const span = li.ownerDocument.createElement('span'); span.className = 'itypora-task-content';
    let next = input.nextSibling;
    while (next && !(next instanceof Element && /^(P|UL|OL|DIV|BLOCKQUOTE|PRE)$/.test(next.tagName))) {
      const following = next.nextSibling; span.append(next); next = following;
    }
    if (!span.hasChildNodes()) return;
    // Lute emits "<input> text"; Typora has no gap after the checkbox. The
    // space is restored by nativeDocument().
    const first = span.firstChild;
    if (first instanceof Text && first.data.startsWith(' ')) { first.deleteData(0, 1); span.dataset.space = ''; }
    input.after(span);
  });
  // Typora keeps inline break syntax visible: "  ↓" before a hard break and
  // the source of an inline <br> tag. The mark is presentation only.
  const doc = root.ownerDocument;
  root.querySelectorAll('.itypora-linebreak').forEach(mark => { if (mark.nextSibling?.nodeName !== 'BR') mark.remove(); });
  const content = (node: Node | null) => Boolean(node && (node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim()));
  root.querySelectorAll('br').forEach(br => {
    if (!content(br.previousSibling) || !content(br.nextSibling) || br.previousElementSibling?.classList.contains('itypora-linebreak')) return;
    if (br.parentElement?.closest('.vditor-ir__preview, .vditor-wysiwyg__preview, code, pre, [data-type^="html-"]')) return;
    const mark = doc.createElement('span'); mark.className = 'md-linebreak itypora-linebreak'; mark.contentEditable = 'false';
    const arrow = doc.createElement('span'); arrow.className = 'md-linebreak-mark';
    mark.append('  ', arrow); br.before(mark);
  });
  root.querySelectorAll<HTMLElement>('[data-type="html-inline"]').forEach(node => {
    node.classList.toggle('md-br', /^<br\s*\/?>$/i.test(node.querySelector(':scope > code')?.textContent?.trim() || ''));
  });
  // Typora shows a footnote reference by its label ("simple"), not a number,
  // and its definition as a styled "[^ name ] :" prefix. Both are presentation
  // only; nativeDocument() restores Vditor's nodes before parsing.
  root.querySelectorAll<HTMLElement>('sup[data-type="footnotes-ref"]').forEach(ref => {
    const label = (ref.dataset.footnotesLabel || '').replace(/^\^/, '');
    if (!label || ref.querySelector(':scope > .itypora-footnote-label')) return;
    // WYSIWYG keeps the generated number as a bare text node.
    [...ref.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()).forEach(node => {
      const number = doc.createElement('span'); number.className = 'itypora-footnote-number'; node.before(number); number.append(node);
    });
    const text = doc.createElement('span'); text.className = 'md-text itypora-footnote-label'; text.contentEditable = 'false'; text.textContent = label;
    const hidden = ref.querySelector(':scope > .vditor-ir__marker--hide, :scope > .itypora-footnote-number');
    if (hidden) hidden.after(text); else ref.append(text);
  });
  root.querySelectorAll<HTMLElement>('[data-type="footnotes-def"]').forEach(def => {
    const first = def.firstChild;
    const match = first?.nodeType === Node.TEXT_NODE ? first.textContent?.match(/^\[\^([^\]]+)\]:\s*$/) : null;
    if (!first || !match) return;
    const source = doc.createElement('span'); source.className = 'itypora-footnote-def-source';
    first.before(source); source.append(first);
    const name = doc.createElement('span'); name.className = 'md-def-name itypora-footnote-def'; name.contentEditable = 'false'; name.textContent = match[1];
    const split = doc.createElement('span'); split.className = 'md-def-split itypora-footnote-def'; split.contentEditable = 'false'; split.textContent = '\u00a0';
    source.after(name, split);
    def.classList.add('footnotes', 'md-def-footnote');
  });
  // Typora renders each link reference definition as "[ name ] : url "title"".
  // The view is presentation only; clicking it reveals the native source
  // (see installDocumentNavigation()).
  root.querySelectorAll<HTMLElement>('[data-type="link-ref-defs-block"]').forEach(block => {
    if (block.querySelector(':scope > .itypora-def-source')) return;
    const defs = (block.textContent || '').replace(/\n$/, '').split('\n')
      .map(line => line.match(/^ {0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/));
    if (!defs.length || defs.some(def => !def)) return;
    const source = doc.createElement('span'); source.className = 'itypora-def-source';
    source.append(...block.childNodes); block.append(source);
    // Vditor restores the caret at its <wbr> marker; it must stay visible.
    if (source.querySelector('wbr')) block.classList.add('itypora-def-editing');
    const view = doc.createElement('span'); view.className = 'itypora-def-view'; view.contentEditable = 'false';
    for (const [, name, url, ...titles] of defs as RegExpMatchArray[]) {
      const def = doc.createElement('span'); def.className = 'footnotes md-def-link';
      const part = (className: string, text: string) => { const span = doc.createElement('span'); span.className = className; span.textContent = text; def.append(span); };
      part('md-def-name', name); part('md-def-split md-def-f', '\u00a0'); part('md-def-content md-def-url md-auto-disp', url.replace(/^<(.*)>$/, '$1'));
      const title = titles.find(value => value !== undefined);
      if (title !== undefined) { part('md-def-split md-auto-hide', '\u00a0'); part('md-def-title md-auto-disp md-auto-hide', title); }
      view.append(def);
    }
    block.append(view);
  });
  root.querySelectorAll<HTMLElement>('[data-type="callout"]').forEach(block => {
    const icon = alertIcons[block.dataset.subtype || 'NOTE'];
    const header = block.querySelector(':scope > .callout-info');
    if (!icon || !header || header.querySelector('.itypora-callout-source')) return;
    const nodes = [...header.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    // Custom titles remain editable in the native engine. Theme-provided labels
    // replace only its generated default emoji/title, never user-authored text.
    if (nodes.map(node => node.textContent).join('').trim() !== defaultAlertText[block.dataset.subtype || 'NOTE']) return;
    const source = block.ownerDocument.createElement('span'); source.className = 'itypora-callout-source';
    nodes[0].before(source); source.append(...nodes);
    // Typora: span.md-alert-text > span.md-alert-text-container[data-text] > svg,
    // a smaller inline label within the header paragraph's normal line.
    const type = (block.dataset.subtype || 'NOTE').toLowerCase();
    const label = block.ownerDocument.createElement('span'); label.className = `md-alert-text md-alert-text-${type}`; label.contentEditable = 'false';
    const title = block.ownerDocument.createElement('span'); title.className = 'md-alert-text-container'; title.dataset.text = type;
    title.innerHTML = `<svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true"><path d="${icon}"></path></svg>`;
    label.append(title); source.after(label);
  });
}
function loadScript(name: string, file: string) {
  if (!scripts.has(name)) scripts.set(name, new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.id = name;
    script.src = new URL(`./vendor/vditor/dist/js/${file}`, document.baseURI).href;
    script.onload = () => resolve(); script.onerror = () => { scripts.delete(name); script.remove(); reject(new Error('无法加载本地图表组件')); };
    document.head.append(script);
  }));
  return scripts.get(name)!;
}

// Vditor leaves inline HTML as invisible source markers. Use its native
// source/preview node contract so the serializer and undo keep the HTML source.
export function installHtmlRendering(editor: Vditor, localImages: boolean) {
  const lute = editor.vditor.lute;
  // Keep both the editable renderer and the standalone preview enabled.
  lute.SetGFMAutoLink(true);
  for (const name of ['SpinVditorIRDOM', 'SpinVditorDOM', 'VditorIRDOM2Md', 'VditorDOM2Md', 'VditorIRDOM2HTML', 'VditorDOM2HTML', 'HTML2Md', 'HTML2VditorIRDOM', 'HTML2VditorDOM'] as const) {
    const original = lute[name].bind(lute);
    const editorDom = name.startsWith('HTML2') ? null : name.includes('IR') ? 'ir' : 'wysiwyg';
    lute[name] = (input: string) => original(nativeDocument(input, editorDom));
  }
  // Restrict Lute's relaxed CJK emphasis rules to plain inline text. Enabling
  // Protyle mode for the editor would also change lists, tables and serialization.
  const relaxed = (window as unknown as {Lute: {New(): typeof lute & {SetProtyleWYSIWYG(value: boolean): void}}}).Lute.New();
  relaxed.SetProtyleWYSIWYG(true);
  for (const name of ['Md2VditorIRDOM', 'SpinVditorIRDOM', 'Md2VditorDOM', 'SpinVditorDOM'] as const) {
    const original = lute[name].bind(lute);
    const ir = name.includes('IR');
    lute[name] = (input: string) => {
      let html = original(input);
      // Lute puts a caret marker in every empty code block. Rendering a document
      // has no caret, and a stray marker would later capture Vditor's restore.
      if (name.startsWith('Md') && !input.includes('<wbr>')) html = html.replace(/<wbr>/g, '');
      const indented = ir && /data-type="code-block" class="vditor-ir__node"><pre/.test(html);
      if (!indented && !html.includes('html-inline') && !html.includes('html-block') && !html.includes('**') && !html.includes('__') && !html.includes('vditor-task') && !html.includes('callout-info') && !html.includes('link-ref-defs-block') && !html.includes('[!') && !/https?:|@/.test(html)) return html;
      const root = new DOMParser().parseFromString(html, 'text/html').body;
      const inert = root.ownerDocument;
      // An indented code block has no fence markers in Lute's IR DOM, so Lute
      // serializes its lines as a paragraph. Give it the fenced form.
      if (indented) root.querySelectorAll('[data-type="code-block"]').forEach(block => {
        if (block.querySelector(':scope > [data-type="code-block-open-marker"]')) return;
        const code = block.querySelector(':scope > pre > code')?.textContent || '';
        const fence = '`'.repeat(Math.max(3, ...(code.match(/`+/g) || []).map(run => run.length + 1)));
        const open = inert.createElement('span'); open.dataset.type = 'code-block-open-marker'; open.textContent = fence;
        const info = inert.createElement('span'); info.className = 'vditor-ir__marker vditor-ir__marker--info'; info.dataset.type = 'code-block-info'; info.textContent = '\u200b';
        const close = inert.createElement('span'); close.dataset.type = 'code-block-close-marker'; close.textContent = fence;
        block.prepend(open, info); block.append(close);
      });
      // Editable Lute output drops reference-definition titles. Read definitions
      // from its Markdown AST (not a regex over code fences) and restore them in
      // the native definition block, so subsequent edits retain the title too.
      if (html.includes('link-ref-defs-block')) {
        const markdown = name.startsWith('Md') ? input : ir ? lute.VditorIRDOM2Md(input) : lute.VditorDOM2Md(input);
        type Ast = { Type: string; Data?: string; Children?: Ast[] };
        const ast: Ast = JSON.parse((lute as typeof lute & {RenderJSON(source: string): string}).RenderJSON(markdown));
        const titles = new Map<string, string>();
        const key = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();
        const visit = (node: Ast) => {
          if (node.Type === 'NodeLinkRefDef') {
            const title = node.Children?.[0]?.Children?.find(child => child.Type === 'NodeLinkTitle')?.Data;
            if (title) titles.set(key(node.Data || ''), title);
          }
          node.Children?.forEach(visit);
        };
        visit(ast);
        root.querySelectorAll('[data-type="link-ref-defs-block"]').forEach(block => {
          // Keep Vditor's <wbr> caret marker: a title added to an earlier line
          // shifts it; one added to the caret's own line follows it.
          const wbr = block.querySelector('wbr');
          let caret = -1, shift = 0;
          if (wbr) { const range = inert.createRange(); range.selectNodeContents(block); range.setEndBefore(wbr); caret = range.toString().length; }
          block.textContent = (block.textContent || '').replace(/^(\[([^\]]+)\]:[^\n]*)(?=\n|$)/gm, (line, _definition, label: string, offset: number) => {
            const title = titles.get(key(label));
            if (!title) return line;
            const suffix = ` "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            if (caret >= 0 && offset + line.length < caret) shift += suffix.length;
            return line + suffix;
          });
          const text = block.firstChild as Text | null;
          if (caret >= 0 && text?.nodeType === Node.TEXT_NODE) text.splitText(Math.min(caret + shift, text.length)).before(inert.createElement('wbr'));
          else if (caret >= 0) block.append(inert.createElement('wbr'));
        });
        root.querySelectorAll<HTMLElement>('[data-type="link-ref"]').forEach(link => {
          const label = link.dataset.linkLabel || link.querySelector('.vditor-ir__marker--link')?.textContent?.slice(1, -1) || '';
          const title = titles.get(key(label));
          if (title) link.title = title;
        });
      }
      root.querySelectorAll<HTMLElement>('blockquote:not([data-type="callout"])').forEach(block => {
        const header = block.firstElementChild;
        const match = block.textContent?.trim().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/);
        if (!match || header?.tagName !== 'P' || block.children.length !== 1) return;
        block.dataset.type = 'callout'; block.dataset.subtype = match[1]; block.classList.add('callout');
        header.className = ir ? 'callout-info vditor-ir__node' : 'callout-info';
        const marker = inert.createElement('span'); marker.className = ir ? 'vditor-ir__marker' : 'vditor-wysiwyg__callout-marker';
        marker.textContent = `[!${match[1]}] `; header.replaceChildren(marker, inert.createTextNode(defaultAlertText[match[1]]));
        const body = inert.createElement('p'); body.dataset.block = '0'; body.append(inert.createElement('br')); block.append(body);
      });
      const walker = inert.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      // Lute misses autolinks next to some CJK punctuation in editable documents.
      // Decorate only untouched text runs; unwrap them on serialization so bare
      // URLs and <email> source do not become explicit Markdown links on save.
      for (const text of texts) {
        if (text.parentElement?.closest('pre, code, a, .vditor-ir__marker, [data-type="a"], [data-type="link-ref"], [data-type="link-ref-defs-block"], [data-type="backslash"], [data-type="html-inline"], [data-type="html-block"], .itypora-autolink, .vditor-ir__preview, .vditor-wysiwyg__preview')) continue;
        const pattern = /https?:\/\/[^\s<>，。；！？、]+|<[\w.!#$%&'*+/=?^`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d.-]*[A-Za-z\d])?\.[A-Za-z]{2,}>/g;
        const parts: Node[] = []; let end = 0;
        for (const match of text.data.matchAll(pattern)) {
          let value = match[0]; const email = value.startsWith('<');
          if (!email) {
            value = value.replace(/[.,!?;:]+$/, '');
            while (value.endsWith(')') && (value.match(/\)/g)||[]).length > (value.match(/\(/g)||[]).length) value = value.slice(0,-1);
          }
          if (!value) continue;
          parts.push(inert.createTextNode(text.data.slice(end, match.index)));
          const span = inert.createElement('span'); span.className = 'itypora-autolink';
          const link = inert.createElement('a'); link.textContent = email ? value.slice(1,-1) : value;
          link.setAttribute('href', email ? 'mailto:' + link.textContent : value);
          if (email) {
            const start = inert.createElement('span'), finish = inert.createElement('span');
            start.className = finish.className = 'itypora-autolink-marker'; start.textContent = '<'; finish.textContent = '>';
            span.append(start, link, finish);
          } else span.append(link);
          parts.push(span); end = match.index + value.length;
        }
        if (parts.length) { parts.push(inert.createTextNode(text.data.slice(end))); text.replaceWith(...parts); }
      }
      // Autolink decoration may have split a run containing CJK emphasis.
      texts.length = 0; walker.currentNode = root;
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      for (const text of texts) {
        if (!/(\*\*|__)[^\n]*[\u3000-\u303f\uff00-\uffef]\1/.test(text.data) || text.parentElement?.closest('pre, code, style, script, .vditor-ir__marker, .vditor-ir__preview, .vditor-wysiwyg__preview')) continue;
        const parsed = new DOMParser().parseFromString(ir ? relaxed.Md2VditorIRDOM(text.data) : relaxed.Md2VditorDOM(text.data), 'text/html').body;
        if (parsed.childElementCount !== 1 || parsed.firstElementChild?.tagName !== 'P' || !parsed.querySelector('strong')) continue;
        // Parsing the run as a paragraph trims its edge whitespace, e.g. the
        // space before following inline code, which would then be lost on save.
        const lead = text.data.match(/^\s*/)![0], trail = text.data.match(/\s*$/)![0];
        text.replaceWith(...[lead, ...parsed.firstElementChild.childNodes, trail].filter(node => node !== ''));
      }
      const sourceOf = (node: Element) => (ir ? node.querySelector(':scope > code') : node)?.textContent?.replace(/^\u200b/, '') || '';
      const markers = [...root.querySelectorAll(ir ? 'span[data-type="html-inline"]' : 'code[data-type="html-inline"]')];
      for (const start of markers) {
        if (!root.contains(start) || start.closest(previewSelector) || (!ir && start.parentElement?.dataset.type === 'html-inline')) continue;
        let source = sourceOf(start);
        const open = source.match(/^<(mark|sub|sup|u|kbd|span|b|strong|i|em|s|del|small|ruby|rt)\b[^>]*>$/i);
        let end: Node = start;
        if (open) {
          let depth = 1;
          for (let next = start.nextSibling; next; next = next.nextSibling) {
            if (!(next instanceof Element) || next.getAttribute('data-type') !== 'html-inline') continue;
            const text = sourceOf(next);
            if (new RegExp(`^<${open[1]}(?:\\s[^>]*)?>$`, 'i').test(text)) depth++;
            if (new RegExp(`^</${open[1]}\\s*>$`, 'i').test(text) && --depth === 0) { end = next; break; }
          }
          if (end === start) continue;
          const range = document.createRange(); range.setStartBefore(start); range.setEndAfter(end);
          const fragment = document.createElement('p'); fragment.append(range.cloneContents());
          source = (ir ? lute.VditorIRDOM2Md(fragment.outerHTML) : lute.VditorDOM2Md(fragment.outerHTML)).trimEnd();
        } else if (!/^<(?:img|br)\b[^>]*\/?\s*>$/i.test(source)) continue;
        const node = inert.createElement('span'); node.dataset.type = 'html-inline';
        node.className = ir ? 'vditor-ir__node' : 'vditor-wysiwyg__block';
        const code = inert.createElement('code'); code.textContent = source;
        if (ir) code.className = 'vditor-ir__marker vditor-ir__marker--pre';
        else { code.dataset.type = 'html-inline'; code.style.display = 'none'; }
        const preview = inert.createElement('span'); preview.className = ir ? 'vditor-ir__preview' : 'vditor-wysiwyg__preview';
        preview.dataset.render = '1';
        const rendered = inert.createElement('div'); rendered.innerHTML = lute.Md2HTML(source);
        preview.innerHTML = DOMPurify.sanitize(rendered.childElementCount === 1 && rendered.firstElementChild?.tagName === 'P' ? rendered.firstElementChild.innerHTML : rendered.innerHTML,
          { FORBID_TAGS: ['style', 'iframe', 'form', 'input'], FORBID_ATTR: ['id', 'class'], ALLOW_DATA_ATTR: false });
        node.append(code, preview);
        const range = document.createRange(); range.setStartBefore(start); range.setEndAfter(end); range.deleteContents(); range.insertNode(node);
      }
      if (localImages) root.querySelectorAll<HTMLImageElement>(`${previewSelector.split(', ').map(s => `${s} img`).join(', ')}`).forEach(img => {
        const src = img.getAttribute('src');
        if (src && !/^(?:[a-z][a-z\d+.-]*:|\/\/|\/|\\)/i.test(src)) img.src = new URL(src, assetBase).href;
      });
      decorateInlinePresentation(root);
      return root.innerHTML;
    };
  }
  // The patched Vditor (scripts/vditor-patch.mjs) keeps definitions in place and
  // renders copies of them after a separator, so references in an edited block
  // resolve. Drop the copies.
  for (const name of ['SpinVditorIRDOM', 'SpinVditorDOM'] as const) {
    const original = lute[name].bind(lute);
    lute[name] = (input: string) => {
      const html = original(input);
      if (!input.includes(definitionCopies)) return html;
      const box = document.createElement('template'); box.innerHTML = html;
      const separator = [...box.content.children].find(child => child.textContent === definitionCopies);
      while (separator?.nextSibling) separator.nextSibling.remove();
      separator?.remove();
      return box.innerHTML;
    };
  }
}

type Mermaid ={ initialize(config: Record<string, unknown>): void; render(id: string, code: string, container?: Element): Promise<{svg: string}> };
const diagramState = new WeakMap<Element, string>();
// Rendered diagrams by source, configuration and width, so re-rendering the
// document (after editing in source mode) does not lay every diagram out again.
const diagramCache = new Map<string, string>();
let diagramQueue = Promise.resolve();
function showDiagram(element: HTMLElement, svg: string) {
  element.innerHTML = svg;
  // Mermaid 11.16 renders "else" branch labels as sectionTitle; Typora's
  // Mermaid 11.13 (and theme CSS) uses loopText for every fragment label.
  element.querySelectorAll('svg[aria-roledescription="sequence"] text.sectionTitle').forEach(text => text.classList.add('loopText'));
  element.dataset.processed = 'true'; element.classList.remove('diagram-error');
}
function diagramConfig() {
  const surface = document.querySelector('.editor-surface')!;
  const style = getComputedStyle(surface);
  const value = (name: string) => style.getPropertyValue(name).trim();
  const requested = value('--mermaid-theme');
  return {
    startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
    theme: ['default', 'neutral', 'dark', 'forest', 'base'].includes(requested) ? requested : document.documentElement.style.colorScheme === 'dark' ? 'dark' : 'default',
    // Typora's diagram defaults (read from its mermaid.mermaidAPI.getConfig()).
    // Typora 1.13 honours --mermaid-theme but keeps sans-serif even when a
    // theme sets --mermaid-font-family (verified with Matcha).
    fontFamily: 'sans-serif',
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: value('--mermaid-flowchart-curve') || 'linear' },
    sequence: { useMaxWidth: false, diagramMarginX: 8, diagramMarginY: 8, boxMargin: 8, showSequenceNumbers: value('--mermaid-sequence-numbers') === 'on' },
    gantt: { useMaxWidth: true, leftPadding: Number(value('--mermaid-gantt-left-padding')) || 75, rightPadding: 20 }
  };
}
function renderDiagram(element: HTMLElement) {
  const block = element.closest('[data-type="code-block"]');
  const source = block?.querySelector('pre > code.language-mermaid')?.textContent || element.textContent || '';
  const config = diagramConfig();
  const key = JSON.stringify([source, config]);
  if (diagramState.get(element) === key) return;
  diagramState.set(element, key);
  const cached = diagramCache.get(key + element.clientWidth);
  if (cached) { showDiagram(element, cached); return; }
  diagramQueue = diagramQueue.then(async () => {
    // Let the page paint between diagrams instead of laying them all out in one task.
    await new Promise(resolve => setTimeout(resolve));
    if (!element.isConnected || diagramState.get(element) !== key) return;
    await loadScript('itypora-mermaid', 'mermaid/mermaid.min.js');
    await document.fonts.ready;
    if (!element.isConnected || diagramState.get(element) !== key) return;
    const mermaid = (window as unknown as {mermaid: Mermaid}).mermaid;
    mermaid.initialize(config);
    // Render inside the panel as Typora does: Mermaid measures labels under the
    // document's CSS and sizes a gantt chart to its container's width.
    const host = element.clientWidth ? document.createElement('div') : undefined;
    if (host) { host.style.cssText = `position: absolute; visibility: hidden; left: 0; top: 0; width: ${element.clientWidth}px`; element.append(host); }
    const width = element.clientWidth;
    const result = await mermaid.render('diagram' + crypto.randomUUID().replaceAll('-', ''), source, host).finally(() => host?.remove());
    diagramCache.delete(key + width); diagramCache.set(key + width, result.svg);
    if (diagramCache.size > 64) diagramCache.delete(diagramCache.keys().next().value!);
    if (!element.isConnected || diagramState.get(element) !== key) return;
    showDiagram(element, result.svg);
  }).catch((error: unknown) => {
    if (!element.isConnected || diagramState.get(element) !== key) return;
    // Text-only diagnostics: a bad diagram must not break its neighbours.
    element.textContent = `图表语法错误：${error instanceof Error ? error.message : String(error)}`;
    element.classList.add('diagram-error'); element.dataset.processed = 'true';
  });
}

// Use the documented rendering adapter to avoid competing asynchronous renders.
Vditor.adapterRender.mermaidRenderAdapter.getElements = root => {
  root.querySelectorAll<HTMLElement>('.language-mermaid').forEach(renderDiagram);
  return document.createDocumentFragment().querySelectorAll('.language-mermaid');
};

export function refreshRendering(editor: Vditor) {
  const dark = document.documentElement.style.colorScheme === 'dark';
  editor.setTheme(dark ? 'dark' : 'classic', undefined, dark ? 'github-dark' : 'github');
  const root = document.querySelector<HTMLElement>('#write');
  if (root) {
    decorateCodeBlocks(root);
    // The code palette is a stylesheet loaded asynchronously by Vditor.
    // Refresh painted text and gutter geometry after either kind of theme change.
    document.getElementById('vditorHljsStyle')?.addEventListener('load', () => {
      if (root.isConnected) decorateCodeBlocks(root);
    }, {once: true});
  }
  document.querySelectorAll<HTMLElement>(`${previewSelector.split(', ').map(s => `${s} .language-mermaid`).join(', ')}`).forEach(renderDiagram);
}

const measured = new WeakSet<HTMLElement>();
export function decorateRendering(root: HTMLElement) {
  // Typora sizes wide diagrams by the window (98vw); here the writing element
  // is the scroll container and can be narrower (sidebar), so use its width.
  if (!measured.has(root)) {
    measured.add(root);
    // Source mode hides the editor; keep the last width meanwhile.
    new ResizeObserver(() => { if (root.clientWidth) root.style.setProperty('--itypora-write-width', root.clientWidth + 'px'); }).observe(root);
    // A full-width gantt chart reaches into the end padding, which Chromium
    // counts as scrollable overflow; the column itself never scrolls sideways.
    root.addEventListener('scroll', () => { if (root.scrollLeft) root.scrollLeft = 0; });
  }
  decorateInlinePresentation(root);
  root.querySelectorAll<HTMLParagraphElement>('p').forEach(p => {
    const onlyImage = p.querySelectorAll('img').length === 1 && [...p.childNodes].every(node => {
      if (node.nodeType === Node.TEXT_NODE) return !node.textContent?.trim();
      if (!(node instanceof Element)) return false;
      return node.tagName === 'IMG' || node.getAttribute('data-type') === 'img' ||
        (node.getAttribute('data-type') === 'html-inline' && /^<img\b/i.test(node.querySelector('code')?.textContent || ''));
    });
    p.classList.toggle('itypora-image-only', onlyImage);
  });
  root.querySelectorAll<HTMLElement>('[data-type="link-ref"]').forEach(link => {
    const label = [...link.children].find(el => !el.classList.contains('vditor-ir__marker')) || link;
    label.classList.add('itypora-reference-link');
  });
  root.querySelectorAll<HTMLElement>('[data-type="a"], [data-type="img"]').forEach(node => {
    const title = node.querySelector(':scope > .vditor-ir__marker--title')?.textContent?.trim().replace(/^["']|["']$/g, '');
    const label = node.querySelector<HTMLElement>(':scope > .vditor-ir__link, :scope > img');
    if (label && title) label.title = title;
  });
  root.querySelectorAll('[data-type="footnotes-ref"]').forEach(el => el.classList.add('md-footnote'));
  root.querySelectorAll('[data-type="footnotes-block"]').forEach(el => el.classList.add('itypora-footnotes'));
  // One "↩" per reference, as Typora renders after each definition.
  const references = new Map<string, number>();
  root.querySelectorAll<HTMLElement>('sup[data-type="footnotes-ref"]').forEach(ref => {
    const label = (ref.dataset.footnotesLabel || '').replace(/^\^/, '');
    references.set(label, (references.get(label) || 0) + 1);
  });
  root.querySelectorAll<HTMLElement>('[data-type="footnotes-def"]').forEach(def => {
    const count = references.get(def.querySelector(':scope > .md-def-name')?.textContent || '') || 0;
    let area = def.querySelector<HTMLElement>(':scope > .md-reverse-footnote-area');
    if (area?.querySelectorAll('.reversefootnote').length === count) return;
    area?.remove();
    if (!count) return;
    area = document.createElement('span'); area.className = 'md-reverse-footnote-area itypora-footnote-def'; area.contentEditable = 'false';
    for (let i = 0; i < count; i++) {
      const link = document.createElement('a'); link.className = 'reversefootnote'; link.title = '回到文档'; link.dataset.index = String(i); link.textContent = '↩';
      area.append(' ', link);
    }
    (def.querySelector(':scope > p') || def.lastChild)?.after(area);
  });
  root.querySelectorAll('[data-type="yaml-front-matter"] > pre').forEach(el => el.classList.add('md-meta-block'));
  // The inner source code and rendered preview also carry data-type="math-block".
  root.querySelectorAll('[data-type="math-block"]').forEach(el => el.classList.toggle('md-math-block', !el.classList.contains('language-math')));
  const headings = [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')];
  root.querySelectorAll<HTMLElement>('[data-type="toc-block"]').forEach(toc => {
    toc.classList.add('md-toc');
    // Typora renders a flat list, so themes style `.md-toc-h1 .md-toc-inner`
    // as a descendant; Vditor's nested lists would leak level 1 rules into
    // every child. Vditor rebuilds the TOC's innerHTML on each change with
    // each entry as its outline panel's `<svg></svg><span>title</span>`; the
    // unsized svg would show as a 300×150 box, so only the title is kept.
    const list = toc.querySelector(':scope > ul');
    if (!list) return;
    const content = document.createElement('p'); content.className = 'md-toc-content'; content.setAttribute('role', 'list');
    list.querySelectorAll<HTMLElement>('[data-target-id]').forEach((source, i) => {
      const heading = headings[i]; if (!heading) return;
      const item = document.createElement('span'); item.className = 'md-toc-item md-toc-h' + heading.tagName[1]; item.setAttribute('role', 'listitem');
      const inner = document.createElement('a'); inner.className = 'md-toc-inner';
      inner.dataset.targetId = source.dataset.targetId; inner.dataset.ityporaTargetId = heading.id;
      const icon = source.firstElementChild, title = icon?.nextElementSibling;
      const outline = icon?.tagName.toLowerCase() === 'svg' && title?.tagName === 'SPAN' && !title.nextSibling;
      inner.append(...(outline ? title.childNodes : source.childNodes)); item.append(inner); content.append(item);
    });
    list.replaceWith(content);
  });
  // Only Markdown tables sit in Typora's figure.table-figure; HTML tables are plain.
  root.querySelectorAll('table').forEach(table => table.classList.toggle('table-figure', !table.closest('.language-mermaid, [data-type="html-block"], [data-type="html-inline"]')));
  // Typora shows an HTML block that renders nothing (a comment or a lone
  // closing tag) as a paragraph of its dimmed source. The paragraph lives in
  // the preview, which Lute ignores when serializing.
  root.querySelectorAll<HTMLElement>('[data-type="html-block"]').forEach(block => {
    const preview = block.querySelector<HTMLElement>(':scope > .vditor-ir__preview, :scope > .vditor-wysiwyg__preview');
    const source = (block.querySelector(':scope > pre > code')?.textContent || '').trim();
    if (!preview) return;
    const shown = preview.querySelector(':scope > .itypora-html-source');
    if (shown?.textContent === source) return;
    shown?.remove();
    const blank = Boolean(source) && !preview.childElementCount && !preview.textContent?.trim();
    block.classList.toggle('itypora-html-source', blank);
    if (!blank) return;
    const paragraph = document.createElement('p'); paragraph.className = 'itypora-html-source';
    const text = document.createElement('span'); text.className = source.startsWith('<!--') ? 'md-comment' : 'md-tag md-raw-inline';
    text.textContent = source; paragraph.append(text); preview.append(paragraph);
  });
  root.querySelectorAll<HTMLElement>('[data-type="callout"]').forEach(block => {
    block.classList.add('md-alert', 'md-alert-' + (block.dataset.subtype || 'note').toLowerCase());
    // A custom title is the header's own editable text; style it as the label.
    const header = block.querySelector('.callout-info');
    header?.classList.toggle('md-alert-text', !header.querySelector('.md-alert-text'));
  });
  root.querySelectorAll<HTMLElement>('pre.vditor-ir__preview, pre.vditor-wysiwyg__preview').forEach(pre => {
    const code = pre.querySelector(':scope > code');
    if (!code) return;
    pre.classList.add('md-fences'); pre.setAttribute('lang', [...code.classList].find(c=>c.startsWith('language-'))?.slice(9) || '');
  });
  root.querySelectorAll<HTMLElement>(`${previewSelector.split(', ').map(s => `${s} .language-mermaid`).join(', ')}`).forEach(el => el.classList.add('md-diagram-panel'));
  // Typora renders an unfocused diagram as pre.md-fences.md-fences-advanced;
  // matching its classes lets the theme's box rules apply unchanged.
  root.querySelectorAll<HTMLElement>('pre.vditor-ir__preview').forEach(pre => {
    const diagram = Boolean(pre.querySelector(':scope > .md-diagram-panel'));
    if (!diagram && !pre.classList.contains('md-diagram')) return;
    for (const name of ['md-fences', 'md-fences-advanced', 'md-diagram']) pre.classList.toggle(name, diagram);
    if (diagram) pre.setAttribute('lang', 'mermaid');
    pre.parentElement?.classList.toggle('itypora-diagram-block', diagram);
    // Typora widens an unfocused gantt chart to the window (see style.css).
    const source = pre.parentElement?.querySelector(':scope > pre > code.language-mermaid')?.textContent || '';
    pre.parentElement?.classList.toggle('itypora-gantt', diagram && /^\s*gantt\b/.test(source));
  });
  decorateCodeBlocks(root);
  decorateFailedImages(root);
}

export function renderCodeMenu(_code: HTMLElement, menu: HTMLElement) {
  const button = menu.querySelector<HTMLElement>('span')!;
  button.removeAttribute('onclick'); button.removeAttribute('onmouseover');
  button.setAttribute('role', 'button'); button.tabIndex = 0;
  const copy = (event: Event) => {
    event.preventDefault(); event.stopPropagation();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const textarea = menu.querySelector('textarea')!;
    textarea.select();
    const copied = document.execCommand('copy');
    focus?.focus({preventScroll:true});
    if (range && selection) { selection.removeAllRanges(); selection.addRange(range); }
    button.setAttribute('aria-label', copied ? '已复制' : '复制失败，请选择代码后复制');
  };
  button.addEventListener('click', copy);
  button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') void copy(event); });
  button.addEventListener('mouseover', () => button.setAttribute('aria-label', '复制'));
}

export function installDocumentNavigation(container: HTMLElement) {
  // A styled link definition switches to its source while the caret is in it.
  const editDefinitions = () => {
    const anchor = getSelection()?.anchorNode ?? null;
    container.querySelectorAll('[data-type="link-ref-defs-block"]').forEach(block => block.classList.toggle('itypora-def-editing', block.contains(anchor)));
  };
  document.addEventListener('selectionchange', editDefinitions);
  container.addEventListener('mousedown', event => {
    const block = (event.target instanceof Element ? event.target : null)?.closest('.itypora-def-view')?.parentElement;
    const source = block?.querySelector(':scope > .itypora-def-source');
    if (!block || !source) return;
    event.preventDefault();
    block.classList.add('itypora-def-editing');
    (block.closest<HTMLElement>('[contenteditable="true"]'))?.focus();
    const text = source.lastChild?.nodeType === Node.TEXT_NODE ? source.lastChild as Text : null;
    const range = document.createRange();
    if (text) range.setStart(text, text.data.replace(/\n$/, '').length); else range.selectNodeContents(source);
    range.collapse(true); getSelection()?.removeAllRanges(); getSelection()?.addRange(range); editDefinitions();
  });
  container.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const back = target?.closest<HTMLElement>('.reversefootnote');
    if (back) {
      const label = back.closest('[data-type="footnotes-def"]')?.querySelector(':scope > .md-def-name')?.textContent || '';
      const refs = [...container.querySelectorAll<HTMLElement>('#write sup[data-type="footnotes-ref"]')].filter(ref => (ref.dataset.footnotesLabel || '').replace(/^\^/, '') === label);
      refs[Number(back.dataset.index) || 0]?.scrollIntoView({block:'center'});
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    const toc = target?.closest<HTMLElement>('[data-itypora-target-id]');
    if (toc) {
      const heading = document.getElementById(toc.dataset.ityporaTargetId || '');
      if (heading && container.contains(heading)) { event.preventDefault(); event.stopImmediatePropagation(); heading.scrollIntoView({block:'start'}); }
      return;
    }
    const anchor = target?.closest('a, [data-type="a"]');
    const href = anchor?.getAttribute('href') || anchor?.querySelector(':scope > .vditor-ir__marker--link')?.textContent || '';
    if (!href.startsWith('#')) return;
    let name: string;
    try { name = decodeURIComponent(href.slice(1)); } catch { return; }
    const heading = [...container.querySelectorAll<HTMLElement>('#write h1, #write h2, #write h3, #write h4, #write h5, #write h6')]
      .find(el => el.id === name || el.id.replace(/^(ir|wysiwyg)-/, '').replace(/_\d+$/, '') === name);
    if (heading) { event.preventDefault(); event.stopImmediatePropagation(); heading.scrollIntoView({block:'start'}); }
  }, true);
}
