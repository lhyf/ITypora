// Double-click a rendered diagram, formula or image to look at it enlarged: a
// full-window viewer with wheel zoom around the pointer, drag to pan and
// keyboard shortcuts. Diagrams and formulas stay vectors, sharp at any zoom.

const previewSelector = ':is(.vditor-ir__preview, .vditor-wysiwyg__preview)';
const diagramSelector = `${previewSelector} :is(.language-mermaid, .language-flowchart, .language-echarts, .language-mindmap, .language-plantuml, .language-markmap, .language-abc, .language-graphviz, .language-smiles)`;
// A single click on a diagram, formula or image shows its Markdown, which moves it.
// Hold the click back this long so a double-click opens the viewer instead.
const clickDelay = 250;
// Computed styles copied onto the enlarged copy: outside the document, rules
// scoped to the theme's #write no longer reach it.
const copiedStyles = [
  'color', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'visibility', 'display', 'paint-order', 'marker-start', 'marker-mid',
  'marker-end', 'clip-path', 'mask', 'filter', 'shape-rendering', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'font-stretch', 'letter-spacing', 'word-spacing', 'line-height', 'text-align', 'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'baseline-shift', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-transform', 'white-space', 'word-break',
  'overflow-wrap', 'direction', 'writing-mode', 'background-color', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'vertical-align', 'box-sizing', 'zoom'
];
const icons = {
  out: '<path d="M5 12h14"/>',
  in: '<path d="M12 5v14M5 12h14"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>'
};
const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

// A diagram (svg or canvas), an image, or a formula (an HTML element).
type Zoomable = SVGSVGElement | HTMLCanvasElement | HTMLImageElement | HTMLElement;

// The element to enlarge for a pointer target inside the document, if any.
export function zoomTarget(target: EventTarget | null): Zoomable | null {
  if (!(target instanceof Element) || !target.closest('#write')) return null;
  const diagram = target.closest(diagramSelector);
  if (diagram) {
    if (diagram.classList.contains('diagram-error')) return null;
    return diagram.querySelector<SVGSVGElement>('svg:not(svg svg)') || diagram.querySelector('canvas') || loaded(diagram.querySelector('img'));
  }
  // A whole formula: an inline one can be several svg pieces with break points between them.
  const math = target.closest(`${previewSelector} .language-math`);
  if (math) return math.querySelector<HTMLElement>('mjx-container, .katex-display, .katex');
  return target instanceof HTMLImageElement ? loaded(target) : null;
}
const loaded = (image: HTMLImageElement | null) => image?.complete && image.naturalWidth ? image : null;

