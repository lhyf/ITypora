# 参与贡献

感谢你愿意改进 Itypora！提交 Issue 和 Pull Request 前请先阅读下面的约定。

## 报告问题

- 在 [Issues](https://github.com/lhyf/ITypora/issues) 中搜索是否已有相同问题。
- 使用 Bug 模板，写明系统及版本、Itypora 版本、编辑模式（即时渲染 / 所见即所得 / 源码）、所用主题，以及能复现问题的最小 Markdown 片段。
- 与 Typora 显示不一致的问题，最好附上两边的截图。
- 安全问题请不要公开提交，按 [SECURITY.md](SECURITY.md) 私下报告。

## 开发环境

需要 Node.js 22.12 或更高版本（开发使用 Node.js 24）和 Git。

```sh
git clone https://github.com/lhyf/ITypora.git
cd ITypora
npm ci
npm run desktop    # 构建并启动桌面版
```

`npm run build` 会先执行 `scripts/assets.mjs`，把 Vditor、MathJax 等离线资源复制到 `public/vendor/`（不纳入版本控制），再进行类型检查和 Vite 构建。

主要目录：

| 目录 | 内容 |
| --- | --- |
| `electron/` | 主进程：窗口、菜单、IPC、文件读写、主题编译、导出、本地图片协议 |
| `src/` | 渲染进程：编辑器挂载、渲染修饰（`rendering.ts`）、源码模式、导出（`export.ts`）、放大查看、样式 |
| `scripts/` | 资源准备、Vditor 构建时补丁（`vditor-patch.mjs`） |
| `tests/` | `*.test.cjs` 为 Node 单元测试，其余 `*.mjs` 通过 Playwright 驱动真实 Electron 窗口 |
| `examples/` | 完整格式样本 `Markdown兼容性与显示测试.md`，大部分渲染测试以它为依据 |

## 代码约定

- 使用 TypeScript（渲染进程）和 CommonJS（主进程），与周围代码保持一致的命名、注释密度和写法。
- 渲染进程运行在沙箱中，只能通过 `electron/preload.cjs` 暴露的受限 IPC 访问文件；不要放宽 `contextIsolation`、`sandbox` 或页面 CSP。
- 不要在仓库中加入 Typora 的程序代码、素材或内置主题，也不要加入许可证不明的第三方主题。
- 保存逻辑要保证“不修改就不改变文件”：未编辑的内容必须逐字节保留（见 `src/preserve.mjs` 和 `tests/save-preserve.mjs`）。

## 测试

提交前至少运行：

```sh
npm test
npm run build
```

修改了哪部分，就运行对应的集成测试（它们会打开真实窗口，运行期间请勿操作鼠标键盘）：

| 修改范围 | 测试 |
| --- | --- |
| 文件读写、模式切换、保存 | `node tests/desktop.mjs`、`node tests/save-preserve.mjs` |
| 渲染、主题、图表、公式 | `node tests/rendering.mjs`、`node tests/render-details.mjs`、`node tests/theme-rendering.mjs` |
| 菜单与格式操作 | `node tests/formatting.mjs`、`node tests/table-dialog.mjs` |
| 源码模式 | `node tests/source-sync.mjs`、`node tests/code-editing.mjs` |
| 导出 | `node tests/export.mjs` |
| 图片路径 | `node tests/image-paths.mjs` |
| 放大查看 | `node tests/zoom-viewer.mjs` |
| 侧栏、偏好设置 | `node tests/sidebar.mjs`、`node tests/preferences.mjs` |

部分测试会用本机 Typora 的第三方主题 Matcha（`%APPDATA%/Typora/themes/matcha.css`、`matcha-dark.css`）与 Typora 对照：`rendering`、`theme-rendering`、`export`、`zoom-viewer` 没有该主题时跳过相关部分；`code-editing` 和 `render-details` 需要它。

集成测试也可以针对打包后的程序运行，例如 `node tests/export.mjs release/win-unpacked/Itypora.exe`。

## 提交 Pull Request

1. 从 `master` 新建分支，一个 PR 只做一件事。
2. 为修复或新功能补充测试；用户可见的变化写进 [CHANGELOG.md](CHANGELOG.md) 顶部的 `未发布` 小节（没有就新建 `## [Unreleased]`）。
3. 确认 GitHub Actions 在三个系统上都通过。
4. PR 描述中说明改了什么、为什么改、如何验证；界面变化请附截图。

## 发布新版本

发布由 GitHub Actions 自动完成（[`.github/workflows/build.yml`](.github/workflows/build.yml)），维护者只需：

1. 修改 `package.json` 的 `version`（例如 `0.4.1`），运行一次 `npm install --package-lock-only` 同步 `package-lock.json`。
2. 在 [CHANGELOG.md](CHANGELOG.md) 中把本次变化整理为 `## [0.4.1] - 日期` 小节，这段内容会成为 Release 说明。
3. 提交并推送到 `master`，等待 CI 通过。
4. 打标签并推送：

   ```sh
   git tag v0.4.1
   git push origin v0.4.1
   ```

5. Actions 会校验标签与 `package.json` 版本一致，在 Windows、macOS、Linux 上打包，然后创建名为 `Itypora v0.4.1` 的 Release 并附上全部安装包。标签中带 `-`（如 `v0.5.0-beta.1`）时标记为预发布。

如果某个系统打包失败，Release 不会创建；修复后删除并重新推送同名标签即可：

```sh
git tag -d v0.4.1
git push origin :refs/tags/v0.4.1
git tag v0.4.1
git push origin v0.4.1
```

### 代码签名（可选）

目前安装包未签名：Windows 没有证书，macOS 使用临时签名（`build.mac.identity: "-"`）。有证书后：

- **Windows**：在仓库 Secrets 中添加 `CSC_LINK`（证书 base64 或下载地址）和 `CSC_KEY_PASSWORD`，并在工作流的打包步骤中传入。
- **macOS**：删除 `package.json` 中的 `"identity": "-"`，添加 `CSC_LINK`、`CSC_KEY_PASSWORD`，以及公证所需的 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`，并开启 `hardenedRuntime`。

详见 electron-builder 的 [代码签名文档](https://www.electron.build/code-signing)。

## 许可证

提交的贡献将以本项目的 [MIT 许可证](LICENSE) 发布。
