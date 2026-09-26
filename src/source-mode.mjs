// Source mode highlighting with the token classes Typora's source mode uses, so
// imported themes' `#typora-source` / `.cm-s-typora-default` rules apply: the
// standard CodeMirror markdown mode, with Typora's names for heading levels
// (`header1`), block quotes (`atom`, `number`), strikethrough (`del`) and images
// (`tag`), `block-start` on block markers, and line classes for headings, block
// quotes, table rows, front matter and fenced code. Web addresses are `link`,
// as in Typora's GFM overlay. Needs the markdown mode from
// src/vendor/codemirror-markdown.mjs, the stex mode, the overlay addon and the
// languages to highlight in fenced code loaded.

const delimiterRow = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const mathFence = /^\s*\$\$\s*$/;
const url = /^(?:(?:https?|ftp):\/\/|www\.)[^\s<>()]*[^\s<>()`.,;:!?"'*_~\]]/i;
const urlStart = /^(?:(?:https?|ftp):\/\/|www\.)/i;

export function defineSourceMode(CodeMirror) {
  CodeMirror.defineMode('itypora-markdown', config => {
    const base = CodeMirror.getMode(config, 'itypora-markdown-base');
    let current = null;
    // Web addresses outside code, replacing the Markdown token's classes.
    const links = {
      token(stream) {
        const inCode = !current || current.front === 1 || current.math || current.md.fencedEndRE || current.md.code || current.md.htmlState;
        if (!inCode && (stream.sol() || !/\w/.test(stream.string.charAt(stream.pos - 1))) && stream.match(url)) return 'link';
        stream.next();
        while (!stream.eol() && !(!/\w/.test(stream.string.charAt(stream.pos - 1)) && stream.match(urlStart, false))) stream.next();
        return null;
      }
    };
    const mode = CodeMirror.overlayMode(base, links, false);
    return { ...mode, token(stream, state) { current = state.base; return mode.token(stream, state); } };
  });

  CodeMirror.defineMode('itypora-markdown-base', config => {
    const markdown = CodeMirror.getMode(config, {
      // Typora marks syntax characters with their element's classes only.
      name: 'markdown', highlightFormatting: false, fencedCodeBlockHighlighting: true,
      taskLists: true, strikethrough: true, emoji: false, xml: true
    });
    const tex = CodeMirror.getMode(config, 'stex');

    // `marker` is a block's opening syntax: a list or quote marker or a fence.
    function rename(style, md, fenced, line, marker) {
      if (!style) return fenced && md.localMode ? 'line-cm-s-inner overlay' : style;
      const classes = new Set(style.split(' '));
      const has = name => classes.has(name);
      if (fenced && md.fencedEndRE) {
        // A fenced block's content: its language's tokens, or `code` without one.
        if (!md.localMode) { classes.delete('comment'); classes.add('code'); }
        classes.add('line-cm-s-inner'); classes.add('overlay');
      }
      if (has('image')) {
        for (const name of ['image', 'image-marker', 'image-alt-text', 'link', 'formatting', 'formatting-image']) classes.delete(name);
        classes.add('tag');
      }
      classes.delete('url');
      for (const name of [...classes]) {
        let match;
        if ((match = /^(formatting-)?header-(\d)$/.exec(name))) {
          classes.delete(name); classes.add(`${match[1] || ''}header${match[2]}`);
          if (!match[1] && /^\s{0,3}#/.test(line)) { classes.add('line-cm-header'); classes.add(`line-cm-header${match[2]}`); }
        } else if ((match = /^quote-(\d+)$/.exec(name))) {
          classes.delete(name); classes.add(Number(match[1]) % 2 ? 'atom' : 'number'); classes.add('line-cm-atom');
        } else if (/^formatting-quote-\d+$/.test(name)) classes.delete(name);
        else if (name === 'strikethrough') { classes.delete(name); classes.add('del'); }
        else if (name === 'formatting-strikethrough') { classes.delete(name); classes.add('formatting-del'); }
      }
      classes.delete('quote');
      if (marker || has('formatting-task')) classes.add('block-start');
      return [...classes].join(' ');
    }

    return {
      startState: () => ({ md: CodeMirror.startState(markdown), front: 0, line: 0, table: false, math: false, tex: null }),
      copyState: state => ({ ...state, md: CodeMirror.copyState(markdown, state.md), tex: state.tex && CodeMirror.copyState(tex, state.tex) }),
      blankLine(state) {
        state.line++; state.table = false;
        if (state.front !== 1 && markdown.blankLine) markdown.blankLine(state.md);
      },
      token(stream, state) {
        const line = stream.string;
        if (stream.sol()) {
          const first = state.line++ === 0;
          const code = state.math || Boolean(state.md.fencedEndRE) || Boolean(state.md.htmlState);
          // A table is a row followed by a delimiter row, and the rows after it.
          state.table = state.front !== 1 && !code && line.includes('|') && (state.table || (!delimiterRow.test(line) && delimiterRow.test(stream.lookAhead(1) || '')));
          if (first && /^---\s*$/.test(line)) { state.front = 1; stream.skipToEnd(); return 'hr'; }
          if (state.front === 1) {
            stream.skipToEnd();
            if (/^(---|\.\.\.)\s*$/.test(line)) { state.front = 2; return 'hr'; }
            return 'line-cm-yaml';
          }
          // Math blocks show as code, with TeX highlighting.
          if (!code && mathFence.test(line)) { state.math = true; state.tex = CodeMirror.startState(tex); stream.skipToEnd(); return 'block-start comment'; }
          if (state.math && mathFence.test(line)) { state.math = false; state.tex = null; stream.skipToEnd(); return 'comment'; }
        }
        if (state.front === 1) { stream.skipToEnd(); return 'line-cm-yaml'; }
        if (state.math) return ['line-cm-s-inner overlay', tex.token(stream, state.tex)].filter(Boolean).join(' ');
        const fenced = Boolean(state.md.fencedEndRE);
        const token = markdown.token(stream, state.md), text = stream.current();
        const leading = !stream.string.slice(0, stream.start).trim();
        const marker = !fenced && Boolean(state.md.fencedEndRE) ||
          leading && state.md.list && /^([*+-]|\d{1,9}[.)])\s*$/.test(text) ||
          state.md.quote && /^>\s*$/.test(text) && /^[\s>]*$/.test(stream.string.slice(0, stream.start));
        const style = rename(token, state.md, fenced, line, marker);
        return state.table ? [style, 'line-cm-table-row'].filter(Boolean).join(' ') : style;
      },
      innerMode: state => state.math ? { state: state.tex, mode: tex } : markdown.innerMode(state.md),
      indent: (state, textAfter, line) => state.math || !markdown.indent ? CodeMirror.Pass : markdown.indent(state.md, textAfter, line)
    };
  });
}
