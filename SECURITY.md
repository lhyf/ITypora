# 安全策略 / Security Policy

## 支持的版本 / Supported versions

只为最新发布的版本提供安全修复。 Security fixes are made for the latest release only.

## 报告漏洞 / Reporting a vulnerability

请不要在公开 Issue 中披露漏洞。请通过 GitHub 的 [私下报告漏洞](https://github.com/lhyf/ITypora/security/advisories/new) 功能提交，写明受影响的版本、系统、复现步骤（例如能触发问题的 Markdown 文件或主题），以及可能的影响。

Please do not disclose vulnerabilities in public issues. Report them privately through GitHub's [private vulnerability reporting](https://github.com/lhyf/ITypora/security/advisories/new) with the affected version, operating system, steps to reproduce (such as a Markdown file or theme that triggers the problem) and the possible impact.

我们会尽快确认并告知处理进度。 We will acknowledge the report and keep you informed of the progress.

## 范围 / Scope

Itypora 会打开来自他人的 Markdown 文档和 CSS 主题，下列问题尤其值得报告：

- 文档或主题中的内容执行脚本、访问网络或读取图片以外的本地文件；
- 绕过渲染进程沙箱或受限 IPC；
- 导出的 HTML 中出现可执行的脚本。

Itypora opens Markdown documents and CSS themes written by others. Of particular interest are content in a document or theme that runs scripts, reaches the network or reads local files other than images, escapes the renderer sandbox or the restricted IPC, and executable script in exported HTML.
