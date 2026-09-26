# 0.2 界面参考与实现边界

参考环境：用户本机 Windows 10 上的 Typora，当前为 Matcha 浅色主题。通过应用菜单的无障碍树、窗口截图和用户主题 CSS 查看界面约定，没有读取或复制 Typora 程序实现。

| 部位 | 0.2 实现 |
| --- | --- |
| 主窗口 | 原生菜单、空白正文、26 px 底部状态栏；移除品牌块、面包屑、网页式工具条和三模式按钮条 |
| 文件 | 新建、打开、打开文件夹、最近文档、保存、另存为、偏好设置、关闭 |
| 编辑 | 撤销/重做、剪切/复制/粘贴、全选、查找及前后查找 |
| 段落 | 六级标题、引用、代码块、表格、三类列表、水平线 |
| 格式 | 加粗、斜体、删除线、行内代码、链接 |
| 视图 | 侧栏、大纲、文件列表/目录分组、源码、专注、打字机、状态栏、统计、全屏及缩放 |
| 主题 | 内置三种配色、导入 CSS、原生主题菜单与主题管理窗口 |
| 帮助 | 本地 Markdown 快捷参考、关于窗口 |
| 偏好设置 | 编辑模式、字号、正文宽度；保存到本地配置 |

Matcha 验证覆盖正文背景、标题/段落/引用/表格、字体、任务框、正文留白及侧栏颜色。字体与图片由主题导入器嵌入本地主题副本，第三方主题不打入发行包。

仍有差异：菜单只包含已实现的操作，不是 Typora 完整菜单复制；原生窗口装饰由系统负责。文件树目前按目录分组，尚无折叠和文件管理。CodeMirror 专有装饰、全部 Markdown 扩展、多文档、导出打印、完整偏好设置仍在后续范围。模式重建不保留跨模式撤销栈与光标位置。

本轮可靠获取了七组菜单内容与空白窗口参考。Typora 的部分快捷键和菜单选择在当前自动化环境中未能可靠执行，因此尚无同一篇正文的双应用逐像素对照结果。

检验材料：

- `test-results/typora-reference/main.png`：Typora 空白窗口。
- `test-results/typora-reference/theme-menu.png`：Typora 主题菜单。
- `tests/fixtures/参考文档.md`：本轮正文测试材料。
- `test-results/itypora-reference-document.png`：Itypora 导入 Matcha 后的正文。
- `test-results/itypora-reference-outline.png`：Itypora 大纲。
- `test-results/packaged-native-window.png`：打包后的 Itypora 窗口与原生菜单。

截图工具在 Windows 10 上的限制与替代捕获方法见 `WINDOWS-CAPTURE.md`。
