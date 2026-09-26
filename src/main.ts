import Vditor from 'vditor';
import 'vditor/dist/index.css';
import './style.css';
import { setupSidebarResize } from './sidebar';
import { createPreferences } from './preferences';
import { context as formatContext, formatEdit, tableLimits, type TableSize } from './formatting.mjs';
import { formatRich } from './rich-format';
import { installHtmlRendering, refreshRendering, decorateRendering, renderCodeMenu, installDocumentNavigation } from './rendering';
import { clearCodeHighlights } from './code-editing';
import { loadMathJax } from './mathjax';
import { createPreserver } from './preserve.mjs';
import { previewSpot, showInPreview, showInSource, sourceSpot } from './source-sync';
import { SourceEditor } from './source-editor';
import { closeZoomViewer, installZoom, zoomViewerOpen } from './zoom-viewer';
import { exportPage } from './export';
import { assetBase } from './asset-url';
import type { Preferences, SettingsSnapshot } from './settings-types';

type Theme = { id: string; name: string; css: string; warnings: string[] };
type DocumentState = { path: string | null; content: string; dirty: boolean; recent: string[] };
type FileEntry = { path: string; name: string };
// package.json's version, set by vite.config.ts.
declare const __APP_VERSION__: string;
declare global {
  interface Window {
    desktop?: {
      initialize(): Promise<DocumentState & SettingsSnapshot & { platform: string }>;
      openPreferences(section: string): Promise<void>;
      preferencesCommand(name: string, value?: unknown): Promise<any>;
      onPreferencesSection(callback: (section: string) => void): void;
      savePreferences(update: Partial<Preferences>): Promise<SettingsSnapshot>;
      onPreferences(callback: (snapshot: SettingsSnapshot) => void): void;
      open(file?: string): Promise<DocumentState | null>;
      folder(): Promise<{ root: string; files: FileEntry[] } | null>;
      newDocument(): Promise<DocumentState | null>;
      save(saveAs?: boolean): Promise<DocumentState | null>;
      exportTarget(kind: 'html' | 'pdf'): Promise<string | null>;
      exportWrite(html: string): Promise<string>;
      close(): Promise<void>;
      update(content: string, dirty: boolean): void;
      importTheme(): Promise<Theme | null>;
      view(state: Record<string, boolean | string>): void;
      find(query: string, forward?: boolean, next?: boolean): Promise<void>;
      onFind(callback: (result: { current: number; total: number }) => void): () => void;
      onAction(callback: (action: string) => Promise<void>): () => void;
    };
  }
}

