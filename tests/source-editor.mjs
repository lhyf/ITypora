import { expect } from '@playwright/test';

// Source mode is a CodeMirror editor in #source-editor. These read and drive it
// through CodeMirror's API; offsets count characters of its `\n`-separated text.
export function sourceEditor(page) {
  const value = () => page.evaluate(() => document.querySelector('#source-editor .CodeMirror').CodeMirror.getValue());
  return {
    locator: page.locator('#source-editor'),
    value,
    // Replaces the whole text as one edit, like typing over a selection.
    fill: text => page.evaluate(text => {
      const cm = document.querySelector('#source-editor .CodeMirror').CodeMirror;
      cm.focus(); cm.execCommand('selectAll'); cm.replaceSelection(text);
    }, text),
    select: (start, end = start) => page.evaluate(([start, end]) => {
      const cm = document.querySelector('#source-editor .CodeMirror').CodeMirror;
      cm.focus(); cm.setSelection(cm.posFromIndex(start), cm.posFromIndex(end));
    }, [start, end]),
    selection: () => page.evaluate(() => {
      const cm = document.querySelector('#source-editor .CodeMirror').CodeMirror;
      return [cm.indexFromPos(cm.getCursor('from')), cm.indexFromPos(cm.getCursor('to'))];
    }),
    // Sets the scroll position when given one; returns the current one.
    scrollTop: top => page.evaluate(top => {
      const cm = document.querySelector('#source-editor .CodeMirror').CodeMirror;
      if (top !== undefined) cm.scrollTo(null, top);
      return cm.getScrollInfo().top;
    }, top),
    focused: () => page.evaluate(() => document.querySelector('#source-editor .CodeMirror').CodeMirror.hasFocus()),
    toHaveValue: expected => expected instanceof RegExp ? expect.poll(value).toMatch(expected) : expect.poll(value).toBe(expected)
  };
}
