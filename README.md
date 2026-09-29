<div align="center">
  <img src="public/icon.png" width="112" height="112" alt="Leaf：捧着书的黑猫" />
  <h1>Leaf</h1>
  <p><strong>把注意力，留给正在读的这一页。</strong></p>
  <p>一款面向 macOS 与 Windows 的本地 PDF 与 Markdown 阅读器。</p>
  <p>
    <img src="docs/readme/platforms.svg" alt="macOS 与 Windows 桌面应用" height="26" />
    <img src="docs/readme/local.svg" alt="本地保存，离线阅读" height="26" />
    <img src="docs/readme/themes.svg" alt="浅色与深色主题" height="26" />
    <img src="docs/readme/annotations.svg" alt="支持 PDF 批注导出" height="26" />
  </p>
</div>

<br />

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/previews/reader-dark.png" />
    <img src="docs/previews/reader-light.png" alt="Leaf 阅读页：精简工具栏、PDF 正文与阅读笔记" width="100%" />
  </picture>
</p>

<p align="center"><sub>空间留给正文，想法留在页边。</sub></p>

## 读进去，也接得上

Leaf 把阅读、定位和批注放在一起。打开 PDF，接着上次的位置读；遇到值得留下的句子，选中、标记、写下想法。书籍、阅读进度与笔记都保存在本机，无需注册，也无需上传文档。

|                    | 阅读体验                                                                       |
| :----------------- | :----------------------------------------------------------------------------- |
| **保留原版**       | 按 PDF 原有版面呈现文字、图片、图表和公式；有文字层的内容可以选择、复制。      |
| **自在翻阅**       | 连续滚动、单页与双页布局，搭配适应宽度、缩放和专注阅读。                       |
| **从上次继续**     | 记住具体阅读位置、缩放比例与页面布局，重新打开后接着读。                       |
| **找到，也回得来** | 目录、缩略图、书签和带上下文的全文搜索；跳转之后可以返回刚才的位置。           |
| **随手留下想法**   | 高亮、划线与笔记自动保存，支持改色、编辑、撤销和重做。                         |
| **带走你的笔记**   | 导出带标准批注的 PDF，在其他支持批注的阅读器中查看；也可以导出 Markdown 笔记。 |

## 一个属于你的书架

拖入文件，或一次导入多份 PDF / Markdown。用分类、收藏和最近阅读整理书库，通过书名、作者快速查找；封面网格和列表视图随时切换。

点击「导入文件」选择 `.md` / `.markdown` 时，每个文件是一册 Book；点击「导入文件夹」时，整个文件夹是一册 Book，子目录中的 Markdown 文件都会作为章节收入同一本书。文件夹名作为书名，根目录 README 优先，其余章节按相对路径自然排序（例如 2 在 10 之前）。文件夹中的本地图片一并保存，章节间的相对链接可以直接跳转；导入后无需保留原文件夹也能离线阅读。隐藏子目录和 `node_modules` 会跳过。

Markdown 阅读支持标题目录、表格、任务列表、代码块、整本书搜索、章节书签、字号调整、深浅主题和续读位置。单文件导入只保存所选文件；需要本地图片或关联章节时，请导入其所在文件夹。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/previews/library-dark.png" />
    <img src="docs/previews/library-light.png" alt="Leaf 书架：真实 PDF 封面、分类、收藏、最近阅读与搜索" width="100%" />
  </picture>
</p>

<p align="center"><sub>截图中的书籍为 Leaf 原创演示文档。</sub></p>

## 白天清爽，夜晚柔和

鼠尾草绿搭配简洁的中性色界面，支持浅色、深色和跟随系统。应用界面与 PDF 页面外观可以分别设置；查看照片、图表时，也可以让文档保持原始颜色。

工具按需展开，笔记随手可记。让你把更多时间花在内容上。

## 开发

`npm run desktop` 启动桌面开发环境，`npm run build` 构建生产前端。
`npm test` 运行单元测试，`npm run test:e2e` 验证浏览器与原生桌面阅读流程。
`npm run test:production` 构建并验证生产文件加载、搜索及批注导出。

模块划分与本地数据迁移见 [架构说明](docs/architecture.md)，Worker、缓存策略和实测结果见 [性能说明](docs/performance.md)。

---

<p align="center">
  <strong>Leaf</strong> · 一只猫，一本书，一段专注的时间。<br />
  <sub>本地保存 · 离线阅读 · 无需账户</sub>
</p>
