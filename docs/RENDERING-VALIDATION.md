# Markdown 渲染验证

代码块原位编辑、列表间距及缺失图片的新修复见 [代码编辑验证](CODE-EDITING-VALIDATION.md)，程序为 `release/code-editing/win-unpacked/Itypora.exe`。

最新整篇检查、逐节结果和剩余差异见 [渲染检查报告](RENDERING-AUDIT.md)。最新程序为 `release/render-audit/win-unpacked/Itypora.exe`；新增 `test:render-details` 与 `test:render-audit`，覆盖链接/图片/HTML/目录/标题保存及四组合逐节截图。

样本：`examples/Markdown兼容性与显示测试.md`。测试只读取样本，在临时用户目录运行，不覆盖样本、现有主题或日常配置。

执行：`npm run test:rendering`。验证已打包程序：`node tests/rendering.mjs release/rendering/win-unpacked/Itypora.exe`。

主题截图专项：`npm run test:theme-rendering`；可传入新版程序路径 `node tests/theme-rendering.mjs release/theme-rendering/win-unpacked/Itypora.exe`。此专项读取本机 Matcha 浅色、深色主题，主题不存在时会明确跳过。

## 任务、提示块、分隔线与表格对照

- 任务框继承正文字号，完成任务使用主题的淡色及删除线；子任务独立显示状态，兼容紧凑列表和包含段落的宽松列表。
- 标准提示块使用随主题着色的线条图标，并提供 Typora 的标题样式入口；Matcha 的五种中文标题直接来自用户主题。自定义标题保留原生编辑能力，默认生成标题不写入 Markdown。
- 分隔线恢复块级布局，使主题的百分比宽度及左右自动边距生效。
- 表格通过空的 CSS caption 为内部表格提供可用宽度，按原生内容算法分配列宽；替代上一版的百分比单元格宽度，保持填满外框及宽表局部滚动。去除编辑器默认行实线，由主题控制单元格边框。
- 主题链接和删除线规则同时匹配即时渲染模式的原生节点。
- 新增四组合截图、任务勾选/编辑/保存、父子任务状态隔离、源码无装饰节点、宽松任务列表及撤销/重做验证。截图：`test-results/theme-*.png`。

## 本轮修复

| 内容 | 修复及验证 |
| --- | --- |
| 表格 | 表头和正文分别保留左、中、右对齐；普通单元格允许换行，宽表在自身范围滚动；HTML 的 rowspan / colspan 保留 |
| HTML 行内内容 | 补齐 mark、sub、sup、u、kbd、br、img 等预览，包含嵌套标签；本地 HTML 图片沿用文档相对路径，width=240 生效；预览经过 DOMPurify 清理，保存使用原标签源码 |
| 数学公式 | 启用数字开头的行内公式；改用与 Typora 相同的 MathJax 4.1 配置，样本中 10 处公式的位置、尺寸和行内断行与 Typora 一致；错误公式保留 MathJax 的红字提示 |
| Mermaid | 8 个示例全部生成 SVG：两个流程图、ER、时序、类、状态、甘特、饼图；字体加载后绘制；读取主题 Mermaid 配置并在切换主题时重新绘制；单个语法错误不影响后续图表，修正后恢复 |
| 主题适配 | 为代码块、提示块、表格、图表添加对应主题样式入口；暗色代码高亮随当前选中主题变化；隔离正文段落间距对图表内部文字的影响；消除代码块嵌套的行内代码底色 |
| 文字 | 恢复中文字体可合成的粗体、斜体；支持 `**检查点：**文字` 的中文标点粗体，代码和转义内容不受影响；明确四至六级标题层次；HTML 实体按正文显示 |
| 交互 | 标题锚点在编辑区内定位；代码复制按钮改用事件监听，不依赖被 CSP 禁用的 HTML 事件属性 |

## 回归覆盖

- 即时渲染、所见即所得两种模式，50 个标题、8 个图表、10 处公式，以及任务、提示、脚注、目录、图片和 HTML 表格。
- 浅色、深色、680 像素窄窗口；本机存在 `Typora/themes/matcha-dark.css` 时额外导入验证，原主题不修改也不随应用分发。
- 切换模式、主题前后原 Markdown 完全一致且不会产生未保存状态；修改正文后，HTML 标签、图片路径、公式、图表、脚注、注释和 YAML 仍保留。
- HTML 中的事件属性不会进入预览；故意损坏的 Mermaid 有错误提示，邻近图表正常。
- 截图保存在 `test-results/rendering-*.png`。代码复制验证会恢复测试前剪贴板。

## Typora 对照范围与仍存在的差异

本轮使用本机 Typora 界面截图、用户实际 Matcha 主题 CSS，以及官方语法说明作为参照。尚未完成同尺寸、同滚动位置的整篇逐像素对比，不能据此声称所有渲染与 Typora 完全相同。

- 公式与 Typora 同用 MathJax 4.1，但未包含 Typora 附带的第三方 xypic 扩展，`\xymatrix` 等交换图语法不可用。[Typora 数学支持](https://support.typora.io/Math/)
- 样本 `<details>` 中的空行会拆开 HTML 块，因此折叠标题下的 Markdown 段落不属于同一个 HTML 折叠块。无空行的完整 HTML 折叠块才会整体折叠；这是 Typora 文档也明确说明的限制。[Typora HTML 支持](https://support.typora.io/HTML/)
- 定义列表仍保留原文；脚注的编辑展示、代码高亮使用不同编辑引擎，未做完全复刻。标准提示图标/标题已按本次截图和实际主题适配，自定义提示标题仍沿用原生编辑方式。
- Mermaid 版本及布局算法可能与本机 Typora 不同；本轮对齐了主题配置、显示尺寸与可读性。[Typora 图表支持](https://support.typora.io/Draw-Diagrams-With-Markdown/)
- 样本的缺失图片和远程图片为预期失败项。现有图片目录/来源限制继续有效，不能将这两项记为本地 PNG 加载故障。

这些差异独立记录，不混入“通过”项。后续调整解析引擎时应继续运行本样本和保存/撤销回归。
