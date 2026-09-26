export const tableLimits = { columns: 50, rows: 200 };

export function createMarkdownTable(columns, rows) {
  if (!Number.isInteger(columns) || columns < 1 || columns > tableLimits.columns || !Number.isInteger(rows) || rows < 1 || rows > tableLimits.rows) {
    throw Error(`列数须为 1–${tableLimits.columns} 的整数，行数须为 1–${tableLimits.rows} 的整数。`);
  }
  const row = '| ' + Array(columns).fill('').join(' | ') + ' |';
  const separator = '| ' + Array(columns).fill('---').join(' | ') + ' |';
  return [row, separator, ...Array(rows - 1).fill(row)].join('\n');
}

export function context(text, start) {
  const lines = text.split('\n');
  const starts = []; let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const row = Math.max(0, starts.findLastIndex(at => at <= start));
  let code = null;
  for (let i = 0; i <= row; i++) {
    const match = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!match) continue;
    if (!code) code = { first: i, last: lines.length - 1, fence: match[1] };
    else if (i !== code.first && match[1][0] === code.fence[0] && match[1].length >= code.fence.length && !match[2].trim()) {
      if (i === row) { code.last = i; break; }
      code = null;
    }
  }
  if (code) for (let i = Math.max(row + 1, code.first + 1); i < lines.length; i++) {
    const match = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (match && match[1][0] === code.fence[0] && match[1].length >= code.fence.length) { code.last = i; break; }
  }
  let table = null;
  if (!code) for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (!lines[i].includes('|') || !cells.length || !cells.every(cell => /^:?-{3,}:?$/.test(cell.trim())) || !lines[i - 1].includes('|')) continue;
    let last = i;
    while (last + 1 < lines.length && lines[last + 1].includes('|') && lines[last + 1].trim()) last++;
    if (row >= i - 1 && row <= last) { table = { first: i - 1, last }; break; }
  }
  const line = lines[row] || '';
  return { lines, starts, row, code, table, list: !code && /^\s*(?:[-+*]|\d+[.)])\s/.test(line), task: !code && /^\s*[-+*] \[[ xX]\]/.test(line), heading: !code ? (line.match(/^ {0,3}(#{1,6})\s/)?.[1].length || 0) : 0 };
}

function splitRow(line) {
  const value = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|\s*$/, '');
  const cells = []; let cell = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) { cell += value[i] + value[++i]; continue; }
    if (value[i] === '|') { cells.push(cell.trim()); cell = ''; } else cell += value[i];
  }
  cells.push(cell.trim()); return cells;
}

