const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { importTheme } = require('../electron/themes.cjs');
const { isWithin } = require('../electron/files.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-theme-'));
  t.after(async () => { assert.ok(isWithin(await fs.realpath(os.tmpdir()), await fs.realpath(root))); await fs.rm(root, { recursive: true, force: true }); });
  return root;
}
test('theme compiles nested imports, embeds assets and scopes document styles', async (t) => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'assets/font.woff2'), 'test-font');
  await fs.writeFile(path.join(root, 'assets/type.css'), '@font-face { font-family: Example; src: url("font.woff2") }\n#write { font-family: Example; }');
  await fs.writeFile(path.join(root, 'custom.css'), '@import "assets/type.css"; :root { --bg-color: ivory; } html body #write h1 { color: red; } .body-copy { color: blue; }');
  const theme = await importTheme(path.join(root, 'custom.css'));
  assert.ok(theme.css.includes('data:font/woff2;base64,'));
  assert.ok(theme.css.includes('.editor-surface #write h1'));
  assert.ok(theme.css.includes('.editor-surface .body-copy'));
  assert.ok(!theme.css.includes('@import'));
  assert.deepEqual(theme.warnings, []);
});
test('remote resources are removed with explicit warnings', async (t) => {
  const root = await fixture(t); const file = path.join(root, 'remote.css');
  await fs.writeFile(file, '@import url("https://example.com/font.css"); p { background: url(https://example.com/a.png); }');
  const theme = await importTheme(file);
  assert.equal(theme.warnings.length, 2);
  assert.ok(!theme.css.includes('https://'));
});

test('Typora inline and task selectors support native editor markup', async (t) => {
  const root = await fixture(t); const file = path.join(root, 'inline.css');
  await fs.writeFile(file, '#write a:hover {color:green} #write del {color:gray} #write .task-list-item > input:checked {background:green} #write .task-list-done > p {text-decoration:line-through}');
  const {css} = await importTheme(file);
  assert.ok(css.includes(':is(a, :where(.vditor-ir__link, .itypora-reference-link)):hover'));
  assert.ok(css.includes(':is(del, s)'));
  assert.ok(css.includes(':is(.vditor-task, .vditor-task > :where(p)) > input:checked'));
  assert.ok(css.includes(':has(> input:checked, > p > input:checked)'));
  assert.ok(css.includes(':is(p, :where(.itypora-task-content))'));
});
test('cycle and path traversal fail without importing outside data', async (t) => {
  const root = await fixture(t); const file = path.join(root, 'cycle.css');
  await fs.writeFile(file, '@import "cycle.css";');
  await assert.rejects(importTheme(file), /循环/);
  await fs.mkdir(path.join(root, 'child'));
  await fs.writeFile(path.join(root, 'outside.css'), 'body { color:red }');
  await fs.writeFile(path.join(root, 'child/escape.css'), '@import "../outside.css";');
  await assert.rejects(importTheme(path.join(root, 'child/escape.css')), /不能超出/);
});
