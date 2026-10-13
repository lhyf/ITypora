const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');

test('release theme bundle contains exactly the eight selected themes and only offline resource URLs', async () => {
  const root = path.join(__dirname, '../resources/themes');
  const expected = ['clarity-dark', 'clarity', 'github', 'lightmind-dark', 'lightmind', 'matcha-dark', 'matcha', 'morandigarden'];
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.themes.map(theme => theme.fileName), expected.map(name => `${name}.css`));
  assert.deepEqual(manifest.themes.map(theme => theme.id), expected.map(name => `builtin:${name}`));
  assert.deepEqual((await fs.readdir(root)).filter(name => name.endsWith('.css')).sort(), expected.map(name => `${name}.css`).sort());
  for (const theme of manifest.themes) {
    const css = postcss.parse(await fs.readFile(path.join(root, theme.fileName), 'utf8'));
    css.walkAtRules(rule => assert.ok(!['import', 'include-when-export'].includes(rule.name), `${theme.fileName}: unresolved ${rule.name}`));
    css.walkDecls(declaration => valueParser(declaration.value).walk(node => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
      const url = valueParser.stringify(node.nodes).replace(/^["']|["']$/g, '');
      assert.ok(url.startsWith('data:') || url.startsWith('#'), `${theme.fileName}: non-embedded resource ${url.slice(0, 100)}`);
    }));
  }
  for (const notice of ['clarity/fonts/OFL-IBMPlexSans.txt', 'clarity/fonts/OFL-JetBrainsMono.txt', 'matcha/fonts/OFL-JetBrainsMono.txt', 'matcha/fonts/OFL-Nunito.txt']) {
    await fs.access(path.join(root, 'licenses', notice));
  }
});
