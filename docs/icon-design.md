# Leaf 图标

正式图标是一只捧书阅读的黑色线稿猫，放在米白纸色的圆角方形底板上。

## 资源与生成

唯一源文件是 `assets/icon/reading-cat.png`。运行 `npm run icon` 会提取线稿，重新上色为 `#1c1b18`，放到上浅下深的纸色渐变底板上，然后生成以下产物：

| 产物                      | 用途                                           | 处理                                                                     |
| :------------------------ | :--------------------------------------------- | :----------------------------------------------------------------------- |
| `build/icon.png`          | macOS 应用图标（打包时转为 ICNS）、开发时 Dock | 1024 画布，824 超椭圆底板，按 Apple 图标网格留边并带柔和投影             |
| `build/icon.ico`          | Windows 应用图标                               | 16–256 px 多尺寸，底板铺满；≤ 48 px 加粗线条，16 px 只保留猫头以保证可辨 |
| `public/icon.png`         | 应用内标识、favicon、窗口图标                  | 512 px，底板铺满                                                         |
| `site/public/icon.png`    | 官网 PNG 图标、添加到主屏幕图标                | 与 `public/icon.png` 一致                                                |
| `site/public/favicon.ico` | 官网浏览器标签页图标                           | 与 `build/icon.ico` 一致，包含小尺寸优化                                 |

修改源图或参数后重新运行 `npm run icon`，再用 `npm run dist:mac` 打包验证。
