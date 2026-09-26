# 实现范围与后续路线

目标是提供可以独立维护、支持跨平台、符合团队写作习惯的 Markdown 桌面软件。首版验证核心编辑、文档生命周期和主题正文兼容，不将完整 Typora 功能对等作为已经完成的事实。

## 首版架构选择

Electron 统一三个平台的 Chromium 渲染环境，减少同一 CSS 在不同 WebView 上的差异，代价是安装包和运行内存较大。主进程负责文件与主题资源，沙箱渲染进程通过按功能列出的 IPC 调用请求操作。禁止页面直接访问 Node.js，阻止任意导航和新窗口，默认不加载远程资源。

Vditor 的即时渲染模式适合“输入 Markdown，在原位置看到排版”的交互。保留独立源码模式，未改动的原始文件与编辑器序列化结果分开记录，减少仅打开或切换模式就改变文件的情况。

主题编译读取公开 CSS 约定：正文容器 `#write`、标准 HTML 元素和 CSS 变量。PostCSS 展开依赖，嵌入本地字体和图片，并限定样式作用范围。没有复制 Typora 的程序代码或内置主题。

## 第二阶段：日常使用可靠性

- 剪贴板图片、拖入图片、相对路径策略和附件管理。
- 替换、跨文件搜索、可折叠文件树增删改和文件系统监听（0.2 已有文内查找和目录分组视图）。
- 多文档、独立撤销历史、外部修改合并、历史版本。
- 中文输入法、多光标位置恢复、大文件与长表格性能基准。
- 数学公式、Mermaid、脚注、YAML、自定义 HTML 的完整往返与安全回归语料。

## 第三阶段：更深的主题兼容

- 建立有授权来源的真实主题样本集，逐项记录选择器覆盖率。
- 适配任务列表、代码块、公式、脚注与标记字符的 `.md-*` 结构。
- 做代码高亮类名映射，明确 CodeMirror/Highlight.js 和 MathJax/KaTeX 的差异。
- 增加主题兼容报告、主题移除与更新、导出样式一致性测试。
- 不以“成功导入 CSS”等同于“与 Typora 完全一致”。

## 第四阶段：公司内部分发

- PDF/HTML 导出、打印样式及按需 Pandoc 文档转换。
- Windows 签名、macOS 签名/公证、Linux 主流发行版验证。
- 自动更新、版本发布、漏洞依赖更新与第三方许可证清单。
- 以真实团队样例完成 Windows/macOS/Linux 快捷键、输入法和显示缩放验收。

## 参考资料

- Typora 授权：https://support.typora.io/License-Agreement/
- Typora 主题规范：https://theme.typora.io/doc/Write-Custom-Theme/
- Vditor：https://github.com/Vanessa219/vditor
- Electron 安全指南：https://www.electronjs.org/docs/latest/tutorial/security
