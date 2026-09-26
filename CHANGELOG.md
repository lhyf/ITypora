# 更新日志

本项目的版本变化记录在这里，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。发布时 GitHub Release 的说明取自对应版本的小节。

## [0.4.0] - 2026-09-26

首个公开发布版本，以 MIT 许可证开源。

### 新增

- 导出 HTML 和 PDF（文件 → 导出）。HTML 为单个文件，内嵌主题样式、字体和本地图片；PDF 为 A4，保留主题底色，带标题书签和可点击链接。脚注、`<details>` 折叠块和 HTML 注释的导出方式与 Typora 一致。
- 双击图表、数学公式或图片，在窗口内放大查看，支持缩放、平移和键盘操作。
- 源码模式改用 CodeMirror，并与 Typora 一样按 Markdown 语法着色；导入主题中的源码模式样式直接生效。
- Ctrl+/ 切换源码时光标和屏幕位置保持对应；源码未修改时切回不再重新渲染。
- 数学公式改用 MathJax 4（与 Typora 相同），并随应用离线打包。
- 本地图片与 Typora 一样按文档位置解析：支持上级目录（`../assets/a.png`）和绝对路径（`E:\pics\a.png`、`file:///…`）。
- 保存时只重写被编辑的块，其余内容逐字节保留；链接引用和脚注定义保持在原位置。
- 段落菜单和格式菜单大幅扩充：标题升降级、表格行列与对齐、公式块、代码语言、提示块、任务状态、列表缩进、脚注、目录、YAML Front Matter、下划线、高亮、上下标、行内公式、图片等。
- 插入表格前先设置行列数。
- 代码块原位编辑，缺失的图片显示原始语法和路径。
- 偏好设置改为主窗口内页面；主题改为用户手动选择，主题菜单与设置页从主题目录读取。
- 按 Typora 截图对齐导入主题的细节：任务列表、提示块图标和标题、表格、分隔线、代码高亮、目录、脚注等。

### 修复

- 大纲中的标题显示了 Markdown 标记（`**`、反引号、Setext 下划线）。
- 插入表格对话框用 Esc 或“取消”关闭后立刻再次打开，点“确定”没有反应。
- 默认模式为所见即所得时，在源码模式下导出得到空内容。
- 代码块中 diff 的增删行带有多余的底色（Typora 只有文字颜色）。

### 其他

- 以 MIT 许可证开源，补充第三方组件许可说明；安装包内附带 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`。
- GitHub Actions 在 Windows、macOS、Linux 上自动测试和打包，推送版本标签时自动发布 Release。
- “关于”对话框显示 `package.json` 中的版本号。

## [0.3.1] - 2026-09-25

### 新增

- 侧栏可拖动调宽（200–600 px），双击恢复默认，宽度重启后保留；窗口变窄时自动为正文留出空间。
- 文件列表和大纲隐藏滚动条，保留滚轮和触控板滚动。

## [0.3.0] - 2026-09-25

### 新增

- 偏好设置：通用、外观、编辑器、Markdown 四个分类和搜索。
- 自定义 CSS（`base.user.css`、`主题名.user.css`）和主题文件夹管理。

## [0.2.1] - 2026-09-25

### 修复

- 隐藏正文和源码区域的系统滚动条；宽表格和长代码行只在各自的块内横向滚动。

## [0.2.0] - 2026-09-25

### 新增

- 参考 Typora 的七组原生菜单、默认空白文档和底部状态栏。
- 文档大纲、文件夹目录分组、专注模式、打字机模式、文内查找。
- 导入 Typora CSS 主题。

[0.4.0]: https://github.com/lhyf/ITypora/releases/tag/v0.4.0
[0.3.1]: https://github.com/lhyf/ITypora/commits/master
[0.3.0]: https://github.com/lhyf/ITypora/commits/master
[0.2.1]: https://github.com/lhyf/ITypora/commits/master
[0.2.0]: https://github.com/lhyf/ITypora/commits/master
