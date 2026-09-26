# Windows 10 截图兼容工具

## 本机诊断

- Windows 10 Pro，build 19045。
- Codex 26.917.71314，内置更新检查返回 `up_to_date`。
- Computer Use `get_window_state` 的文字读取正常，截图连续失败：
  `SetIsBorderRequired failed: 不支持此接口 (0x80004002)`。
- `IsBorderRequired` 从 Windows build 20348 才开始提供；微软将 `0x80004002` 定义为 `E_NOINTERFACE`。
- 上游已有相同问题报告。该报告属于用户反馈，不能视作修复版本承诺。

结论：当前内置截图路径与本机 Windows API 不兼容。这里提供独立的截图替代路径，**没有修改或修复 Codex 的内置二进制组件**，也没有修改系统权限、隐私设置或 Typora。

## 实现

`scripts/capture-window.cjs` 使用项目已有的 Electron `desktopCapturer`。

1. 普通窗口模式：按已确认的原生窗口 ID 匹配窗口图像，适合文档正文和侧栏。
2. 菜单模式：截取目标显示器后，仅保存目标窗口可见范围。`window-bounds.py` 在实际截图时读取物理坐标并确认目标仍在前台，避免复用旧坐标。
3. `--wait-for` 允许截图进程提前就绪，再展开菜单、触发截图，避免启动 Electron 导致菜单失焦消失。

窗口 ID 必须从当前窗口枚举中获取，不要复用已经关闭的窗口 ID。菜单超出窗口边界时，超出的部分会被裁掉；先确保窗口完整位于屏幕内。被遮挡、跨屏或 DPI 改变时，应重新验证捕获结果。

## 用法

普通窗口截图（将示例 ID 替换为当前 Typora 窗口 ID）：

```powershell
& './node_modules/.bin/electron.cmd' scripts/capture-window.cjs --window=9903688 --out=test-results/typora-reference/main.png
```

菜单截图：通过 `--python=<Python可执行文件>` 自动读取坐标，并提供一个尚不存在的 `--wait-for=<触发文件>`。截图进程输出 `Capture ready` 后，在目标应用内展开菜单，再创建触发文件。输出目录及触发文件均放在 `test-results/typora-reference/`。进程最多等待 60 秒，截图后自行退出。

使用 `Start-Process` 启动截图进程时须使用 `-WindowStyle Hidden`。该工具本身不点击、不输入、不访问网络。

## 已验证

- Typora 主窗口截图成功。
- Typora“视图”菜单完整截图成功，并与可访问性菜单项交叉核对。
- Typora“主题”菜单截图成功，可确认本机当前主题为 Matcha。
- 截图位于 `test-results/typora-reference/`，不纳入源码发布。

## 来源

- [Microsoft：IsBorderRequired 的最低版本](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession.isborderrequired)
- [Microsoft：COM 错误码](https://learn.microsoft.com/en-us/windows/win32/com/com-error-codes-1)
- [相同上游问题 #25178](https://github.com/openai/codex/issues/25178)
- [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
