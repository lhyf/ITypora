// Keep the user's chosen width when a smaller window temporarily constrains it.
export function setupSidebarResize() {
  const sidebar = document.querySelector<HTMLElement>('#sidebar')!;
  const workspace = document.querySelector<HTMLElement>('.workspace')!;
  const handle = document.querySelector<HTMLElement>('#sidebar-resizer')!;
  const minimum = 200, defaultWidth = 240;
  const stored = Number(localStorage.getItem('itypora-sidebar-width'));
  let preferred = Number.isFinite(stored) && stored >= minimum ? Math.min(600, stored) : defaultWidth;
  let drag: { pointer: number; x: number; width: number; previous: number } | undefined;
  const maximum = () => Math.max(minimum, Math.min(600, workspace.clientWidth - 320));
  function apply() {
    const width = Math.round(Math.max(minimum, Math.min(maximum(), preferred)));
    sidebar.style.setProperty('--sidebar-width', `${width}px`);
    handle.setAttribute('aria-valuemin', String(minimum));
    handle.setAttribute('aria-valuemax', String(maximum()));
    handle.setAttribute('aria-valuenow', String(width));
    return width;
  }
  function persist() { localStorage.setItem('itypora-sidebar-width', String(preferred)); }
  function finish(cancel = false) {
    if (!drag) return;
    const previous = drag; drag = undefined;
    if (cancel) preferred = previous.previous;
    document.body.classList.remove('resizing-sidebar');
    if (handle.hasPointerCapture(previous.pointer)) handle.releasePointerCapture(previous.pointer);
    apply(); persist();
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || drag) return;
    event.preventDefault();
    drag = { pointer: event.pointerId, x: event.clientX, width: sidebar.getBoundingClientRect().width, previous: preferred };
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-sidebar');
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    preferred = Math.max(minimum, Math.min(maximum(), drag.width + event.clientX - drag.x)); apply();
  });
  handle.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointer) finish(); });
  handle.addEventListener('pointercancel', () => finish(true));
  handle.addEventListener('lostpointercapture', () => finish());
  window.addEventListener('blur', () => finish());
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && drag) finish(true); });
  handle.addEventListener('dblclick', () => { preferred = defaultWidth; apply(); persist(); });
  handle.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 50 : 10;
    preferred = event.key === 'Home' ? minimum : event.key === 'End' ? maximum() : apply() + (event.key === 'ArrowLeft' ? -step : step);
    preferred = Math.max(minimum, Math.min(maximum(), preferred)); apply(); persist();
  });
  new ResizeObserver(apply).observe(workspace);
  apply();
}
