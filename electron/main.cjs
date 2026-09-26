const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { atomicWrite, readDocument, listMarkdown, MAX_DOCUMENT_BYTES } = require('./files.cjs');
const { createSettingsStore } = require('./settings.cjs');
const { createMenu } = require('./menu.cjs');

if (!app.isPackaged && process.env.ITYPORA_TEST_USER_DATA) app.setPath('userData', path.resolve(process.env.ITYPORA_TEST_USER_DATA));

protocol.registerSchemesAsPrivileged([{ scheme: 'itypora-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window;
let settingsStore;
const settingsSnapshot = () => settingsStore.snapshot();
function broadcastSettings() {
  themes = settingsStore.snapshot().themes;
  rebuildMenu();
  if (window && !window.isDestroyed()) window.webContents.send('preferences-changed', settingsSnapshot());
  return settingsSnapshot();
}
async function openPreferences(section = 'general') {
  window.webContents.send('preferences-section', typeof section === 'string' ? section : 'general');
}
async function importSettingsTheme(owner) {
  const result = await dialog.showOpenDialog(owner, { properties: ['openFile'], filters: [{ name: 'Typora CSS 主题', extensions: ['css'] }] });
  if (result.canceled) return null;
  const next = await settingsStore.add(result.filePaths[0]);
  await settingsStore.saveSettings({ theme: next.imported.id }); broadcastSettings();
  return next.imported;
}
let state = { path: null, content: '', diskContent: '', dirty: false };
let recent = [];
let themes = [];
let allowedFiles = new Set();
let closeAllowed = false;
let draftQueue = Promise.resolve();
let lastDraft = '';
let operation = Promise.resolve();
let view = {};
// The file chosen for the export in progress; the page itself comes from the renderer.
let exportTarget = null;
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
const sendAction = (name) => window?.webContents.send('action', name);
const rebuildMenu = () => Menu.setApplicationMenu(createMenu(sendAction, themes, recent, view));
const entry = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
const dataFile = (name) => path.join(app.getPath('userData'), name);
const snapshot = () => ({ path: state.path, content: state.content, dirty: state.dirty, recent });

async function readJson(name, fallback) {
  try { return JSON.parse(await fs.readFile(dataFile(name), 'utf8')); } catch { return fallback; }
}
function trusted(event) { return event.sender === window?.webContents && event.senderFrame?.url === entry; }
function checkpoint() {
  const text = state.dirty ? JSON.stringify(state) : '';
  if (text === lastDraft) return draftQueue;
  lastDraft = text;
  draftQueue = draftQueue.catch(() => {}).then(async () => {
    if (text) await atomicWrite(dataFile('recovery.json'), text);
    else await fs.rm(dataFile('recovery.json'), { force: true });
  }).catch((error) => { lastDraft = ''; console.error('Draft checkpoint failed:', error.message); });
  return draftQueue;
}
async function remember(file) {
  recent = [file, ...recent.filter((item) => item !== file)].slice(0, 12);
  allowedFiles.add(file);
  await atomicWrite(dataFile('recent.json'), JSON.stringify(recent));
  if (window) rebuildMenu();
}
async function saveDocument(saveAs = false) {
  let target = state.path;
  if (!target || saveAs) {
    const result = await dialog.showSaveDialog(window, {
      title: '保存 Markdown', defaultPath: target || '未命名.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });
    if (result.canceled || !result.filePath) return null;
    target = result.filePath;
  }
  const content = state.content;
  if (target === state.path) {
    const disk = await fs.readFile(target, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (disk !== state.diskContent) {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', message: '磁盘上的文件已被其他程序修改或删除。',
        detail: '覆盖会替换外部修改。你也可以取消后另存为新文件。',
        buttons: ['取消', '覆盖保存'], defaultId: 0, cancelId: 0
      });
      if (response !== 1) return null;
    }
  }
  await atomicWrite(target, content);
  state.path = target;
  state.diskContent = content;
  state.dirty = state.content !== content;
  await remember(target);
  await checkpoint();
  return snapshot();
}
async function canReplace() {
  if (!state.dirty) return true;
  const { response } = await dialog.showMessageBox(window, {
    type: 'question', message: '要保存当前文档的修改吗？',
    buttons: ['保存', '不保存', '取消'], defaultId: 0, cancelId: 2
  });
  if (response === 2) return false;
  if (response === 0) return Boolean(await saveDocument());
  return true;
}
// Typora on Chinese Windows resolves generic sans-serif (e.g. Mermaid text,
// CJK fallback of Latin-only stacks) to Microsoft YaHei; Chromium's own
// default here is the Japanese Meiryo, with different glyphs and line height.
function defaultFonts() {
  const locale = app.getLocale();
  const sansSerif = process.platform !== 'win32' || !/^zh/i.test(locale) ? undefined : /^zh-(TW|HK|MO|Hant)/i.test(locale) ? 'Microsoft JhengHei' : 'Microsoft YaHei';
  return sansSerif && { defaultFontFamily: { sansSerif } };
}
// A local image of the current document, addressed as
// itypora-asset://document/?/<path as written in the Markdown>: relative to the
// document (also above its folder, ../assets/a.png) or absolute (E:\a.png,
// file:///E:/a.png), as Typora shows them. The path rides in the query, where
// the browser does not resolve "..". Null when it is not an image or too large.
const assetPrefix = 'itypora-asset://document/?/';
async function readAsset(href) {
  const url = new URL(href);
  if (url.protocol !== 'itypora-asset:' || url.hostname !== 'document' || !url.search.startsWith('?/')) return null;
  let value = url.search.slice(2);
  try { value = decodeURIComponent(value); } catch { /* A stray % is part of the name. */ }
  const file = /^file:/i.test(value), folder = state.path && path.dirname(state.path);
  if (!folder && !file && !path.isAbsolute(value)) return null;
  const target = await fs.realpath(file ? fileURLToPath(value) : folder ? path.resolve(folder, value) : path.resolve(value));
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif' };
  const type = types[path.extname(target).toLowerCase()];
  const stat = await fs.stat(target);
  if (!type || !stat.isFile() || stat.size > 20 * 1024 * 1024) return null;
  return { type, data: await fs.readFile(target) };
}
// Embeds the document's images in an exported page, so it needs no files beside
// it; one that cannot be read keeps its path, as written in the document.
async function embedAssets(html) {
  const pattern = /(\ssrc=")(itypora-asset:\/\/document\/[^"]*)"/g;
  const values = new Map();
  for (const [, , value] of html.matchAll(pattern)) {
    if (values.has(value)) continue;
    const href = value.replace(/&amp;/g, '&');
    const asset = await readAsset(href).catch(() => null);
    values.set(value, asset ? `data:${asset.type};base64,${asset.data.toString('base64')}` : value.startsWith(assetPrefix) ? value.slice(assetPrefix.length) : value);
  }
  return html.replace(pattern, (_match, attribute, value) => `${attribute}${values.get(value)}"`);
}
async function chooseExport(kind) {
  if (kind !== 'html' && kind !== 'pdf') throw new Error('Unknown export format');
  const name = state.path ? path.join(path.dirname(state.path), path.basename(state.path, path.extname(state.path))) : '未命名';
  const result = await dialog.showSaveDialog(window, {
    title: kind === 'pdf' ? '导出 PDF' : '导出 HTML', defaultPath: `${name}.${kind}`,
    filters: [kind === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'HTML', extensions: ['html', 'htm'] }]
  });
  exportTarget = result.canceled || !result.filePath ? null : { kind, file: result.filePath };
  return exportTarget?.file || null;
}
// Prints the exported page in a hidden, offline window with scripts limited to
// this process, like the document window's own rendering.
async function printPdf(html) {
  const file = path.join(app.getPath('temp'), `itypora-export-${crypto.randomUUID()}.html`);
  await fs.writeFile(file, html, { encoding: 'utf8', mode: 0o600 });
  const printer = new BrowserWindow({
    show: false, width: 1000, height: 1400,
    webPreferences: { partition: 'itypora-export', contextIsolation: true, nodeIntegration: false, sandbox: true, ...defaultFonts() }
  });
  try {
    const contents = printer.webContents;
    contents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|data):/i.test(details.url) || (details.url.startsWith('file:') && details.url !== pathToFileURL(file).href) }));
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
    await printer.loadFile(file);
    await contents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => resolve(true))))', true);
    return await contents.printToPDF({
      pageSize: 'A4', printBackground: true, preferCSSPageSize: true, generateDocumentOutline: true, generateTaggedPDF: true
    });
  } finally {
    printer.destroy();
    await fs.rm(file, { force: true });
  }
}
async function writeExport(html) {
  const target = exportTarget;
  exportTarget = null;
  if (!target || typeof html !== 'string' || Buffer.byteLength(html) > MAX_EXPORT_BYTES) throw new Error('导出内容无效');
  html = await embedAssets(html);
  await atomicWrite(target.file, target.kind === 'pdf' ? await printPdf(html) : html);
  return target.file;
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Untrusted IPC sender');
    const next = operation.catch(() => {}).then(() => callback(...args));
    operation = next;
    return next;
  });
}

