const { Menu } = require('electron');

// Commands share one path with the status bar and editor, including dirty-file checks.
function createMenu(action, themes, recent, view = {}) {
  const command = (id, label, accelerator, extra = {}) => ({ id, label, accelerator, click: () => action(id), ...extra });
  const separator = { type: 'separator' };
  const toggle = (id, label, accelerator, checked) => command(id, label, accelerator, { type: 'checkbox', checked: Boolean(checked) });
  const format = (id, label, accelerator, enabled = true) => command(`format:${id}`, label, accelerator, { enabled: enabled && view.editing !== false });
  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: '文件(&F)', submenu: [
      command('new', '新建', 'CmdOrCtrl+N'), command('open', '打开…', 'CmdOrCtrl+O'), command('folder', '打开文件夹…'),
      { label: '打开最近文件', submenu: recent.length ? recent.map((file, index) => command(`recent:${index}`, file)) : [{ label: '暂无最近文件', enabled: false }] },
      separator, command('save', '保存', 'CmdOrCtrl+S'), command('save-as', '另存为…', 'CmdOrCtrl+Shift+S'),
      separator, command('preferences', '偏好设置…', 'CmdOrCtrl+,'), separator, command('close', '关闭', 'CmdOrCtrl+W')
    ] },
    { label: '编辑(&E)', submenu: [
      command('format:undo', '撤销', 'CmdOrCtrl+Z'), command('format:redo', '重做', 'CmdOrCtrl+Y'), separator,
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' },
      { role: 'pasteAndMatchStyle', label: '粘贴为纯文本' }, { role: 'selectAll', label: '全选' }, separator,
      command('find', '查找…', 'CmdOrCtrl+F'), command('find-next', '查找下一个', 'F3'), command('find-previous', '查找上一个', 'Shift+F3')
    ] },
    { label: '段落(&P)', submenu: [
      ...Array.from({ length: 6 }, (_, i) => format(`h${i + 1}`, `${i + 1} 级标题`, `CmdOrCtrl+${i + 1}`)),
      separator, format('paragraph', '段落', 'CmdOrCtrl+0'),
      separator, format('heading-up', '提升标题级别', 'CmdOrCtrl+='), format('heading-down', '降低标题级别', 'CmdOrCtrl+-'),
      separator, { label: '表格', submenu: [
        format('table', '插入表格…'), separator,
        ...[['table-row-before', '在上方插入行'], ['table-row-after', '在下方插入行'], ['table-column-before', '在左侧插入列'], ['table-column-after', '在右侧插入列'],
          ['table-row-delete', '删除当前行'], ['table-column-delete', '删除当前列'], ['table-delete', '删除表格']].map(([id, label]) => format(id, label, undefined, Boolean(view.inTable))),
        separator, ...[['left', '左对齐'], ['center', '居中对齐'], ['right', '右对齐']].map(([id, label]) => format(`table-align-${id}`, label, undefined, Boolean(view.inTable)))
      ] },
      format('math', '公式块', 'CmdOrCtrl+Shift+M'), format('code', '代码块', 'CmdOrCtrl+Shift+K'),
      { label: '代码工具', submenu: [
        { label: '设置代码语言', submenu: [['', '纯文本'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['java', 'Java'], ['json', 'JSON'], ['sql', 'SQL'], ['sh', 'Shell'], ['mermaid', 'Mermaid']].map(([id, label]) => format(`code-language:${id}`, label, undefined, Boolean(view.inCode))) },
        format('code-unfence', '转换为普通文本', undefined, Boolean(view.inCode))
      ] },
      { label: '警告框', submenu: [['NOTE', '说明'], ['TIP', '提示'], ['IMPORTANT', '重要'], ['WARNING', '警告'], ['CAUTION', '注意']].map(([id, label]) => format(`alert:${id}`, label)) },
      separator, format('quote', '引用', 'CmdOrCtrl+Shift+Q'),
      separator, format('ordered-list', '有序列表', 'CmdOrCtrl+Shift+['), format('list', '无序列表', 'CmdOrCtrl+Shift+]'), format('check', '任务列表', 'CmdOrCtrl+Shift+X'),
      { label: '任务状态', submenu: [['task-toggle', '切换完成状态'], ['task-done', '标记为已完成'], ['task-undone', '标记为未完成']].map(([id, label]) => format(id, label, undefined, Boolean(view.inTask))) },
      { label: '列表缩进', submenu: [format('indent', '增加缩进', 'CmdOrCtrl+]', Boolean(view.inList)), format('outdent', '减少缩进', 'CmdOrCtrl+[', Boolean(view.inList))] },
      separator, format('insert-before', '在上方插入段落'), format('insert-after', '在下方插入段落'),
      separator, format('link-reference', '链接引用'), format('footnote', '脚注'),
      separator, format('line', '水平分割线'), format('toc', '内容目录'), format('yaml', 'YAML Front Matter')
    ] },
    { label: '格式(&O)', submenu: [
      format('bold', '加粗', 'CmdOrCtrl+B'), format('italic', '斜体', 'CmdOrCtrl+I'), format('underline', '下划线', 'CmdOrCtrl+U'),
      format('strike', '删除线', 'Alt+Shift+5'), format('highlight', '高亮', 'CmdOrCtrl+Shift+H'),
      separator, format('superscript', '上标'), format('subscript', '下标'),
      separator, format('inline-code', '行内代码', 'CmdOrCtrl+Shift+`'), format('inline-math', '行内公式'),
      separator, format('link', '超链接', 'CmdOrCtrl+K'), format('image', '图像')
    ] },
    { label: '视图(&V)', submenu: [
      toggle('sidebar', '显示 / 隐藏侧边栏', 'CmdOrCtrl+Shift+L', view.sidebar),
      command('outline', '大纲', 'CmdOrCtrl+Shift+1'), command('files', '文档列表', 'CmdOrCtrl+Shift+2'),
      command('tree', '文件树', 'CmdOrCtrl+Shift+3'), separator,
      toggle('source', '源代码模式', 'CmdOrCtrl+/', view.source), toggle('focus', '专注模式', 'F8', view.focus),
      toggle('typewriter', '打字机模式', 'F9', view.typewriter), toggle('statusbar', '显示状态栏', undefined, view.statusbar !== false),
      command('statistics', '字数统计'), separator,
      { role: 'togglefullscreen', label: '切换全屏', accelerator: 'F11' },
      { role: 'resetZoom', label: '实际大小', accelerator: 'CmdOrCtrl+Shift+9' },
      { role: 'zoomIn', label: '放大', accelerator: 'CmdOrCtrl+Shift+=' }, { role: 'zoomOut', label: '缩小', accelerator: 'CmdOrCtrl+Shift+-' }
    ] },
    { label: '主题(&T)', submenu: [
      ...themes
        .map(theme => command(`theme:${theme.id}`, theme.name, undefined, { type: 'radio', checked: (view.theme || 'paper') === theme.id })),
      separator, command('import-theme', '导入 CSS 主题…'), command('appearance', '管理主题…')
    ] },
    { label: '帮助(&H)', submenu: [command('help', 'Markdown 快捷参考'), command('about', '关于 Itypora')] }
  ]);
}
module.exports = { createMenu };