const icons: Record<string, string> = {
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
  source: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  arrow: '<path d="m8 4 8 8-8 8"/>',
  check: '<path d="m5 12 4 4L19 6"/>'
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
const button = (action: string, name: string, label: string) => `<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}">${icon(name)}</button>`;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <nav class="browser-menu" aria-label="菜单" ${window.desktop ? 'hidden' : ''}>
    <button data-action="new">新建</button><button data-action="open">打开</button><button data-action="save">保存</button>
    <button data-action="sidebar">侧栏</button><button data-action="find">查找</button><button data-action="appearance">主题</button><button data-action="preferences">偏好设置</button>
  </nav>
  <div class="workspace">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-tabs"><button class="active" data-tab="files">文件</button><button data-tab="outline">大纲</button>${button('sidebar', 'panel', '隐藏侧边栏')}</div>
    <div id="file-pane"><label class="search-field">${icon('search')}<input id="file-search" placeholder="搜索文档" aria-label="查找文档" /></label>
      <div class="file-view"><button data-tab="files" class="active">列表</button><button data-tab="tree">文件树</button></div><div id="file-list"></div></div>
    <nav id="outline" aria-label="文档大纲" hidden></nav>
    <button class="folder-button" data-action="folder">${icon('folder')}<span id="workspace-name">打开文件夹…</span></button>
    <div id="sidebar-resizer" role="separator" tabindex="0" aria-label="调整侧栏宽度" aria-orientation="vertical" aria-controls="sidebar" title="拖动调整侧栏宽度，双击恢复默认"></div>
  </aside>
  <main class="main">
    <div class="findbar" hidden><input id="find-query" placeholder="查找" aria-label="查找正文" /><span id="find-result"></span><button data-action="find-previous" aria-label="上一个">↑</button><button data-action="find-next" aria-label="下一个">↓</button><button data-action="close-find" aria-label="关闭查找">×</button></div>
    <section class="editor-surface"><div id="editor"></div><div id="source-editor" hidden></div></section>
  </main>
  </div>
  <footer class="statusbar"><div>${button('sidebar', 'panel', '显示 / 隐藏侧边栏 Ctrl+Shift+L')}${button('source', 'source', '源代码模式 Ctrl+/')}<span id="save-status"></span><span id="dirty-dot" hidden title="未保存">●</span><span id="document-name" class="sr-only"></span></div><button id="word-count" data-action="statistics">0 词</button></footer>
  <dialog id="info-dialog"><div class="dialog-header"><h2 id="info-title"></h2><button data-close="info-dialog" class="close-button" aria-label="关闭信息">×</button></div><div id="info-content"></div></dialog>
  <dialog id="table-dialog" aria-labelledby="table-dialog-title" aria-describedby="table-dialog-hint">
    <form id="table-form">
      <h2 id="table-dialog-title">插入表格</h2>
      <div class="table-dimensions">
        <label>列<input id="table-columns" type="number" min="1" max="${tableLimits.columns}" step="1" value="3" required autofocus /></label>
        <label>行<input id="table-rows" type="number" min="1" max="${tableLimits.rows}" step="1" value="4" required /></label>
      </div>
      <p id="table-dialog-hint">行数包含表头。</p>
      <div class="table-dialog-actions"><button type="button" id="table-cancel">取消</button><button type="submit" id="table-confirm">确定</button></div>
    </form>
  </dialog>
  <section id="preferences" aria-label="偏好设置" hidden></section>
  <div id="toast" role="status" hidden></div>
  <input type="file" id="browser-open" accept=".md,.markdown,.txt" hidden />
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const desktop = window.desktop;
installDocumentNavigation($('#editor'));
installZoom($('#editor'), () => syncView());
const source = new SourceEditor($('#source-editor'), () => { raw = source.value; sync(); });
// The source caret lives in CodeMirror, not the document selection; menus follow it.
source.cm.on('cursorActivity', () => syncView());
let editor: Vditor;
let editorAlive = false;
let mode: 'ir' | 'wysiwyg' | 'source' = 'ir';
let currentPath: string | null = null;
let raw = '';
let saved = '';
let normalized = '';
// Writes only the edited blocks back into the loaded Markdown.
let preserver = createPreserver('');
// Source mode hides the rendered editor instead of destroying it: the settings it
// was built with, the Markdown it showed and whether a theme change is pending.
let editorSettings = '';
let sourceBase = '';
let renderStale = false;
let recovered = false;
let loading = true;
let busy = false;
let pendingClose = false;
let editorGeneration = 0;
let themes: Theme[] = [];
let files: FileEntry[] = [];
let recent: string[] = [];
let outlineTimer: ReturnType<typeof setTimeout>;
let toastTimer: ReturnType<typeof setTimeout>;
let paddingObserver: MutationObserver | undefined;
let renderingObserver: MutationObserver | undefined;
let selection: Range | null = null;
let fileTab = 'files';
const preferences: Preferences = { mode: 'ir', size: '0', width: '0', typewriter: false, fontFamily: '', theme: 'paper', showStatus: true, showCount: true, readingSpeed: 400, spellcheck: false, codeLineNumbers: false, autoSpace: false, tabSize: 4 };
let baseCss = '';
let pendingSettings: SettingsSnapshot | undefined;
try {
  const { lightTheme, darkTheme, separateDark, ...stored } = JSON.parse(localStorage.getItem('itypora-preferences') || '{}');
  Object.assign(preferences, stored);
  preferences.theme = stored.theme || localStorage.getItem('itypora-theme') || lightTheme || 'paper';
} catch { /* Use defaults for corrupt settings. */ }
mode = preferences.mode === 'wysiwyg' ? 'wysiwyg' : 'ir';
document.body.classList.toggle('sidebar-hidden', localStorage.getItem('itypora-sidebar') !== 'visible');
setupSidebarResize();
document.body.classList.toggle('status-hidden', localStorage.getItem('itypora-status') === 'hidden');
document.body.classList.toggle('typewriter-mode', preferences.typewriter);
const themeStyle = document.createElement('style');
themeStyle.id = 'imported-theme';
document.head.append(themeStyle);
const dirty = () => recovered || raw !== saved;
const basename = (file: string) => file.split(/[\\/]/).pop() || file;
const wordCount = () => (raw.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>~|\[\]()-]/g, ' ').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu) || []).length;

const preferencesPage = desktop ? createPreferences($('#preferences'), { command: desktop.preferencesCommand }, closePreferences) : undefined;
let preferencesFocus: HTMLElement | null = null;
let preferencesSelection: Range | null = null;
let preferencesScroll = 0;
function showPreferences(section: string) {
  if (!preferencesPage || $<HTMLDialogElement>('#table-dialog').open) return;
  if ($('#preferences').hidden) {
    flush();
    preferencesFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = window.getSelection();
    preferencesSelection = current?.rangeCount && document.querySelector('#write')?.contains(current.anchorNode) ? current.getRangeAt(0).cloneRange() : null;
    preferencesScroll = (mode === 'source' ? source : document.querySelector<HTMLElement>('#write'))?.scrollTop || 0;
    $('.workspace').inert = true;
    $('.statusbar').inert = true;
    document.body.classList.add('preferences-open');
    $('#preferences').hidden = false;
  }
  preferencesPage.show(section);
  syncView();
}
function closePreferences() {
  if ($('#preferences').hidden) return;
  $('#preferences').hidden = true;
  document.body.classList.remove('preferences-open');
  $('.workspace').inert = false;
  $('.statusbar').inert = false;
  window.dispatchEvent(new Event('resize'));
  const writing = mode === 'source' ? source : document.querySelector<HTMLElement>('#write');
  // CodeMirror restores its own selection only when focused through its API.
  const target = preferencesFocus?.isConnected && !source.element.contains(preferencesFocus) ? preferencesFocus : writing;
  if (target instanceof HTMLElement) target.focus({ preventScroll: true }); else target?.focus();
  if (preferencesSelection && document.contains(preferencesSelection.startContainer)) {
    const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(preferencesSelection);
  }
  if (writing) writing.scrollTop = preferencesScroll;
  syncView();
}

function currentFormatContext() {
  if (mode === 'source') {
    const current = formatContext(source.value, source.selectionStart);
    return { inTable: Boolean(current.table), inCode: Boolean(current.code), inTask: current.task, inList: current.list };
  }
  const node = window.getSelection()?.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  const inside = Boolean(element && $('#editor').contains(element));
  return { inTable: inside && Boolean(element?.closest('table')), inCode: inside && Boolean(element?.closest('[data-type="code-block"]')), inTask: inside && Boolean(element?.closest('li.vditor-task')), inList: inside && Boolean(element?.closest('li')) };
}

