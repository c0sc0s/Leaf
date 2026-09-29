# Leaf 猫猫插图

角色使用长三角耳、深 V 形耳间凹口、相邻圆眼、圆点鼻子和两侧各两根胡须。黑色手绘线条保留颗粒与不规则笔触，背景透明。

| 图片 | 内容 | 使用场景 |
| --- | --- | --- |
| reading.png | 小猫在桌前写字，旁边有书和杯子 | 阅读、欢迎、笔记空状态 |
| empty.png | 小猫查看空纸箱 | 书库、搜索、收藏、书签、标签、目录空状态 |
| not-found.png | 小猫拿地图寻找方向 | 404 |
| settings.png | 小猫调整台灯，眼睛看向灯 | 设置 |

原图位于 `assets/mascot/sources/`，应用图片位于 `public/mascot/`，尺寸和场景记录在 `public/mascot/manifest.json`。执行 `node scripts/build-mascots.mjs` 原样复制图片，不平滑或重绘笔触。

浅色模式保留原始黑色线条，深色模式仅对插图使用反色以保证可见性；透明度不变。图片使用原有容器尺寸和 `object-fit: contain`，不改变界面布局、字体、主题、毛玻璃或背景取色。
