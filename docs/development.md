# 开发与打包

## 本地运行

需要 Node.js 22.13+ 与 npm。

```sh
npm ci
npm run desktop
```

`npm ci` 准备本地 PDF 字体、CMap 和 WASM 资源；安装后可离线使用。浏览器预览运行 `npm run dev`。

## 验证与打包

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run dist:mac
npm run test:desktop
npm run dist:win
```

安装包在 `release/`。macOS 构建主机当前架构的 DMG/ZIP，Windows 构建 x64 NSIS 安装程序。`.github/workflows/build.yml` 提供两平台构建测试。打包脚本生成未签名开发包；正式发布需配置签名、公证并在两平台实机验收。macOS 验证不能代替 Windows 原生运行验证。
