// Vditor saves by serializing the whole document through Lute, which reformats
// tables, escapes, link destinations and block spacing everywhere. Keep the
// original Markdown for every block the user did not edit: the baseline is Lute's
// serialization of the document as loaded, and only blocks that differ between it
// and the current serialization are taken from the editor.

const maxDistance = 3000;

// Myers diff over lines. Returns ascending [aIndex, bIndex] pairs of equal lines,
// or null when the inputs differ too much to be worth aligning.
function matches(a, b) {
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start, offset = n + m + 1;
  const v = new Int32Array(2 * offset + 1), trace = [];
  let done = n === 0 && m === 0;
  for (let d = 0; !done; d++) {
    if (d > maxDistance) return null;
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { done = true; break; }
    }
  }
  const middle = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const previous = trace[d], at = k => previous[k + d], k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; middle.push([start + x, start + y]); }
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) { x--; y--; middle.push([start + x, start + y]); }
  const pairs = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  pairs.push(...middle.reverse());
  for (let i = 0; i < a.length - endA; i++) pairs.push([endA + i, endB + i]);
  return pairs;
}

// Alignment of Lute's output with the source. Lines that occur once on both sides
// anchor it (patience diff), so repeated lines such as blank lines never pair up
// across reformatted blocks. A stretch without such lines pairs its blank-line
// separated blocks in order when both sides have the same number of them.
function align(a, b) {
  const pairs = [];
  const walk = (a0, a1, b0, b1) => {
    while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) pairs.push([a0++, b0++]);
    const tail = [];
    while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) tail.push([--a1, --b1]);
    if (a0 < a1 && b0 < b1) {
      const seen = new Map();
      for (let k = a0; k < a1; k++) { const s = seen.get(a[k]); seen.set(a[k], s ? { a: -1, b: -1 } : { a: k, b: -2 }); }
      for (let k = b0; k < b1; k++) { const s = seen.get(b[k]); if (s && s.a >= 0) s.b = s.b === -2 ? k : -1; }
      const unique = [...seen.values()].filter(s => s.a >= 0 && s.b >= 0).sort((x, y) => x.a - y.a);
      if (unique.length) {
        // Longest run of unique lines in the same order on both sides.
        const tops = [], back = [];
        unique.forEach((s, k) => {
          let lo = 0, hi = tops.length;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (unique[tops[mid]].b < s.b) lo = mid + 1; else hi = mid; }
          back[k] = lo ? tops[lo - 1] : -1; tops[lo] = k;
        });
        const chain = [];
        for (let k = tops[tops.length - 1]; k >= 0; k = back[k]) chain.unshift(unique[k]);
        let x = a0, y = b0;
        for (const s of chain) { walk(x, s.a, y, s.b); pairs.push([s.a, s.b]); x = s.a + 1; y = s.b + 1; }
        walk(x, a1, y, b1);
      } else {
        const runs = (lines, from, to) => {
          const result = [];
          for (let k = from; k < to; k++) if (lines[k].trim() && (k === from || !lines[k - 1].trim())) result.push(k);
          return result;
        };
        const ra = runs(a, a0, a1), rb = runs(b, b0, b1);
        if (ra.length > 1 && ra.length === rb.length) {
          ra.forEach((start, k) => walk(start, k + 1 < ra.length ? ra[k + 1] : a1, rb[k], k + 1 < rb.length ? rb[k + 1] : b1));
        }
      }
    }
    pairs.push(...tail.reverse());
  };
  walk(0, a.length, 0, b.length);
  return pairs;
}

// Top-level blocks of Lute's output: lines separated by blank lines, where fenced
// code, math, front matter and HTML comments keep their inner blank lines, and
// loose list items and indented continuations stay with their block. A top-level
// fence also ends its block, since Lute omits the blank line after it. Returns the
// block index of every line, -1 for blank lines between blocks.
export function blocks(lines) {
  const id = new Int32Array(lines.length).fill(-1);
  let block = -1, list = false, fence = null, top = false, ended = false, pending = [];
  lines.forEach((line, k) => {
    if (fence) { id[k] = block; if (fence.test(line)) { fence = null; ended = top; } return; }
    if (!line.trim()) { if (block >= 0) pending.push(k); return; }
    const marker = /^([-+*]|\d{1,9}[.)])(\s|$)/.test(line);
    const fresh = block < 0 || ended || !lines[k - 1].trim() && !/^\s/.test(line) && !(marker && list);
    if (fresh) { block++; list = marker; pending = []; }
    for (const blank of pending) id[blank] = block;
    pending = []; id[k] = block; ended = false; top = !/^\s/.test(line);
    fence = closing(line, k);
  });
  return id;
}

