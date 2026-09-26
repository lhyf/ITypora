import type Vditor from 'vditor';
import { formatEdit, type TableSize } from './formatting.mjs';

function nodePath(node: Node, root: Node): number[] {
  const path: number[] = [];
  while (node !== root) {
    const parent = node.parentNode;
    if (!parent) throw new Error('请先将光标放入编辑器。');
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node)); node = parent;
  }
  return path;
}
function atPath(root: Node, path: number[]): Node | undefined {
  let node: Node | undefined = root;
  for (const index of path) node = node?.childNodes[index];
  return node;
}
const token = () => 'ITyporaCaret' + crypto.randomUUID().replaceAll('-', '') + 'End';

// Work on a detached clone: cursor markers never enter the document or undo history.
function markdownSelection(editor: Vditor, root: HTMLElement, range: Range, mode: 'ir' | 'wysiwyg') {
  const clone = root.cloneNode(true) as HTMLElement;
  const startNode = atPath(clone, nodePath(range.startContainer, root))!;
  const endNode = atPath(clone, nodePath(range.endContainer, root))!;
  const a = token(), b = token();
  const endRange = document.createRange(); endRange.setStart(endNode, range.endOffset); endRange.collapse(true); endRange.insertNode(document.createTextNode(b));
  const startRange = document.createRange(); startRange.setStart(startNode, range.startOffset); startRange.collapse(true); startRange.insertNode(document.createTextNode(a));
  const lute = editor.vditor.lute;
  const marked = mode === 'ir' ? lute.VditorIRDOM2Md(clone.innerHTML) : lute.VditorDOM2Md(clone.innerHTML);
  const start = marked.indexOf(a), end = marked.indexOf(b) - a.length;
  if (start < 0 || end < start) throw new Error('请将光标放在可编辑的正文或代码中后重试。');
  return { text: marked.replace(a, '').replace(b, ''), start, end };
}

function restoreSelection(editor: Vditor, root: HTMLElement, text: string, start: number, end: number, mode: 'ir' | 'wysiwyg') {
  const a = token(), b = token();
  const marked = text.slice(0, start) + a + text.slice(start, end) + b + text.slice(end);
  const clone = document.createElement('div');
  clone.innerHTML = mode === 'ir' ? editor.vditor.lute.Md2VditorIRDOM(marked) : editor.vditor.lute.Md2VditorDOM(marked);
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const points: { path: number[]; offset: number }[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = node.textContent || '';
    const ai = value.indexOf(a), bi = value.indexOf(b);
    if (ai >= 0) points[0] = { path: nodePath(node, clone), offset: ai };
    if (bi >= 0) points[1] = { path: nodePath(node, clone), offset: bi - (ai >= 0 && ai < bi ? a.length : 0) };
  }
  const range = document.createRange();
  const first = points[0] && atPath(root, points[0].path), last = points[1] && atPath(root, points[1].path);
  if (first?.nodeType === Node.TEXT_NODE && last?.nodeType === Node.TEXT_NODE) {
    range.setStart(first, Math.min(points[0].offset, first.textContent?.length || 0));
    range.setEnd(last, Math.min(points[1].offset, last.textContent?.length || 0));
  } else { range.selectNodeContents(root); range.collapse(false); }
  root.focus({ preventScroll: true });
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
}

export function formatRich(editor: Vditor, root: HTMLElement, range: Range, command: string, mode: 'ir' | 'wysiwyg', tabSize: number, tableSize?: TableSize) {
  const current = markdownSelection(editor, root, range, mode);
  const change = formatEdit(command, current.text, current.start, current.end, tabSize, tableSize);
  const next = current.text.slice(0, change.start) + change.text + current.text.slice(change.end);
  if (next === current.text) return;
  const scroll = root.scrollTop;
  // Preserve pending typing as its own undo step before applying a menu command.
  editor.vditor.undo?.addToUndoStack(editor.vditor);
  editor.setValue(next);
  restoreSelection(editor, root, next, change.selectionStart, change.selectionEnd, mode);
  editor.vditor.undo?.addToUndoStack(editor.vditor);
  root.scrollTop = scroll;
}
