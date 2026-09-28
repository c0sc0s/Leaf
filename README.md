# Folio

一个跨 Windows / macOS、默认离线的 PDF 桌面阅读应用。书架参考封面墙与现代简约设计，界面采用中文，支持浅色、深色和跟随系统。

## 运行

需要 Node.js 22.13+（推荐 22 LTS）、npm 与安装依赖时的网络。

```sh
npm ci
npm run desktop
```

`npm ci` 会准备本地 PDF 字体、CMap、WASM、OCR 引擎和中英文模型。OCR 模型从 Tesseract.js 官方模型站点下载，约 30 MB；安装后读取 PDF 与 OCR 均可离线使用。首次下载需要 curl（macOS、Windows 10/11 已提供）。

仅浏览器预览：`npm run dev`，访问 http://127.0.0.1:5173。

## 已实现

- 本机书库：多文件导入、拖放、SHA-256 去重、真实首页封面、分类、收藏、最近阅读、搜索、网格/列表视图。
- 原版阅读：PDF.js Canvas 保留文字、图形与原始版面；TextLayer 支持选择和复制；缩放、跳页、键盘翻页、懒加载缩略图、PDF 内嵌目录、书签、全文搜索。
- 舒适阅读：读取 PDF 文字与坐标，优先参考 Tagged PDF 的语义结构，推断标题、段落、列表及常见双栏顺序，再由 HTML/CSS 排版；字体、字号、行距、正文宽度可调。
- 深浅主题：应用外观与 PDF 页面可分别设置。原版模式对 Canvas 进行颜色转换；舒适阅读直接设置正文色与背景色。
- 批注：四种高光颜色、划线、页边笔记、跨模式显示、删除批注、原 PDF 的标准 Highlight / Underline 批注导出、Markdown 笔记导出。
- 扫描件：本机 Tesseract.js 中英文 OCR，提取文字框、支持重排及标注、持久化识别结果。
- 数据：IndexedDB 保存 PDF 副本、阅读进度、书签、笔记和 OCR 结果；不上传文档，不依赖服务端。偏好保存于 localStorage。
- 桌面集成：原生文件打开/保存对话框、单实例、系统 PDF 文件关联、macOS 打开文件事件、Windows 启动参数、菜单与快捷键。

首次进入提供 8 本原创演示 PDF，可直接体验真实渲染和标注；示例不是已出版书籍。删除示例后不会再次自动添加。

## 使用

导入 PDF 后点击封面。选中文字，工具条中选择颜色，然后高光或划线。打开右上方「阅读笔记」填写页边笔记，离开输入框后保存。工具栏右上方可导出批注 PDF。

「舒适阅读」是一键文字重排；扫描件页面会出现「识别本页文字」。设置中可以调整字体与版心。

- `Cmd/Ctrl + O`：导入 PDF
- `Cmd/Ctrl + F`：搜索所有页面
- `← / →` 或 `PageUp / PageDown`：翻页
- 点击缩放百分比：恢复适合页面

文件大小上限 512 MB。密码保护的文件可输入密码阅读；密码不保存。pdf-lib 不支持修改加密 PDF，导出前需自行解除保护。

## 验证与打包

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run dist:mac
npm run dist:win
npm run test:desktop
```

安装包位于 `release/`。macOS 生成 DMG / ZIP，Windows 生成 NSIS 安装程序。macOS 默认构建主机当前架构，Windows 默认 x64；可向 electron-builder 传入 `--x64` 或 `--arm64`。`.github/workflows/build.yml` 提供 macOS 与 Windows 分平台构建和测试。

打包脚本默认生成未签名开发包。正式发布应配置 Apple Developer 签名、公证和 Windows 代码签名证书，并直接调用 electron-builder 覆盖 mac.identity 与 win.signExecutable。未签名包仅供本机开发/测试，系统可能显示来源提示。Windows 运行验证需要 Windows 环境，不能由 macOS 测试替代。

## 文字重排的边界

PDF 不是 Word：很多 PDF 只有绘图指令与文字位置，没有段落、标题或阅读顺序。当前重排适合普通文字文档、文章和常见双栏文本，不能保证复杂布局的语义完整。

- 舒适阅读聚焦文字，插图、复杂表格、数学公式和表单请切回原版。
- 未标记 PDF 的标题、分栏与段落是版面推断，可能误识别；界面会说明。
- 横排文字的批注位置按字符比例估计，复杂字形、竖排和旋转文字可能不够精确。
- OCR 是逐页、用户主动触发；结果可能有误，需与原版对照。首次识别后保存在本机，可用于全文搜索。
- 暂不支持编辑正文、PDF 表单填写、数字签名、账户同步、跨设备同步与自动更新。
- 原版夜间颜色转换也会改变图片色彩；需要准确看颜色时选择始终浅色。

技术选型、结构模型与后续可行的增强路线见 [技术调研与架构](docs/architecture.md)。