// The line that ends the fenced code, math, front matter or HTML comment that
// `line` (the k-th) opens, or null.
function closing(line, k) {
  const open = line.match(/^\s*(`{3,}|~{3,})/);
  if (open) return new RegExp(`^\\s*${open[1][0] === '`' ? '`' : '~'}{${open[1].length},}\\s*$`);
  if (/^\s*\$\$\s*$/.test(line)) return /^\s*\$\$\s*$/;
  if (k === 0 && line === '---') return /^(---|\.\.\.)$/;
  if (line.includes('<!--') && !line.slice(line.lastIndexOf('<!--')).includes('-->')) return /-->/;
  return null;
}

// Lute writes blank lines inside footnotes and list items as indentation only.
// Write them empty, except inside fences where the spaces are content.
function tidy(lines) {
  let fence = null;
  return lines.map((line, k) => {
    if (fence) { if (fence.test(line)) fence = null; return line; }
    fence = closing(line, k);
    return line.trim() ? line : '';
  });
}

export function createPreserver(source) {
  const bom = source.startsWith('\ufeff') ? '\ufeff' : '';
  const parts = source.slice(bom.length).split('\n');
  const lines = parts.map(line => line.replace(/\r$/, ''));
  // The line break after each source line, so untouched lines keep CRLF or LF.
  const breaks = parts.map((line, i) => i === parts.length - 1 ? '' : line.endsWith('\r') ? '\r\n' : '\n');
  const eol = breaks.filter(end => end === '\r\n').length * 2 > breaks.length - 1 ? '\r\n' : '\n';
  let base = null, sourceOf = null, block = null, first = [], last = [];
  return {
    // Lute's serialization of the untouched document.
    baseline(before) {
      base = tidy(before.split('\n'));
      sourceOf = new Map(align(base, lines));
      block = blocks(base); first = []; last = [];
      block.forEach((b, k) => { if (b >= 0) { if (first[b] === undefined) first[b] = k; last[b] = k + 1; } });
    },
    merge(after) {
      if (!base || !sourceOf) return after;
      const next = tidy(after.split('\n')), n = base.length;
      const pairs = matches(base, next);
      if (!pairs) return after;
      const nextOf = new Map(pairs);
      // Anchors are lines that both Lute and the edit left unchanged.
      const anchor = k => sourceOf.has(k) && nextOf.has(k);
      // Grow an edit to whole blocks bounded by anchors. An insertion between
      // blocks stays a single point.
      const grow = (from, to) => {
        for (let changed = true; changed;) {
          changed = false;
          if (from < to) {
            if (block[from] >= 0 && first[block[from]] < from) { from = first[block[from]]; changed = true; }
            if (block[to - 1] >= 0 && last[block[to - 1]] > to) { to = last[block[to - 1]]; changed = true; }
          } else if (from > 0 && from < n && block[from] >= 0 && block[from - 1] === block[from]) {
            const inside = block[from];
            from = first[inside]; to = last[inside]; changed = true;
          }
          const point = from === to && (from === 0 || anchor(from - 1) || from === n || anchor(from));
          if (!point && from > 0 && !anchor(from - 1)) { from--; changed = true; }
          if (!point && to < n && !anchor(to)) { to++; changed = true; }
        }
        return [from, to];
      };
      // Each span remembers its first and last edit, so the unchanged lines at its
      // edges can be located in the editor text.
      const spans = [];
      let i = 0, j = 0;
      for (const [x, y] of [...pairs, [n, next.length]]) {
        if (x > i || y > j) {
          let [from, to] = grow(i, x), head = { i, j };
          while (spans.length && from <= spans[spans.length - 1].to) {
            const span = spans.pop();
            [from, to] = grow(Math.min(span.from, from), Math.max(span.to, to));
            head = span.head;
          }
          spans.push({ from, to, head, tail: { x, y } });
        }
        i = x + 1; j = y + 1;
      }
      const output = [];
      const keep = (from, to) => { for (let k = from; k < to; k++) output.push([lines[k], breaks[k] || eol]); };
      let cursor = 0;
      for (const { from, to, head, tail } of spans) {
        let start, stop;
        if (from === to) start = stop = from === 0 ? 0 : anchor(from - 1) ? sourceOf.get(from - 1) + 1 : from === n ? lines.length : sourceOf.get(from);
        else { start = from === 0 ? 0 : sourceOf.get(from - 1) + 1; stop = to === n ? lines.length : sourceOf.get(to); }
        // Blank lines between an edited block and its unchanged neighbours keep the
        // source's spacing: the source's own are kept and Lute's are dropped.
        let low = head.j - (head.i - from), high = tail.y + (to - tail.x), inner = start, outer = stop;
        if (from < to && from < head.i && base[from].trim()) while (inner < outer && !lines[inner].trim()) inner++;
        if (from < to && to > tail.x && base[to - 1].trim()) while (outer > inner && !lines[outer - 1].trim()) outer--;
        keep(cursor, inner);
        const blank = k => !next[k].trim();
        if (!output.length || !output[output.length - 1][0].trim()) while (low < Math.min(head.j, high) && blank(low)) low++;
        if (outer < stop || stop >= lines.length || !lines[stop].trim()) while (high > Math.max(tail.y, low) && blank(high - 1)) high--;
        for (let k = low; k < high; k++) output.push([next[k], eol]);
        keep(outer, stop);
        cursor = Math.max(cursor, stop);
      }
      keep(cursor, lines.length);
      return bom + output.map(([line, end], k) => k === output.length - 1 ? line : line + end).join('');
    }
  };
}
