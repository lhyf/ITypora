import { blockAt, blockStarts, count, nth, words } from './position.mjs';
import type { SourceEditor } from './source-editor';

// Keeps the caret, or the first visible block, at the same place on screen when
// switching between the rendered editor and source mode.

// A source offset and its distance in pixels below the top of the scroll area.
export type Spot = { offset: number; y: number };

// Rendered previews and widgets are not part of the Markdown.
const rendered = '.vditor-ir__preview, .vditor-wysiwyg__preview, [contenteditable="false"]';
const keyLength = 16;

function texts(block: Element): Text[] {
  const result: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => node instanceof Element ? node.matches(rendered) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) result.push(node as Text);
  return result;
}

// The words a block starts with.
function head(block: Element) {
  if (block.matches('[data-type="toc-block"]')) return 'toc';
  let text = '';
  for (const node of texts(block)) { text += words(node.data); if (text.length >= keyLength) break; }
  return text || words([...block.querySelectorAll('img')].map(img => img.alt).join(''));
}

function layout(write: HTMLElement, value: string) {
  const blocks = [...write.children] as HTMLElement[];
  const lines = value.split('\n'), lineStart: number[] = [];
  lines.reduce((at, line) => { lineStart.push(at); return at + line.length + 1; }, 0);
  const starts = blockStarts(blocks.map(head), lines);
  // Source range of block i: up to the next block that starts on a later line.
  const range = (i: number) => {
    const next = starts.find((line, j) => j > i && line > starts[i]);
    return { from: lineStart[starts[i]] ?? 0, to: next === undefined ? value.length : lineStart[next] - 1 };
  };
  return { blocks, lines, lineStart, starts, range };
}

function caretRect(range: Range) {
  const caret = range.cloneRange(); caret.collapse(true);
  const node = caret.startContainer;
  return caret.getClientRects()[0] ?? (node instanceof Element ? node : node.parentElement)?.getBoundingClientRect();
}

// Where the rendered editor's caret, or else its first visible block, is in `value`.
export function previewSpot(write: HTMLElement, value: string): Spot {
  const { blocks, lines, lineStart, starts, range } = layout(write, value);
  if (!blocks.length) return { offset: 0, y: 0 };
  const top = write.getBoundingClientRect().top, bottom = top + write.clientHeight;
  const selection = getSelection();
  const caret = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const rect = caret && write.contains(caret.startContainer) ? caretRect(caret) : undefined;
  const index = caret ? blocks.findIndex(block => block.contains(caret.startContainer)) : -1;
  if (caret && rect && index >= 0 && rect.bottom > top && rect.top < bottom) {
    const { from, to } = range(index), segment = value.slice(from, to), node = caret.startContainer;
    const nodes = texts(blocks[index]), at = node instanceof Text ? nodes.indexOf(node) : -1;
    let offset = from;
    if (at >= 0) {
      // The text around the caret, at its occurrence in the block.
      const before = nodes.slice(0, at).map(text => text.data).join('') + (node as Text).data.slice(0, caret.startOffset);
      const own = (node as Text).data.slice(0, caret.startOffset).replace(/​/g, ''), after = (node as Text).data.slice(caret.startOffset).replace(/​/g, '');
      search: {
        for (let k = Math.min(keyLength, own.length); k > 0; k--) {
          const key = own.slice(-k), found = nth(segment, key, count(before, key));
          if (found >= 0) { offset = from + found + k; break search; }
        }
        for (let k = Math.min(keyLength, after.length); k > 0; k--) {
          const key = after.slice(0, k), found = nth(segment, key, count(before, key) + 1);
          if (found >= 0) { offset = from + found; break search; }
        }
      }
    }
    return { offset, y: rect.top - top };
  }
  // Keep the first visible block in place; within a tall one, the visible line.
  let first = blocks.findIndex(block => block.getBoundingClientRect().bottom > top);
  if (first < 0) first = blocks.length - 1;
  const box = blocks[first].getBoundingClientRect();
  if (box.top >= top || !box.height) return { offset: lineStart[starts[first]] ?? 0, y: box.top - top };
  const { from, to } = range(first);
  const firstLine = starts[first], lastLine = Math.max(firstLine, value.slice(0, to).split('\n').length - 1);
  const line = Math.min(lines.length - 1, firstLine + Math.round((top - box.top) / box.height * (lastLine - firstLine)));
  return { offset: line > firstLine ? lineStart[line] : from, y: 0 };
}

