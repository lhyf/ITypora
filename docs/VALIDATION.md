# 验证记录

## 0.2.1 滚动布局修复

- 隐藏居中正文及源码区域的系统滚动条，保留原编辑器滚动容器以支持滚轮、光标定位和打字机模式。
- 宽表格和代码/预览区域限制在正文宽度内，横向滚动仅发生在相应内容块中；局部滚动提示在悬停时显示。
- 使用 12 列宽表格、长代码行和 70 段长文验证：即时渲染、所见即所得及 Matcha 下正文 `scrollWidth = clientWidth = 770`，滚轮能滚动，Ctrl+End 可见文末，宽表格可滚动至末列。
- 源码模式隐藏滚动条，未编辑 Markdown 打开/切换/保存保持原文。截图：`test-results/scrollbar-after.png`。

验证环境：Windows 10 x64、Node.js 24.12.0、Electron 44.4.5。

已完成：

- TypeScript 类型检查及 Vite 生产构建。
- 7 项文件与主题单元测试全部通过。
- 真实 Electron 集成测试：离线启动、本地相对路径图片、UTF-8/CRLF 原文保存、三种模式切换。
- 即时输入后立刻保存、打开当前文件并先保存修改、外部文件修改取消覆盖。
- 原生另存为、未保存新建/关闭取消、草稿恢复文件写入。
- Typora 风格 `#write` CSS 主题导入及计算样式验证。
- 素纸/夜读界面截图检查，工具栏图标本地加载；无渲染进程 JavaScript 异常。
- `release/win-unpacked/Itypora.exe` 打包后独立启动验证。

相关命令：

```sh
npm test
npm run test:desktop
node tests/packaged.mjs
```

截图保存在 `test-results/`，不纳入源码版本控制。

## 0.2 界面更新（2026-09-25）

- 参考本机 Typora 的七组菜单、默认空白编辑区与底部状态栏，移除原网页式顶栏和格式工具栏。
- 真实 Electron 菜单调用验证：标题、富文本加粗、源码加粗及撤销。
- 大纲、文件夹目录分组、专注/打字机/状态栏切换、文内查找、字号偏好验证。
- 使用用户本机 Matcha 浅色主题，验证奶油色正文背景、侧栏颜色、嵌入字体、主题正文留白和圆形任务框。
- 保留全部原有文件生命周期回归：CRLF 原文、立即保存、同文件重开、外部冲突取消、另存为、未保存关闭取消及恢复草稿。
- 截图：`test-results/itypora-reference-document.png`、`test-results/itypora-reference-outline.png`。
- Windows 0.2.0 打包后独立运行验证通过：打开参考 Markdown、导入 Matcha、字体和原生窗口截图。完整窗口截图为 `test-results/packaged-native-window.png`。
- 单文件 `Itypora 0.2.0.exe` 已实际解压启动，通过 Windows 无障碍树确认七组菜单、编辑器、源码开关和词数。Playwright 无法经便携启动器完成调试握手，因此完整自动化用 `win-unpacked/Itypora.exe` 执行；不要将两种验证混为一谈。
- 截图修复与限制见 `WINDOWS-CAPTURE.md`。本机 Typora 的部分快捷键/菜单选择未能通过自动化可靠执行，尚未完成同一篇正文在两款应用中的逐像素对照；上述正文截图来自 Itypora。

尚未完成的验收：macOS/Linux 实机、中文输入法组合输入专项、大文件性能、更多第三方主题样本、异常断电恢复全流程、签名和安装器分发。当前测试不代表 Typora 全功能对等或所有主题完全兼容。

## 0.3 偏好设置更新（2026-09-25）

