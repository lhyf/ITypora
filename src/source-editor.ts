import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/mode/overlay';
import 'codemirror/addon/mode/simple';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/edit/continuelist';
import 'codemirror/mode/meta';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/stex/stex';
// Languages highlighted inside fenced code blocks.
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/python/python';
import 'codemirror/mode/css/css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/sql/sql';
import 'codemirror/mode/shell/shell';
import 'codemirror/mode/yaml/yaml';
import 'codemirror/mode/diff/diff';
import 'codemirror/mode/clike/clike';
import 'codemirror/mode/go/go';
import 'codemirror/mode/rust/rust';
import 'codemirror/mode/php/php';
import 'codemirror/mode/ruby/ruby';
import 'codemirror/mode/powershell/powershell';
import { defineMarkdownMode } from './vendor/codemirror-markdown.mjs';
import { defineSourceMode } from './source-mode.mjs';

defineMarkdownMode(CodeMirror);
defineSourceMode(CodeMirror);

// Source mode: a CodeMirror editor laid out and highlighted like Typora's
// (`#typora-source`, theme `typora-default`), with the textarea-like surface
// the rest of the application uses. Offsets count characters of `value`,
// whose line breaks are always `\n`.
export class SourceEditor {
  readonly cm: CodeMirror.Editor;

  constructor(readonly element: HTMLElement, onInput: () => void) {
    const host = document.createElement('div'); host.id = 'typora-source';
    element.append(host);
    this.cm = CodeMirror(host, {
      value: '', mode: 'itypora-markdown', theme: 'typora-default',
      lineWrapping: true, lineNumbers: true, styleActiveLine: true,
      inputStyle: 'textarea', screenReaderLabel: 'Markdown 源码',
      indentWithTabs: false, viewportMargin: 50, scrollbarStyle: 'null',
      extraKeys: {
        Enter: 'newlineAndIndentContinueMarkdownList',
        Tab: cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.execCommand('insertSoftTab'),
        'Shift-Tab': cm => cm.indentSelection('subtract')
      }
    } as CodeMirror.EditorConfiguration);
    // Programmatic replacements are not edits.
    this.cm.on('changes', (_, changes) => { if (changes.some(change => change.origin !== 'setValue')) onInput(); });
  }

  get value() { return this.cm.getValue(); }
  // Replacing the text starts a new undo history, as it does for a textarea.
  set value(text: string) {
    if (text.replace(/\r\n?/g, '\n') === this.cm.getValue()) return;
    this.cm.setValue(text); this.cm.clearHistory();
  }
  // Shows another document: always a fresh undo history.
  load(text: string) { this.cm.setValue(text); this.cm.clearHistory(); }
  get selectionStart() { return this.cm.indexFromPos(this.cm.getCursor('from')); }
  get selectionEnd() { return this.cm.indexFromPos(this.cm.getCursor('to')); }
  setSelectionRange(start: number, end = start) { this.cm.setSelection(this.cm.posFromIndex(start), this.cm.posFromIndex(end)); }
  // Replaces start…end with `text` as one undo step.
  replaceRange(text: string, start: number, end: number) { this.cm.replaceRange(text, this.cm.posFromIndex(start), this.cm.posFromIndex(end), '+input'); }
  get scrollTop() { return this.cm.getScrollInfo().top; }
  set scrollTop(top: number) { this.cm.scrollTo(null, top); }
  set readOnly(readOnly: boolean) { this.cm.setOption('readOnly', readOnly); }
  set tabSize(size: number) { this.cm.setOption('tabSize', size); this.cm.setOption('indentUnit', size); }
  get hidden() { return this.element.hidden; }
  set hidden(hidden: boolean) {
    this.element.hidden = hidden;
    // CodeMirror measures its text only while shown.
    if (!hidden) this.cm.refresh();
  }
  // Applies input CodeMirror has not read from its textarea yet, so a save or
  // mode switch right after a keystroke includes it.
  flush() { (this.cm as unknown as { display: { input: { poll(): boolean } } }).display.input.poll(); }
  focus() { this.cm.focus(); }
  undo() { this.cm.undo(); }
  redo() { this.cm.redo(); }
  scrollIntoView() { this.cm.scrollIntoView(null, 80); }
}
