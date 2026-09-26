const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');
const selectorParser = require('postcss-selector-parser');
const { isWithin } = require('./files.cjs');

const mime = {
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp'
};

async function importTheme(file) {
  const root = await fs.realpath(path.dirname(file));
  const warnings = new Set();
  let totalBytes = 0;
  const cache = new Map();
  async function local(reference, from) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/|\\)/i.test(reference)) throw new Error('仅支持主题文件夹内的相对资源路径');
    const target = await fs.realpath(path.resolve(path.dirname(from), decodeURIComponent(reference.split(/[?#]/)[0])));
    if (!isWithin(root, target)) throw new Error('主题资源不能超出所选 CSS 所在的文件夹');
    return target;
  }
  async function read(target) {
    if (cache.has(target)) return cache.get(target);
    const stat = await fs.stat(target);
    if (stat.size > 8 * 1024 * 1024 || totalBytes + stat.size > 20 * 1024 * 1024) throw new Error('主题资源超过大小限制（单文件 8 MB，总计 20 MB）');
    totalBytes += stat.size;
    const bytes = await fs.readFile(target);
    cache.set(target, bytes);
    return bytes;
  }
  async function compile(target, parents = []) {
    if (parents.includes(target) || parents.length > 12) throw new Error('主题包含循环或过深的 CSS 导入');
    const css = postcss.parse((await read(target)).toString('utf8'), { from: target });
    const imports = [];
    css.walkAtRules('import', (rule) => imports.push(rule));
    for (const rule of imports) {
      const parsed = valueParser(rule.params);
      const first = parsed.nodes.find((node) => node.type !== 'space' && node.type !== 'comment');
      const reference = first?.type === 'function' && first.value.toLowerCase() === 'url'
        ? valueParser.stringify(first.nodes).replace(/^["']|["']$/g, '') : first?.value;
      if (!reference || /^(?:https?:)?\/\//i.test(reference)) {
        warnings.add('已跳过远程 @import；请将字体和 CSS 下载到主题文件夹后重新导入。');
        rule.remove(); continue;
      }
      const child = await compile(await local(reference, target), [...parents, target]);
      const media = rule.params.slice(first.sourceEndIndex).trim();
      if (/\b(layer|supports)\s*\(/.test(media)) throw new Error('此版本暂不支持带 layer/supports 的 @import');
      if (media) { const wrapper = postcss.atRule({ name: 'media', params: media }); wrapper.append(child.nodes); rule.replaceWith(wrapper); }
      else rule.replaceWith(...child.nodes);
    }
    const declarations = [];
    css.walkDecls((declaration) => declarations.push(declaration));
    for (const declaration of declarations) {
      const parsed = valueParser(declaration.value);
      const urls = [];
      parsed.walk((node) => { if (node.type === 'function' && node.value.toLowerCase() === 'url') urls.push(node); });
      for (const node of urls) {
        const reference = valueParser.stringify(node.nodes).replace(/^["']|["']$/g, '');
        if (reference.startsWith('data:') || reference.startsWith('#')) continue;
        let uri = 'data:,';
        if (/^(?:https?:)?\/\//i.test(reference)) warnings.add('已跳过远程字体或图片；主题使用本地资源时可完整离线加载。');
        else {
          const asset = await local(reference, target);
          if (!mime[path.extname(asset).toLowerCase()]) throw new Error(`不支持的主题资源：${path.basename(asset)}`);
          uri = `data:${mime[path.extname(asset).toLowerCase()]};base64,${(await read(asset)).toString('base64')}`;
        }
        node.nodes = [{ type: 'string', quote: '"', value: uri }];
      }
      declaration.value = parsed.toString();
    }
    return css;
  }
  const css = await compile(await fs.realpath(file));
  css.walkRules((rule) => {
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map((selector) => {
      const scoped = selectorParser((selectors) => {
        selectors.walkTags((node) => {
          if (node.value === 'html' || node.value === 'body') node.replaceWith(selectorParser.className({ value: 'editor-surface' }));
          // IR links and tight task text are spans; keep imported theme rules
          // applicable while preserving the theme's original specificity.
          else if (node.value === 'a') node.replaceWith(selectorParser().astSync(':is(a, :where(.vditor-ir__link, .itypora-reference-link))').first.first);
          else if (node.value === 'del') node.replaceWith(selectorParser().astSync(':is(del, s)').first.first);
          else if (node.value === 'p' && selector.includes('.task-list-done')) node.replaceWith(selectorParser().astSync(':is(p, :where(.itypora-task-content))').first.first);
        });
        selectors.walkPseudos((node) => { if (node.value === ':root') node.replaceWith(selectorParser.className({ value: 'editor-surface' })); });
        // Mermaid 11.16 prefixes sequence marker ids with the diagram id
        // (diagramXXX-arrowhead); themes target Typora's unprefixed ids.
        selectors.walkIds((node) => {
          if (['arrowhead', 'crosshead', 'filled-head', 'sequencenumber', 'computerIcon', 'databaseIcon', 'clockIcon'].includes(node.value)) {
            node.replaceWith(selectorParser().astSync(`:is(#${node.value}, [id$="-${node.value}"])`).first.first);
          }
        });
        selectors.walkClasses((node) => {
          const codeClasses = {
            'cm-s-inner': '.md-fences', 'cm-keyword': '.hljs-keyword', 'cm-def': '.hljs-title',
            'cm-variable': '.hljs-variable', 'cm-variable-2': '.hljs-params', 'cm-type': '.hljs-type',
            'cm-property': '.hljs-attr, .hljs-property', 'cm-string': '.hljs-string',
            'cm-number': '.hljs-number', 'cm-atom': '.hljs-literal', 'cm-comment': '.hljs-comment, .hljs-code',
            // Markdown mode tokens (CodeMirror header/strong/em/quote).
            'cm-header': '.hljs-section', 'cm-strong': '.hljs-strong', 'cm-em': '.hljs-emphasis', 'cm-quote': '.hljs-quote',
            'cm-operator': '.hljs-operator', 'cm-meta': '.hljs-meta', 'cm-builtin': '.hljs-built_in',
            'cm-tag': '.hljs-tag', 'cm-attribute': '.hljs-attribute', 'cm-error': '.hljs-error',
            'cm-positive': '.hljs-addition', 'cm-negative': '.hljs-deletion'
          };
          if (codeClasses[node.value]) {
            node.replaceWith(selectorParser().astSync(`:is(.${node.value}, ${codeClasses[node.value]})`).first.first);
            return;
          }
          if (node.value === 'task-list-item') {
            const combinator = node.next();
            if (combinator?.type === 'combinator' && combinator.value.trim() === '>' && combinator.next()?.value === 'input') {
              node.replaceWith(selectorParser().astSync(':is(.vditor-task, .vditor-task > :where(p))').first.first);
            } else node.value = 'vditor-task';
          }
          else if (node.value === 'task-list-done') node.replaceWith(...selectorParser().astSync('.vditor-task:where(:has(> input:checked, > p > input:checked))').first.nodes);
        });
      }).processSync(selector);
      // Collapse html body and keep document CSS from restyling application controls.
      const normalized = scoped.replace(/\.editor-surface\s+\.editor-surface/g, '.editor-surface');
      return normalized.startsWith('.editor-surface') ? normalized : `.editor-surface ${normalized}`;
    });
  });
  return {
    id: crypto.randomUUID(), name: path.basename(file, '.css'), css: css.toString(),
    warnings: [...warnings], importedAt: new Date().toISOString()
  };
}

module.exports = { importTheme };