/** A single replacement keeps native textarea undo intact. Offsets are UTF-16. */
export function formatEdit(command, text, start, end, tabSize = 4, tableSize = { columns: 3, rows: 4 }) {
  const c = context(text, start);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const selected = text.slice(start, end);
  const edit = (from, to, value, a = value.length, b = a) => ({ start: from, end: to, text: value, selectionStart: from + a, selectionEnd: from + b });
  const inline = {
    bold: ['**', '**', '粗体'], italic: ['*', '*', '斜体'], strike: ['~~', '~~', '删除线'],
    underline: ['<u>', '</u>', '下划线'], highlight: ['==', '==', '高亮'], superscript: ['^', '^', '上标'], subscript: ['~', '~', '下标'],
    'inline-code': ['`', '`', '代码'], 'inline-math': ['$', '$', 'x^2'],
    link: ['[', '](https://example.com)', '链接文字'], image: ['![', '](image.png)', '图片描述']
  };
  if (inline[command]) {
    let [before, after, placeholder] = inline[command];
    if (start >= before.length && text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
      return edit(start - before.length, end + after.length, selected, 0, selected.length);
    }
    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const value = selected.slice(before.length, -after.length); return edit(start, end, value, 0, value.length);
    }
    const value = selected || placeholder;
    if (command === 'inline-code' && value.includes('`')) {
      const fence = '`'.repeat(Math.max(...(value.match(/`+/g) || []).map(run => run.length)) + 1);
      before = fence + ' '; after = ' ' + fence;
    }
    return edit(start, end, before + value + after, before.length, before.length + value.length);
  }
  const lineStart = c.starts[c.row];
  const endRow = context(text, end > start && text[end - 1] === '\n' ? end - 1 : end).row;
  const lineEnd = c.starts[endRow] + c.lines[endRow].replace(/\r$/, '').length;
  const transformLines = fn => {
    const value = text.slice(lineStart, lineEnd).split(/\r?\n/).map(fn).join(eol);
    const prefix = value.match(/^[ \t]*(?:>\s*)*(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/)[0];
    return edit(lineStart, lineEnd, value, prefix.length, value.length);
  };
  if (/^h[1-6]$/.test(command) || ['paragraph', 'heading-up', 'heading-down'].includes(command)) {
    if (c.code || c.table) throw Error('请将光标放在普通段落或标题中。');
    return transformLines(line => {
      if (command === 'paragraph') return line.replace(/^[ \t]*(?:>\s*)*/, '').replace(/^(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/, '');
      const prefix = line.match(/^(\s*(?:>\s*)*)/)?.[1] || '';
      const body = line.slice(prefix.length); const level = body.match(/^(#{1,6})\s+/)?.[1].length || 0;
      const target = command === 'paragraph' ? 0 : command === 'heading-up' ? Math.max(1, level - 1) : command === 'heading-down' ? Math.min(6, level + 1) : Number(command[1]);
      return prefix + (target ? '#'.repeat(target) + ' ' : '') + body.replace(/^#{1,6}\s+/, '');
    });
  }
  if (['list', 'ordered-list', 'check', 'quote'].includes(command)) {
    return transformLines((line, i) => {
      const content = line.replace(/^(\s*)(?:(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|>\s?)/, '$1');
      const indent = content.match(/^\s*/)[0];
      const prefix = { list: '- ', 'ordered-list': `${i + 1}. `, check: '- [ ] ', quote: '> ' }[command];
      return indent + prefix + content.slice(indent.length);
    });
  }
  if (command === 'indent' || command === 'outdent') {
    if (!c.list && !c.code) throw Error('请将光标放在列表项或代码中。');
    return transformLines(line => command === 'indent' ? ' '.repeat(tabSize) + line : line.replace(new RegExp(`^(?:\\t| {1,${tabSize}})`), ''));
  }
  if (command.startsWith('task-')) {
    if (!c.task) throw Error('请将光标放在任务列表项中。');
    return transformLines(line => line.replace(/^(\s*[-+*] \[)([ xX])(\])/, (_, a, state, b) => a + (command === 'task-done' ? 'x' : command === 'task-undone' ? ' ' : state === ' ' ? 'x' : ' ') + b));
  }
  if (command === 'insert-before') return edit(lineStart, lineStart, eol + eol, 0);
  if (command === 'insert-after') return edit(lineEnd, lineEnd, eol + eol, 2 * eol.length);
  if (command.startsWith('code-language:') || command === 'code-unfence') {
    if (!c.code) throw Error('请将光标放在围栏代码块中。');
    const { first, last, fence } = c.code;
    if (command === 'code-unfence') {
      const closed = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(c.lines[last]);
      return edit(c.starts[first], c.starts[last] + c.lines[last].length, c.lines.slice(first + 1, closed ? last : last + 1).join('\n'));
    }
    const language = command.slice('code-language:'.length);
    if (!/^[\w+-]*$/.test(language)) throw Error('无效代码语言。');
    const change = edit(c.starts[first], c.starts[first] + c.lines[first].replace(/\r$/, '').length, fence + language);
    const delta = change.text.length - (change.end - change.start);
    change.selectionStart = Math.max(change.start + change.text.length + eol.length, start + delta);
    change.selectionEnd = Math.max(change.selectionStart, end + delta);
    return change;
  }
  if (command.startsWith('table-')) {
    if (!c.table) throw Error('请将光标放在 Markdown 表格中。');
    const { first, last } = c.table;
    const from = c.starts[first], to = c.starts[last] + c.lines[last].replace(/\r$/, '').length;
    if (command === 'table-delete') return edit(from, to, '');
    const rows = c.lines.slice(first, last + 1).map(splitRow);
    const width = rows[0].length;
    rows.forEach(row => { while (row.length < width) row.push(''); });
    const row = c.row - first;
    const prefix = c.lines[c.row].slice(0, Math.max(0, start - c.starts[c.row]));
    const pipes = (prefix.replace(/\\./g, '').match(/\|/g) || []).length;
    const column = Math.min(width - 1, Math.max(0, pipes - (c.lines[c.row].trimStart().startsWith('|') ? 1 : 0)));
    if (command === 'table-row-before' || command === 'table-row-after') rows.splice(Math.max(2, row + (command.endsWith('after') ? 1 : 0)), 0, Array(width).fill(''));
    else if (command === 'table-row-delete') { if (row < 2) throw Error('表头不能单独删除，请删除整张表格。'); rows.splice(row, 1); }
    else if (command.startsWith('table-column-')) {
      if (command === 'table-column-delete' && width === 1) throw Error('至少保留一列；如需移除，请删除表格。');
      rows.forEach((cells, i) => {
        if (command === 'table-column-delete') cells.splice(column, 1);
        else cells.splice(column + (command.endsWith('after') ? 1 : 0), 0, i === 1 ? '---' : '');
      });
    } else if (command.startsWith('table-align-')) rows[1][column] = { left: ':---', center: ':---:', right: '---:' }[command.slice(12)];
    else throw Error('未知表格操作。');
    const value = rows.map(cells => '| ' + cells.join(' | ') + ' |').join(eol);
    return edit(from, to, value, Math.min(value.length, start - from));
  }
  const unique = prefix => { let i = 1; while (text.toLowerCase().includes(`[${prefix}${i}]`)) i++; return prefix + i; };
  let block;
  if (command === 'code') {
    const content = selected || '代码';
    const fence = '`'.repeat(Math.max(3, ...(content.match(/`+/g) || []).map(run => run.length + 1)));
    block = `${fence}\n${content}\n${fence}`;
  } else if (command === 'math') block = `$$\n${selected || 'E = mc^2'}\n$$`;
  else if (command === 'table') block = createMarkdownTable(tableSize.columns, tableSize.rows);
  else if (command === 'line') block = '---';
  else if (command === 'toc') block = '[toc]';
  else if (command.startsWith('alert:')) {
    const kind = command.slice(6);
    if (!['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'].includes(kind)) throw Error('未知警告框类型。');
    block = `> [!${kind}]\n` + (selected || '提示内容').split(/\r?\n/).map(line => '> ' + line).join('\n');
  } else if (command === 'footnote' || command === 'link-reference') {
    const id = unique(command === 'footnote' ? '^note' : 'ref');
    const reference = command === 'footnote' ? `${selected}[${id}]` : `[${selected || '链接文字'}][${id}]`;
    const definition = `[${id}]: ${command === 'footnote' ? '脚注内容' : 'https://example.com'}`;
    // Include the untouched suffix in the same undoable edit; definitions belong at the end.
    return edit(start, text.length, reference + text.slice(end) + eol + eol + definition + eol, reference.length);
  } else if (command === 'yaml') {
    if (/^\uFEFF?---\r?\n/.test(text)) throw Error('文档开头已有 YAML Front Matter。');
    const at = text.startsWith('\uFEFF') ? 1 : 0;
    return edit(at, at, `---${eol}title: 标题${eol}tags: []${eol}---${eol}${eol}`, 3 + eol.length + 7);
  } else throw Error('未知格式操作。');
  block = block.replace(/\r?\n/g, eol);
  const before = start > 0 ? eol + eol : '';
  return edit(start, end, before + block + eol + eol, before.length + block.length + 2 * eol.length);
}
