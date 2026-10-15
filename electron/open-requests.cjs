const path = require('node:path');
const { fileURLToPath } = require('node:url');

const documentPath = file => typeof file === 'string' && path.isAbsolute(file) && /\.(md|markdown|mdown|txt)$/i.test(file);

function commandLineFile(argv, packaged, cwd = process.cwd()) {
  const args = argv.slice(packaged ? 1 : 2);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (['--user-data-dir', '--log-file', '--crash-dumps-dir'].includes(argument)) { index++; continue; }
    if (typeof argument !== 'string' || argument.startsWith('-')) continue;
    try {
      const file = argument.startsWith('file:') ? fileURLToPath(argument) : path.resolve(cwd, argument);
      if (documentPath(file)) return file;
    } catch { /* Ignore malformed file URLs and unrelated shell arguments. */ }
  }
  return null;
}

module.exports = { commandLineFile, documentPath };
