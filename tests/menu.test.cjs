const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { formatEdit } = require('../src/formatting.mjs');
const sandbox = { module: { exports: {} }, process: { platform: 'win32' }, require: () => ({ Menu: { buildFromTemplate: template => template } }) };
vm.runInNewContext(fs.readFileSync(require.resolve('../electron/menu.cjs'), 'utf8'), sandbox);
const createMenu = sandbox.module.exports.createMenu;
const flatten = items => items.flatMap(item => [item, ...(item.submenu ? flatten(item.submenu) : [])]);

test('menu commands and shortcuts are unique, context-sensitive actions are disabled outside their targets', () => {
  const items = flatten(createMenu(() => {}, [], [], { editing: true }));
  for (const key of ['id', 'accelerator']) { const values = items.map(item => item[key]).filter(Boolean); assert.equal(new Set(values).size, values.length, key); }
  for (const id of ['table-row-after', 'code-unfence', 'task-toggle', 'indent']) assert.equal(items.find(item => item.id === `format:${id}`).enabled, false);
  const preferences = flatten(createMenu(() => {}, [], [], { editing: false, inTable: true }));
  assert.equal(preferences.find(item => item.id === 'format:table-row-after').enabled, false);
});

test('every visible paragraph and inline format command has a source-mode implementation', () => {
  const commands = flatten(createMenu(() => {}, [], [], { editing: true, inTable: true, inCode: true, inTask: true, inList: true }))
    .filter(item => item.id?.startsWith('format:')).map(item => item.id.slice(7));
  for (const command of commands) {
    if (['undo', 'redo'].includes(command)) continue;
    let text = 'Text', start = 0, end = 4;
    if (command.startsWith('table-')) { text = '| A | B |\n| --- | --- |\n| first | second |'; start = end = text.indexOf('second'); }
    else if (command.startsWith('code-')) { text = '```js\nbody\n```'; start = end = text.indexOf('body'); }
    else if (command.startsWith('task-') || ['indent', 'outdent'].includes(command)) { text = '- [ ] task'; start = end = 6; }
    assert.doesNotThrow(() => formatEdit(command, text, start, end), command);
  }
  assert.ok(commands.length >= 50);
});
