# 代码块与缺失图片修复

对应用户的三张 Typora / Itypora 对照截图。程序：`release/code-editing/win-unpacked/Itypora.exe`。

## 改动

- 列表内普通代码块只保留主题定义的一份间距，清除外层空白行和重复源码框。关闭行号时，代码从主题内边距开始；开启行号时使用随位数增长的紧凑列，避免原来固定 4em 的多余留白。
- 加载失败的 Markdown 图片显示失败标记、替代文字和完整图片语法/路径。正常图片继续渲染；路径改为有效文件后恢复图片。即时渲染模式使用原始语法节点，所见即所得模式使用只读占位，保存前还原原生图片节点。
- 普通代码块直接在同一个主题框内编辑，不显示第二份源码或围栏。语法颜色使用 CSS Highlights 绘制，不往可编辑文本中注入高亮 span，避免编辑和序列化丢字。
- 代码块高度随内容增长，取消内部高度上限和竖向滚动；长行仍允许横向滚动。复制、语言菜单、行号、编辑器撤销/重做继续可用。
- 主题切换会更新语法颜色及行号位置；切换编辑模式时清理旧的高亮范围。
- 多行输入可能使 Chromium 将一个 code 节点拆为多个节点；交回 Markdown 引擎前合并文本并保留光标标记，防止只保存第一行。

Mermaid、公式等图形渲染块保持自己的编辑/预览方式；此变更针对 JavaScript、Shell、Python 等普通文本代码块。

## 验证

```powershell
npm run test:code-editing
node tests/code-editing.mjs release/code-editing/win-unpacked/Itypora.exe
node tests/rendering.mjs release/code-editing/win-unpacked/Itypora.exe
```

专项覆盖即时渲染和所见即所得模式：单一可见编辑框、语法颜色、列表缩进、多行输入、Tab、Enter、保存、撤销/重做、100 行代码自动撑高、三位数行号不覆盖正文、缺失图片路径和恢复。另检查浅色到深色主题切换后的颜色和行号位置。

截图：

- [列表代码块](../test-results/code-editing-ir-list.png)
- [缺失图片](../test-results/code-editing-ir-missing.png)
- [即时渲染模式中编辑代码](../test-results/code-editing-ir-active.png)
- [所见即所得模式中编辑代码](../test-results/code-editing-wysiwyg-active.png)
- [深色主题](../test-results/code-editing-dark-active.png)

测试使用临时文档与独立配置，不改写原兼容性样本。完整渲染回归中的图片断言更新为 3 张正常可见图片和 2 个源码占位。
