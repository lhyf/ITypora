const test = require('node:test');
const assert = require('node:assert/strict');
const { formatEdit, context, createMarkdownTable } = require('../src/formatting.mjs');
const apply = (command, text, start = 0, end = start) => { const edit = formatEdit(command, text, start, end); return text.slice(0, edit.start) + edit.text + text.slice(edit.end); };

test('table dimensions count the header as a row and validate integer limits', () => {
  const table = createMarkdownTable(3, 4).split('\n');
  assert.equal(table.length, 5); // Four visible rows plus the Markdown delimiter.
  assert.equal(table[0], '|  |  |  |');
  assert.equal(table[1], '| --- | --- | --- |');
  assert.equal(createMarkdownTable(1, 1), '|  |\n| --- |');
  for (const [columns, rows] of [[0, 4], [3, 0], [-1, 4], [2.5, 4], [3, NaN], [Infinity, 4], [51, 4], [3, 201]]) {
    assert.throws(() => createMarkdownTable(columns, rows), /整数/);
  }
  const change = formatEdit('table', 'Before\r\n\r\nAfter', 8, 8, 4, { columns: 2, rows: 3 });
  assert.ok(change.text.includes('| --- | --- |\r\n')); assert.equal(change.text.replace(/\r\n/g, '').includes('\n'), false);
});

test('heading replacement, level boundaries and CRLF preserve surrounding content', () => {
  assert.equal(apply('h2', '# First\r\n\r\nTail', 3), '## First\r\n\r\nTail');
  assert.equal(apply('paragraph', '## First\nTail', 4), 'First\nTail');
  assert.equal(apply('heading-up', '# First', 3), '# First');
  assert.equal(apply('heading-down', '###### First', 8), '###### First');
  assert.equal(apply('h2', 'One\nTwo\nTail', 0, 8), '## One\n## Two\nTail');
});

test('inline selection wrappers, toggle and code delimiters preserve content', () => {
  assert.equal(apply('highlight', 'Before text after', 7, 11), 'Before ==text== after');
  assert.equal(apply('highlight', '==text==', 0, 8), 'text');
  assert.equal(apply('highlight', '==text==', 2, 6), 'text');
  assert.equal(apply('underline', 'text', 0, 4), '<u>text</u>');
  assert.equal(apply('inline-code', 'a`b', 0, 3), '`` a`b ``');
});

test('list and task operations act on selected lines without changing adjacent text', () => {
  assert.equal(apply('check', 'one\ntwo\ntail', 0, 7), '- [ ] one\n- [ ] two\ntail');
  assert.equal(apply('task-done', '- [ ] one\n- [x] two', 6), '- [x] one\n- [x] two');
  assert.equal(apply('task-toggle', '- [X] one', 6), '- [ ] one');
  assert.equal(apply('indent', '- one\n- two', 8), '- one\n    - two');
  assert.equal(apply('outdent', '    - one', 7), '- one');
  assert.throws(() => apply('task-done', 'plain'), /任务/);
});

test('fenced code context ignores shorter delimiters and code conversion retains body', () => {
  const code = 'Before\n\n````js\n```\nbody\n````\n\nAfter';
  assert.equal(context(code, code.indexOf('body')).code.first, 2);
  assert.match(apply('code-language:python', code, code.indexOf('body')), /````python\n```\nbody/);
  assert.equal(apply('code-unfence', code, code.indexOf('body')), 'Before\n\n```\nbody\n\nAfter');
  assert.equal(context('```\n| A |\n| --- |\n```', 10).table, null);
});

test('table column operations preserve escaped pipes and affect the current column', () => {
  const table = 'Before\n\n| A | B |\n| --- | --- |\n| a\\|b | second |\n\nAfter';
  const at = table.indexOf('second');
  assert.match(apply('table-align-right', table, at), /\| --- \| ---: \|/);
  assert.match(apply('table-column-before', table, at), /\| A \|  \| B \|/);
  assert.match(apply('table-column-delete', table, at), /\| a\\\|b \|/);
  assert.match(apply('table-row-after', table, at), /\| a\\\|b \| second \|\n\|  \|  \|/);
  assert.equal(apply('table-delete', table, at), 'Before\n\n\n\nAfter');
  assert.throws(() => apply('table-row-delete', table, table.indexOf('A |')), /表头/);
});

test('footnotes, references and YAML use unique IDs and safe document positions', () => {
  const note = '正文[^note1]\n\n[^note1]: 已有脚注';
  const next = apply('footnote', note, 2);
  assert.match(next, /正文\[\^note2\]\[\^note1\]/);
  assert.match(next, /\[\^note2\]: 脚注内容/);
  assert.match(apply('link-reference', 'name\n\n[ref1]: old', 0, 4), /^\[name\]\[ref2\]/);
  assert.match(apply('footnote', 'Text[^NOTE1]', 4), /Text\[\^note2\]/);
  assert.match(apply('yaml', '\uFEFF正文'), /^\uFEFF---\ntitle:/);
  assert.throws(() => apply('yaml', '---\ntitle: existing\n---\n'), /已有/);
});