function syncView() {
  desktop?.view({ sidebar: !document.body.classList.contains('sidebar-hidden'), source: mode === 'source', focus: document.body.classList.contains('focus-mode'), typewriter: preferences.typewriter, statusbar: !document.body.classList.contains('status-hidden'), theme: localStorage.getItem('itypora-theme') || 'paper', editing: $('#preferences').hidden && !$<HTMLDialogElement>('#table-dialog').open && !zoomViewerOpen() && !loading, ...currentFormatContext() });
}
function flush() {
  if (mode === 'source') source.flush();
  if (editorAlive && mode !== 'source') {
    const value = editor.getValue();
    if (value !== normalized) { raw = preserver.merge(value); normalized = value; sync(); }
  }
}
function updatePreferences() {
  localStorage.setItem('itypora-preferences', JSON.stringify(preferences));
  document.body.classList.toggle('status-hidden', !preferences.showStatus);
  document.body.classList.toggle('typewriter-mode', preferences.typewriter);
  $('#word-count').hidden = !preferences.showCount;
  source.tabSize = preferences.tabSize;
  const writing = document.querySelector<HTMLElement>('#write');
  if (writing) {
    writing.spellcheck = preferences.spellcheck;
    if (preferences.fontFamily) writing.style.setProperty('font-family', preferences.fontFamily, 'important'); else writing.style.removeProperty('font-family');
    if (Number(preferences.size)) writing.style.setProperty('font-size', `${Number(preferences.size)}px`, 'important'); else writing.style.removeProperty('font-size');
    if (Number(preferences.width)) writing.style.setProperty('max-width', `${Number(preferences.width)}px`, 'important'); else writing.style.removeProperty('max-width');
  }
  // Source mode follows the same font and width preferences, as in Typora.
  const code = source.element.style;
  if (preferences.fontFamily) code.setProperty('font-family', preferences.fontFamily, 'important'); else code.removeProperty('font-family');
  if (Number(preferences.size)) code.setProperty('font-size', `${Number(preferences.size)}px`, 'important'); else code.removeProperty('font-size');
  if (Number(preferences.width)) code.setProperty('--itypora-source-width', `${Number(preferences.width)}px`); else code.removeProperty('--itypora-source-width');
  source.element.classList.toggle('itypora-width', Boolean(Number(preferences.width)));
  if (!source.hidden) source.cm.refresh();
}

function toast(message: string) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}

function sync() {
  desktop?.update(raw, dirty());
  $('#dirty-dot').hidden = !dirty();
  $('#document-name').textContent = currentPath ? basename(currentPath) : '未命名';
  $('#document-name').title = currentPath || '尚未保存到文件';
  document.title = `${dirty() ? '● ' : ''}${$('#document-name').textContent} — Itypora`;
  $('#save-status').textContent = dirty() ? '未保存' : '';
  $('#save-status').title = currentPath || '尚未保存';
  const count = Array.from(raw.replace(/\s/g, '')).length;
  $('#word-count').textContent = `${count.toLocaleString()} 字符`;
  $('#word-count').title = `${count.toLocaleString()} 字符 · 点击查看统计`;
  $('#word-count').textContent = `${wordCount().toLocaleString()} 词`;
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(renderOutline, 180);
}

function decorate() {
  // In source mode the hidden editor keeps the mode it was rendered in.
  const rendered = mode === 'source' && editorAlive ? (editor.vditor as unknown as { currentMode: string }).currentMode : mode;
  const writing = document.querySelector<HTMLElement>(rendered === 'wysiwyg' ? '.vditor-wysiwyg > .vditor-reset' : '.vditor-ir > .vditor-reset');
  document.querySelectorAll('#write').forEach((element) => { if (element !== writing) element.removeAttribute('id'); });
  if (writing) { writing.id = 'write'; writing.setAttribute('aria-label', 'Markdown 编辑器'); }
}

// Renders `raw` and records Lute's serialization of it as the save baseline.
function renderDocument() {
  editor.setValue(raw, true);
  normalized = editor.getValue();
  preserver = createPreserver(raw); preserver.baseline(normalized);
}
const editorKey = (editing: typeof mode) => JSON.stringify([editing, preferences.typewriter, preferences.autoSpace, preferences.codeLineNumbers, preferences.tabSize]);

