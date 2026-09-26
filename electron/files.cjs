const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function readDocument(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) throw new Error('仅支持 10 MB 以内的文本文件。');
  const bytes = await fs.readFile(file);
  if (bytes.includes(0)) throw new Error('暂不支持二进制或 UTF-16 文件，请转换为 UTF-8。');
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('文件不是有效的 UTF-8 文本。'); }
}

async function atomicWrite(file, text) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    const existing = await fs.stat(file).catch(() => null);
    await fs.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: existing?.mode ?? 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function listMarkdown(root) {
  const files = [];
  async function walk(folder, depth) {
    if (depth > 8 || files.length >= 500) return;
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.isSymbolicLink()) continue;
      const full = path.join(folder, item.name);
      if (item.isDirectory()) await walk(full, depth + 1);
      else if (item.isFile() && /\.(md|markdown|mdown)$/i.test(item.name)) {
        files.push({ path: full, name: path.relative(root, full) });
      }
      if (files.length >= 500) break;
    }
  }
  await walk(root, 0);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { isWithin, readDocument, atomicWrite, listMarkdown, MAX_DOCUMENT_BYTES };
