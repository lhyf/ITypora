

---

### 下载 / Downloads

| 系统 System | 文件 File |
| --- | --- |
| Windows 10/11 x64 | `Itypora-<版本>-win-x64-setup.exe`（安装版 installer）或 `…-portable.exe`（便携版 portable） |
| macOS Apple 芯片 / Apple silicon | `Itypora-<版本>-mac-arm64.dmg` |
| macOS Intel | `Itypora-<版本>-mac-x64.dmg` |
| Linux x64 | `Itypora-<版本>-linux-x86_64.AppImage` 或 / or `…-linux-amd64.deb` |

安装包未做商业代码签名 / The installers are not code-signed:

- **Windows**：SmartScreen 提示时点“更多信息 → 仍要运行”。 If SmartScreen warns, choose *More info → Run anyway*.
- **macOS**：把 Itypora 拖入“应用程序”后，在终端执行 / after moving Itypora to Applications, run:
  `xattr -dr com.apple.quarantine /Applications/Itypora.app`
- **Linux AppImage**：`chmod +x Itypora-*.AppImage` 后运行；若提示 sandbox 错误，加 `--no-sandbox` 启动。 Make it executable; if it reports a sandbox error, start it with `--no-sandbox`.
