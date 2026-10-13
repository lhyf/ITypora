import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { importTheme } = require('../electron/themes.cjs');
const postcss = require('postcss');
const source = process.argv[2];
if (!source) throw new Error('用法：npm run themes:bundle -- "主题目录"');
const sourceFolder = await fs.realpath(source);
const destination = fileURLToPath(new URL('../resources/themes/', import.meta.url));
const entries = await fs.readdir(sourceFolder, { withFileTypes: true });
const files = entries.filter(entry => entry.isFile() && /\.css$/i.test(entry.name) && !/\.user\.css$/i.test(entry.name) && !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
if (!files.length) throw new Error('主题目录没有 CSS 主题。');
const compiled = [];
for (const entry of files) {
  if (!/^[\w.-]+\.css$/.test(entry.name)) throw new Error(`主题文件名仅支持字母、数字、下划线和连字符：${entry.name}`);
  const theme = await importTheme(path.join(sourceFolder, entry.name));
  if (theme.warnings.length) throw new Error(`${entry.name}：${theme.warnings.join('；')}`);
  const css = postcss.parse(theme.css);
  // Typora's export-only CDN directives are unnecessary with embedded fonts.
  css.walkAtRules('include-when-export', rule => rule.remove());
  compiled.push({ id: `builtin:${entry.name.slice(0, -4)}`, fileName: entry.name, css: css.toString() });
}
// Compile every theme before replacing the current manifest.
await fs.mkdir(destination, { recursive: true });
for (const theme of compiled) await fs.writeFile(path.join(destination, theme.fileName), theme.css);
async function copyNotices(folder, relative = '') {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name === 'old-themes') continue;
    const next = path.join(relative, entry.name), file = path.join(folder, entry.name);
    if (entry.isDirectory()) await copyNotices(file, next);
    else if (/^(?:license|copying|ofl)(?:[.-]|$)/i.test(entry.name)) {
      const target = path.join(destination, 'licenses', next);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(file, target);
    }
  }
}
await copyNotices(sourceFolder);
await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ themes: compiled.map(({ id, fileName }) => ({ id, fileName })) }, null, 2) + '\n');
console.log(`已打包 ${compiled.length} 个离线主题：${compiled.map(theme => theme.fileName).join('、')}`);
