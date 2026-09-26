// Windows 10 compatibility capture for reference-app inspection.
// Uses Chromium's supported capturer, independent of Codex's WGC helper.
const { app, desktopCapturer, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const separator = argument.indexOf('=');
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}));
const target = options['--window'];
const output = options['--out'];
if (!target || !/^\d+$/.test(target) || !output) {
  console.error('Usage: electron scripts/capture-window.cjs --window=<native window id> --out=<png path>');
  app.exit(2);
} else {
  app.setPath('userData', path.join(os.tmpdir(), 'itypora-reference-capture'));
  const timeout = setTimeout(() => { console.error('Window capture timed out'); app.exit(1); }, options['--wait-for'] ? 60000 : 20000);
  app.whenReady().then(async () => {
    if (options['--wait-for']) {
      console.log('Capture ready; waiting for trigger file.');
      while (!await fs.access(options['--wait-for']).then(() => true, () => false)) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    let crop;
    let display;
    if (options['--python']) {
      options['--bounds'] = execFileSync(options['--python'], [path.join(__dirname, 'window-bounds.py'), target, '--csv', '--require-foreground'], { encoding: 'utf8', windowsHide: true }).trim();
    }
    if (options['--bounds']) {
      const [x, y, width, height] = options['--bounds'].split(',').map(Number);
      crop = { x, y, width, height };
      if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(crop[key])) || crop.width <= 0 || crop.height <= 0) throw new Error('Invalid physical window bounds');
      const displays = screen.getAllDisplays();
      display = displays.find((item) => {
        const point = screen.screenToDipPoint({ x: crop.x + Math.floor(crop.width / 2), y: crop.y + Math.floor(crop.height / 2) });
        return point.x >= item.bounds.x && point.y >= item.bounds.y && point.x < item.bounds.x + item.bounds.width && point.y < item.bounds.y + item.bounds.height;
      });
      if (!display) throw new Error('Window is not on an available display');
    }
    const sources = await desktopCapturer.getSources({
      types: [crop ? 'screen' : 'window'],
      thumbnailSize: display ? { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } : { width: 2560, height: 1600 },
      fetchWindowIcons: false
    });
    const matches = sources.filter((source) => crop ? source.display_id === String(display.id) : source.id.split(':')[1] === target);
    if (matches.length !== 1) throw new Error('Requested window is unavailable; refresh window selection before retrying.');
    const source = matches[0];
    if (source.thumbnail.isEmpty()) throw new Error('The selected window returned an empty thumbnail.');
    let screenshot = source.thumbnail;
    if (crop) {
      const origin = screen.dipToScreenPoint({ x: display.bounds.x, y: display.bounds.y });
      const size = screenshot.getSize();
      if (options['--diagnostic'] === 'true') console.log(JSON.stringify({ display: { bounds: display.bounds, size: display.size, scaleFactor: display.scaleFactor }, origin, thumbnail: size, crop }));
      const x = Math.max(0, crop.x - origin.x);
      const y = Math.max(0, crop.y - origin.y);
      const width = Math.min(crop.x - origin.x + crop.width, size.width) - x;
      const height = Math.min(crop.y - origin.y + crop.height, size.height) - y;
      if (width <= 0 || height <= 0) throw new Error('Window lies outside the selected display');
      screenshot = screenshot.crop({ x, y, width, height });
    }
    const destination = path.resolve(output);
    if (path.extname(destination).toLowerCase() !== '.png') throw new Error('Output must be a PNG path.');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, screenshot.toPNG());
    console.log(JSON.stringify({ windowId: target, capture: crop ? 'visible-window-with-popups' : 'window', ...screenshot.getSize(), path: destination }));
    clearTimeout(timeout);
    app.exit(0);
  }).catch((error) => { console.error(error.message); clearTimeout(timeout); app.exit(1); });
}
