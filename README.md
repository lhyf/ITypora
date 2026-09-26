# Itypora

一个面向团队日常写作的本地 Markdown 桌面编辑器。独立实现，使用自己的界面和素材，与 Typora 项目无关联。

## 启动

需要 Node.js 22.12+（本机已使用 Node.js 24 验证）。

```sh
npm ci
npm run desktop
```

`npm run dev` 启动浏览器界面预览；文件夹、草稿恢复及带资源的主题导入需要桌面版。浏览器预览可以打开文件并下载 Markdown。

## 0.3 版功能

- 即时渲染、所见即所得、独立源码编辑模式。Ctrl+/ 切换源码时光标和屏幕位置保持对应（光标不在屏幕内时对齐当前可见的内容）；源码未修改时切回即时显示，不重新渲染。
- 源码模式与 Typora 一样按 Markdown 语法着色：标题放大加粗、粗体/斜体/删除线、代码与代码块语言高亮、引用、列表、链接、表格和 YAML Front Matter；只在当前行显示行号。使用与 Typora 源码模式相同的 CodeMirror 类名（`#typora-source`、`.cm-s-typora-default`），导入主题中的源码模式样式直接生效。
- 标题、列表、任务列表、表格、引用、代码高亮等 Markdown 编辑。
- 丰富的段落菜单：标题升降级、段落转换、表格行列与对齐、公式块、代码语言、警告框、任务状态、列表缩进、段落插入、链接引用、脚注、目录和 YAML Front Matter。
- 插入表格时先设置列数和行数，默认 3 列、4 行（包含表头）；Enter 确认、Esc 取消，弹窗跟随当前主题，确认后在原选区插入并支持撤销。
- 格式菜单支持加粗、斜体、下划线、删除线、高亮、上下标、行内代码、行内公式、链接和图片；源码、即时渲染和所见即所得模式共用菜单。表格、代码、任务和列表操作根据光标上下文启用。
- 七组原生菜单：文件、编辑、段落、格式、视图、主题、帮助；默认空白文档、收起侧栏、底部源码开关与词数。
- 文件夹列表/目录分组视图、最近文档、文档大纲、专注模式、打字机模式、文内查找、字数统计。
- 左侧文件列表和大纲隐藏滚动条，保留滚轮/触控板滚动。拖动侧栏右边界调整宽度，双击恢复默认；宽度在重启后保留，窗口缩小时自动为正文留出空间。
- 主窗口内的偏好设置页面：通用、外观、编辑器、Markdown 四个分类和搜索。右上角 × 或 Esc 返回文档，配色跟随当前主题；设置即时生效并持久保存。
- 外观设置：自动 / 自定义字号、词数与阅读速度、从主题目录选择当前主题、主题文件夹和自定义 CSS。
- 编辑设置：字体、宽度、模式、打字机模式、拼写检查（即时渲染和所见即所得模式）、代码行号及 Tab 缩进。
- 本地 UTF-8 文件打开、保存、另存为；临时文件写入后原子替换。
- 未保存提示、磁盘外部修改冲突提示、每秒保存恢复草稿。
- 首次启动将素纸、暖砂、夜读三个默认配色写入主题目录，已有同名文件不会被覆盖。
- Typora CSS 正文主题导入，递归读取本地 `@import`，打包同目录及子目录下的图片和字体。
- 编辑器、解析器及随附渲染资源均随应用打包，基础编辑不依赖 CDN。

## 主题使用

1. 保持主题原来的文件结构，例如 `my-theme.css`、`my-theme/fonts/`。
2. 点击“主题 → 导入 CSS 主题…”，选择入口 `.css` 文件。
3. 通过原生主题菜单或“偏好设置 → 外观 → 当前主题”选择目录中的主题。主题由用户手动选择，不随系统明暗变化切换。
4. “打开主题文件夹”打开 Itypora 用户数据目录中的 `themes`。可把主题 CSS 和资源子目录复制进去，然后“重新加载主题”。导入按钮会将本地资源嵌入主题副本，原文件不变；旧版导入的主题首次启动时自动迁移。
5. “自定义 CSS”编辑 `base.user.css`，对内置及导入主题生效。导入主题还可通过 `主题名.user.css` 单独覆盖，顺序为主题 CSS → `base.user.css` → `主题名.user.css`。字号、字体、宽度的显式偏好设置优先于主题。

