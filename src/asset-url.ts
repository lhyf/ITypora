// Local images load through the itypora-asset protocol (electron/main.cjs),
// which resolves the path as written in the Markdown against the current
// document, as Typora does: beside it, above it (../assets/a.png) or absolute
// (E:\a.png, file:///E:/a.png). The path rides in the query, where the browser
// does not resolve "..". Vditor's link base (main.ts) prefixes relative paths;
// localAsset() also absolute ones and those in HTML.
export const assetBase = 'itypora-asset://document/?/';

// The protocol address of a local image path; null for web, data and other URLs.
export function localAsset(src: string) {
  if (!src || src.startsWith(assetBase)) return src || null;
  // A drive (E:\, E:/), root or UNC path (\a, /a, \\server) or a file: URL.
  if (/^(?:[a-z]:[\\/]|[\\/](?!\/)|file:)/i.test(src)) return assetBase + src;
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src) ? null : assetBase + src;
}

// The path as written in the Markdown.
export const assetPath = (src: string) => src.startsWith(assetBase) ? src.slice(assetBase.length) : src;
