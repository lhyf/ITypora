const RELEASES_URL = 'https://github.com/lhyf/ITypora/releases';
const LATEST_RELEASE_API = 'https://api.github.com/repos/lhyf/ITypora/releases/latest';

function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value);
  if (!match) return null;
  const prerelease = match[4]?.split('.') || [];
  if (prerelease.some(part => /^\d+$/.test(part) && /^0\d/.test(part))) return null;
  return { core: match.slice(1, 4).map(BigInt), prerelease };
}

// Compare numeric components, so 0.4.10 is newer than 0.4.9; build metadata is ignored.
function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  if (!a || !b) throw new Error('无法识别版本号。');
  const compare = (x, y) => x === y ? 0 : x > y ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const result = compare(a.core[i], b.core[i]);
    if (result) return result;
  }
  if (!a.prerelease.length || !b.prerelease.length) return compare(!a.prerelease.length, !b.prerelease.length);
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i], y = b.prerelease[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    return xn && yn ? compare(BigInt(x), BigInt(y)) : xn !== yn ? xn ? -1 : 1 : compare(x, y);
  }
  return 0;
}

async function latestRelease(currentVersion, fetch, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response, release;
  let failure = '无法连接 GitHub，请检查网络连接后重试。';
  try {
    try {
      response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ITypora-update-check' },
        signal: controller.signal, cache: 'no-store', credentials: 'omit'
      });
      if (response.ok) {
        failure = 'GitHub 返回了无法识别的版本信息，请稍后重试。';
        release = await response.json();
      }
    } catch {
      throw new Error(controller.signal.aborted ? '连接 GitHub 超时，请稍后重试。' : failure);
    }
    if (response.status === 404) return null;
    if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制了更新检查，请稍后重试。');
    if (!response.ok) throw new Error(`GitHub 服务暂时不可用（HTTP ${response.status}），请稍后重试。`);
    const version = parseVersion(release?.tag_name);
    if (!version || version.prerelease.length || release.draft !== false || release.prerelease !== false) {
      throw new Error('GitHub 返回了无法识别的正式版本信息，请稍后重试。');
    }
    return {
      version: release.tag_name.replace(/^v/, ''),
      newer: compareVersions(release.tag_name, currentVersion) > 0,
      // Construct a repository-owned link instead of opening a URL supplied by the response.
      url: `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { latestRelease, compareVersions };
