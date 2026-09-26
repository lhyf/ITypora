const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { atomicWrite, readDocument, listMarkdown, isWithin, MAX_DOCUMENT_BYTES } = require('../electron/files.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'itypora-test-'));
  t.after(async () => {
    assert.ok(isWithin(await fs.realpath(os.tmpdir()), await fs.realpath(root)));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test('UTF-8, BOM and CRLF are preserved by read/write', async (t) => {
  const root = await fixture(t);
  const file = path.join(root, '中文文档.md');
  const content = '\uFEFF# 中文标题\r\n\r\n- [ ] task\r\n';
  await atomicWrite(file, content);
  assert.equal(await readDocument(file), content);
  await atomicWrite(file, content + '修改\r\n');
  assert.equal(await readDocument(file), content + '修改\r\n');
  assert.deepEqual(await fs.readdir(root), ['中文文档.md']);
});
test('invalid UTF-8, binary and oversized files are rejected', async (t) => {
  const root = await fixture(t);
  const file = path.join(root, 'bad.md');
  for (const content of [Buffer.from([0xff]), Buffer.from([65, 0]), Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 65)]) {
    await fs.writeFile(file, content);
    await assert.rejects(readDocument(file));
  }
});
test('workspace listing includes nested markdown and ignores hidden/vendor directories', async (t) => {
  const root = await fixture(t);
  for (const folder of ['notes', '.git', 'node_modules']) await fs.mkdir(path.join(root, folder));
  for (const file of ['readme.md', 'notes/测试.markdown', '.git/private.md', 'node_modules/no.md', 'image.png']) await fs.writeFile(path.join(root, file), '');
  assert.deepEqual((await listMarkdown(root)).map((file) => file.name).sort(), [path.join('notes', '测试.markdown'), 'readme.md'].sort());
});
test('path containment rejects parent and sibling-prefix escapes', () => {
  const root = path.resolve('workspace');
  assert.ok(isWithin(root, path.join(root, 'image.png')));
  assert.ok(!isWithin(root, path.resolve(root, '../outside')));
  assert.ok(!isWithin(root, `${root}-other/image.png`));
});