// Renames ids in a copy so its references (markers, gradients, its own
// stylesheet) point at the copy rather than the original.
function renameIds(root: Element) {
  const names = new Map<string, string>();
  for (const element of [root, ...root.querySelectorAll('[id]')]) {
    if (!element.id) continue;
    names.set(element.id, `itypora-zoom-${element.id}`); element.id = names.get(element.id)!;
  }
  if (!names.size) return;
  const escape = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`#(${[...names.keys()].map(escape).sort((a, b) => b.length - a.length).join('|')})(?![\\w-])`, 'g');
  const rewrite = (text: string) => text.replace(pattern, (_match, id: string) => `#${names.get(id)}`);
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.tagName.toLowerCase() === 'style') { element.textContent = rewrite(element.textContent || ''); continue; }
    for (const attribute of [...element.attributes]) {
      if (attribute.name !== 'id' && attribute.value.includes('#')) element.setAttribute(attribute.name, rewrite(attribute.value.replace(/url\((["']?)[^"')#]*#/g, 'url($1#')));
    }
  }
}

// A copy that looks the same outside the document.
function copyStyled<T extends Element>(element: T) {
  const copy = element.cloneNode(true) as T;
  const originals = [element, ...element.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')];
  // Shapes drawn through <use> (formula glyphs) take their colors from the
  // <use>, not from where they are defined; their own styles must not be fixed.
  const shared = new Set<Element>();
  element.querySelectorAll('use').forEach(use => {
    const reference = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    const shape = reference.startsWith('#') ? element.querySelector(`[id="${CSS.escape(reference.slice(1))}"]`) : null;
    if (shape) [shape, ...shape.querySelectorAll('*')].forEach(node => shared.add(node));
  });
  originals.forEach((original, index) => {
    if (original.tagName.toLowerCase() === 'style' || shared.has(original)) return;
    const computed = getComputedStyle(original), target = copies[index] as SVGElement | HTMLElement;
    // Important, so the diagram's own stylesheet (which has !important rules) cannot override them.
    const declarations = copiedStyles.map(name => `${name}: ${computed.getPropertyValue(name)} !important`).join('; ');
    target.setAttribute('style', `${target.getAttribute('style') || ''}; ${declarations}`);
  });
  // Hidden MathML for screen readers; the viewer only shows the picture.
  copy.querySelectorAll('mjx-assistive-mml').forEach(node => node.remove());
  renameIds(copy);
  return copy;
}
const important = (element: HTMLElement | SVGElement, styles: Record<string, string>) => {
  for (const [name, value] of Object.entries(styles)) element.style.setProperty(name, value, 'important');
};

// The color the picture is drawn on in the document.
function backdrop(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(color)) return color;
  }
  return '';
}

type View = { scale: number; x: number; y: number };

let current: { close(restore?: boolean): void } | null = null;
export const zoomViewerOpen = () => Boolean(current);
export function closeZoomViewer() { current?.close(); }

// Opens the viewer for a diagram, an image or a formula. `onClose` runs after
// the overlay is gone.
export function openZoomViewer(source: Zoomable, onChange: () => void, onClose?: () => void) {
  current?.close(false);
  const raster = source instanceof HTMLImageElement || source instanceof HTMLCanvasElement;
  const box = source.getBoundingClientRect();
  let width = 1, height = 1;
  // A formula's zoom in the document (a theme can shrink inline math); 100% is its size there.
  let base = 1;
  let content: SVGSVGElement | HTMLElement;
  if (source instanceof SVGSVGElement) {
    content = copyStyled(source);
    important(content, { margin: '0', 'max-width': 'none', display: 'block', zoom: '1' });
    content.removeAttribute('class');
    // A diagram's own size; the document may show it narrower.
    width = source.viewBox.baseVal?.width || box.width; height = source.viewBox.baseVal?.height || box.height;
  } else if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
    const image = document.createElement('img');
    image.src = source instanceof HTMLCanvasElement ? source.toDataURL() : source.currentSrc || source.src;
    image.alt = source instanceof HTMLImageElement ? source.alt : '';
    image.draggable = false;
    content = image;
    width = source instanceof HTMLImageElement ? source.naturalWidth : box.width; height = source instanceof HTMLImageElement ? source.naturalHeight : box.height;
  } else {
    // A formula keeps its layout on one line; its size is measured once shown.
    content = copyStyled(source);
    important(content, { display: 'inline-block', margin: '0', width: 'max-content', 'max-width': 'none', 'white-space': 'nowrap', overflow: 'visible', 'vertical-align': 'top' });
    base = (source as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
  }
  const label = source instanceof HTMLImageElement ? '图片查看器' : source instanceof SVGSVGElement || source instanceof HTMLCanvasElement ? '图表查看器' : '公式查看器';
  const overlay = document.createElement('div');
  overlay.className = 'zoom-viewer';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', label);
  overlay.innerHTML = `<div class="zoom-viewer__stage" tabindex="-1"><div class="zoom-viewer__content"></div></div>
    <div class="zoom-viewer__toolbar" role="toolbar" aria-label="缩放">
      <button type="button" data-zoom="out" title="缩小（-）" aria-label="缩小">${icon('out')}</button>
      <button type="button" data-zoom="actual" class="zoom-viewer__level" title="实际大小（1）" aria-label="实际大小"></button>
      <button type="button" data-zoom="in" title="放大（+）" aria-label="放大">${icon('in')}</button>
      <button type="button" data-zoom="fit" title="适应窗口（0）" aria-label="适应窗口">${icon('fit')}</button>
      <span class="zoom-viewer__separator" aria-hidden="true"></span>
      <button type="button" data-zoom="close" title="关闭（Esc）" aria-label="关闭">${icon('close')}</button>
    </div>
    <p class="zoom-viewer__hint" aria-hidden="true">滚轮缩放 · 拖动移动 · 双击切换大小 · Esc 关闭</p>`;
  const color = backdrop(source);
  if (color) overlay.style.setProperty('--zoom-viewer-backdrop', color);
  const stage = overlay.querySelector<HTMLElement>('.zoom-viewer__stage')!;
  const holder = overlay.querySelector<HTMLElement>('.zoom-viewer__content')!;
  const level = overlay.querySelector<HTMLElement>('.zoom-viewer__level')!;
  holder.append(content);
  const focused = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
  document.body.append(overlay);
  if (!(source instanceof SVGSVGElement) && !raster) {
    content.style.setProperty('zoom', String(base));
    ({ width, height } = content.getBoundingClientRect());
  }
  width ||= 1; height ||= 1;

  const view: View = { scale: 1, x: 0, y: 0 };
  let fitted = true;
  const padding = () => ({ top: 64, right: 40, bottom: 48, left: 40 });
  // Whole picture in the window; diagrams and formulas enlarge up to 4x, images not past 100%.
  const fitScale = () => {
    const pad = padding();
    const scale = Math.min((stage.clientWidth - pad.left - pad.right) / width, (stage.clientHeight - pad.top - pad.bottom) / height);
    return Math.max(0.01, Math.min(scale, raster ? 1 : 4));
  };
  const limits = () => { const fit = fitScale(); return { min: Math.min(0.1, fit), max: Math.max(raster ? 8 : 10, fit) }; };
  function draw() {
    const w = width * view.scale, h = height * view.scale;
    // Keep part of the picture in the window.
    const keepX = Math.min(48, w), keepY = Math.min(48, h);
    view.x = Math.min(stage.clientWidth - keepX, Math.max(keepX - w, view.x));
    view.y = Math.min(stage.clientHeight - keepY, Math.max(keepY - h, view.y));
    holder.style.transform = `translate(${view.x}px, ${view.y}px)`;
    // Resizing (not transforming) redraws vectors sharply at every zoom.
    if (content instanceof SVGSVGElement) { content.setAttribute('width', String(w)); content.setAttribute('height', String(h)); }
    else if (raster) { content.style.width = `${w}px`; content.style.height = `${h}px`; }
    // A formula is laid out again at the zoomed size, like a page zoom.
    else content.style.setProperty('zoom', String(view.scale * base));
    level.textContent = `${Math.round(view.scale * 100)}%`;
  }
  function fit() {
    const pad = padding();
    view.scale = fitScale();
    view.x = pad.left + (stage.clientWidth - pad.left - pad.right - width * view.scale) / 2;
    view.y = pad.top + (stage.clientHeight - pad.top - pad.bottom - height * view.scale) / 2;
    fitted = true; draw();
  }
  // Zooms to `scale`, keeping the point (px, py) of the stage in place.
  function zoom(scale: number, px = stage.clientWidth / 2, py = stage.clientHeight / 2) {
    const { min, max } = limits();
    const next = Math.min(max, Math.max(min, scale));
    view.x = px - (px - view.x) * next / view.scale;
    view.y = py - (py - view.y) * next / view.scale;
    view.scale = next; fitted = false; draw();
  }
  const step = (direction: 1 | -1) => zoom(view.scale * (direction > 0 ? 1.25 : 0.8));

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    // A pinch arrives as a wheel event with Ctrl held and small deltas.
    zoom(view.scale * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX - rect.left, event.clientY - rect.top);
  };
  let drag: { id: number; x: number; y: number; startX: number; startY: number } | null = null;
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: view.x, startY: view.y };
    stage.setPointerCapture(event.pointerId); stage.classList.add('dragging');
    event.preventDefault(); stage.focus({ preventScroll: true });
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    view.x = drag.startX + event.clientX - drag.x; view.y = drag.startY + event.clientY - drag.y;
    fitted = false; draw();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null; stage.classList.remove('dragging');
  };
  // Double-click: from the whole picture to a closer look at that point, and back.
  const onDoubleClick = (event: MouseEvent) => {
    const rect = stage.getBoundingClientRect();
    if (fitted) zoom(view.scale < 1 ? 1 : view.scale * 2, event.clientX - rect.left, event.clientY - rect.top);
    else fit();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const pan = event.shiftKey ? 240 : 60;
    const keys: Record<string, () => void> = {
      Escape: () => close(), '+': () => step(1), '=': () => step(1), '-': () => step(-1), _: () => step(-1),
      '0': fit, '1': () => zoom(1),
      ArrowLeft: () => { view.x += pan; fitted = false; draw(); }, ArrowRight: () => { view.x -= pan; fitted = false; draw(); },
      ArrowUp: () => { view.y += pan; fitted = false; draw(); }, ArrowDown: () => { view.y -= pan; fitted = false; draw(); }
    };
    if (event.key === 'Tab') {
      // Keep focus inside the viewer.
      const stops = [stage, ...overlay.querySelectorAll<HTMLElement>('button')];
      const index = stops.indexOf(document.activeElement as HTMLElement);
      const next = stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length];
      event.preventDefault(); event.stopPropagation(); next.focus(); return;
    }
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault(); event.stopPropagation(); run();
  };
  const onResize = () => { if (fitted) fit(); else draw(); };
  overlay.querySelector('.zoom-viewer__toolbar')!.addEventListener('click', event => {
    const action = (event.target as Element).closest<HTMLElement>('[data-zoom]')?.dataset.zoom;
    if (action === 'in') step(1);
    else if (action === 'out') step(-1);
    else if (action === 'actual') zoom(1);
    else if (action === 'fit') fit();
    else if (action === 'close') close();
  });
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('dblclick', onDoubleClick);
  overlay.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  let open = true;
  function close(restore = true) {
    if (!open) return;
    open = false; current = null;
    window.removeEventListener('resize', onResize);
    overlay.remove();
    if (restore && focused?.isConnected) focused.focus({ preventScroll: true });
    onClose?.();
    onChange();
  }
  current = { close };
  fit();
  stage.focus({ preventScroll: true });
  onChange();
}

