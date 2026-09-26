const test = require('node:test');
const assert = require('node:assert/strict');
const { blockStarts, blockAt, words, count, nth } = require('../src/position.mjs');

const lines = [
  '---', 'title: 示例', '---', '', '# 标题 **一**', '', '第一段，[链接](https://example.com)。', '第一段第二行。', '',
  '***', '', '- 列表一', '- 列表二', '', '```js', 'const answer = 42;', '```', '重复', '', '重复', '', '[toc]', ''
];

test('words keep letters and digits only', () => {
  assert.equal(words('**粗体** `code` \\* [a](b) 1.5'), '粗体codeab15');
});

test('blocks are found by their first words, in order, with syntax and rendering differences ignored', () => {
  // Heads as the rendered editor shows them: no syntax, link targets dropped.
  const heads = ['title示例', '标题一', '第一段链接第一段第二行', '', '列表一列表二', 'constanswer42', '重复', '重复', 'toc'];
  assert.deepEqual(blockStarts(heads, lines), [1, 4, 6, 9, 11, 15, 17, 19, 21]);
});

test('a block missing from the source starts at the next paragraph', () => {
  assert.deepEqual(blockStarts(['标题一', '不存在的文字', '列表一'], lines), [4, 6, 11]);
});

test('blockAt finds the block that holds a line', () => {
  const starts = [1, 4, 6, 9];
  assert.equal(blockAt(starts, 0), 0);
  assert.equal(blockAt(starts, 5), 1);
  assert.equal(blockAt(starts, 6), 2);
  assert.equal(blockAt(starts, 30), 3);
});

test('nth picks the same occurrence, or the last one', () => {
  assert.equal(count('abab', 'ab'), 2);
  assert.equal(nth('abab', 'ab', 2), 2);
  assert.equal(nth('abab', 'ab', 5), 2);
  assert.equal(nth('abab', 'c', 1), -1);
});
