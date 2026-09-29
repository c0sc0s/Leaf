# Leaf 技术架构

`App.tsx` 负责组合书架、阅读器、设置和弹窗。业务状态与异步操作放在各自模块中，避免导入、存储、主题和阅读器生命周期继续集中到 App。

| 模块                                                                         | 职责                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `features/library/useLibrary.ts`                                             | 书架元数据、按需打开正文、收藏/进度更新、删除和笔记计数               |
| `features/library/useBookImport.ts`                                          | 浏览器文件选择、原生文件/文件夹选择、拖放与系统文件打开事件的导入队列 |
| `features/library/importBook.ts`                                             | 格式/大小检查、PDF 密码与 PDF/Markdown 格式转换                       |
| `features/library/initializeLibrary.ts`                                      | 首次示例书初始化，共享正在执行的初始化任务                            |
| `features/settings/useSettings.ts`                                           | 设置保存、系统主题监听与原生窗口外观同步                              |
| `components/PasswordDialog.tsx`、`components/useToast.ts`、`features/about/` | 密码请求队列、通知和关于弹窗                                          |
| `features/import/useFileDrop.ts`                                             | 文件与 Markdown 文件夹的拖放入口                                      |
| `features/reader/BookReader.tsx`                                             | 按格式延迟加载 PDF 或 Markdown 阅读器及其公共参数                     |
| `features/reader/hooks/`                                                     | 阅读位置保存、快捷键、文档加载和搜索等阅读器行为                      |

## 书架与正文分离

类型分为 `BookMetadata` 和 `BookContent`。书架只持有元数据，打开某本书时读取该书正文，组合为完整的 `Book`。收藏、书签和进度更新保留已加载正文的引用，避免重新加载文档或重启 Worker。

IndexedDB `folio-library` 的第 5 版使用以下存储：

- `books`：标题、封面、页数、收藏、进度和书签。
- `bookContents`：PDF Blob，或 Markdown 原始 Blob、章节和本地图片。
- `annotations`：批注；按 `bookId` 建索引，书架通过索引计数，无需读取所有批注正文与矩形。
- `ocr`：已有 OCR 缓存。

升级在同一个事务中将旧书籍记录拆分；失败时整个升级回滚。导入也在同一事务中保存元数据与正文。进度等操作只更新 `books`。删除同时清理正文、批注、OCR 和本地阅读位置；迟到的进度更新不会重新创建已删除书籍。

导入任务按队列执行。连续系统文件打开事件不会因为正在导入而丢失，一本书失败也不会阻断后续书籍。重复检测通过书籍 ID 点查询完成。

## 阅读器与计算服务

PDF 与 Markdown 共用 `useReadingPersistence` 和 `useReaderShortcuts`。阅读位置在滚动停止后保存，并定期及退出时补存；状态未变时跳过重复写入。进度延迟更新，模态弹窗与目录树保留各自的键盘操作。

PDF 阅读器通过 `useReaderNavigation`、`useBookmarks`、`useExports`、`usePinchZoom` 和 `useMarkColor` 组合导航、书签、导出、缩放和批注颜色。页面排布计算集中在 `viewport/geometry.ts`，批注颜色集中在 `lib/marks.ts`。可选文档能力读取失败时通过 `lib/report.ts` 记录上下文。

Markdown 的解析、标题提取、代码高亮和搜索通过 `MarkdownDocument` 服务完成；PDF 搜索通过 `PDFSearchIndex` 服务完成。React 调用有固定输入/返回类型的文档方法，Worker 创建、请求协议和销毁集中在服务实现中。`lib/workerClient.ts` 负责请求编号、取消、过期响应和异常传播。

格式特有的定位、选择和渲染留在对应阅读器中。PDF 导出按需启动独立 Worker，完成后传回结果缓冲区并终止。缓存限额、实测结果及验证方式见 [performance.md](performance.md)。

后续增加计算实现时，优先替换服务内部算法，并用真实大文档的测量决定是否引入 WASM 或 GPU；界面与存储无需跟随计算实现改变。

## PDF 渲染与定位

