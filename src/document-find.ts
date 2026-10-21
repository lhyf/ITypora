// CSS highlights leave the editable DOM and Markdown untouched, and let the
// search field retain focus while the document scrolls to a match.
export class DocumentFind {
  private query = '';
  private root: HTMLElement | null = null;
  private active: Range | null = null;
  private index = -1;

  clear() {
    CSS.highlights.delete('document-matches');
    CSS.highlights.delete('document-match-active');
    this.query = ''; this.root = null; this.active = null; this.index = -1;
  }

  find(root: HTMLElement, query: string, forward: boolean, next: boolean) {
    const segments: { node: Text; start: number; end: number }[] = [];
    let text = '', block: Element | null = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const parent = node.parentElement;
      if (!parent || parent.closest('.vditor-ir__marker, .itypora-code-overlay, .itypora-code-gutter, .vditor-copy, script, style') || !parent.checkVisibility({ checkVisibilityCSS: true })) continue;
      const currentBlock = parent.closest('p, h1, h2, h3, h4, h5, h6, li, td, th, pre, summary, div');
      if (block && block !== currentBlock) text += '\n';
      block = currentBlock;
      const start = text.length; text += node.data;
      segments.push({ node, start, end: text.length });
    }
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const ranges: Range[] = [];
    let segmentIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const from = match.index!, to = from + match[0].length;
      while (segmentIndex < segments.length && segments[segmentIndex].end <= from) segmentIndex++;
      const first = segments[segmentIndex];
      let endIndex = segmentIndex;
      while (endIndex < segments.length && segments[endIndex].end < to) endIndex++;
      const last = segments[endIndex];
      if (!first || !last || first.start > from || last.start >= to) continue;
      const range = document.createRange();
      range.setStart(first.node, from - first.start); range.setEnd(last.node, to - last.start);
      if ([...range.getClientRects()].some(rect => rect.width > 0 && rect.height > 0)) ranges.push(range);
    }
    const continuing = next && this.query === query && this.root === root;
    const active = this.active;
    const previous = continuing && active ? ranges.findIndex(range => range.startContainer === active.startContainer && range.startOffset === active.startOffset && range.endContainer === active.endContainer && range.endOffset === active.endOffset) : -1;
    if (!ranges.length) this.index = -1;
    else if (continuing) this.index = ((previous >= 0 ? previous : this.index) + (forward ? 1 : -1) + ranges.length) % ranges.length;
    else this.index = forward ? 0 : ranges.length - 1;
    this.query = query; this.root = root; this.active = ranges[this.index] || null;
    const highlights = new Highlight();
    for (const range of ranges) highlights.add(range);
    CSS.highlights.set('document-matches', highlights);
    CSS.highlights.set('document-match-active', new Highlight(...(this.active ? [this.active] : [])));
    if (this.active) {
      const rect = this.active.getBoundingClientRect();
      root.scrollTop += rect.top - root.getBoundingClientRect().top - (root.clientHeight - rect.height) / 2;
    }
    return { current: this.index + 1, total: ranges.length };
  }
}
