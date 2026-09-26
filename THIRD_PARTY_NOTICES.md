# Third-party components

Itypora is an independent application and is not affiliated with Typora.

Primary components:

| Component | License | Source |
| --- | --- | --- |
| Electron | MIT and bundled Chromium/Node.js notices | https://github.com/electron/electron |
| Vditor | MIT | https://github.com/Vanessa219/vditor |
| DOMPurify | Apache-2.0 OR MPL-2.0 | https://github.com/cure53/DOMPurify |
| CodeMirror 5 | MIT | https://github.com/codemirror/codemirror5 |
| MathJax 4.1 | Apache-2.0 | https://github.com/mathjax/MathJax |
| MathJax New Computer Modern font (@mathjax/mathjax-newcm-font) | Apache-2.0 | https://github.com/mathjax/MathJax-fonts |
| PostCSS | MIT | https://github.com/postcss/postcss |
| postcss-selector-parser | MIT | https://github.com/postcss/postcss-selector-parser |
| postcss-value-parser | MIT | https://github.com/TrySound/postcss-value-parser |
| Vite | MIT | https://github.com/vitejs/vite |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Playwright | Apache-2.0 | https://github.com/microsoft/playwright |

Editor rendering bundles also contain third-party libraries such as Lute,
Highlight.js, KaTeX and Mermaid, and `vendor/mathjax` holds unmodified MathJax
components copied from npm. Their distributed license comments and
upstream notices remain in the unmodified vendor assets. This table is a
summary, not a substitute for the licenses shipped by each component.

The bundled Vditor editor code is modified at build time by
`scripts/vditor-patch.mjs` so that link reference and footnote definitions
stay where they are written.

`src/vendor/codemirror-markdown.mjs` is CodeMirror 5.65.21's
`mode/markdown/markdown.js` (MIT, copyright Marijn Haverbeke and others),
modified so source mode tokenizes Markdown the way Typora's source mode does.

Imported themes are user-provided content and retain their own licenses.
No Typora proprietary application assets or bundled themes are included.