PDF.js 的 Worker 解析文档，Canvas 保持原始字体、图片、公式和版面，TextLayer 提供选择与批注。字体、CMap、WASM 与 Worker 均随应用离线分发。`lib/text.ts` 建立搜索和批注的 canonical 文字索引，保留来源坐标、原始文字项序号与已有批注的偏移兼容性。

`PDFViewport` 为全部页面保留轻量占位，只挂载可见页和邻近页。优先获取保存位置所在页的尺寸，未知页暂用已知比例估算；真实尺寸到达后恢复文字锚点，避免前方页面高度变化推走阅读位置。离开预加载范围的画布释放，几何文字缓存最多保留 30 页。`PDFPage` 在离屏 Canvas 和 TextLayer 都完成后一起替换 DOM，缩放重绘期间保留原画面。

PDF 阅读位置包含来源页、文字偏移、文字在视口中的 Y 坐标、页内比例和水平滚动比例。缩放、布局切换、侧栏变化、返回和续读优先恢复文字锚点，没有文字时恢复比例。每本书独立保存缩放与连续/单页/双页布局，跳转历史保留最近 50 个位置。目录使用 PDF destination 坐标，搜索使用文字偏移，书签保存添加时的具体位置。右侧笔记采用覆盖面板；进度条拖动期间预览缩略图，松手后导航。

## 批注与导出

PDF 选区的 DOM Range 转换为实际 PDF 坐标，跨页选择拆成来源锚点，在同一个事务保存并占一项撤销历史。复制使用浏览器实际选中文字。同一批注的 SVG 矩形先绘制到一组，再对整组应用透明度，避免重复或重叠的矩形使颜色加深；浅色使用 multiply，深色使用 screen。

`useAnnotations` 串行执行写入，事务成功后更新显示和撤销栈。新增、删除和笔记编辑均可撤销/重做；连续笔记输入按 2.5 秒窗口合并，保留最多 100 个会话操作。`NoteEditor` 停止输入 250 ms 后保存，离开或卸载时提交待保存文本。导出等待写入队列完成。

PDF 导出使用标准 Highlight / Underline，包含 QuadPoints、颜色和 Unicode 笔记，保留原 PDF。pdf-lib 无法编辑的加密 PDF 仍可导出 Markdown 笔记。Markdown 批注使用章节和文字偏移定位，装饰缓存树的副本，避免修改缓存原树。

## 桌面边界与兼容

Renderer 启用 sandbox 和 contextIsolation，关闭 Node.js 集成，禁止外部导航与新窗口。主进程提供原生文档选择、所选文件读取、导出保存、窗口外观/控制和受限外链接口。CSP 限定本机脚本、Worker 和 WASM。书籍按内容 SHA-256 去重并保存副本，移动原文件不影响离线阅读。

Leaf 首次启动沿用已存在的 Folio 用户目录。IndexedDB 与 localStorage 的既有 `folio-*` 存储键保留，避免应用更名导致数据丢失。旧阅读状态仍能读取页码、文字位置和缩放；数据库升级移除不用的 `documents` 缓存。全新安装使用 Leaf 用户目录，测试通过 `LEAF_USER_DATA` 隔离书库。

## 验证

单元测试覆盖索引偏移、缓存限额、取消、Worker 关闭、导入队列、Markdown 装饰与标准批注导出。端到端测试覆盖混合尺寸 PDF、长文档画布数量、定位/续读、目录/搜索/书签、选字、笔记和撤销、主题、键盘、Markdown 安全渲染和原生导入。数据库测试验证真实旧文档迁移和只写元数据。`npm run test:production` 构建当前代码后，通过 Electron 的 `file://` 加载验证阅读器、计算 Worker 与原生打开/保存。

安装包通过 `THIRD_PARTY_NOTICES.md` 和 `licenses/` 分发依赖许可。正式发布另需完成安装包、签名及两平台验收。

公共样式按功能分在 `src/styles/`（base、overlays、library、reader、notes），Markdown 阅读和设置面板各自保留功能样式。阅读器、PDF.js 与 PDF 导出实现按需加载。
