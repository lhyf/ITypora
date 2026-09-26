// Typora 1.13 renders TeX with MathJax 4.1 (SVG output, New Computer Modern font).
// Load the same local components with Typora's settings. Vditor's own MathJax
// loader injects inline JS, so it is skipped by reusing its script id.
const scriptId = 'protyleMathJaxScript';

declare global {
  interface Window { MathJax: any }
}

// Typora's iTeX/HTML-style aliases (window.html, #mathjax-load).
const macros: Record<string, string | [string, number]> = {
  alef: '\\aleph', alefsym: '\\aleph', Alpha: '\\mathrm{A}', and: '\\land', ang: '\\angle',
  Beta: '\\mathrm{B}', bold: '\\mathbf', bull: '\\bullet', C: '\\mathbb{C}', Chi: '\\mathrm{X}',
  clubs: '\\clubsuit', cnums: '\\mathbb{C}', Complex: '\\mathbb{C}', coppa: 'ϙ', Coppa: 'Ϙ',
  Dagger: '\\ddagger', Digamma: 'Ϝ', darr: '\\downarrow', dArr: '\\Downarrow', Darr: '\\Downarrow',
  diamonds: '\\diamondsuit', empty: '\\emptyset', Epsilon: '\\mathrm{E}', Eta: '\\mathrm{H}', euro: '€',
  exist: '\\exists', geneuro: '€', geneuronarrow: '€', geneurowide: '€', H: '\\mathbb{H}',
  hAar: '\\Leftrightarrow', harr: '\\leftrightarrow', Harr: '\\Leftrightarrow', hearts: '\\heartsuit',
  image: '\\Im', infin: '\\infty', Iota: '\\mathrm{I}', isin: '\\in', Kappa: '\\mathrm{K}', koppa: 'ϟ',
  Koppa: 'Ϟ', lang: '\\langle', larr: '\\leftarrow', Larr: '\\Leftarrow', lArr: '\\Leftarrow',
  lrarr: '\\leftrightarrow', Lrarr: '\\Leftrightarrow', lrArr: '\\Leftrightarrow', Mu: '\\mathrm{M}',
  N: '\\mathbb{N}', natnums: '\\mathbb{N}', Nu: '\\mathrm{N}', O: '\\emptyset', officialeuro: '€',
  Omicron: '\\mathrm{O}', or: '\\lor', P: '¶', pagecolor: ['', 1], part: '\\partial', plusmn: '\\pm',
  Q: '\\mathbb{Q}', R: '\\mathbb{R}', rang: '\\rangle', rarr: '\\rightarrow', Rarr: '\\Rightarrow',
  rArr: '\\Rightarrow', real: '\\Re', reals: '\\mathbb{R}', Reals: '\\mathbb{R}', Rho: '\\mathrm{P}',
  sdot: '\\cdot', sampi: 'ϡ', Sampi: 'Ϡ', sect: '\\S', spades: '\\spadesuit', stigma: 'ϛ',
  Stigma: 'Ϛ', sub: '\\subset', sube: '\\subseteq', supe: '\\supseteq', Tau: '\\mathrm{T}',
  textvisiblespace: '␣', thetasym: '\\vartheta', uarr: '\\uparrow', uArr: '\\Uparrow', Uarr: '\\Uparrow',
  varcoppa: 'ϙ', varstigma: 'ϛ', vline: '\\smash{\\large\\lvert}', weierp: '\\wp',
  Z: '\\mathbb{Z}', Zeta: '\\mathrm{Z}',
  dashint: '\\unicodeInt{x2A0D}', ddashint: '\\unicodeInt{x2A0E}',
  ointctrclockwise: '\\unicodeInt{x2233}',
  unicodeInt: ['\\mathop{\\vcenter{\\mathchoice{\\huge\\unicode{#1}\\,}{\\unicode{#1}}{\\unicode{#1}}{\\unicode{#1}}}\\,}\\nolimits', 1],
  varointclockwise: '\\unicodeInt{x2232}'
};

let loading: Promise<void> | undefined;

export function loadMathJax(): Promise<void> {
  if (loading) return loading;
  const base = new URL('./vendor/mathjax', document.baseURI).href;
  window.MathJax = {
    loader: {
      paths: { mathjax: base, fonts: `${base}/fonts` },
      // Typora's bundle: TeX input, SVG output and hidden assistive MathML; no menu or speech.
      load: ['input/tex', 'output/svg', 'a11y/assistive-mml']
    },
    options: { enableAssistiveMml: true },
    startup: {
      typeset: false,
      ready() {
        const MathJax = window.MathJax;
        // Typora renders CJK characters in formulas as text instead of italic identifiers.
        const ranges = MathJax._.core.MmlTree.OperatorDictionary.RANGES;
        ranges[28][3] = ranges[30][3] = ranges[33][3] = ranges[47][3] = 'mtext';
        MathJax.startup.defaultReady();
        MathJax.startup.document.addStyleSheet();
        // Vditor swaps MathJax's error output for plain text. Typora keeps MathJax's
        // red message, so hide the error node from Vditor's check.
        const tex2svgPromise = MathJax.tex2svgPromise;
        MathJax.tex2svgPromise = (math: string, options: object) => tex2svgPromise(math, options).then((node: any) => {
          node.querySelector = (selector: string) => selector.includes('merror') ? null : Element.prototype.querySelector.call(node, selector);
          return node;
        });
      }
    },
    tex: {
      maxBuffer: 10 * 1024,
      processEscapes: true,
      macros,
      packages: { '[+]': ['noundefined', 'autoload', 'ams', 'textmacros'] },
      tags: 'none',
      formatError(jax: any, error: any) {
        const message = error.message.replace(/\n.*/, '');
        return jax.parseOptions.nodeFactory.create('error', message, error.id, 'Error: ' + message);
      },
      useLabelIds: true
    },
    svg: { scale: 1, minScale: 80 }
  };
  // Resolve once MathJax.startup.promise exists; Vditor waits on it before rendering.
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `${base}/startup.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('无法加载本地公式引擎'));
    document.head.append(script);
  });
  return loading;
}