// Puts the rendered editor's caret at `spot` and scrolls it to the same height.
export function showInPreview(write: HTMLElement, value: string, spot: Spot) {
  const { blocks, lineStart, starts, range } = layout(write, value);
  if (!blocks.length) return;
  const line = Math.max(0, value.slice(0, spot.offset).split('\n').length - 1);
  const index = blockAt(starts, line), block = blocks[index];
  const { from } = range(index);
  const nodes = texts(block), text = nodes.map(node => node.data).join('');
  const lineBegin = Math.max(from, lineStart[line]), lineEnd = value.indexOf('\n', spot.offset);
  const before = spot.offset >= from ? value.slice(from, spot.offset) : '';
  const own = spot.offset >= lineBegin ? value.slice(lineBegin, spot.offset) : '';
  const after = value.slice(spot.offset, lineEnd < 0 ? value.length : lineEnd);
  let position = -1;
  // The source text before the caret, dropping trailing syntax such as `**`
  // that the rendered text may not show.
  search: {
    for (let trim = 0; trim <= Math.min(4, own.length); trim++) {
      const base = own.slice(0, own.length - trim), prefix = before.slice(0, before.length - trim);
      for (let k = Math.min(keyLength, base.length); k > 0; k--) {
        const key = base.slice(-k), found = nth(text, key, count(prefix, key));
        if (found >= 0) { position = found + k; break search; }
      }
    }
    for (let k = Math.min(keyLength, after.length); k > 0; k--) {
      const key = after.slice(0, k), found = nth(text, key, count(before, key) + 1);
      if (found >= 0) { position = found; break search; }
    }
  }
  const caret = document.createRange();
  let rest = Math.max(0, position), placed = false;
  for (const node of nodes) {
    if (rest <= node.data.length) { caret.setStart(node, rest); placed = true; break; }
    rest -= node.data.length;
  }
  if (!placed) caret.setStart(block, 0);
  caret.collapse(true);
  write.focus({ preventScroll: true });
  const selection = getSelection(); selection?.removeAllRanges(); selection?.addRange(caret);
  const top = write.getBoundingClientRect().top;
  const rect = position >= 0 ? caretRect(caret) : block.getBoundingClientRect();
  if (rect) write.scrollTop += rect.top - top - spot.y;
}

// Where the source editor's caret, or else its first visible line, is.
export function sourceSpot(source: SourceEditor): Spot {
  const cm = source.cm, scroller = cm.getScrollerElement();
  const top = scroller.getBoundingClientRect().top;
  const caret = cm.cursorCoords(true, 'window').top - top;
  if (caret >= 0 && caret < scroller.clientHeight) return { offset: source.selectionStart, y: caret };
  const line = cm.lineAtHeight(top, 'window');
  return { offset: cm.indexFromPos({ line, ch: 0 }), y: cm.charCoords({ line, ch: 0 }, 'window').top - top };
}

// Puts the source editor's caret at `spot` and scrolls it to the same height.
export function showInSource(source: SourceEditor, spot: Spot) {
  const cm = source.cm;
  source.focus();
  source.setSelectionRange(spot.offset);
  const now = cm.charCoords(cm.posFromIndex(spot.offset), 'window').top - cm.getScrollerElement().getBoundingClientRect().top;
  cm.scrollTo(null, cm.getScrollInfo().top + now - spot.y);
}
