// Draws the application icon: `npm run icon` (runs in Electron to rasterize).
// A sheet of paper on a sage-green tile, with a heading, lines of text and the
// text caret, an I-beam that is also the I of Itypora. Writes the SVG sources
// and 1024 px PNGs to build/ (electron-builder makes .ico, .icns and the Linux
// sizes from them) and the window icon to electron/icon.png.
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const accent = '#58754e';

// Everything is drawn on an 824-unit tile: macOS's icon grid (824 px tile with
// room for its shadow in 1024 px); Windows and Linux use nearly the whole canvas.
function icon({ mac }) {
  const [offset, size] = mac ? [100, 824] : [24, 976];
  const paper = { left: 172, right: 652, top: 112, bottom: 712, corner: 28, fold: 104 };
  const { left, right, top, bottom, corner: r, fold: f } = paper;
  const sheet = `M${left + r},${top} H${right - f} L${right},${top + f} V${bottom - r} A${r},${r} 0 0 1 ${right - r},${bottom} H${left + r} A${r},${r} 0 0 1 ${left},${bottom - r} V${top + r} A${r},${r} 0 0 1 ${left + r},${top} Z`;
  const flap = `M${right - f},${top} V${top + f - 22} A22,22 0 0 0 ${right - f + 22},${top + f} H${right} Z`;
  const line = (y, width) => `<rect x="236" y="${y}" width="${width}" height="24" rx="12"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#80a172"/>
      <stop offset="1" stop-color="#4a6641"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".16"/>
      <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="tile-shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".25"/>
    </filter>
    <filter id="paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#1c3017" flood-opacity=".32"/>
    </filter>
  </defs>
  <g transform="translate(${offset} ${offset}) scale(${size / 824})">
    <rect width="824" height="824" rx="185" fill="url(#tile)"${mac ? ' filter="url(#tile-shadow)"' : ''}/>
    <rect width="824" height="824" rx="185" fill="url(#sheen)"/>
    <g filter="url(#paper-shadow)">
      <path d="${sheet}" fill="#fbfaf5"/>
      <path d="${flap}" fill="#e1e7da"/>
    </g>
    <g transform="translate(0 14)">
    <g stroke="${accent}" stroke-width="15" stroke-linecap="round">
      <path d="M262,196 L250,270 M298,196 L286,270 M238,218 H312 M234,250 H308"/>
    </g>
    <rect x="338" y="213" width="224" height="40" rx="20" fill="#33402f"/>
    <g fill="#d3d9cd">${line(318, 352)}${line(370, 312)}${line(422, 336)}${line(532, 150)}</g>
    <g fill="${accent}">
      <rect x="420" y="496" width="20" height="96" rx="4"/>
      <rect x="400" y="490" width="60" height="16" rx="8"/>
      <rect x="400" y="582" width="60" height="16" rx="8"/>
    </g>
    </g>
  </g>
</svg>
`;
}

// Rasterizes an SVG at `size` px with transparency, in the page's canvas.
async function png(window, svg, size) {
  const data = await window.webContents.executeJavaScript(`(async () => {
    const image = new Image(); image.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = ${size};
    canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
    return canvas.toDataURL('image/png');
  })()`);
  return Buffer.from(data.split(',')[1], 'base64');
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL('about:blank');
  mkdirSync(new URL('build/', root), { recursive: true });
  for (const [name, mac] of [['icon', false], ['icon-mac', true]]) {
    const svg = icon({ mac });
    writeFileSync(new URL(`build/${name}.svg`, root), svg);
    writeFileSync(new URL(`build/${name}.png`, root), await png(window, svg, 1024));
  }
  writeFileSync(new URL('electron/icon.png', root), await png(window, icon({ mac: false }), 256));
  app.quit();
});
