// Install editable defaults once; the directory is the source of selectable themes.
const palettes = [
  ['paper', '素纸', ['#fff', '#333', '#f5f5f5', '#888', '#e7e7e7', '#58754e', '#e9ece6', '#f5f5f5']],
  ['sepia', '暖砂', ['#f8f3e7', '#635b4e', '#f0ebdf', '#a49985', '#e9e2d3', '#8c7751', '#e8e0cf', '#f0e9d9']],
  ['night', '夜读', ['#252b29', '#c8d0c8', '#202522', '#869185', '#373e37', '#98b788', '#354131', '#202522']]
];
const variables = ['bg-color', 'text-color', 'side-bar-bg-color', 'control-text-color', 'window-border-color', 'primary-color', 'active-file-bg-color', 'code'];
module.exports = palettes.map(([id, name, colors]) => ({
  id, name, fileName: `${name}.css`,
  css: `:root {\n${variables.map((variable, i) => `  --${variable}: ${colors[i]};`).join('\n')}\n}\n`
}));
