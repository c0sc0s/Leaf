# Leaf 架构图生成说明

生成方式：内置 image_gen。

依据：当前源代码与 `docs/architecture.md`。

## 最终提示词

Use case: infographic-diagram
Asset type: Chinese software architecture documentation image.
Primary request: A polished landscape architecture diagram for Leaf, a local PDF and Markdown reader. Highly legible Simplified Chinese, warm off-white background, sage green native/UI panels, muted blue Web Worker panel, amber local-storage panel, charcoal text, rounded boxes, thin orthogonal connectors.

Title: "Leaf · 项目架构"
Subtitle: "本地 PDF / Markdown 阅读器"
Badge: "离线优先 · 数据保存在本机"

Left panel: "原生桌面层"
Local input files: PDF, Markdown, folders.
Electron main process: file/folder selection, OS file-open events, export saving, window controls.
Bridge: preload.cjs, contextBridge and IPC; bidirectional connection with main and React renderer.
Output: annotated PDF and Markdown notes, saved by Electron main.
Boundary caption: sandbox and contextIsolation.

Center panel: "React 渲染进程 · TypeScript"
App.tsx composes library, readers, settings and dialogs.
Library/import: useLibrary and useBookImport; shelf reads metadata only.
Settings/themes: useSettings.
BookReader lazily loads a reader by format; opening a book reads its content on demand.
PDF reader: PDFViewport / PDFPage; Canvas and TextLayer; visible pages mounted.
Markdown reader: MarkdownContent; React DOM; local images remain in bookContents.
Shared behavior: reading position, shortcuts, bookmarks, annotations and notes.
Connect App to library and settings, library to BookReader, BookReader to both readers, both readers to shared behavior.

Right panel: "后台计算 · Web Workers"
PDF.js Worker: PDF parsing, matched with PDF reader using badge ①.
PDFSearchIndex / search.worker.ts: text search, matched with PDF reader using badge ②.
MarkdownDocument / markdown.worker.ts: parsing, highlighting and search, matched with Markdown reader using badge ③.
PDF export Worker / export.worker.ts / pdf-lib: matched with annotations using badge ④.
WorkerClient handles requests, cancellation and lifecycle for search, Markdown and export services only.
Use numbered badges instead of long cross-panel worker connectors.
Legend:
①② PDF 解析与搜索
③ Markdown 解析与搜索
④ 批注与原文 → 导出计算
Compact export route: 导出结果 → preload → 原生保存

Bottom persistence panel: "本地持久化 · 渲染进程直接访问"
IndexedDB · folio-library v5:
books: metadata, progress, bookmarks.
bookContents: PDF, chapters, local images.
annotations: annotations and notes.
ocr: retained cache only.
localStorage: settings and reading position.
Library/import and shared reading behavior connect directly to IndexedDB; settings and reading position connect directly to localStorage. No storage route through Electron main.

Footer flow: 导入 → 书架 → 阅读与批注 → 本地保存 / 导出
Constraints: technically accurate labels and direction. Canvas/TextLayer and Markdown DOM rendering stay on the UI thread. No invented cloud, backend, account, Rust/GPU compute service, or active OCR engine. No watermark. All Chinese labels fully legible.
