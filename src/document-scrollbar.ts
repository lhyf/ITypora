type ScrollTarget = {
  element: HTMLElement;
  top: number;
  height: number;
  viewport: number;
  scrollTo(top: number): void;
};

// Mirror the active editor's native scroll range at the window edge. The editor
// remains the scroll owner so caret navigation and typewriter mode keep working.
export function installDocumentScrollbar(surface: HTMLElement, target: () => ScrollTarget | null) {
  const bar = document.createElement('div');
  bar.id = 'document-scrollbar';
  bar.tabIndex = 0;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', '文档滚动条');
  const spacer = document.createElement('div');
  bar.append(spacer); surface.append(bar);
  let frame = 0, mirroredTop = 0;
  const observed = new Set<Element>();
  const resize = new ResizeObserver(schedule);
  resize.observe(surface);

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    const current = target();
    const elements = new Set<Element>(current ? [current.element, ...current.element.children] : []);
    // CodeMirror's sizer changes height as lines are measured and wrapped.
    const sizer = current?.element.querySelector('.CodeMirror-sizer');
    if (sizer) elements.add(sizer);
    for (const element of observed) if (!elements.has(element)) { resize.unobserve(element); observed.delete(element); }
    for (const element of elements) if (!observed.has(element)) { resize.observe(element); observed.add(element); }
    const range = current ? Math.max(0, current.height - current.viewport) : 0;
    bar.hidden = range <= 1;
    if (bar.hidden || !current) return;
    const height = `${bar.clientHeight + range}px`;
    if (spacer.style.height !== height) spacer.style.height = height;
    mirroredTop = current.top;
    if (Math.abs(bar.scrollTop - mirroredTop) > 1) bar.scrollTop = mirroredTop;
  }
  bar.addEventListener('scroll', () => {
    if (Math.abs(bar.scrollTop - mirroredTop) <= 1) return;
    mirroredTop = bar.scrollTop;
    target()?.scrollTo(mirroredTop);
    schedule();
  });
  surface.addEventListener('scroll', event => { if (event.target !== bar) schedule(); }, true);
  surface.addEventListener('load', schedule, true);
  const mutation = new MutationObserver(schedule);
  for (const editor of surface.querySelectorAll('#editor, #source-editor')) {
    mutation.observe(editor, { subtree: true, childList: true, characterData: true, attributes: true });
  }
  schedule();
}
