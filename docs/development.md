# 开发与验证

在仓库根目录安装依赖，Node.js 最低为 22.18。

```sh
npm ci
npm run desktop
```

`desktop` 构建原生服务和三个插件，启动 Vite 与 Electron。独立调试浏览器界面使用 `npm run dev`；其本地服务也使用 SQLite，并以 cookie 区分书库。正式桌面应用不需要 Vite 服务。

插件包位于 `dist-plugins/*.leaf-plugin`。首次启动默认安装 PDF；在应用设置中安装 Markdown 或 AI。插件代码修改后运行 `npm run build:plugins`，通过设置重新安装生成的包。公共包的正式运行时由 `npm run build:runtime` 构建。

```sh
npm run check
npm run test:e2e
npm run test:production
npm run pack
npm run test:desktop
```

`check` 包含依赖边界、静态检查、类型、格式和单元测试。端到端测试使用 Chromium 和隐藏的 Electron 窗口，验证阅读交互、存储、插件安装卸载和 AI；测试环境在新书库中安装全部内置插件并导入八份样本。

`test:production` 使用正式资源协议、默认 PDF 与动态安装的 Markdown 和 AI，验证原生导入、搜索、批注导出、插件 Worker、AI 工具调用与执行记录，以及重启后的批注和问答恢复。`pack` 生成本机目录安装包。`test:desktop` 使用目录安装包验证桌面窗口、渲染、原生操作与主题。也可将 `LEAF_EXECUTABLE` 设为打包后的可执行文件，再运行 `node scripts/production-test.mjs` 验证正式包。

macOS arm64 安装包使用 `npm run dist:mac`，Windows x64 使用 `npm run dist:win`。产物在 `release/`；三个插件包单独分发。CI 在 macOS 和 Windows 上执行检查、端到端测试、打包与桌面验证。

测试诊断在 `test-results/`，Playwright 报告在 `playwright-report/`。这些生成文件不属于源码或架构文档。

`LEAF_USER_DATA` 可指定独立桌面数据目录；开发版和正式版默认使用不同目录。`LEAF_HIDDEN_WINDOW=1` 用于自动化隐藏窗口。`LEAF_TEST_PLUGINS=all` 与 `VITE_LEAF_SEED_SAMPLES=1` 仅供测试或明确需要样本的开发运行。

AI 插件可在界面保存 OpenAI 兼容服务地址、模型和 API Key。`LEAF_AI_BASE_URL`、`LEAF_AI_MODEL`、`LEAF_AI_API_KEY` 同时配置时使用受环境管理的配置。桌面凭据使用系统 `safeStorage`；浏览器开发服务使用本地加密文件。

备份使用 `node scripts/library-backup.mjs backup SOURCE_DIRECTORY NEW_DESTINATION`，恢复使用同一命令的 `restore` 操作。只处理当前 `leaf.reader` 备份格式；备份内容包括 SQLite 和文档内容文件，插件代码与凭据需要单独保管。
