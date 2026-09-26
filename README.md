# Itypora

[![Build](https://github.com/lhyf/ITypora/actions/workflows/build.yml/badge.svg)](https://github.com/lhyf/ITypora/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/lhyf/ITypora?include_prereleases)](https://github.com/lhyf/ITypora/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简体中文 | [English](README.en.md)

本地优先的 Markdown 桌面编辑器：即时渲染、所见即所得、源码三种编辑模式，可以直接导入 Typora 的 CSS 主题，导出 HTML 和 PDF。支持 Windows、macOS 和 Linux。

Itypora 基于 Electron 与 Vditor 独立实现，使用自己的界面和素材，**与 Typora 项目没有任何关联**。

![Itypora 浅色主题](docs/images/screenshot-light.png)

<details>
<summary>深色主题截图</summary>

![Itypora 深色主题](docs/images/screenshot-dark.png)

</details>

## 下载安装

到 [Releases](https://github.com/lhyf/ITypora/releases) 页面下载最新版本：

| 系统 | 文件 |
| --- | --- |
| Windows 10/11 x64 | `Itypora-<版本>-win-x64-setup.exe`（安装版）或 `Itypora-<版本>-win-x64-portable.exe`（便携版，免安装） |
| macOS（Apple 芯片） | `Itypora-<版本>-mac-arm64.dmg` |
| macOS（Intel） | `Itypora-<版本>-mac-x64.dmg` |
| Linux x64 | `Itypora-<版本>-linux-x86_64.AppImage` 或 `Itypora-<版本>-linux-amd64.deb` |

安装包目前没有做商业代码签名，首次运行时系统可能拦截：

- **Windows**：SmartScreen 提示“已保护你的电脑”时，点“更多信息 → 仍要运行”。
- **macOS**：把 Itypora 拖进“应用程序”后，在终端执行一次
  `xattr -dr com.apple.quarantine /Applications/Itypora.app`，之后即可正常打开。
- **Linux**：AppImage 需要先 `chmod +x Itypora-*.AppImage`。部分发行版（如 Ubuntu 24.04）限制了沙箱，启动报 sandbox 错误时可加 `--no-sandbox` 参数，或改用 `.deb` 安装包（`sudo apt install ./Itypora-*.deb`）。

## 功能

**编辑**

- 即时渲染、所见即所得、独立源码三种模式。Ctrl+/ 切换源码时，光标和屏幕位置保持对应；源码未修改时切回不重新渲染。
- 源码模式与 Typora 一样按 Markdown 语法着色：标题、粗体/斜体/删除线、代码块语言高亮、引用、列表、链接、表格和 YAML Front Matter；使用与 Typora 源码模式相同的 CodeMirror 类名，导入主题里的源码模式样式直接生效。
- 标题、列表、任务列表、表格、引用、代码块、数学公式、Mermaid 等图表、脚注、目录、GitHub 风格提示块（`> [!NOTE]`）。
- 丰富的段落菜单：标题升降级、段落转换、表格行列与对齐、公式块、代码语言、提示块、任务状态、列表缩进、段落插入、链接引用、脚注、目录和 YAML Front Matter。
- 格式菜单：加粗、斜体、下划线、删除线、高亮、上下标、行内代码、行内公式、链接和图片；三种模式共用，表格、代码、任务和列表操作按光标上下文启用。
- 插入表格时先设置列数和行数（默认 3 列、4 行，含表头），Enter 确认、Esc 取消，支持撤销。
- 双击流程图、时序图等图表，数学公式或图片，在窗口内放大查看：滚轮以指针为中心缩放、拖动平移，键盘 +/- 缩放、0 适应窗口、1 实际大小、Esc 关闭。图表和公式保持矢量，放大后依然清晰。

**文件与界面**

- 打开文件夹，列表或目录分组浏览其中的 Markdown 文件；最近文档、文档大纲、文内查找、字数统计。
- 专注模式、打字机模式；侧栏可拖动调宽，宽度重启后保留。
- 七组原生菜单：文件、编辑、段落、格式、视图、主题、帮助。
- 主窗口内的偏好设置：通用、外观、编辑器、Markdown 四个分类，支持搜索，设置即时生效。

**导出**（文件 → 导出）

- **HTML**：单个文件，内嵌主题样式、字体和本地图片，图表和公式为 SVG，不含脚本，可以直接发给别人用浏览器打开。链接、目录和脚注可跳转；与 Typora 一致，脚注集中在文末，`<details>` 折叠块可展开，HTML 注释和 YAML Front Matter 不显示。
- **PDF**：A4，整页保留主题底色，带标题书签和可点击链接，图表、图片、代码块等尽量不跨页断开。
- 源码模式下同样可以导出，导出内容为当前（包括未保存的）文本。

**离线可用**：编辑器、解析器、MathJax、Mermaid 等渲染资源都随应用打包，不依赖 CDN。

## 主题

Itypora 可以导入为 Typora 编写的 CSS 正文主题，也自带素纸、暖砂、夜读三个配色。

1. 保持主题原来的文件结构，例如 `my-theme.css`、`my-theme/fonts/`。
2. 点击“主题 → 导入 CSS 主题…”，选择入口 `.css` 文件。本地 `@import`、同目录及子目录中的图片和字体会一起打包进主题副本，原文件不变。
3. 通过“主题”菜单或“偏好设置 → 外观 → 当前主题”切换。主题由用户手动选择，不随系统明暗切换。
4. “打开主题文件夹”可直接管理 Itypora 用户数据目录中的 `themes`，复制进去后“重新加载主题”即可。
5. “自定义 CSS”编辑 `base.user.css`，对所有主题生效；也可以用 `主题名.user.css` 单独覆盖某个主题。加载顺序为主题 CSS → `base.user.css` → `主题名.user.css`；字号、字体、宽度的显式偏好设置优先于主题。

兼容 `#write`、标准元素、正文 CSS 变量、字体和任务列表选择器，常用的背景、文字、侧栏和强调色变量会映射到应用界面。已用 Matcha 等主题与 Typora 逐项对照，但**不承诺所有主题与 Typora 像素级一致**。远程 `@import`、远程字体和图片会被跳过并提示；引用父目录、绝对路径和循环导入会报错；单个资源上限 8 MB，总计 20 MB。第三方主题不随安装包分发，使用时请遵守主题自身的许可证。

主题编写参考 Typora 的 [About Themes](https://support.typora.io/About-Themes/) 与 [Add Custom CSS](https://support.typora.io/Add-Custom-CSS/)。

## 保存与数据

- 文档未修改时，切换模式和保存都保留原文，包括 BOM 和 CRLF。在即时渲染/所见即所得模式中编辑后，只有被编辑的块由编辑引擎重新写出，其余内容逐字节保留；撤销回原样后保存，文件与原文一致。被编辑的块内部，空白和部分写法可能被规范化（例如表格重新对齐）。
- 对自定义 Markdown 扩展或复杂的内嵌 HTML，建议在源码模式中编辑。
- 支持最大 10 MB 的 UTF-8 文档；UTF-16、其他编码和二进制文件会明确拒绝打开。
- 写入临时文件后原子替换；每秒保存一份恢复草稿（独立副本，不会覆盖原文件）。外部程序修改或删除当前文档后，保存时会提示覆盖或取消。
- 本地图片与 Typora 一样按文档位置解析：同一目录、子目录、上级目录（如 `chapters/ch01.md` 引用 `../assets/a.png`）以及绝对路径（`E:\pics\a.png`、`E:/pics/a.png`、`file:///E:/pics/a.png`）都能显示。支持 PNG/JPEG/GIF/WebP/AVIF，单张 20 MB 以内。
- 文件夹列表最多 500 个 Markdown 文件、8 层目录，跳过隐藏目录、符号链接和 `node_modules`。

## 快捷键

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 新建 | Ctrl+N | Cmd+N |
| 打开 | Ctrl+O | Cmd+O |
| 保存 | Ctrl+S | Cmd+S |
| 另存为 | Ctrl+Shift+S | Cmd+Shift+S |
| 源码切换 | Ctrl+/ | Cmd+/ |
| 侧栏切换 | Ctrl+Shift+L | Cmd+Shift+L |
| 大纲 | Ctrl+Shift+1 | Cmd+Shift+1 |
| 查找 | Ctrl+F | Cmd+F |
| 偏好设置 | Ctrl+, | Cmd+, |
| 专注模式 / 打字机模式 | F8 / F9 | F8 / F9 |
| 普通段落 | Ctrl+0 | Cmd+0 |
| 提升 / 降低标题级别 | Ctrl+= / Ctrl+- | Cmd+= / Cmd+- |
| 公式块 | Ctrl+Shift+M | Cmd+Shift+M |
| 下划线 | Ctrl+U | Cmd+U |
| 高亮 | Ctrl+Shift+H | Cmd+Shift+H |
| 界面放大 / 缩小 | Ctrl+Shift+= / Ctrl+Shift+- | Cmd+Shift+= / Cmd+Shift+- |
| 放大查看图表 / 公式 / 图片 | 双击 | 双击 |

Esc 退出专注模式和放大查看。

## 从源码构建

需要 Node.js 22.12 或更高版本（开发使用 Node.js 24）。

```sh
git clone https://github.com/lhyf/ITypora.git
cd ITypora
npm ci
npm run desktop     # 构建并启动桌面版
```

- `npm run dev`：在浏览器中预览界面（文件夹、草稿恢复、主题导入等功能需要桌面版）。
- `npm run pack`：生成可直接运行的目录，例如 Windows 的 `release/win-unpacked/Itypora.exe`。
- `npm run dist`：在当前系统上生成安装包（Windows NSIS/便携版、macOS DMG/ZIP、Linux AppImage/DEB）。

首次安装依赖和打包需要联网下载 Electron；打包后的应用可以完全离线使用。

## 测试

```sh
npm test                 # 单元测试
npm run test:desktop     # 以下为真实 Electron 窗口的集成测试
npm run test:interface
npm run test:preferences
npm run test:formatting
npm run test:table-dialog
npm run test:rendering
npm run test:sidebar
npm run test:zoom
npm run test:export
npm run test:images
```

完整格式样本在 `examples/Markdown兼容性与显示测试.md`，已验证的范围与已知差异见 [渲染验证记录](docs/RENDERING-VALIDATION.md) 和 [验证记录](docs/VALIDATION.md)。

## 自动构建与发布

仓库使用 GitHub Actions（[`.github/workflows/build.yml`](.github/workflows/build.yml)）：

- 每次推送和 Pull Request：在 Windows、macOS、Linux 上运行单元测试、构建并打包，安装包可在该次运行的 Artifacts 中下载；另外运行桌面集成测试。
- 推送 `v*` 标签（如 `v0.4.0`）：三个系统打包完成后自动创建 GitHub Release，附上全部安装包，发布说明取自 [CHANGELOG.md](CHANGELOG.md) 中对应版本的内容。

发布步骤见 [CONTRIBUTING.md](CONTRIBUTING.md#发布新版本)。

## 项目结构

```text
electron/     主进程：窗口、菜单、受限 IPC、本地文件、主题编译、导出
src/          渲染进程：编辑模式、渲染修饰、源码模式、导出、样式
scripts/      离线编辑器资源准备、Vditor 构建时补丁
tests/        单元测试与真实 Electron 集成测试
examples/     完整格式样本与示例主题
docs/         验证记录与路线图
```

技术栈：Electron、TypeScript、Vite、Vditor、CodeMirror 5、MathJax、PostCSS。

## 已知限制

- 安装包未签名，macOS 未做公证，也没有自动更新。
- 远程图片、SVG 文档图片尚未开放；导出暂不支持纸张、页边距、页眉页脚等选项。
- 日常开发和完整测试在 Windows 上进行；macOS、Linux 版本由 CI 构建并运行部分集成测试，欢迎反馈在这些系统上遇到的问题。

## 参与贡献

欢迎提交 Issue 和 Pull Request，开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。发现安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

[MIT](LICENSE)。第三方组件的许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

Typora 是其所有者的商标。Itypora 是独立项目，不包含 Typora 的任何程序代码、素材或内置主题。
