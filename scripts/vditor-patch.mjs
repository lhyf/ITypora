// Vditor 4.0 moves every link reference and footnote definition to the end of the
// document after each edit (ir/input.ts, wysiwyg/input.ts), merging separate groups
// into one. Typora keeps definitions where they are written. Keep them in place:
// the edited block still gets copies of the definitions, after a separator, so its
// references resolve; src/rendering.ts drops the copies from Lute's output.
import fs from 'node:fs/promises';

// Separator before the definition copies; must match src/rendering.ts.
const definitionCopies = 'ITyporaDefinitionCopies';
const target = /[\\/]vditor[\\/]dist[\\/]index\.js$/;

const edits = [
  {
    // Before rendering the edited block: append copies instead of moving the definitions.
    pattern: /if \(!blockElement\.innerText\.startsWith\("```"\)\) \{[^]*?(vditor\.(?:ir|wysiwyg)\.element)\.querySelectorAll\("\[data-type='link-ref-defs-block'\]"\)\.forEach\(function \(item\) \{\s*if \(item && !blockElement\.isEqualNode\(item\)\) \{\s*(html(?:_1)?) \+= item\.outerHTML;\s*item\.remove\(\);\s*\}\s*\}\);[^]*?\.querySelectorAll\("\[data-type='footnotes-block'\]"\)\.forEach\(function \(item\) \{\s*if \(item && !blockElement\.isEqualNode\(item\)\) \{\s*html(?:_1)? \+= item\.outerHTML;\s*item\.remove\(\);\s*\}\s*\}\);\s*\}/g,
    replace: (_match, root, html) => `if (!blockElement.innerText.startsWith("\`\`\`") && !/^(code-block|math-block|html-block|yaml-front-matter)$/.test(blockElement.getAttribute("data-type") || "")) {
            var ityporaDefinitions = "";
            ${root}.querySelectorAll("[data-type='link-ref-defs-block'], [data-type='footnotes-block']").forEach(function (item) {
                if (item && !blockElement.isEqualNode(item)) {
                    ityporaDefinitions += item.outerHTML;
                }
            });
            if (ityporaDefinitions) {
                ${html} += '<p data-block="0">${definitionCopies}</p>' + ityporaDefinitions;
            }
        }`
  },
  {
    // After rendering: no merging and no move to the end.
    pattern: /var firstLinkRefDefElement(?:_1)?;\s*var allLinkRefDefsElement = vditor\.(?:ir|wysiwyg)\.element\.querySelectorAll[^]*?\.insertAdjacentElement\("beforeend", allFootnoteElement\[0\]\);\s*\}/g,
    replace: () => '/* Itypora: definitions stay where they are written. */'
  }
];

export function patchVditor(code) {
  for (const { pattern, replace } of edits) {
    const count = code.match(pattern)?.length || 0;
    if (count !== 2) throw new Error(`Vditor patch expected 2 matches (IR and WYSIWYG) for ${pattern.source.slice(0, 60)}…, found ${count}`);
    code = code.replace(pattern, replace);
  }
  return code;
}

export function vditorPatch() {
  return {
    name: 'itypora-vditor-definitions',
    enforce: 'pre',
    // Skip Rollup's virtual CommonJS wrappers (\0-prefixed ids) of the same file.
    transform(code, id) { return !id.startsWith('\0') && target.test(id.split('?')[0]) ? { code: patchVditor(code), map: null } : null; },
    // The dev server pre-bundles dependencies with esbuild, outside Rollup's transform.
    config: () => ({
      optimizeDeps: {
        esbuildOptions: {
          plugins: [{
            name: 'itypora-vditor-definitions',
            setup(build) { build.onLoad({ filter: target }, async args => ({ contents: patchVditor(await fs.readFile(args.path, 'utf8')), loader: 'js' })); }
          }]
        }
      }
    })
  };
}
