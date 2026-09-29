# Leaf 官网

独立的 React + Vite 单页官网，包含首屏文案、macOS / Windows 下载按钮和小猫插画。图片和字体通过 Vite 打包，构建结果可部署到静态托管服务。

macOS 和 Windows 访问者只看到对应系统的下载按钮，按钮带平台图标。其他系统或无法识别的平台显示两个下载选项。

下载按钮下方提供 GitHub 仓库和哔哩哔哩首页入口，均在新标签页打开。

品牌标题使用 Caveat 手写字体，正文与按钮使用 Public Sans，中文使用系统字体。字体随官网本地打包，授权文本保存在 `fonts/`。插画禁止原生拖动与选择。

浏览器标签页与添加到主屏幕的图标复用 APP 的读书小猫。`public/favicon.ico` 包含 16–256 px 多尺寸图标，`public/icon.png` 提供 512 px 图标。在仓库根目录运行 `npm run icon` 会同步更新 APP 和官网图标。

## 开发与构建

需要 Node.js 22.13.0 或更高版本。在仓库根目录安装依赖后运行：

```sh
npm install
npm run dev:site
```

开发地址：http://127.0.0.1:8766。

```sh
npm run build:site
npm run preview:site
```

发布 `site/dist/` 目录；预览地址：http://127.0.0.1:8767。

官网也可独立安装和运行：

```sh
cd site
npm ci
npm run dev
npm run build
npm run preview
```

静态托管平台的项目根目录设为 `site`，构建命令为 `npm run build`，输出目录为 `dist`。构建使用相对资源路径，支持部署到子目录。

## 源码结构

- `index.html`：HTML 入口与页面元信息。
- `src/main.jsx`：React 挂载入口。
- `src/App.jsx`：页面组合。
- `src/components/DownloadActions.jsx`：平台下载按钮。
- `src/components/SocialLinks.jsx`：GitHub 和哔哩哔哩入口。
- `src/sections/Hero.jsx`：首屏文案和插画。
- `src/website.js`：平台下载地址与相关链接。
- `styles.css`：页面样式、移动端布局与减少动态效果设置。
- `illustrations/`、`fonts/`：本地静态资源。

下载文件名须与仓库根目录 `package.json` 的安装包配置保持一致；当前为 macOS Apple Silicon 和 Windows x64。
