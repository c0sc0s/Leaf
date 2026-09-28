# Leaf 猫咪与书 App Icon

正式图标源文件：`assets/leaf-icon-cat-book.png`。采用黑猫头像与打开的米白书页组合，移除眼镜、铅笔和完整身体，以绿色圆角底板承托。主色目标为 `#798B64`，角色黑 `#171916`，书页米白 `#F4EEDD`。图像生成存在局部色值偏差，主题 CSS 仍使用精确品牌色。

圆角外为透明背景。运行 `npm run icon` 生成应用统一使用的 `public/icon.png`；界面、浏览器图标、Electron 窗口与安装包均引用此资源。小尺寸与深浅底色预览：`docs/design/leaf-icon-preview.html`。

生成方式：imagegen 技能、内置 image_gen，使用用户选定的角色母版作为造型参考；本图标明确不带眼镜。

## 完整提示词

Use case: logo-brand. Design ONE polished desktop APP ICON for Leaf, a PDF reading app. The attached mascot sheet is a reference ONLY for the black cat's ears, simple eye shapes, quiet cute personality and flat graphic style. IMPORTANT USER CHANGE: REMOVE THE GLASSES COMPLETELY. The cat MUST NOT wear spectacles, monocles, goggles, lenses, colored eye rims, a bridge across the nose, or any eyewear. Plain bare face, simple oval eyes only.
ICON CONCEPT: a cute BLACK CAT HEAD peeking over and holding one OPEN IVORY BOOK. Cat head and book make one compact, integrated emblem. No full-body scene, no legs, no long torso, no tail, no pencil, no eyewear. Two tiny black mitten paws curl over the outer edges of the open book. The book's two broad warm-ivory pages create a very clear shallow W silhouette with ONE dark central spine / valley. A thin dark green cover visible underneath is enough. No writing or fine page lines. Cat's bare eyes and tiny nose remain fully visible above the book.
DESIGN: near-flat clean vector-like illustration. Friendly wide rounded head, two softly rounded triangular ears of moderate height, large warm-ivory oval eyes with simple dark oval pupils, tiny cream horizontal nose, a gentle curious expression with pupils looking toward the reader. Slight soft asymmetry is fine but not a tilted composition. No mouth, blush, reflections, sparkly highlights or eye rings. At most two short bold whiskers on each side. Familiar approved black-cat character translated to a simpler bare-faced icon. Absolutely NO GLASSES.
PALETTE: dominant sage-green rounded-square background tile #798B64, near-black cat #171916, warm-ivory eyes and book #F4EEDD, subtle darker sage book-cover edge if needed. Bold flat color fields, smooth edges, no gradient, no texture, no fur, no 3D, no light effects, no shadows, no glossy or glass material.
COMPOSITION: exactly ONE square desktop app icon, centered and straight-on. A sage-green rounded-square tile spans 88 percent canvas width with generous consistent corner radius; even 6 percent TRANSPARENT margin outside the tile, actual alpha transparency around all rounded corners. Integrated cat-and-book silhouette spans roughly 74 percent of tile width and 78 percent of tile height. Cat head and ears in upper two thirds, open book at lower third. Entire mark has balanced breathing room and does not touch tile edges. Strong clear CAT + OPEN BOOK recognition when reduced to 32 pixels. No words, no letters, no 'Leaf' label, no badges, no watermarks, no mockup, no design sheet. Deliver only this single finished app icon with alpha outside the green tile.