界面与操作参考 [Typora 主题说明](https://support.typora.io/About-Themes/) 和 [自定义 CSS 说明](https://support.typora.io/Add-Custom-CSS/)。当前实现上述四个设置分类，图片管理、导出配置等尚未实现。

兼容 `#write`、标题/段落/表格等标准元素、正文 CSS 变量、字体和任务列表选择器。主题样式限定在编辑区域，常用背景、文本、侧栏和强调色变量映射到应用界面；原生菜单由操作系统绘制。已用本机 Matcha 浅色主题验证背景、字体、侧栏、标题和圆形任务框。**不承诺全部主题与 Typora 像素级一致**：Typora 专有的 `.md-*` 结构和 CodeMirror 代码块尚未完整适配。第三方主题不随安装包分发。

远程 `@import`、远程字体/图片会被跳过并显示提示；主题应提供本地资源。引用父目录、绝对路径和循环导入会报错。单资源上限 8 MB，总资源上限 20 MB。使用或随软件分发第三方主题时应遵守该主题自身的许可证。

## 保存与数据

- 未改动的文档在切换模式和保存时保留原文，包括 BOM、CRLF。在即时渲染/富文本模式中编辑后，只有被编辑的块（段落、列表、表格、代码块等）由编辑引擎重新写出，其余内容逐字节保留；撤销回原样后保存，文件与原文一致。被编辑的块内空白和部分语法写法可能规范化，例如表格重新对齐、缩进代码块改为围栏代码块。链接引用和脚注定义保持在原位置。
- 对自定义 Markdown 扩展或复杂内嵌 HTML，优先使用源码模式，避免富文本解析后格式丢失。
- 支持最大 10 MB 的 UTF-8 文档。UTF-16、其他编码及二进制文件明确拒绝打开。
- 恢复草稿是独立副本，不自动覆盖源文件；异常退出最多可能丢失最近约一秒输入。
- 外部程序修改或删除当前文档后，保存会提示覆盖或取消。首版没有文件内容合并。
- 本地图片支持文档所在目录及子目录中的 PNG/JPEG/GIF/WebP/AVIF。父目录图片、远程图片和 SVG 文档图片尚未开放。
- 文件夹列表最多 500 个 Markdown 文件、最多 8 层目录，跳过隐藏目录、符号链接及 `node_modules`。

## 快捷键

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 新建 | Ctrl+N | Cmd+N |
| 打开 | Ctrl+O | Cmd+O |
| 保存 | Ctrl+S | Cmd+S |
| 另存为 | Ctrl+Shift+S | Cmd+Shift+S |
| 源码切换 | Ctrl+/ | Cmd+/ |
| 侧栏切换 | Ctrl+Shift+L | Cmd+Shift+L |
| 专注模式 | F8 | F8 |
| 打字机模式 | F9 | F9 |
| 大纲 | Ctrl+Shift+1 | Cmd+Shift+1 |
| 查找 | Ctrl+F | Cmd+F |
| 偏好设置 | Ctrl+, | Cmd+, |
| 普通段落 | Ctrl+0 | Cmd+0 |
| 提升 / 降低标题级别 | Ctrl+= / Ctrl+- | Cmd+= / Cmd+- |
| 公式块 | Ctrl+Shift+M | Cmd+Shift+M |
| 下划线 | Ctrl+U | Cmd+U |
| 高亮 | Ctrl+Shift+H | Cmd+Shift+H |
| 放大 / 缩小 | Ctrl+Shift+= / Ctrl+Shift+- | Cmd+Shift+= / Cmd+Shift+- |

Esc 退出专注模式。

## 验证和打包

```sh
npm test
npm run test:desktop
npm run test:interface
npm run test:preferences
npm run test:formatting
npm run test:table-dialog
npm run test:rendering
npm run test:sidebar
npm run pack
npm run dist
```

- `pack`：生成可直接运行的目录，Windows 输出 `release/win-unpacked/Itypora.exe`。
- `dist`：在对应系统上生成 Windows NSIS/portable、macOS DMG/ZIP、Linux AppImage/DEB。
- `.github/workflows/build.yml` 配置三系统构建与测试；本地 Windows 测试通过不代表 macOS/Linux 已完成实机验收。
- 首次下载 Electron 和打包工具需要网络；打包后的基础编辑可离线使用。
- 发行签名、macOS 公证、自动更新尚未配置。公司正式推广前需要在目标设备上验收。

## 项目结构

```text
electron/     桌面窗口、受限 IPC、本地文件与主题编译
src/          写作界面、编辑模式、文档状态与样式
scripts/      离线编辑器资源准备
tests/        文件/主题单元测试、真实 Electron 集成测试
docs/         设计范围与后续路线
```

技术栈：Electron、TypeScript、Vite、Vditor、PostCSS。Vditor 是 MIT 许可开源编辑器；软件本身的发布许可证尚未决定，暂标记为 `UNLICENSED`。第三方组件许可证见各依赖及 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

真实主题验证可运行 `node tests/interface.mjs "主题入口.css的绝对路径"`；当前额外断言针对 Matcha 浅色主题。参考文档在 `tests/fixtures/参考文档.md`，验证过程使用临时用户配置，不更改原主题。

完整格式样本的渲染回归运行 `npm run test:rendering`；已验证范围和与 Typora 的已知差异见 [渲染验证记录](docs/RENDERING-VALIDATION.md)。