async function mountEditor() {
  loading = true;
  const generation = ++editorGeneration;
  paddingObserver?.disconnect(); selection = null;
  renderingObserver?.disconnect();
  clearCodeHighlights();
  if (editorAlive) { editor.destroy(); editorAlive = false; }
  $('#editor').innerHTML = '';
  $('#editor').hidden = mode === 'source';
  source.hidden = mode !== 'source';
  if (mode === 'source') { source.focus(); loading = false; return; }
  // Vditor's synchronous icon loader injects inline JS. Load the same local
  // bundle externally so the application can keep inline scripts blocked.
  if (!document.getElementById('vditorIconScript')) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'vditorIconScript';
      if (document.getElementById('vditor-icon-bold')) {
        script.type = 'application/json'; document.head.append(script); resolve(); return;
      }
      script.src = new URL('./vendor/vditor/dist/js/icons/ant.js', document.baseURI).href;
      script.onload = () => resolve(); script.onerror = () => reject(new Error('无法加载本地编辑器图标'));
      document.head.append(script);
    });
  }
  // Typora's formula engine; fall back to Vditor's bundled KaTeX if it cannot load.
  const mathEngine = await loadMathJax().then(() => 'MathJax' as const, () => 'KaTeX' as const);
  const editorMode = mode;
  await new Promise<void>((resolve) => {
    editor = new Vditor('editor', {
      mode: editorMode, value: '', height: '100%', minHeight: 300, lang: 'zh_CN',
      cdn: new URL('./vendor/vditor', document.baseURI).href.replace(/\/$/, ''),
      cache: { enable: false },
      typewriterMode: preferences.typewriter,
      tab: ' '.repeat(preferences.tabSize),
      toolbar: ['line', 'headings', 'bold', 'italic', 'strike', '|', 'list', 'ordered-list', 'check', 'indent', 'outdent', 'insert-before', 'insert-after', '|', 'quote', 'code', 'inline-code', 'link', 'table', '|', 'undo', 'redo'],
      toolbarConfig: { pin: true },
      counter: { enable: false }, resize: { enable: false },
      // Double-clicked images open in src/zoom-viewer.ts instead.
      image: { isPreview: false },
      placeholder: '',
      preview: {
        delay: 120,
        theme: { current: 'light', path: new URL('./vendor/vditor/dist/css/content-theme', document.baseURI).href },
        markdown: { autoSpace: preferences.autoSpace, fixTermTypo: false, sanitize: true, gfmAutoLink: true, mark: true, sup: true, sub: true, toc: true, linkBase: desktop ? assetBase : '' },
        hljs: { enable: true, lineNumber: preferences.codeLineNumbers, renderMenu: renderCodeMenu }, math: { engine: mathEngine, inlineDigit: true }
      },
      input(value) {
        if (loading || generation !== editorGeneration || mode === 'source') return;
        if (value !== normalized) { raw = preserver.merge(value); normalized = value; }
        decorate(); sync();
      },
      after() {
        installHtmlRendering(editor, Boolean(desktop));
        // Vditor's undo stack diffs whole snapshots and gives up after this many
        // seconds; the default second blocks input after rendering diagrams.
        (editor.vditor as unknown as { undo: { dmp: { Diff_Timeout: number } } }).undo.dmp.Diff_Timeout = 0.05;
        renderDocument();
        editorAlive = true; editorSettings = editorKey(editorMode); decorate();
        const writing = $('#write');
        writing.classList.toggle('itypora-code-line-numbers', preferences.codeLineNumbers);
        writing.addEventListener('error', () => decorateRendering(writing), true);
        writing.addEventListener('load', () => decorateRendering(writing), true);
        // Vditor writes padding inline on resize. Let imported #write CSS own layout.
        writing.style.removeProperty('padding');
        paddingObserver = new MutationObserver(() => { if (writing.style.padding) writing.style.removeProperty('padding'); });
        paddingObserver.observe(writing, { attributes: true, attributeFilter: ['style'] });
        decorateRendering(writing);
        renderingObserver = new MutationObserver(() => decorateRendering(writing));
        renderingObserver.observe(writing, { childList: true, subtree: true });
        refreshRendering(editor);
        updatePreferences(); loading = false; resolve();
      }
    });
  });
}

async function loadDocument(next: DocumentState) {
  currentPath = next.path; raw = next.content; saved = raw; recovered = next.dirty; recent = next.recent;
  source.load(raw);
  source.scrollTop = 0;
  await mountEditor(); sync(); renderFiles();
}

function renderFiles() {
  const list = $('#file-list'); list.replaceChildren();
  const query = $<HTMLInputElement>('#file-search').value.trim().toLowerCase();
  const entries = files.length ? files : recent.map((file) => ({ path: file, name: basename(file) }));
  const label = document.createElement('div'); label.className = 'list-label'; label.textContent = files.length ? '文件夹文档' : '最近打开'; list.append(label);
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'empty-files';
    empty.innerHTML = '<p>暂无文档</p><button data-action="open">打开文档…</button>';
    list.append(empty); return;
  }
  let previousDirectory = '';
  for (const file of entries.filter((entry) => entry.name.toLowerCase().includes(query)).sort((a, b) => fileTab === 'tree' ? a.path.localeCompare(b.path) : 0)) {
    const directory = file.name.split(/[\\/]/).slice(0, -1).join(' / ');
    if (fileTab === 'tree' && directory && directory !== previousDirectory) {
      const group = document.createElement('div'); group.className = 'tree-directory'; group.textContent = directory; list.append(group);
    }
    previousDirectory = directory;
    const item = document.createElement('button'); item.className = `file-item ${file.path === currentPath ? 'active' : ''}`;
    item.innerHTML = icon('file');
    const name = document.createElement('span'); name.textContent = fileTab === 'tree' ? basename(file.name) : file.name; item.append(name); item.title = file.path;
    if (fileTab === 'tree' && directory) item.style.paddingLeft = '26px';
    item.addEventListener('click', () => void run(async () => { const next = await desktop?.open(file.path); if (next) await loadDocument(next); }));
    list.append(item);
  }
}