- 偏好设置改为独立原生窗口，包含通用、外观、编辑器、Markdown 分类与搜索；外观页使用明暗主题下拉框，不再使用主题卡片。
- 参考 Typora 官方 [主题说明](https://support.typora.io/About-Themes/)、[外观页截图](https://support.typora.io/media/new-97/Screen%20Shot%202020-12-05%20at%2017.01.49.png) 和 [自定义 CSS](https://support.typora.io/Add-Custom-CSS/)。本机 Typora 的偏好窗口仍未能可靠自动打开，本次不宣称完成本机偏好页的逐像素对照。
- `npm test`：10 项单元测试通过。新增旧主题迁移与 ID 保持、设置持久保存、CSS 覆盖顺序、主题目录增删与错误保留、无效自定义 CSS 不覆盖有效文件。
- `node tests/desktop.mjs`：文档生命周期与模式切换回归通过，偏好设置改用独立窗口交互。
- `node tests/interface.mjs <本机 Matcha CSS>`：原生菜单、侧栏、查找、字号与 Matcha 字体/颜色测试通过。
- `node tests/preferences.mjs`：明暗系统切换、未保存文本保护、自定义 CSS 实时应用与错误提示、设置搜索、目录主题加载、重启后主题和设置保留通过。
- `node tests/packaged.mjs release/0.3.0/win-unpacked/Itypora.exe <本机 Matcha CSS>`：Windows 0.3.0 打包版独立启动、Markdown 打开、主题导入、偏好窗口和系统明暗切换通过。
- 外观页截图：`test-results/packaged-preferences.png`。测试均使用独立临时配置，未修改用户原主题、当前文档或正在运行的旧版窗口。
- 图片管理、导出配置及其偏好页仍未实现；内置配色没有打包 Typora 的原装主题。目录中手工修改 CSS 后需点击“重新加载主题”。

## 0.3.1 侧栏更新（2026-09-25）

- 文件列表与大纲隐藏横纵滚动条，保留滚动容器；长标题和目录名换行，文件名继续省略显示。
- 侧栏边界可拖动，宽度记忆范围为 200–600 px，同时至少给正文保留 320 px；缩小窗口暂时限制实际宽度，放大后恢复用户选择。
- 双击边界恢复 240 px，键盘左右方向键微调、Home/End 到边界；Esc 取消本次拖动，失去焦点/指针捕获后清理拖动状态。
- `npm run test:sidebar` 以及 `node tests/sidebar.mjs release/0.3.1/win-unpacked/Itypora.exe` 均通过：100 个文件和 100 项大纲无可见滚动条且可滚轮滚动、拖动调宽、键盘调整、取消/重置、窗口缩放约束、收起展开、重启恢复宽度、文档未被修改。
- Windows 打包版截图：`test-results/sidebar-resized.png`。测试使用临时目录，未操作用户已有窗口。

## 2026-09-25：主窗口内偏好设置

- 偏好设置使用主窗口内页面，右上角 × 和 Esc 返回编辑器，不再创建额外 BrowserWindow。
- 背景、文字、边框、选中状态与控件复用当前主题颜色；支持内置主题、导入主题直接设置 body 颜色、主题重新加载和系统外观切换。
- `npm run build`、`npm test`（10 项）、`node tests/preferences.mjs`、`node tests/interface.mjs`、`node tests/desktop.mjs` 通过。
- 偏好设置回归覆盖单窗口、右上角关闭、窄窗口、未保存文档、源码选区/滚动位置/撤销记录保留、设置搜索和重启持久化。
- 目录构建：`release/preferences-inline/win-unpacked/Itypora.exe`；`node tests/packaged.mjs release/preferences-inline/win-unpacked/Itypora.exe` 通过。
- 截图：`test-results/preferences-inline-sepia.png`、`test-results/preferences-inline-dark.png`。

## 2026-09-25：主题改为单一手动选择

- 删除独立深色主题与系统外观切换逻辑，设置只保留 `theme`，旧版 `lightTheme` 迁移为当前选择。
- 设置页和原生主题菜单均从主题目录读取选项。三种默认主题首次写入目录，不覆盖同名文件，用户删除后不会在重启时重新生成。
- `npm run build`、`npm test`（12 项）、`node tests/preferences.mjs`、`node tests/desktop.mjs` 通过；覆盖目录列表、默认主题文件保留、旧设置迁移、系统明暗变化不切换主题、菜单同步与重启持久化。
- `node tests/packaged.mjs release/manual-themes/win-unpacked/Itypora.exe` 通过。新版目录构建为 `release/manual-themes/win-unpacked/Itypora.exe`。

## 2026-09-25：扩充段落和格式菜单

- 段落菜单新增普通段落、标题升降级、表格行列与对齐、公式块、代码语言和解除围栏、五类警告框、任务完成状态、列表缩进、上下插入段落、链接引用、脚注、目录及 YAML Front Matter。
- 格式菜单新增下划线、高亮、上下标、行内公式和图片。启用对应 Markdown 渲染扩展；原有标题、强调、列表、引用等操作继续使用编辑器原生能力。
- 表格、任务、列表和代码工具按光标上下文启用；偏好设置打开时禁用正文格式操作。缩放快捷键改为 Ctrl/Cmd+Shift+= 和 Ctrl/Cmd+Shift+-，避免与标题升降级冲突。
- 源码操作使用单次可撤销替换；新增富文本操作在脱离文档的克隆上定位 Markdown 选区，保留编辑器撤销历史。定位标记不会写入正文。
- 构建、20 项单元测试、界面、桌面保存与偏好设置回归通过。
- `node tests/formatting.mjs` 验证三种编辑模式的标题、行内样式、表格行列、任务状态、缩进、代码、公式、警告框、脚注、链接引用、目录及 YAML，并检查撤销/重做和未选中内容。
- `node tests/formatting.mjs release/rich-menus/win-unpacked/Itypora.exe` 通过，包括空白文档插入表格/公式、公式实际渲染和图片语法插入。
- 新版目录构建：`release/rich-menus/win-unpacked/Itypora.exe`。

## 2026-09-25：插入表格先设置行列

- “段落 → 表格 → 插入表格…”先打开主题配色的模态设置框，默认 3 列、4 行，行数包含表头。
- 列数允许 1–50、行数允许 1–200 的整数；空值、零、负数、小数及越界值不会插入。Enter 确认，取消或 Esc 不修改文档。
- 弹窗打开前保存源码选区或富文本 Range，确认时恢复位置并执行一次可撤销插入；取消时同步恢复选区。弹窗期间阻止后台文档菜单操作。
- 构建、21 项单元测试、完整格式菜单回归通过。`node tests/table-dialog.mjs` 验证源码、即时渲染和所见即所得模式中的默认值、取消/Esc、输入校验、3×4 / 2×6 / 1×1 尺寸、前后正文保留及撤销/重做。
- `node tests/table-dialog.mjs release/table-dialog/win-unpacked/Itypora.exe` 通过；截图为 `test-results/table-dialog-light.png` 和 `test-results/table-dialog-dark.png`。
- 新版目录构建：`release/table-dialog/win-unpacked/Itypora.exe`。

## 2026-09-25：完整格式样本渲染优化

- 基于 `examples/Markdown兼容性与显示测试.md`，修复表格对齐/换行、HTML 行内标签/图片、数字公式、中文标点粗体、主题图表裁切、代码背景和复制、标题锚点。
- 新增 `src/rendering.ts` 渲染适配及 `tests/rendering.mjs`；覆盖两种富文本模式、8 个 Mermaid 图、10 处公式、窄窗口、主题切换、错误恢复及源码保留。
- 本机 Matcha 深色主题截图复核通过，特别检查 ER 图内部文字完整、代码块无叠加底色。
- `npm run build`、21 项单元测试、格式菜单、表格弹窗、偏好设置、桌面保存/恢复回归均通过。中文强调适配后重跑渲染和格式菜单测试通过。
- `node tests/rendering.mjs release/rendering/win-unpacked/Itypora.exe` 和 `node tests/packaged.mjs release/rendering/win-unpacked/Itypora.exe` 通过。
- 新版程序：`release/rendering/win-unpacked/Itypora.exe`。截图：`test-results/rendering-*.png`。
- 对照依据、验证范围及尚未完全对齐的项目见 [渲染验证记录](RENDERING-VALIDATION.md)；未宣称与 Typora 整篇逐像素一致。

## 2026-09-25：表格内容填满外框

- 修复 `display: block` 表格外框为全宽、内部匿名表格却按内容收缩的问题；为单元格提供百分比列宽，使内部列填满可用区域，同时保留宽表格的最小内容宽度和横向滚动。
- 不增加编辑器 DOM 包装、不改 Markdown 源码。现有两种编辑模式、HTML 合并单元格、主题和编辑回归通过。
- `tests/rendering.mjs` 新增真实行宽与外框宽度断言，覆盖普通窗口、680 像素窄窗口和本机 Matcha 深色主题；同时验证宽表格能实际横向滚动。
- 截图：`test-results/rendering-ir-inline-table.png`、`test-results/rendering-wysiwyg-inline-table.png`、`test-results/rendering-matcha-inline-table.png`。
- 构建目录：`release/table-width/win-unpacked/Itypora.exe`。

## 2026-09-25：标题装饰留在主题背景内

- 清除 Vditor 标题 `::before` 原有的左浮动、负边距、右内边距及小字号，防止这些标题编号样式影响导入主题的叶片装饰；主题仍可定义自身装饰样式。
- Matcha 浅色/深色 × 即时渲染/所见即所得四种组合实测通过；叶片恢复行内布局，字号与标题一致，点击标题和源码往返不改变文档。
- 截图：`test-results/heading-decoration-matcha-ir.png` 等四张；构建目录：`release/heading-decoration/win-unpacked/Itypora.exe`。

## 2026-09-25：按 Typora 截图对齐主题细节

- 修复任务复选框大小、已完成文字颜色/删除线、紧凑及宽松任务列表；嵌套子任务保留独立完成状态。
- 标准提示块使用线条图标和主题定义的标题，Matcha 显示“笔记 / 小窍门 / 划重点 / 留意 / 当心”。展示节点在编辑器解析前剥离，默认英文标题和图标不会写进源码。
- 恢复分隔线居中；表格保持全宽与局部横向滚动，改用原生内容列宽分配；行边框由主题控制。即时渲染链接、删除线匹配主题颜色。
- 构建、22 项单元测试、完整样本渲染和格式菜单回归通过。新增 `tests/theme-rendering.mjs` 验证 Matcha 浅色/深色 × 两种富文本模式、主题样式、任务编辑/保存、嵌套状态、宽松列表及撤销/重做。
- 构建目录：`release/theme-rendering/win-unpacked/Itypora.exe`；专项截图：`test-results/theme-*.png`。
- 打包版本已通过主题专项与完整格式菜单测试；测试目录删除增加重试，处理 Windows 词典文件短暂占用。

## 2026-09-25：整篇自动截图与主动渲染排查

- 对兼容性文档的 23 个编号章节及前置说明自动分段截图，覆盖 Matcha / Matcha Dark × 即时渲染 / 所见即所得，共 96 组章节记录；长章节继续截图。
- 修复裸网址/邮箱识别、引用式链接配色和标题保留、独立图片居中、目录主题样式及跳转、YAML、脚注字号、主题代码高亮和 HTML 预览字体/行内代码；兼容空提示块。
- 新增 `tests/render-details.mjs` 验证显示、交互和编辑保存；`tests/render-audit.mjs` 生成完整画廊与 Itypora 修复前后对照。保留原始样本，使用独立测试配置。
- 构建、22 项单元测试、整篇渲染、主题专项和格式菜单回归通过。新版 `release/render-audit/win-unpacked/Itypora.exe` 通过细节专项及完整渲染回归。
- 详细依据和未完全对齐项见 [整篇检查记录](RENDERING-AUDIT.md)。Typora 原生截图接口不可用，未宣称整篇逐像素一致。

## 2026-09-25：代码块原位编辑与缺失图片

- 普通代码块使用单一原生编辑框及 CSS Highlights，消除点击后源码/预览重复；高度随内容增长，保留长行横向滚动、复制、语言菜单和紧凑行号。
- 列表代码块去除重复间距、外层空白及固定 4em 缩进；缺失图片显示完整语法和路径，路径恢复有效时正常显示图片。
- 新增 `tests/code-editing.mjs`，验证两种模式、多行输入、Tab/Enter、保存、撤销/重做、100 行高度、行号、图片恢复及深色主题；原样本不变。
- 构建、22 项单元测试、格式菜单、链接图片细节专项及完整渲染回归通过。详细截图与命令见 [代码编辑验证](CODE-EDITING-VALIDATION.md)。程序目录：`release/code-editing/win-unpacked/Itypora.exe`。

## 2026-09-26：源码模式切换定位与速度

- Ctrl+/ 切换时光标跟随所在文字，并保持在屏幕上的同一高度；光标不在屏幕内时，对齐当前可见的第一个块。Lute 没有源码位置信息，按块开头的文字（仅字母、数字和汉字）在源码中顺序定位，块内再用光标附近的原文精确定位（`src/position.mjs`、`src/source-sync.ts`）。
- 进入源码模式时隐藏而不销毁编辑器；源码未修改时切回不重新渲染（约 0.13 秒，原约 3 秒）。源码修改后在同一编辑器内重新渲染（约 0.8 秒）：图表按源码、配置和宽度缓存，逐个渲染时让出主线程，撤销栈对比限时 0.05 秒（原默认 1 秒）。编辑器创建时不再先用未适配的 Lute 渲染一遍。
- 编辑后 Vditor 重建目录会给每项加一个无尺寸的 svg，导致大片空白，现已去除。
- 新增 `tests/source-sync.mjs`（两种富文本模式各 5 处往返定位、可见块对齐、未修改不重渲染、源码修改后的渲染与保存）和 `tests/position.test.cjs`；`tests/render-details.mjs` 增加编辑、撤销后的目录检查。
- 33 项单元测试和 12 组界面测试通过；`release/source-sync/win-unpacked/Itypora.exe` 通过 source-sync、save-preserve、render-details、rendering。

## 2026-09-26：源码模式按 Markdown 语法着色

- 源码模式改用 CodeMirror 5（Typora 源码模式同样基于 CodeMirror），沿用 Typora 的结构和类名：`#typora-source`、`.cm-s-typora-default`、`cm-header1`、`line-cm-header`、`cm-block-start`、`cm-table-row` 等，导入主题中针对源码模式的样式直接生效。
- 与 Typora 源码模式一致：标题连同 `#` 放大加粗并使用主题标题色，`**` 与粗体文字同色，Front Matter 分隔线变灰，代码块按语言高亮，引用分层着色，链接、图片、表格行和公式块有各自样式；只在当前行显示行号；字体跟随主题和偏好设置。
- Markdown 着色使用 CodeMirror markdown 模式的修改副本（`src/vendor/codemirror-markdown.mjs`）：原版在中文紧跟 `**` 等情况下无法正确闭合强调，按 Typora 的结果调整。用参考文档逐行比对 Typora 的着色类名，755 行中 9 行不同，均为有意保留或 Typora 自身的解析特例。
- 输入采用 CodeMirror 的 textarea 方式。contenteditable 方式由浏览器直接改写行内容，约 80 毫秒后才读回；其间窗口缩放等重绘会抛出异常，甚至把已删除的文字重新写回。textarea 方式下中文输入法组字（包括替换跨行选区、组字中缩放窗口）已验证正常。代价是源码模式不提供浏览器拼写检查，渲染模式照常。
- 顺带修复：保存或切换模式前先读取尚未处理的输入；关闭偏好设置后源码选区和滚动位置恢复；源码光标移动时同步菜单可用状态（表格、代码、任务、列表操作）；偏好设置“自定义 CSS”在文件读取完成前可以输入，读取结果会覆盖已输入内容，现改为读取完成前只读。
- 新增 `tests/source-mode.test.cjs`（着色类名）；`tests/theme-rendering.mjs` 检查 Matcha 下源码模式标题字号、粗体、字体和行号；界面测试改用 CodeMirror 接口（`tests/source-editor.mjs`）。
- 36 项单元测试和 12 组界面测试通过，`tests/preferences.mjs` 连续 12 次通过；`release/source-mode/win-unpacked/Itypora.exe` 通过 packaged 及 source-sync、save-preserve、code-editing、rendering、render-details、theme-rendering、formatting、desktop、table-dialog、sidebar。