app.whenReady().then(async () => {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  recent = await readJson('recent.json', []);
  if (!Array.isArray(recent)) recent = [];
  recent = recent.filter((value) => typeof value === 'string').slice(0, 12);
  allowedFiles = new Set(recent);
  settingsStore = createSettingsStore(app.getPath('userData'));
  themes = (await settingsStore.initialize()).themes;
  protocol.handle('itypora-asset', async (request) => {
    try {
      const asset = await readAsset(request.url);
      if (!asset) return new Response('', { status: 403 });
      return new Response(asset.data, { headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-store' } });
    } catch { return new Response('', { status: 404 }); }
  });
  window = new BrowserWindow({
    width: 1000, height: 800, minWidth: 620, minHeight: 420,
    title: 'Itypora', backgroundColor: '#faf9f6', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, ...defaultFonts() }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  rebuildMenu();
  ipcMain.on('view-update', (event, update) => {
    if (!trusted(event) || !update || typeof update !== 'object') return;
    const next = {};
    for (const key of ['sidebar', 'source', 'focus', 'typewriter', 'statusbar', 'editing', 'inTable', 'inCode', 'inTask', 'inList']) next[key] = Boolean(update[key]);
    next.theme = typeof update.theme === 'string' ? update.theme.slice(0, 100) : 'paper';
    if (JSON.stringify(next) !== JSON.stringify(view)) { view = next; rebuildMenu(); }
  });
  handle('find', (query, forward = true, next = false) => {
    if (typeof query !== 'string' || query.length > 1000) return;
    if (!query) { window.webContents.stopFindInPage('clearSelection'); return; }
    window.webContents.findInPage(query, { forward: Boolean(forward), findNext: !next });
  });
  window.webContents.on('found-in-page', (_event, result) => window.webContents.send('find-result', { current: result.activeMatchOrdinal, total: result.matches }));
  handle('initialize', async () => {
    const recovery = await readJson('recovery.json', null);
    if (recovery?.dirty && typeof recovery.content === 'string') {
      const { response } = await dialog.showMessageBox(window, { message: '发现上次未保存的文档', buttons: ['恢复草稿', '丢弃草稿'], defaultId: 0, cancelId: 0 });
      if (response === 0) state = { ...recovery, path: typeof recovery.path === 'string' ? recovery.path : null };
      else await fs.rm(dataFile('recovery.json'), { force: true });
    }
    return { ...snapshot(), ...settingsSnapshot(), platform: process.platform };
  });
  handle('open', async (file) => {
    if (file && (typeof file !== 'string' || !allowedFiles.has(file))) throw new Error('请通过文件选择器打开文档。');
    if (!file) {
      const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Markdown / 文本', extensions: ['md', 'markdown', 'mdown', 'txt'] }] });
      if (result.canceled) return null;
      file = result.filePaths[0];
    }
    if (!await canReplace()) return null;
    const content = await readDocument(file);
    state = { path: file, content, diskContent: content, dirty: false };
    await remember(file);
    await checkpoint();
    return snapshot();
  });
  handle('folder', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    const files = await listMarkdown(result.filePaths[0]);
    files.forEach((file) => allowedFiles.add(file.path));
    return { root: result.filePaths[0], files };
  });
  handle('new-document', async () => {
    if (!await canReplace()) return null;
    state = { path: null, content: '', diskContent: '', dirty: false };
    await checkpoint();
    return snapshot();
  });
  handle('save', saveDocument);
  handle('export-target', chooseExport);
  handle('export-write', writeExport);
  handle('close', async () => {
    if (!await canReplace()) return;
    state.dirty = false;
    await checkpoint();
    closeAllowed = true;
    window.close();
  });
  handle('import-theme', () => importSettingsTheme(window));
  handle('open-preferences', openPreferences);
  handle('save-preferences', async update => { await settingsStore.saveSettings(update); return broadcastSettings(); });
  const preferencesCommands = {
    get: () => settingsSnapshot(),
    save: async update => { await settingsStore.saveSettings(update); return broadcastSettings(); },
    import: async () => { await importSettingsTheme(window); return settingsSnapshot(); },
    refresh: async () => { await settingsStore.refresh(); return broadcastSettings(); },
    folder: async () => { const error = await shell.openPath(settingsStore.folder); if (error) throw new Error(error); },
    gallery: () => shell.openExternal('https://theme.typora.io/'),
    'read-css': () => settingsStore.customCss(),
    'save-css': async css => { await settingsStore.customCss(css); return broadcastSettings(); }
  };
  ipcMain.handle('preferences-command', (event, command, value) => {
    if (!trusted(event) || !Object.hasOwn(preferencesCommands, command)) throw new Error('Untrusted settings request');
    const next = operation.catch(() => {}).then(() => preferencesCommands[command](value)); operation = next; return next;
  });
  ipcMain.on('document-update', (event, update) => {
    if (!trusted(event) || typeof update?.content !== 'string' || Buffer.byteLength(update.content) > MAX_DOCUMENT_BYTES * 2) return;
    state.content = update.content;
    state.dirty = Boolean(update.dirty);
    window.setDocumentEdited(state.dirty);
  });
  window.on('close', (event) => {
    if (closeAllowed) return;
    event.preventDefault();
    window.webContents.send('action', 'close');
  });
  setInterval(checkpoint, 1000).unref();
  window.once('ready-to-show', () => window.show());
  await window.loadURL(entry);
});
app.on('window-all-closed', () => app.quit());
