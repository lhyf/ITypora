const test = require('node:test');
const assert = require('node:assert/strict');
const { latestRelease, compareVersions } = require('../electron/updates.cjs');

const published = (tag = 'v0.4.4', extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });
const json = value => async () => Response.json(value);

test('update versions follow numeric and prerelease precedence, ignoring build metadata', () => {
  for (const [older, newer] of [
    ['0.4.9', 'v0.4.10'], ['0.9.0', '0.10.0'], ['0.99.99', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'], ['1.0.0-alpha.2', '1.0.0-alpha.10'],
    ['1.0.0-alpha.10', '1.0.0-beta'], ['1.0.0-rc.1', '1.0.0']
  ]) {
    assert.equal(compareVersions(older, newer), -1);
    assert.equal(compareVersions(newer, older), 1);
  }
  assert.equal(compareVersions('v0.4.3', '0.4.3+local'), 0);
  assert.equal(compareVersions('1.0.0-beta.1', '1.0.0-beta.1+build'), 0);
  for (const version of ['0.4', '01.2.3', '1.0.0-01', 'latest', '1.2.3/evil', '', null]) {
    assert.throws(() => compareVersions(version, '0.4.3'), /版本号/);
  }
});

test('update check queries only the configured GitHub repository and constructs its release link', async () => {
  const release = await latestRelease('0.4.3', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/lhyf/ITypora/releases/latest');
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal.aborted, false);
    return Response.json(published('v0.4.10', { html_url: 'https://example.com/unsafe' }));
  });
  assert.deepEqual(release, { version: '0.4.10', newer: true, url: 'https://github.com/lhyf/ITypora/releases/tag/v0.4.10' });
  for (const version of ['0.4.10', '0.5.0']) assert.equal((await latestRelease(version, json(published('v0.4.10')))).newer, false);
  assert.equal((await latestRelease('0.4.10-rc.1', json(published('v0.4.10')))).newer, true);
});

test('missing releases, unavailable services, malformed responses and prereleases are handled explicitly', async () => {
  assert.equal(await latestRelease('0.4.3', async () => new Response('', { status: 404 })), null);
  for (const status of [403, 429]) await assert.rejects(latestRelease('0.4.3', async () => new Response('', { status })), /限制/);
  await assert.rejects(latestRelease('0.4.3', async () => new Response('', { status: 502 })), /HTTP 502/);
  await assert.rejects(latestRelease('0.4.3', async () => { throw new Error('offline'); }), /网络连接/);
  await assert.rejects(latestRelease('0.4.3', async () => new Response('<html>proxy error</html>')), /无法识别/);
  for (const release of [null, {}, published('latest'), published('v0.5.0-rc.1'), published('v0.5.0', { draft: true }), published('v0.5.0', { prerelease: true })]) {
    await assert.rejects(latestRelease('0.4.3', json(release)), /正式版本/);
  }
});

test('update timeout aborts both a stalled request and a stalled response body', async () => {
  const waitForAbort = signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  await assert.rejects(latestRelease('0.4.3', (_url, { signal }) => waitForAbort(signal), 10), /超时/);
  await assert.rejects(latestRelease('0.4.3', async (_url, { signal }) => ({ ok: true, json: () => waitForAbort(signal) }), 10), /超时/);
});
