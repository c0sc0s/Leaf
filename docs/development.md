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

`check` 包含源码与测试的依赖边界、静态检查、类型、格式，以及全部单元和集成测试。端到端测试使用 Chromium 和隐藏的 Electron 窗口，验证阅读交互、存储、插件发现／安装／更新／取消和 AI；测试环境在新书库中安装全部内置插件并导入八份样本。

## 测试归属

测试按代码所有者和运行边界组织。公共包与插件持有自己的测试；应用仓库的 `tests/` 持有宿主测试、跨层集成、用户流程与正式包验收。

```text
packages/*/tests/unit/         公共工具、阅读协议、SDK 与共享 UI
plugins/*/tests/unit/          格式实现、Agent 与业务 harness
plugins/*/tests/integration/   插件与外部服务协议，例如模型流式 HTTP
tests/
  unit/
    core/                     文档、阅读会话、批注、插件注册与偏好
    app/                      应用自身的展示逻辑
    platform/                 渲染端平台逻辑与保存协调
    electron/platform/        原生窗口等独立逻辑
  integration/
    electron/                 SQLite、内容资源、安装器、后台进程、文件
    plugins/                  插件与宿主服务的组合，例如 AI 配置与凭据
  e2e/
    browser/
      app/                    书架、设置、插件管理与错误恢复
      reader/                 阅读会话、批注、笔记、续读与快捷操作
      plugins/                PDF、Markdown、AI 的完整用户流程
    desktop/                  原生窗口、IPC、SQLite、重启与面板保存
  packaged/                   真实安装包与生产资源协议
  support/                    测试运行辅助
  fixtures/                   通用协议替身、独立插件包与样本文件
```

领域单元测试通过仓储和通用文档协议注入替身，不依赖 PDF、Markdown、Electron 或 React。格式插件的私有实现只在该插件的测试中使用。共享目录组件测试使用不透明的位置；PDF 页码和 Markdown 章节的解释分别由格式测试负责。跨层行为进入集成或端到端测试。

`check:architecture` 同时检查这些测试边界，拒绝落在未声明目录或不符合运行入口命名的测试文件。Vitest 使用 `unit`、`integration` 两个项目，文件命名为 `.test.ts` 或 `.test.tsx`；Playwright 使用 `browser`、`desktop` 两个项目，文件命名为 `.spec.ts`，避免移动测试后遗漏运行入口。

| 验收边界     | 测试内容                                                     |
| ------------ | ------------------------------------------------------------ |
| 公开协议     | API 版本、贡献项声明、定位归属、跨区批注和资源路径           |
| 插件生命周期 | 重复释放、取消后的资源、依赖、最后一个阅读插件、重装后的数据 |
| 阅读与保存   | 视图解绑、续读、撤销重做、保存失败后的重试与关闭前保存       |
| 格式实现     | 解析、搜索、目录、选择、渲染、图片、链接与 PDF 导出          |
| 原生集成     | SQLite 事务、内容租约、安装包哈希、后台请求、取消和凭据      |
| 正式应用     | 默认 PDF、动态 Markdown/AI、Worker、Trace 与重启恢复         |

可按层单独运行：

```sh
npm run test:unit
npm run test:integration
npm run test:browser
npm run test:electron
```

发布前执行完整 `check`、`test:e2e`、构建、打包和两项正式包验证。各层的子集通过不能代替完整验收。测试平台为 macOS 与 Windows；本机执行只证明当前平台，另一个平台由对应 CI 作业验证。

`test:production` 使用正式资源协议、默认 PDF 与动态安装的 Markdown 和 AI，验证原生导入、搜索、批注导出、插件 Worker、AI 工具调用与执行记录，以及重启后的批注和问答恢复。`pack` 生成本机目录安装包。`test:desktop` 使用目录安装包验证桌面窗口、渲染、原生操作与主题。也可将 `LEAF_EXECUTABLE` 设为打包后的可执行文件，再运行 `node tests/packaged/production.mjs` 验证正式包。

macOS arm64 安装包使用 `npm run dist:mac`，Windows x64 使用 `npm run dist:win`。产物在 `release/`；三个插件包单独分发。CI 在 macOS 和 Windows 上执行检查、端到端测试、打包与桌面验证。

测试诊断在 `test-results/`，Playwright 报告在 `playwright-report/`。这些生成文件不属于源码或架构文档。

`LEAF_USER_DATA` 可指定独立桌面数据目录；开发版和正式版默认使用不同目录。`LEAF_HIDDEN_WINDOW=1` 用于自动化隐藏窗口。`LEAF_TEST_PLUGINS=all` 与 `VITE_LEAF_SEED_SAMPLES=1` 仅供测试或明确需要样本的开发运行。

AI 插件可在界面保存 OpenAI 兼容服务地址、模型和 API Key。`LEAF_AI_BASE_URL`、`LEAF_AI_MODEL`、`LEAF_AI_API_KEY` 同时配置时使用受环境管理的配置。桌面凭据使用系统 `safeStorage`；浏览器开发服务使用本地加密文件。

备份使用 `node scripts/library-backup.mjs backup SOURCE_DIRECTORY NEW_DESTINATION`，恢复使用同一命令的 `restore` 操作。只处理当前 `leaf.reader` 备份格式；备份内容包括 SQLite 和文档内容文件，插件代码与凭据需要单独保管。

在线目录测试分别位于 `tests/unit/core/plugins/catalog.test.ts`（依赖计划与安装协调）、`tests/integration/electron/plugins/catalog.test.ts`（签名、缓存、下载校验与取消）、`tests/integration/electron/platform/catalogFetch.test.ts`（原生重定向、流式响应与取消）和 `tests/e2e/browser/app/catalog.spec.ts`（发现、确认、安装、更新与失败恢复）。官方目录发布流程见 [插件文档](plugins.md#发布官方目录)。

`npm run test:catalog` 在独立桌面数据目录中访问真实官方签名目录，经 HTTPS 在线安装 Markdown 与 AI 并验证重启恢复。它需要网络，作为发布后的公网验收单独执行；可以通过 `LEAF_EXECUTABLE` 指定实际安装包中的程序。
