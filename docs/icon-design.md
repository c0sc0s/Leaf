# Leaf 图标

正式图标使用「黑猫 + 打开的书」意象：无眼镜黑猫、米白书页与绿色圆角底板。主色以 `#798B64` 为目标，圆角外保留透明背景。

## 资源与生成

- 唯一源文件：`assets/leaf-icon-cat-book.png`。
- 运行 `npm run icon`，生成 1024 × 1024 的 `public/icon.png`。
- 应用标题栏、浏览器 favicon 和 Electron 窗口 / Dock 使用该 PNG。
- Vite 构建将 PNG 复制到 `dist/icon.png`；electron-builder 的 macOS 和 Windows 配置均使用 `public/icon.png`，打包时生成原生 ICNS / ICO。

使用内置 imagegen 生成。[设计说明及完整提示词](design/leaf-icon-cat-book.md)记录角色与造型约束，[尺寸预览](design/leaf-icon-preview.html)展示浅色、深色背景以及 16–256 px 效果。
