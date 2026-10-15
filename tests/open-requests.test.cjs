const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { commandLineFile, documentPath } = require('../electron/open-requests.cjs');

test('OS command lines support packaged/development launches, relative paths, Unicode and file URLs', () => {
  const cwd = path.resolve('中文 目录');
  const file = path.join(cwd, '默认编辑器 #% 文档.MD');
  assert.equal(commandLineFile(['ITypora.exe', file], true, cwd), file);
  assert.equal(commandLineFile(['electron', 'app', '--no-sandbox', path.basename(file)], false, cwd), file);
  assert.equal(commandLineFile(['ITypora.exe', pathToFileURL(file).href], true, cwd), file);
  assert.equal(commandLineFile(['ITypora.exe', '--user-data-dir', 'profile.md', '--log-file=log.md', file], true, cwd), file);
  assert.equal(commandLineFile(['electron', 'project.md'], false, cwd), null);
  assert.equal(commandLineFile(['ITypora.exe', '--inspect=9229', 'image.png', 'https://example.com/'], true, cwd), null);
});

test('native open requests accept only absolute document paths', () => {
  for (const name of ['a.md', '中文.markdown', 'b.mdown', 'text.txt']) assert.ok(documentPath(path.resolve(name)));
  for (const value of [null, {}, 'relative.md', path.resolve('image.png')]) assert.ok(!documentPath(value));
});