function renderOutline() {
  const nav = $('#outline'); nav.replaceChildren();
  const headings = mode === 'source' ? [] : Array.from(document.querySelectorAll<HTMLElement>('#write h1,#write h2,#write h3,#write h4,#write h5,#write h6'));
  if (!headings.length) { const p = document.createElement('p'); p.className = 'outline-empty'; p.textContent = mode === 'source' ? '切回编辑模式查看大纲' : '写下标题，大纲会出现在这里'; nav.append(p); }
  for (const heading of headings) {
    const button = document.createElement('button');
    // The heading's text without its Markdown (#, setext underline, **, `).
    const text = heading.cloneNode(true) as HTMLElement;
    text.querySelectorAll('.vditor-ir__marker, .vditor-ir__marker--hide, [data-type="heading-marker"]').forEach(marker => marker.remove());
    button.textContent = text.textContent?.replace(/​/g, '').replace(/^#+\s*/, '').trim() || '无标题';
    button.style.paddingLeft = `${16 + (Number(heading.tagName.slice(1)) - 1) * 12}px`;
    button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth', block: 'start' })); nav.append(button);
  }
}

function applyTheme(id: string) {
  const imported = themes.find((theme) => theme.id === id);
  if (!imported && (desktop || !['paper', 'night', 'sepia'].includes(id))) id = 'paper';
  const root = document.documentElement;
  for (const name of ['paper', 'ink', 'sidebar', 'muted', 'accent', 'hover', 'line']) root.style.removeProperty(`--${name}`);
  document.documentElement.dataset.theme = ['paper', 'night', 'sepia'].includes(id) ? id : 'paper';
  // The default palettes (also theme files on desktop) keep Itypora's own base look.
  root.classList.toggle('itypora-imported-theme', Boolean(imported) && !['paper', 'sepia', 'night'].includes(id));
  themeStyle.textContent = imported?.css || baseCss;
  const isDarkBackground = () => {
    const rgb = getComputedStyle($('.editor-surface')).backgroundColor.match(/[\d.]+/g)?.map(Number);
    return Boolean(rgb && rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 140);
  };
  // A custom dark theme may omit UI colors; use dark defaults for those controls.
  if (imported && !['paper', 'sepia', 'night'].includes(id)) root.dataset.theme = isDarkBackground() ? 'night' : 'paper';
  if (themeStyle.textContent) {
    const style = getComputedStyle($('.editor-surface'));
    const variables: Record<string, string> = { paper: '--bg-color', ink: '--text-color', sidebar: '--side-bar-bg-color', muted: '--control-text-color', accent: '--primary-color', hover: '--active-file-bg-color', line: '--window-border-color' };
    const resolved = Object.entries(variables).map(([target, source]) => [target, style.getPropertyValue(source).trim()]);
    for (const [target, value] of resolved) if (value && CSS.supports('color', value)) root.style.setProperty(`--${target}`, value);
    // Imported themes may set body colors directly instead of using variables.
    root.style.setProperty('--paper', style.backgroundColor);
    root.style.setProperty('--ink', style.color);
  }
  root.style.colorScheme = isDarkBackground() ? 'dark' : 'light';
  if (editorAlive && mode !== 'source') refreshRendering(editor);
  else renderStale = editorAlive;
  localStorage.setItem('itypora-theme', id);
  syncView();
}
async function applySettings(next: SettingsSnapshot) {
  if (busy || loading) { pendingSettings = next; return; }
  await run(async () => {
    const rebuild = ['mode', 'typewriter', 'autoSpace', 'codeLineNumbers', 'tabSize'].some(key => preferences[key as keyof Preferences] !== next.settings[key as keyof Preferences]);
    Object.assign(preferences, next.settings); themes = next.themes; baseCss = next.baseCss;
    if (rebuild && mode !== 'source') { mode = preferences.mode === 'wysiwyg' ? 'wysiwyg' : 'ir'; await mountEditor(); }
    applyTheme(preferences.theme);
    updatePreferences(); sync(); syncView();
  });
}
async function savePreferences(update: Partial<Preferences>) {
  if (desktop) await applySettings(await desktop.savePreferences(update));
  else { Object.assign(preferences, update); updatePreferences(); }
}

async function run(work: () => Promise<void>) {
  if (busy || loading) return;
  busy = true;
  // Everything after this point must reach `finally`, or `busy` would stay set.
  try {
    // Capture input synchronously; Vditor normally debounces its callback.
    flush();
    if (mode !== 'source') editor.disabled();
    source.readOnly = true;
    await work();
  } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  finally {
    busy = false;
    try {
      if (mode !== 'source' && editorAlive) editor.enable();
      source.readOnly = false;
    } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
    if (pendingSettings) { const next = pendingSettings; pendingSettings = undefined; await applySettings(next); }
    if (pendingClose) { pendingClose = false; void action('close'); }
  }
}

// Saves the rendered document as a standalone HTML page or a PDF (src/export.ts).
async function exportDocument(kind: 'html' | 'pdf') {
  if (!desktop && kind === 'pdf') { toast('请运行桌面版导出 PDF。'); return; }
  if (!editorAlive) throw new Error('文档尚未渲染完成，暂时无法导出。');
  const target = desktop ? await desktop.exportTarget(kind) : '';
  if (target === null) return;
  const title = currentPath ? basename(currentPath).replace(/\.[^.]+$/, '') : '未命名';
  const view = $('#editor');
  // Source mode hides the rendered document: lay it out unseen, with the latest text.
  const hidden = view.hidden;
  if (hidden) {
    view.classList.add('itypora-exporting'); view.hidden = false;
    if (raw !== sourceBase) { loading = true; try { renderDocument(); } finally { loading = false; } decorate(); sourceBase = raw; }
    if (renderStale) { refreshRendering(editor); renderStale = false; }
  }
  try {
    if (desktop) toast(kind === 'pdf' ? '正在导出 PDF…' : '正在导出 HTML…');
    const html = await exportPage($('#write'), title);
    if (!desktop) {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${title}.html`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('已导出 HTML 文件'); return;
    }
    toast(`已导出到 ${await desktop.exportWrite(html)}`);
  } finally {
    if (hidden) { view.hidden = true; view.classList.remove('itypora-exporting'); }
  }
}

async function changeMode(next: typeof mode) {
  if (next === mode) return;
  if (next === 'source') {
    source.value = raw; sourceBase = raw;
    const spot = editorAlive ? previewSpot($('#write'), source.value) : null;
    mode = next;
    $('#editor').hidden = true; source.hidden = false;
    if (spot) showInSource(source, spot); else source.focus();
  } else {
    const spot = source.hidden ? null : sourceSpot(source);
    mode = next;
    if (editorAlive && editorSettings === editorKey(next)) {
      $('#editor').hidden = false; source.hidden = true;
      if (raw !== sourceBase) { loading = true; try { renderDocument(); } finally { loading = false; } decorate(); }
      if (renderStale) refreshRendering(editor);
      renderStale = false; updatePreferences();
    } else await mountEditor();
    if (spot && editorAlive) showInPreview($('#write'), source.value, spot);
  }
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  document.querySelector('[data-action="source"]')?.classList.toggle('active', mode === 'source');
  sync(); syncView();
}

function showPane(tab: string) {
  fileTab = tab;
  document.body.classList.remove('sidebar-hidden'); localStorage.setItem('itypora-sidebar', 'visible');
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(item => item.classList.toggle('active', item.dataset.tab === tab || item.dataset.tab === 'files' && tab === 'tree' && Boolean(item.closest('.sidebar-tabs'))));
  $('#file-pane').hidden = tab === 'outline'; $('#outline').hidden = tab !== 'outline'; renderFiles(); renderOutline(); syncView();
}

type TableTarget = { mode: 'ir' | 'wysiwyg' | 'source'; generation: number; content: string; start: number; end: number; range: Range | null; scroll: number };
let tableTarget: TableTarget | null = null;
function showTableDialog() {
  const dialog = $<HTMLDialogElement>('#table-dialog');
  if (busy || loading || dialog.open) return;
  flush();
  const writing = $('#write');
  let range: Range | null = null;
  if (mode !== 'source') {
    const current = window.getSelection();
    range = current?.rangeCount && writing.contains(current.anchorNode) ? current.getRangeAt(0).cloneRange() : selection?.cloneRange() || null;
    if (!range || !writing.contains(range.startContainer) || !writing.contains(range.endContainer)) {
      range = document.createRange(); range.selectNodeContents(writing); range.collapse(false);
    }
  }
  tableTarget = { mode, generation: editorGeneration, content: raw, start: source.selectionStart, end: source.selectionEnd, range, scroll: mode === 'source' ? source.scrollTop : writing.scrollTop };
  $<HTMLFormElement>('#table-form').reset();
  dialog.showModal();
  $<HTMLInputElement>('#table-columns').focus();
  $<HTMLInputElement>('#table-columns').select();
  syncView();
}
function restoreTableTarget(target: TableTarget) {
  if (target.mode !== mode || target.generation !== editorGeneration || target.content !== raw) return false;
  if (mode === 'source') {
    source.focus(); source.setSelectionRange(target.start, target.end); source.scrollTop = target.scroll;
    return true;
  }
  const writing = $('#write');
  writing.focus({ preventScroll: true });
  if (target.range && writing.contains(target.range.startContainer) && writing.contains(target.range.endContainer)) {
    selection = target.range.cloneRange();
    const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(selection);
  } else return false;
  writing.scrollTop = target.scroll;
  return true;
}
function cancelTableDialog() {
  const target = tableTarget; tableTarget = null;
  $<HTMLDialogElement>('#table-dialog').close();
  if (target) restoreTableTarget(target);
  syncView();
}
$('#table-cancel').onclick = cancelTableDialog;
$('#table-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelTableDialog(); });
$('#table-dialog').addEventListener('close', () => {
  // The event is queued: when the dialog has already been opened again, it belongs to the previous one.
  if ($<HTMLDialogElement>('#table-dialog').open) return;
  if (tableTarget) restoreTableTarget(tableTarget);
  tableTarget = null;
  syncView();
});
$('#table-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$<HTMLFormElement>('#table-form').reportValidity() || !tableTarget) return;
  const dimensions = { columns: $<HTMLInputElement>('#table-columns').valueAsNumber, rows: $<HTMLInputElement>('#table-rows').valueAsNumber };
  const target = tableTarget; tableTarget = null;
  $<HTMLDialogElement>('#table-dialog').close();
  if (restoreTableTarget(target)) format('table', dimensions);
  else toast('文档已变化，请重新选择插入位置。');
  syncView();
});

function format(command: string, tableSize?: TableSize) {
  if (loading || busy) return;
  try {
  if (mode === 'source') {
    source.focus();
    if (command === 'undo') { source.undo(); return; }
    if (command === 'redo') { source.redo(); return; }
    const change = formatEdit(command, source.value, source.selectionStart, source.selectionEnd, preferences.tabSize, tableSize);
    source.replaceRange(change.text, change.start, change.end);
    source.setSelectionRange(change.selectionStart, change.selectionEnd);
    raw = source.value; sync(); syncView(); return;
  }
  const currentSelection = window.getSelection();
  if (currentSelection?.rangeCount && $('#write').contains(currentSelection.anchorNode)) selection = currentSelection.getRangeAt(0).cloneRange();
  $('#write').focus();
  if (selection && document.contains(selection.startContainer)) { const active = window.getSelection(); active?.removeAllRanges(); active?.addRange(selection); }
  if (/^h[1-6]$/.test(command) || ['bold', 'italic', 'strike', 'quote', 'list', 'ordered-list', 'check', 'indent', 'outdent', 'insert-before', 'insert-after', 'undo', 'redo'].includes(command)) {
    const selector = /^h[1-6]$/.test(command) ? `[data-tag="${command}"]` : `[data-type="${command}"]`;
    document.querySelector<HTMLElement>(`.vditor-toolbar ${selector}`)?.click();
  } else {
    const current = window.getSelection();
    if (!current?.rangeCount || !$('#write').contains(current.anchorNode)) throw new Error('请先将光标放入编辑器。');
    formatRich(editor, $('#write'), current.getRangeAt(0), command, mode, preferences.tabSize, tableSize);
  }
  flush(); decorate(); syncView();
  } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
}

function info(title: string, html: string) {
  $('#info-title').textContent = title; $('#info-content').innerHTML = html; $<HTMLDialogElement>('#info-dialog').showModal();
}

async function find(forward = true, next = false) {
  const query = $<HTMLInputElement>('#find-query').value;
  if (mode === 'source') {
    if (!query) { $('#find-result').textContent = ''; return; }
    const matches = Array.from(source.value.matchAll(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))).map(match => match.index!);
    const at = next ? (forward ? source.selectionEnd : source.selectionStart - 1) : 0;
    const position = forward ? matches.find(index => index >= at) ?? matches[0] : [...matches].reverse().find(index => index <= at) ?? matches.at(-1);
    if (position !== undefined) { source.focus(); source.setSelectionRange(position, position + query.length); source.scrollIntoView(); }
    $('#find-result').textContent = `${position === undefined ? 0 : matches.indexOf(position) + 1} / ${matches.length}`;
  } else if (desktop) await desktop.find(query, forward, next);
  else if (query) (window as unknown as { find(text: string, matchCase: boolean, backwards: boolean, wrap: boolean): boolean }).find(query, false, !forward, true);
}

async function action(name: string) {
  if ($<HTMLDialogElement>('#table-dialog').open) {
    if (name === 'close') cancelTableDialog();
    else if (name === 'format:undo' || name === 'format:redo') document.execCommand(name.slice(7));
    return;
  }
  if (zoomViewerOpen()) {
    // Nothing to format while an enlarged picture covers the document.
    if (name.startsWith('format:')) return;
    closeZoomViewer();
  }
  if (name === 'close' && (busy || loading)) { pendingClose = true; return; }
  if (!$('#preferences').hidden && name.startsWith('format:')) {
    if (name === 'format:undo' || name === 'format:redo') document.execCommand(name.slice(7));
    return;
  }
  if (!$('#preferences').hidden && (['new', 'open', 'source', 'find', 'files', 'tree', 'outline', 'export-html', 'export-pdf'].includes(name) || name.startsWith('recent:'))) closePreferences();
  if (name === 'format:table') { showTableDialog(); return; }
  if (name.startsWith('format:')) { format(name.slice(7)); return; }
  if (name.startsWith('theme:')) { await savePreferences({ theme: name.slice(6) }); return; }
  if (name === 'sidebar') { document.body.classList.toggle('sidebar-hidden'); localStorage.setItem('itypora-sidebar', document.body.classList.contains('sidebar-hidden') ? 'hidden' : 'visible'); syncView(); return; }
  if (['files', 'tree', 'outline'].includes(name)) { showPane(name); return; }
  if (name === 'focus') { document.body.classList.toggle('focus-mode'); syncView(); return; }
  if (name === 'statusbar') { await savePreferences({ showStatus: !preferences.showStatus }); return; }
  if (name === 'find') { $('.findbar').hidden = false; $<HTMLInputElement>('#find-query').focus(); $<HTMLInputElement>('#find-query').select(); return; }
  if (name === 'find-next' || name === 'find-previous') { if ($('.findbar').hidden) await action('find'); else await find(name === 'find-next', true); return; }
  if (name === 'close-find') { $('.findbar').hidden = true; await desktop?.find(''); return; }
  if (name === 'preferences' || name === 'appearance') { if (desktop) await desktop.openPreferences(name === 'appearance' ? 'appearance' : 'general'); else toast('请运行桌面版使用完整偏好设置。'); return; }
  if (name === 'typewriter') { await savePreferences({ typewriter: !preferences.typewriter }); return; }
  if (name === 'statistics') { flush(); info('字数统计', `<dl class="statistics"><dt>词数</dt><dd>${wordCount()}</dd><dt>字符（不含空格）</dt><dd>${Array.from(raw.replace(/\s/g, '')).length}</dd><dt>预计阅读</dt><dd>${Math.max(1, Math.ceil(wordCount() / preferences.readingSpeed))} 分钟</dd><dt>行数</dt><dd>${raw ? raw.split('\n').length : 0}</dd></dl><p>词数按汉字和英文单词估算，不计代码块。</p>`); return; }
  if (name === 'help') { info('Markdown 快捷参考', '<p>输入标记后按空格即可即时排版。</p><pre># 一级标题\n## 二级标题\n**加粗**　*斜体*\n- 无序列表\n1. 有序列表\n- [ ] 任务列表\n> 引用\n[链接](https://example.com)</pre><p>Ctrl+/ 切换源码 · F8 专注模式 · F9 打字机模式</p>'); return; }
  if (name === 'about') { info(`Itypora ${__APP_VERSION__}`, '<p>本地 Markdown 编辑器。</p><p>基于 Electron 和 Vditor 独立实现，支持导入 Typora CSS 主题。与 Typora 项目无隶属关系。</p>'); return; }
  await run(async () => {
    if (name === 'close') { desktop?.update(raw, dirty()); await desktop?.close(); }
    else if (name === 'source') await changeMode(mode === 'source' ? preferences.mode === 'wysiwyg' ? 'wysiwyg' : 'ir' : 'source');
    else if (name.startsWith('recent:')) { const file = recent[Number(name.slice(7))]; if (file) { const next = await desktop?.open(file); if (next) await loadDocument(next); } }
    else if (name === 'new') {
      const next = desktop ? await desktop.newDocument() : (!dirty() || confirm('放弃未保存的修改？')) ? { path: null, content: '', dirty: false, recent: [] } : null;
      if (next) await loadDocument(next);
    } else if (name === 'open') {
      if (!desktop) { $<HTMLInputElement>('#browser-open').click(); return; }
      const next = await desktop.open(); if (next) await loadDocument(next);
    } else if (name === 'folder') {
      if (!desktop) { toast('请运行桌面版使用本地文件夹：npm run desktop'); return; }
      const folder = await desktop.folder(); if (folder) { files = folder.files; $('#workspace-name').textContent = basename(folder.root); renderFiles(); if (files.length >= 500) toast('首版最多显示 500 个 Markdown 文件。'); }
    } else if (name === 'save' || name === 'save-as') {
      if (!desktop) {
        const url = URL.createObjectURL(new Blob([raw], { type: 'text/markdown;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = currentPath ? basename(currentPath) : '未命名.md'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        saved = raw; recovered = false; sync(); toast('已导出 Markdown 文件'); return;
      }
      desktop.update(raw, dirty());
      const result = await desktop.save(name === 'save-as');
      if (result) { currentPath = result.path; saved = result.content; recovered = false; recent = result.recent; sync(); renderFiles(); toast('已保存到本地'); }
    } else if (name === 'export-html' || name === 'export-pdf') {
      await exportDocument(name === 'export-pdf' ? 'pdf' : 'html');
    } else if (name === 'import-theme') {
      if (!desktop) { toast('请运行桌面版导入带本地资源的 CSS 主题。'); return; }
      const theme = await desktop.importTheme();
      if (theme) { toast(theme.warnings.length ? theme.warnings.join('\n') : `已导入主题「${theme.name}」`); }
    }
  });
}

document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (target) void action(target.dataset.action!);
  const close = (event.target as HTMLElement).closest<HTMLElement>('[data-close]');
  if (close) $<HTMLDialogElement>(`#${close.dataset.close}`).close();
});
document.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.addEventListener('click', () => showPane(button.dataset.tab!)));
document.addEventListener('selectionchange', () => {
  syncView();
  const active = window.getSelection();
  if (!active?.rangeCount || !$('#editor').contains(active.anchorNode)) return;
  selection = active.getRangeAt(0).cloneRange();
  let block = active.anchorNode instanceof HTMLElement ? active.anchorNode : active.anchorNode?.parentElement;
  while (block?.parentElement && block.parentElement.id !== 'write') block = block.parentElement;
  document.querySelectorAll('.active-paragraph').forEach(item => item.classList.remove('active-paragraph'));
  if (block?.parentElement?.id === 'write') block.classList.add('active-paragraph');
});
$('#find-query').addEventListener('input', () => { if (mode !== 'source') void find(); });
$('#find-query').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void find(!event.shiftKey, true); } });
desktop?.onFind(result => { $('#find-result').textContent = `${result.current} / ${result.total}`; });
$('#file-search').addEventListener('input', renderFiles);
$('#browser-open').addEventListener('change', () => void run(async () => {
  const input = $<HTMLInputElement>('#browser-open'); const file = input.files?.[0]; input.value = '';
  if (!file || (dirty() && !confirm('放弃未保存的修改？'))) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB');
  await loadDocument({ path: file.name, content: await file.text(), dirty: false, recent: [] });
}));
desktop?.onAction(action);
desktop?.onPreferences(next => { preferencesPage?.render(next); void applySettings(next); });
desktop?.onPreferencesSection(showPreferences);
document.addEventListener('keydown', (event) => {
  if ($<HTMLDialogElement>('#table-dialog').open) return;
  if (event.key === 'Escape' && !$('#preferences').hidden) { event.preventDefault(); closePreferences(); return; }
  if (event.key === 'Escape') { void action('close-find'); document.body.classList.remove('focus-mode'); syncView(); }
  if (desktop || !(event.ctrlKey || event.metaKey)) return;
  const name = event.key.toLowerCase() === 's' ? event.shiftKey ? 'save-as' : 'save' : event.key.toLowerCase() === 'o' ? 'open' : event.key === '/' ? 'source' : null;
  if (name) { event.preventDefault(); void action(name); }
});
window.addEventListener('beforeunload', (event) => { if (!desktop && dirty()) { event.preventDefault(); event.returnValue = ''; } });

async function start() {
  if (desktop) {
    let initial = await desktop.initialize(); recent = initial.recent;
    if (!initial.initialized) {
      const migrated = await desktop.savePreferences({ ...preferences, theme: localStorage.getItem('itypora-theme') || 'paper', showStatus: localStorage.getItem('itypora-status') !== 'hidden' });
      initial = { ...initial, ...migrated };
    }
    Object.assign(preferences, initial.settings); themes = initial.themes; baseCss = initial.baseCss;
    mode = preferences.mode === 'wysiwyg' ? 'wysiwyg' : 'ir';
    if (initial.path || initial.dirty || initial.content) { currentPath = initial.path; raw = initial.content; saved = raw; recovered = initial.dirty; }
  }
  await mountEditor();
  applyTheme(preferences.theme); renderFiles(); sync();
  if (pendingSettings) { const next = pendingSettings; pendingSettings = undefined; await applySettings(next); }
}
start().catch((error) => { loading = false; toast(`启动失败：${error.message}`); });
