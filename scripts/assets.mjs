import { cp, mkdir, rm } from 'node:fs/promises';

await mkdir('public/vendor/vditor', { recursive: true });
await cp('node_modules/vditor/dist', 'public/vendor/vditor/dist', { recursive: true });

// MathJax 4 components Typora uses: TeX input, SVG output, assistive MathML, New CM font.
const mathjax = 'public/vendor/mathjax';
await rm(mathjax, { recursive: true, force: true });
for (const file of ['LICENSE', 'startup.js', 'core.js', 'input/tex.js', 'input/tex-base.js', 'input/tex/extensions', 'output/svg.js', 'a11y/assistive-mml.js']) {
  await cp(`node_modules/mathjax/${file}`, `${mathjax}/${file}`, { recursive: true });
}
for (const file of ['package.json', 'svg.js', 'svg']) {
  await cp(`node_modules/@mathjax/mathjax-newcm-font/${file}`, `${mathjax}/fonts/mathjax-newcm-font/${file}`, { recursive: true });
}
// Glyphs for \ce, \mathbbm, \mathbbold and \mathds; Typora fetches these from a CDN.
for (const name of ['mhchem', 'bbm', 'bboldx', 'dsfont']) {
  for (const file of ['package.json', 'svg.js']) {
    await cp(`node_modules/@mathjax/mathjax-${name}-font-extension/${file}`, `${mathjax}/fonts/mathjax-${name}-font-extension/${file}`);
  }
}
