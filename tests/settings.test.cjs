const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createSettingsStore } = require('../electron/settings.cjs');

async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-settings-'));
  t.after(async () => { const relative = path.relative(await fs.realpath(os.tmpdir()), await fs.realpath(root)); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup'); await fs.rm(root, { recursive: true, force: true }); });
  return root;
}
test('legacy themes migrate with stable IDs and preferences survive restart', async t => {
  const root = await temporary(t);
  await fs.writeFile(path.join(root, 'themes.json'), JSON.stringify([{ id: 'legacy-id', name: 'old-theme', css: '#write { color: red }', warnings: [] }]));
  const store = createSettingsStore(root);
  const initial = await store.initialize(); assert.equal(initial.initialized, false); assert.ok(initial.themes.some(theme => theme.id === 'legacy-id'));
  await store.saveSettings({ theme: 'legacy-id', size: '18', unknown: true, readingSpeed: -5 });
  const restarted = await createSettingsStore(root).initialize();
  assert.equal(restarted.initialized, true); assert.equal(restarted.settings.theme, 'legacy-id');
  assert.ok(restarted.themes.some(theme => theme.id === 'legacy-id')); assert.equal(restarted.settings.size, '18'); assert.equal(restarted.settings.readingSpeed, 400); assert.equal(restarted.settings.unknown, undefined);
});
test('theme directory reload respects override order, errors and deletion', async t => {
  const root = await temporary(t), store = createSettingsStore(root); await store.initialize();
  await fs.writeFile(path.join(store.folder, 'sample.css'), '#write { color: red }');
  await fs.writeFile(path.join(store.folder, 'base.user.css'), '#write { color: blue }');
  await fs.writeFile(path.join(store.folder, 'sample.user.css'), '#write { color: green }');
  let value = await store.refresh();
  assert.equal(value.themes.length, 4);
  const css = value.themes.find(theme => theme.name === 'sample').css; assert.ok(css.indexOf('red') < css.indexOf('blue')); assert.ok(css.indexOf('blue') < css.indexOf('green'));
  assert.match((await store.saveSettings({ showCount: false })).baseCss, /blue/);
  await fs.writeFile(path.join(store.folder, 'sample.css'), '#write {');
  value = await store.refresh(); assert.equal(value.themeErrors.length, 1); assert.equal(value.themes.find(theme => theme.name === 'sample').css, css);
  await fs.rm(path.join(store.folder, 'sample.css')); assert.equal((await store.refresh()).themes.length, 3);
});

test('dual theme settings migrate to one selection and deprecated updates are ignored', async t => {
  const root = await temporary(t);
  await fs.writeFile(path.join(root, 'preferences.json'), JSON.stringify({ lightTheme: 'sepia', darkTheme: 'night', separateDark: true, size: '18' }));
  const store = createSettingsStore(root);
  const value = await store.initialize();
  assert.equal(value.settings.theme, 'sepia'); assert.equal(value.settings.size, '18');
  const persisted = JSON.parse(await fs.readFile(path.join(root, 'preferences.json'), 'utf8'));
  for (const key of ['lightTheme', 'darkTheme', 'separateDark']) assert.equal(Object.hasOwn(persisted, key), false);
  await store.saveSettings({ theme: 'night', lightTheme: 'paper', separateDark: true });
  const restarted = await createSettingsStore(root).initialize();
  assert.equal(restarted.settings.theme, 'night'); assert.equal(restarted.settings.separateDark, undefined);
});

test('default themes are real files, never overwrite existing CSS or recreate deleted defaults', async t => {
  const root = await temporary(t), folder = path.join(root, 'themes');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, '素纸.css'), ':root { --bg-color: pink; }');
  const store = createSettingsStore(root);
  const initial = await store.initialize();
  assert.equal(initial.themes.length, 3);
  assert.match(initial.themes.find(theme => theme.id === 'paper').css, /pink/);
  for (const theme of initial.themes) await fs.access(path.join(folder, theme.fileName));
  for (const theme of initial.themes) await fs.rm(path.join(folder, theme.fileName));
  assert.equal((await store.refresh()).themes.length, 0);
  assert.equal((await createSettingsStore(root).initialize()).themes.length, 0);
});
test('invalid custom CSS cannot overwrite valid CSS', async t => {
  const store = createSettingsStore(await temporary(t)); await store.initialize();
  await store.customCss('#write { color: purple }');
  await assert.rejects(() => store.customCss('#write {'));
  assert.equal(await store.customCss(), '#write { color: purple }');
  assert.match(store.snapshot().baseCss, /purple/);
});
