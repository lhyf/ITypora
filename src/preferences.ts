import './preferences.css';
import type { Preferences, SettingsSnapshot } from './settings-types';
type SettingsAPI = { command(name: string, value?: unknown): Promise<any> };
export function createPreferences(host: HTMLElement, api: SettingsAPI, close: () => void) {
const categories = [['general', '通用', '⚙'], ['appearance', '外观', '◐'], ['editor', '编辑器', '✎'], ['markdown', 'Markdown', 'M↓']];
const checkbox = (key: keyof Preferences, label: string) => `<label class="check"><input type="checkbox" data-setting="${key}"/>${label}</label>`;
host.innerHTML = `
  <div class="preferences-header"><span>偏好设置</span><button id="close" title="关闭偏好设置（Esc）" aria-label="关闭偏好设置"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
  <div class="preferences-body">
  <aside><input id="search" type="search" placeholder="搜索偏好设置" aria-label="搜索偏好设置"/><nav aria-label="设置分类">${categories.map(([id, label, icon]) => `<button data-section="${id}"><span class="symbol">${icon}</span>${label}</button>`).join('')}</nav><div class="brand">Itypora <span>偏好设置</span></div></aside>
  <main><header><h1 id="title">通用</h1><span>设置自动保存</span></header>
    <section data-page="general"><article><h2>窗口</h2>${checkbox('showStatus', '显示底部状态栏')}<p>在状态栏切换侧边栏、源码模式并查看字数。</p></article><article><h2>文档</h2><p>使用 Ctrl+S 保存文件。未保存的修改会保留恢复草稿，下次启动时可选择恢复。</p><p>当前版本支持 UTF-8 Markdown 文档。</p></article></section>
    <section data-page="appearance" hidden>
      <article><h2>字体大小</h2><div class="inline"><label><input type="radio" name="font-size" value="auto"/>自动（推荐）</label><label><input type="radio" name="font-size" value="custom"/>自定义</label><input id="setting-size" type="number" min="10" max="36" aria-label="正文字号"/><span>px</span></div><p>自动使用主题定义的字号。</p><label class="row">正文字体<input data-setting="fontFamily" placeholder="跟随主题" aria-label="正文字体"/></label></article>
      <article><h2>字数统计</h2>${checkbox('showCount', '始终显示字数统计')}<label class="row">阅读速度<div><input data-setting="readingSpeed" type="number" min="50" max="2000" aria-label="阅读速度"/> 词 / 分钟</div></label></article>
      <article><h2>主题</h2><label class="row">当前主题<select id="current-theme" data-setting="theme" aria-label="当前主题"></select></label><p>从主题文件夹中选择已有主题。</p><div class="buttons"><button id="open-folder">打开主题文件夹</button><button id="get-themes">获取主题</button></div><div class="buttons secondary"><button id="import-theme">导入 CSS 主题…</button><button id="refresh-themes">重新加载主题</button></div><p id="theme-folder" class="path"></p><p>可将主题 CSS 和资源文件夹放入此目录，再点击“重新加载主题”。</p><p id="theme-errors" class="error" role="alert" hidden></p>
      <details><summary>自定义 CSS</summary><p>全局覆盖保存为 base.user.css；针对单个主题，可在主题文件夹添加“主题名.user.css”。</p><textarea id="custom-css" spellcheck="false" readonly aria-label="自定义 CSS" placeholder="#write {\n  /* 在这里调整正文样式 */\n}"></textarea><button id="save-css" disabled>保存并应用 CSS</button></details></article>
    </section>
    <section data-page="editor" hidden><article><h2>编辑模式</h2><label class="row">默认模式<select id="setting-mode" data-setting="mode"><option value="ir">即时渲染</option><option value="wysiwyg">所见即所得</option></select></label><p>切换时保留当前文档内容。</p></article><article><h2>排版</h2><label class="row">正文宽度<select data-setting="width"><option value="0">跟随主题</option><option value="760">760 px</option><option value="960">960 px</option><option value="1200">1200 px</option></select></label>${checkbox('typewriter', '打字机模式')}${checkbox('spellcheck', '拼写检查')}</article></section>
    <section data-page="markdown" hidden><article><h2>代码块</h2>${checkbox('codeLineNumbers', '显示代码行号')}<label class="row">Tab 缩进<select data-setting="tabSize"><option value="2">2 个空格</option><option value="4">4 个空格</option><option value="8">8 个空格</option></select></label></article><article><h2>渲染</h2>${checkbox('autoSpace', '自动调整中英文之间的显示间距')}<p>控制正文渲染，不会自动改写磁盘上的文件。</p></article></section>
    <p id="no-results" hidden>未找到匹配的设置。</p><footer><span id="message" role="status"></span></footer>
  </main></div>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
let section = 'general';
let cssLoaded = false, cssLoading = false;
function navigate(next: string) { section = categories.some(([id]) => id === next) ? next : 'general'; $<HTMLInputElement>('#search').value = ''; filter(); }
function filter() {
  const query = $<HTMLInputElement>('#search').value.trim().toLowerCase();
  let found = false;
  host.querySelectorAll<HTMLElement>('[data-page]').forEach(page => {
    let matches = false;
    page.querySelectorAll<HTMLElement>('article').forEach(article => { article.hidden = Boolean(query) && !article.textContent!.toLowerCase().includes(query); matches ||= !article.hidden; });
    page.hidden = query ? !matches : page.dataset.page !== section;
    found ||= !page.hidden;
  });
  host.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => { button.classList.toggle('selected', !query && button.dataset.section === section); button.setAttribute('aria-current', String(!query && button.dataset.section === section)); });
  $('#title').textContent = query ? '搜索结果' : categories.find(([id]) => id === section)![1]; $('#no-results').hidden = found;
}
function render(value: SettingsSnapshot) {
  const themes = value.themes;
  const select = $<HTMLSelectElement>('#current-theme'); select.replaceChildren();
  for (const theme of themes) select.add(new Option(theme.name, theme.id));
  if (!themes.some(theme => theme.id === value.settings.theme)) {
    const missing = new Option(themes.length ? '所选主题已移除，请重新选择' : '主题目录暂无可用主题', value.settings.theme);
    missing.disabled = true; select.add(missing);
  }
  host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]').forEach(input => {
    const current = value.settings[input.dataset.setting as keyof Preferences];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(current); else input.value = String(current);
  });
  const automatic = value.settings.size === '0';
  $<HTMLInputElement>(`[name="font-size"][value="${automatic ? 'auto' : 'custom'}"]`).checked = true;
  $<HTMLInputElement>('#setting-size').disabled = automatic;
  $<HTMLInputElement>('#setting-size').value = automatic ? '16' : value.settings.size;
  $('#theme-folder').textContent = value.themeFolder;
  $('#theme-errors').textContent = value.themeErrors.join('\n'); $('#theme-errors').hidden = !value.themeErrors.length;
}
async function run(work: () => Promise<unknown>, message = '') {
  try { await work(); $('#message').textContent = message; $('#message').classList.remove('error'); }
  catch (error) { $('#message').textContent = error instanceof Error ? error.message : String(error); $('#message').classList.add('error'); }
}
async function save(update: Partial<Preferences>) { render(await api.command('save', update)); }
host.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => button.onclick = () => navigate(button.dataset.section!));
$('#search').addEventListener('input', filter);
host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]').forEach(input => input.addEventListener('change', () => void run(async () => {
  if (!input.checkValidity()) { input.reportValidity(); return; }
  const key = input.dataset.setting!;
  const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : ['readingSpeed', 'tabSize'].includes(key) ? Number(input.value) : input.value;
  await save({ [key]: value });
})));
host.querySelectorAll<HTMLInputElement>('[name="font-size"]').forEach(radio => radio.onchange = () => void run(() => save({ size: radio.value === 'auto' ? '0' : $<HTMLInputElement>('#setting-size').value })));
$('#setting-size').addEventListener('change', () => void run(async () => { const input = $<HTMLInputElement>('#setting-size'); if (input.checkValidity()) await save({ size: input.value }); else input.reportValidity(); }));
for (const [id, command] of [['open-folder', 'folder'], ['get-themes', 'gallery'], ['import-theme', 'import'], ['refresh-themes', 'refresh']]) {
  $(`#${id}`).onclick = () => void run(async () => { const result = await api.command(command); if (result?.settings) render(result); }, command === 'refresh' ? '主题已重新加载' : '');
}
$('details').addEventListener('toggle', () => {
  if (cssLoaded || cssLoading) return;
  cssLoading = true;
  void run(async () => {
    try {
      const css = $<HTMLTextAreaElement>('#custom-css');
      css.value = await api.command('read-css');
      // Editable only once the saved file is shown, so it never replaces what was typed.
      css.readOnly = false; $<HTMLButtonElement>('#save-css').disabled = false; cssLoaded = true;
    } finally { cssLoading = false; }
  });
});
$('#save-css').onclick = () => void run(async () => render(await api.command('save-css', $<HTMLTextAreaElement>('#custom-css').value)), '自定义 CSS 已保存并应用');
$('#close').onclick = close;
return {
  render,
  show(next: string) {
    navigate(next);
    $('main').scrollTop = 0;
    $('#search').focus({ preventScroll: true });
    void run(async () => render(await api.command('get')));
  }
};
}
