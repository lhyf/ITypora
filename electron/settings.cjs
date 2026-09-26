const fs = require('node:fs/promises');
const path = require('node:path');
const { atomicWrite } = require('./files.cjs');
const { importTheme } = require('./themes.cjs');
const defaultThemes = require('./default-themes.cjs');

const defaults = {
  mode: 'ir', size: '0', width: '0', typewriter: false, fontFamily: '',
  theme: 'paper',
  showStatus: true, showCount: true, readingSpeed: 400, spellcheck: false,
  codeLineNumbers: false, autoSpace: false, tabSize: 4
};
function sanitize(update) {
  const result = {};
  for (const [key, value] of Object.entries(update || {})) {
    if (!(key in defaults)) continue;
    if (typeof defaults[key] === 'boolean' && typeof value === 'boolean') result[key] = value;
    else if (key === 'mode' && ['ir', 'wysiwyg'].includes(value)) result[key] = value;
    else if (key === 'size' && (value === '0' || Number(value) >= 10 && Number(value) <= 36)) result[key] = String(Number(value));
    else if (key === 'width' && (value === '0' || Number(value) >= 500 && Number(value) <= 1800)) result[key] = String(Number(value));
    else if (key === 'readingSpeed' && Number.isFinite(value) && value >= 50 && value <= 2000) result[key] = Math.round(value);
    else if (key === 'tabSize' && [2, 4, 8].includes(value)) result[key] = value;
    else if (['theme', 'fontFamily'].includes(key) && typeof value === 'string' && value.length <= 200) result[key] = value;
  }
  return result;
}

function createSettingsStore(root) {
  const folder = path.join(root, 'themes');
  let settings = { ...defaults }, themes = [], errors = [], initialized = false, baseCss = '';
  async function read(name, fallback) { try { return JSON.parse(await fs.readFile(path.join(root, name), 'utf8')); } catch { return fallback; } }
  const snapshot = () => ({ settings: { ...settings }, themes: themes.map(theme => ({ ...theme })), themeFolder: folder, themeErrors: [...errors], initialized, baseCss });
  async function saveSettings(update) {
    settings = { ...settings, ...sanitize(update) }; initialized = true;
    await atomicWrite(path.join(root, 'preferences.json'), JSON.stringify(settings));
    return snapshot();
  }
  async function refresh() {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile() && /\.css$/i.test(entry.name) && !/\.user\.css$/i.test(entry.name) && !entry.name.startsWith('.')).slice(0, 100);
    const next = []; errors = [];
    baseCss = '';
    const base = path.join(folder, 'base.user.css');
    if (await fs.access(base).then(() => true, () => false)) {
      try { baseCss = (await importTheme(base)).css; } catch (error) { errors.push(`base.user.css：${error.message}`); }
    }
    for (const entry of files) {
      const previous = themes.find(theme => theme.fileName === entry.name);
      try {
        const theme = await importTheme(path.join(folder, entry.name));
        const override = path.join(folder, `${entry.name.slice(0, -4)}.user.css`);
        let custom = '';
        if (await fs.access(override).then(() => true, () => false)) custom = (await importTheme(override)).css;
        next.push({ ...theme, id: previous?.id || defaultThemes.find(item => item.fileName === entry.name)?.id || `file:${entry.name}`, fileName: entry.name, css: `${theme.css}\n${baseCss}\n${custom}` });
      } catch (error) { errors.push(`${entry.name}：${error.message}`); if (previous) next.push(previous); }
    }
    themes = next;
    // Base user CSS also applies when a selected theme is missing.
    const result = snapshot(); result.baseCss = baseCss;
    await atomicWrite(path.join(root, 'themes.json'), JSON.stringify(themes));
    return result;
  }
  async function initialize() {
    await fs.mkdir(folder, { recursive: true });
    const defaultsMarker = path.join(folder, '.defaults-initialized');
    if (!await fs.access(defaultsMarker).then(() => true, () => false)) {
      for (const theme of defaultThemes) {
        await fs.writeFile(path.join(folder, theme.fileName), theme.css, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      }
      await atomicWrite(defaultsMarker, '1');
    }
    const stored = await read('preferences.json', null);
    initialized = stored !== null; settings = { ...defaults, ...sanitize(stored) };
    if (stored && (!Object.hasOwn(stored, 'theme') || ['lightTheme', 'darkTheme', 'separateDark'].some(key => Object.hasOwn(stored, key)))) {
      settings = { ...settings, ...sanitize({ theme: stored.theme ?? stored.lightTheme ?? defaults.theme }) };
      await atomicWrite(path.join(root, 'preferences.json'), JSON.stringify(settings));
    }
    const legacy = await read('themes.json', []);
    themes = Array.isArray(legacy) ? legacy : [];
    // Migrate old embedded themes once without reading or changing their source files.
    for (const theme of themes) {
      if (theme.fileName || typeof theme.css !== 'string') continue;
      const safeName = String(theme.name || theme.id).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '') || 'theme';
      theme.fileName = `${safeName}.css`;
      await fs.writeFile(path.join(folder, theme.fileName), theme.css, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    }
    return refresh();
  }
  async function add(file) {
    const theme = await importTheme(file);
    if (/\.user$/i.test(theme.name) || theme.name.startsWith('.')) throw new Error('请选择主题 CSS；自定义覆盖请放入主题文件夹中的 .user.css 文件。');
    const fileName = `${theme.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '') || 'theme'}.css`;
    const existing = themes.find(item => item.name === theme.name || item.fileName === fileName);
    await atomicWrite(path.join(folder, fileName), theme.css);
    if (!existing) themes.push({ ...theme, fileName });
    const result = await refresh();
    result.imported = themes.find(item => item.fileName === fileName);
    if (!result.imported) throw new Error('主题加载失败，请检查 CSS 和资源文件。');
    result.imported.warnings = [...new Set([...result.imported.warnings, ...theme.warnings])];
    return result;
  }
  async function customCss(value) {
    if (value === undefined) return fs.readFile(path.join(folder, 'base.user.css'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 * 1024) throw new Error('自定义 CSS 不能超过 1 MB');
    const temporary = path.join(folder, '.base.user-check.css');
    try {
      await atomicWrite(temporary, value);
      await importTheme(temporary);
      await atomicWrite(path.join(folder, 'base.user.css'), value);
    } finally { await fs.rm(temporary, { force: true }); }
    return refresh();
  }
  return { initialize, snapshot, saveSettings, refresh, add, customCss, folder };
}
module.exports = { createSettingsStore, defaults, sanitize };
