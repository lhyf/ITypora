// Lute has no source positions, so switching between the rendered editor and
// source mode locates each top-level block in the Markdown by its words: the
// letters and digits it starts with, which Markdown syntax, escapes and Lute's
// normalization leave unchanged.

const keyLength = 16;

export const words = text => text.replace(/[^\p{L}\p{N}]/gu, '');

// First source line of each block, given the words each block starts with.
// Keys that occur once in the source anchor the blocks (the longest run of them
// in order); the blocks between anchors are searched for in order between them,
// and a block without a match starts at the next paragraph after the previous one.
export function blockStarts(keys, lines) {
  let text = '';
  const offsets = lines.map(line => { const at = text.length; text += words(line); return at; });
  offsets.push(text.length);
  // The line holding the character at `position` of `text`.
  const lineAt = position => {
    let low = 0, high = lines.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (offsets[mid] <= position) low = mid; else high = mid - 1; }
    return low;
  };
  const key = i => keys[i].slice(0, keyLength);
  const unique = [];
  keys.forEach((_, i) => {
    if (key(i).length < 4) return;
    const first = text.indexOf(key(i));
    if (first >= 0 && text.indexOf(key(i), first + 1) < 0) unique.push({ i, line: lineAt(first) });
  });
  const tops = [], back = [];
  unique.forEach((anchor, k) => {
    let low = 0, high = tops.length;
    while (low < high) { const mid = (low + high) >> 1; if (unique[tops[mid]].line < anchor.line) low = mid + 1; else high = mid; }
    back[k] = low ? tops[low - 1] : -1; tops[low] = k;
  });
  const starts = new Array(keys.length).fill(-1);
  for (let k = tops.length ? tops[tops.length - 1] : -1; k >= 0; k = back[k]) starts[unique[k].i] = unique[k].line;
  const found = starts.slice();
  // The first anchored or found line after block i, or the end.
  const limit = i => { for (let j = i + 1; j < keys.length; j++) if (found[j] >= 0) return found[j]; return lines.length; };
  let from = 0;
  keys.forEach((_, i) => {
    if (found[i] < 0 && key(i)) {
      const at = text.indexOf(key(i), offsets[from]);
      if (at >= 0 && lineAt(at) < limit(i)) found[i] = lineAt(at);
    }
    if (found[i] >= 0) from = found[i] + 1;
  });
  keys.forEach((_, i) => {
    if (found[i] >= 0) { starts[i] = found[i]; return; }
    const previous = i ? starts[i - 1] : -1, end = limit(i);
    let line = previous + 1;
    while (line < end && !(lines[line].trim() && (line === 0 || !lines[line - 1].trim()))) line++;
    starts[i] = line < end ? line : Math.max(previous, Math.min(previous + 1, end - 1), 0);
  });
  return starts;
}

// Index of the block that holds `line`.
export function blockAt(starts, line) {
  let low = 0, high = starts.length - 1;
  while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= line) low = mid; else high = mid - 1; }
  return low;
}

// Occurrences of `key` in `text`, and the index of the n-th one (the last one
// when there are fewer, -1 when there is none).
export function count(text, key) {
  let n = 0;
  for (let at = text.indexOf(key); at >= 0; at = text.indexOf(key, at + 1)) n++;
  return n;
}
export function nth(text, key, n) {
  let found = -1;
  for (let at = text.indexOf(key), k = 1; at >= 0; at = text.indexOf(key, at + 1), k++) { found = at; if (k >= n) break; }
  return found;
}