// Double-click on a diagram, formula or image in `root` opens the viewer. A single click
// still shows its Markdown, a moment later, as Typora does.
export function installZoom(root: HTMLElement, onChange: () => void) {
  let press: { element: ReturnType<typeof zoomTarget> & Element; time: number; ranges: Range[]; clicked: boolean } | null = null;
  let held: ReturnType<typeof setTimeout> | undefined;
  let replaying = false;
  const inside = (event: Event) => event.target instanceof Node && root.contains(event.target);
  const release = () => { clearTimeout(held); held = undefined; };

  document.addEventListener('mousedown', event => {
    if (event.button !== 0 || !inside(event)) return;
    if (event.detail >= 2 && press && Date.now() - press.time < 1000) {
      // Second press of a double-click: no word selection, no Markdown.
      event.preventDefault(); event.stopPropagation();
      release();
      return;
    }
    if (event.detail !== 1) return;
    const element = zoomTarget(event.target);
    const selection = getSelection();
    press = element ? { element, time: Date.now(), clicked: false, ranges: selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [] } : null;
  }, true);

  document.addEventListener('click', event => {
    if (replaying || event.button !== 0 || !inside(event)) return;
    if (event.detail >= 2 && press && Date.now() - press.time < 1000) { event.stopPropagation(); return; }
    if (event.detail !== 1 || !press || !zoomTarget(event.target)) return;
    // Hold the click; replay it unless a second click follows.
    event.stopPropagation();
    const target = event.target as Element, init: MouseEventInit = {
      bubbles: true, cancelable: true, composed: true, view: window, detail: 1, button: 0,
      clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
      ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey
    };
    release();
    const pressed = press;
    held = setTimeout(() => {
      held = undefined;
      if (!target.isConnected) return;
      pressed.clicked = true;
      replaying = true;
      try { target.dispatchEvent(new MouseEvent('click', init)); } finally { replaying = false; }
    }, clickDelay);
  }, true);

  document.addEventListener('dblclick', event => {
    if (!inside(event) || !press || Date.now() - press.time > 1000) return;
    event.preventDefault(); event.stopPropagation();
    const { element, ranges, clicked } = press;
    press = null; release();
    if (!element.isConnected) return;
    openZoomViewer(element, onChange, () => {
      // Unless the first click already showed the Markdown, leave the caret where it was.
      if (clicked) return;
      const selection = getSelection();
      if (!selection || !ranges.length || !ranges.every(range => range.startContainer.isConnected)) return;
      selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range));
    });
  }, true);
}
