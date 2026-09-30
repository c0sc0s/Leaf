# 开发与打包

## 本地运行

需要 Node.js 22.18+ 与 npm。

```sh
npm ci
npm run desktop
```

`npm ci` 准备本地 PDF 字体、CMap 和 WASM 资源；安装后可离线使用。`npm run desktop` 先编译主进程，再同时运行 Vite、主进程增量编译和 Electron；前端改动热更新，`electron/` 的改动编译后需重启 Electron 窗口。浏览器预览运行 `npm run dev`。

## 工程结构

| 目录                   | 运行位置                  | 说明                                                               |
| ---------------------- | ------------------------- | ------------------------------------------------------------------ |
| `src/`                 | 渲染进程（sandbox）       | React 界面与文档计算，由 Vite 打包                                 |
| `electron/`            | 主进程、preload、存储线程 | TypeScript，编译到 `dist-electron/`；`preload.cts` 编译为 CommonJS |
| `electron/contract.ts` | 两侧共享                  | IPC 契约：`window.desktop`、AI 事件与配置等类型，不含运行时代码    |
| `scripts/vite/`        | Vite 开发服务器           | 浏览器开发模式下直接复用 `electron/storage` 与 `electron/ai`       |

TypeScript 分三个工程，由根目录 `tsconfig.json` 统一引用：

- `tsconfig.app.json`：渲染进程，只能以类型方式引用 `electron/contract.ts`。
- `tsconfig.electron.json`：主进程，输出 `dist-electron/`。源码只用可擦除的 TypeScript 语法并写明 `.ts` 扩展名，因此 Node 22.18+、Vite 与 Vitest 可以直接运行源码，只有 Electron 使用编译结果。
- `tsconfig.node.json`：Vite/Vitest/Playwright 配置、开发服务器插件与测试。

oxlint 除基础检查外还约束进程边界：渲染进程不能引用 Node、Electron 或 `electron/` 下除契约外的模块；主进程不能引用 `src/`。

## 检查与打包

```sh
npm run check        # lint、类型检查、格式检查与单元测试
npx playwright install chromium
npm run test:e2e
npm run build
npm run dist:mac
npm run test:desktop
npm run dist:win
```

安装包在 `release/`。macOS 构建主机当前架构的 DMG/ZIP，Windows 构建 x64 NSIS 安装程序。`.github/workflows/build.yml` 提供两平台构建测试。打包脚本生成未签名开发包；正式发布需配置签名、公证并在两平台实机验收。macOS 验证不能代替 Windows 原生运行验证。
