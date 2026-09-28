# Folio 图标

图标使用内置 imagegen 生成，参考用户提供的虹彩翻页书本图片。设计保留翻页轮廓、虹彩渐变与柔和光感，采用深蓝圆角底板和透明外缘，适配浅色、深色桌面背景。

原始图像位于 `assets/folio-icon-source.png`。运行 `npm run icon` 生成用于界面、Dock、窗口及安装包的 1024 × 1024 PNG：`public/icon.png`。electron-builder 在打包时生成 macOS ICNS 和 Windows ICO。

## 生成提示词

Create a production-ready desktop app icon for Folio, a beautiful modern PDF reader. Use the attached image only as visual inspiration: an open book with several elegantly upward-turning pages, luminous iridescent pastel gradients, and a deep midnight navy atmosphere. Design an original, polished app icon, not a photograph or a mockup. Square 1024x1024 canvas. A large rounded-square midnight-navy tile with transparent space outside the rounded tile, about 6% margin around it. Center an open book occupying about 75% of the tile width, viewed in a gentle three-quarter perspective, spine pointing toward the lower center. Three distinct rising page shapes and a graceful broad right page. Rich coral pink, lavender, sky blue, mint, and pale warm yellow gradients; beautifully luminous folds and edges; very subtle fine grain and restrained soft bloom. Strong simple silhouette that remains legible at 32px. Smooth sophisticated dimensional illustration, more refined and less grainy than the reference. The book must sit comfortably inside the tile with ample breathing room. No letters, no words, no watermark, no badge, no outer drop shadow, no surrounding presentation. Output exactly one icon.
