const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreserver, blocks } = require('../src/preserve.mjs');

// Lute pads tables, drops the escape in code spans, rewrites task markers and rules.
const source = [
  '# Title', '', 'First paragraph.', '', '| a | b |', '| --- | --- |', '| `x \\| y` | 2 |', '',
  '- [x] done', '- [ ] open', '', '***', '', '```js', 'one();', '', 'two();', '```', '', 'Last paragraph.', ''
].join('\n');
const lute = [
  '# Title', '', 'First paragraph.', '', '| a       | b   |', '| ------- | --- |', '| `x | y` | 2   |', '',
  '- [X]  done', '- [ ]  open', '', '---', '', '```js', 'one();', '', 'two();', '```', '', 'Last paragraph.', ''
].join('\n');
const merged = (text, after) => { const keeper = createPreserver(text); keeper.baseline(lute); return keeper.merge(after); };

test('untouched and reverted documents keep the original bytes', () => {
  assert.equal(merged(source, lute), source);
  const keeper = createPreserver(source); keeper.baseline(lute);
  keeper.merge(lute.replace('- [ ]  open', '- [ ]  opened'));
  assert.equal(keeper.merge(lute), source);
});

test('an edit replaces only the edited block', () => {
  const edit = (from, to) => assert.equal(merged(source, lute.replace(from, to)), source.replace(from, to));
  edit('Last paragraph.', 'Last line.');
  edit('First paragraph.', 'First paragraph.\n\nNew paragraph.');
  edit('First paragraph.', 'First paragraph.\nSecond line.');
  edit('\nLast paragraph.\n', '\n');
  edit('# Title\n\n', '');
  assert.equal(merged(source, lute + 'Appended.\n'), source + 'Appended.\n');
});

test('an edit inside a reformatted block takes that whole block from the editor', () => {
  const table = merged(source, lute.replace('| 2   |', '| 3   |'));
  assert.equal(table, source.replace(/\| a \| b \|[^]*?\| 2 \|/, '| a       | b   |\n| ------- | --- |\n| `x | y` | 3   |'));
  const list = merged(source, lute.replace('open', 'opened'));
  assert.equal(list, source.replace('- [x] done\n- [ ] open', '- [X]  done\n- [ ]  opened'));
  const code = merged(source, lute.replace('two();', 'three();'));
  assert.equal(code, source.replace('two();', 'three();'));
});

test('CRLF, mixed line breaks and a byte order mark survive edits', () => {
  const crlf = '\ufeff' + source.replace(/\n/g, '\r\n');
  assert.equal(merged(crlf, lute), crlf);
  assert.equal(merged(crlf, lute.replace('First paragraph.', 'One\n\nTwo')), crlf.replace('First paragraph.', 'One\r\n\r\nTwo'));
  const mixed = source.replace('# Title\n', '# Title\r\n');
  assert.equal(merged(mixed, lute.replace('Last', 'Final')), mixed.replace('Last', 'Final'));
});

test('without a usable baseline the editor text is returned unchanged', () => {
  assert.equal(createPreserver(source).merge(lute), lute);
});

test('block boundaries keep fences, loose lists and continuations together', () => {
  const lines = ['Para', '', '- a', '', '- b', '', '  more', '', '```', 'x', '', 'y', '```', '', '[^1]: note', '', '    second', '', 'End'];
  assert.deepEqual([...blocks(lines)], [0, -1, 1, 1, 1, 1, 1, -1, 2, 2, 2, 2, 2, -1, 3, 3, 3, -1, 4]);
  assert.deepEqual([...blocks(['---', 'a: 1', '', '---', '', '$$', 'x', '', '$$', '<!-- a', '', 'b -->'])], [0, 0, 0, 0, -1, 1, 1, 1, 1, 2, 2, 2]);
  // Lute writes no blank line after a closing fence.
  assert.deepEqual([...blocks(['```', 'code', '```', 'Text', '  - item', '   ```', '   x', '   ```', '   more'])], [0, 0, 0, 1, 1, 1, 1, 1, 1]);
});
