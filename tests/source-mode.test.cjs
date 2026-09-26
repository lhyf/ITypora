const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

// Source mode highlighting: the token classes Typora's source mode gives the
// same Markdown (checked against Typora 1.13 with its markdown mode).
const root = path.join(__dirname, '../node_modules/codemirror/');
const runmode = path.join(root, 'addon/runmode/runmode.node.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (/lib\/codemirror(\.js)?$/.test(request)) return runmode;
  return resolve.call(this, request, parent, ...rest);
};
const CodeMirror = require(runmode);
for (const file of ['mode/meta.js', 'mode/xml/xml.js', 'mode/stex/stex.js', 'mode/javascript/javascript.js', 'addon/mode/overlay.js']) require(path.join(root, file));

let ready;
const load = () => ready ||= Promise.all([import('../src/vendor/codemirror-markdown.mjs'), import('../src/source-mode.mjs')]).then(([markdown, source]) => {
  markdown.defineMarkdownMode(CodeMirror); source.defineSourceMode(CodeMirror);
});
// Each line's tokens as `[classes]text`, and its line classes.
async function tokens(text) {
  await load();
  const lines = text.split('\n').map(() => ({ tokens: [], line: new Set() }));
  let row = 0;
  CodeMirror.runMode(text, 'itypora-markdown', (token, style) => {
    if (token === '\n') { row++; return; }
    // The editor ignores a token that consumed nothing; runMode reports it.
    if (!token) return;
    const names = (style || '').split(' ').filter(Boolean);
    names.filter(name => name.startsWith('line-')).forEach(name => lines[row].line.add(name.slice(5)));
    const classes = names.filter(name => !name.startsWith('line-')).sort().join(' ');
    const last = lines[row].tokens.at(-1);
    if (last && last.classes === classes) last.text += token; else lines[row].tokens.push({ classes, text: token });
  });
  return lines.map(({ tokens, line }) => ({ tokens: tokens.map(({ classes, text }) => classes ? `[${classes}]${text}` : text).join(''), line: [...line].sort().join(' ') }));
}

test('headings, emphasis and front matter carry Typora classes without formatting classes', async () => {
  const lines = await tokens('---\ntitle: 示例\n---\n\n# 标题\n\n**使用方法：**先观察，~~删除~~\n\nSetext\n===');
  assert.deepEqual(lines[0], { tokens: '[hr]---', line: '' });
  assert.deepEqual(lines[1], { tokens: 'title: 示例', line: 'cm-yaml' });
  assert.deepEqual(lines[4], { tokens: '[header header1]# 标题', line: 'cm-header cm-header1' });
  // CJK text right after a closing `**` still closes the strong run.
  assert.equal(lines[6].tokens, '[strong]**使用方法：**先观察，[del]~~删除~~');
  assert.equal(lines[8].tokens, 'Setext');
  assert.equal(lines[9].tokens, '[header header1]===');
});

test('block markers, tasks, quotes and links', async () => {
  const lines = await tokens('- [ ] 待办\n- [x] 完成\n\n> 引用\n> > 嵌套\n\n[链接](https://example.com) 与 https://example.org/a 以及 [!NOTE]，脚注[^1]\n\n![图](a.png)');
  assert.equal(lines[0].tokens, '[block-start variable-2]- [block-start formatting formatting-task meta][ ] [variable-2]待办');
  assert.equal(lines[1].tokens, '[block-start variable-2]- [block-start formatting formatting-task property][x] [variable-2]完成');
  assert.deepEqual(lines[3], { tokens: '[atom block-start]> [atom]引用', line: 'cm-atom' });
  assert.equal(lines[4].tokens, '[atom block-start]> [block-start number]> [number]嵌套');
  assert.equal(lines[6].tokens, '[link][链接][string](' + '[link]https://example.com[string]) 与 [link]https://example.org/a 以及 [!NOTE]，脚注[link][^1]');
  assert.equal(lines[8].tokens, '[tag]![图][string](a.png)');
});

test('fenced code, math and tables', async () => {
  const lines = await tokens('```js\nconst a = 1;\n```\n\n$$\n\\frac{1}{2}\n$$\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n文字');
  assert.deepEqual(lines[0], { tokens: '[block-start comment]```js', line: '' });
  assert.equal(lines[1].line, 'cm-s-inner');
  assert.match(lines[1].tokens, /^\[keyword overlay\]const/);
  assert.deepEqual(lines[2], { tokens: '[comment]```', line: '' });
  assert.deepEqual(lines[4], { tokens: '[block-start comment]$$', line: '' });
  assert.equal(lines[5].line, 'cm-s-inner');
  assert.deepEqual(lines[6], { tokens: '[comment]$$', line: '' });
  for (const row of [8, 9, 10]) assert.equal(lines[row].line, 'cm-table-row');
  assert.equal(lines[12].line, '');
});
