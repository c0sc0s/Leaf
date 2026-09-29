# 发版

安装包发布在 GitHub Releases（`c0sc0s/Leaf`）。官网 `site/` 部署在 Vercel，下载按钮指向最新 Release 的固定文件名。

## 流程

1. 确认要发布的改动已提交并推送到 `main`。
2. 在仓库根目录运行：

   ```bash
   npm run release -- <patch|minor|major|x.y.z>
   ```

   修复用 `patch`，新功能用 `minor`，不兼容改动用 `major`。

3. 脚本推送 tag 后，`.github/workflows/release.yml` 自动执行：校验 tag 与版本号一致 → 在 macOS、Windows 上 `npm ci`、`npm test`、打包并验证打包后的应用 → 校验两个下载文件 → 创建同名 Release 并上传安装包。
4. 用 `gh run watch` 或 `gh run list --workflow=Release` 等待完成，再用 `gh release view v<版本>` 确认包含 `Leaf-mac-arm64.dmg` 和 `Leaf-win-x64.exe`。

网站无需重新部署。

## `npm run release` 做了什么

`scripts/release.mjs` 依次：

1. 检查当前分支是 `main`、没有未提交或未跟踪的文件、`HEAD` 与 `origin/main` 一致。任一不满足直接报错退出，不修改任何内容。
2. 运行 `npm test`。
3. `npm version <参数>`：更新 `package.json` 与 `package-lock.json`，提交 `chore: release v<版本>`，打 tag `v<版本>`。
4. `git push origin main --follow-tags`。

## 约束

- 安装包文件名必须保持 `Leaf-mac-arm64.dmg` 和 `Leaf-win-x64.exe`，不含版本号。它们由 `package.json` 中 `build.mac.artifactName` 与 `build.win.artifactName` 决定，`site/src/website.js` 的下载链接依赖这两个名字。修改任一处必须同步另一处。
- macOS 只构建 Apple 芯片（arm64），不构建 Intel 或 universal 包。
- macOS 使用 ad-hoc 签名（`-c.mac.identity=-`），未公证，`hardenedRuntime` 关闭。用户首次打开需在系统设置中允许。接入 Apple Developer 签名前不要改这几项。
- Windows 安装包未签名，下载时 SmartScreen 会提示。
- 应用没有自动更新，用户需从官网重新下载新版本。
- tag 必须等于 `v` + `package.json` 的 `version`，否则工作流失败。不要手动改版本号后再单独打 tag，统一走 `npm run release`。

## 失败处理

- **`npm run release` 在推送前报错**（前置检查或 `npm test` 失败）：此时未产生提交或 tag。按报错处理（提交或暂存改动、切到 `main`、pull/push 同步、修复测试）后重跑。
- **推送后工作流失败**：tag 已在远程但没有 Release。先用 `gh run view --log-failed` 找原因并修复、提交、推送，再选择其一：
  - 发一个新版本：`npm run release -- patch`（推荐）。
  - 重用原版本号：`git push origin :refs/tags/v<版本> && git tag -d v<版本>`，然后 `git tag -a v<版本> -m v<版本> && git push origin v<版本>`。
- **Release 已创建但安装包有问题**：不要覆盖已发布文件，修复后发新版本。

## 本地验证打包（可选）

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac
codesign --verify --deep --strict release/mac-arm64/Leaf.app
```

产物在 `release/`。若本机已有 Leaf 在运行，单实例锁会让新启动的进程立即退出，测试时设置 `LEAF_USER_DATA=/tmp/leaf-test` 使用独立数据目录。

## 一次性配置

- GitHub（已完成）：Actions 已启用；工作流在发布任务中声明 `contents: write`，不需要修改仓库默认权限。
- Vercel：导入本仓库，Root Directory 设为 `site`，Framework 选 Vite，构建命令设为 `npm run build`，输出目录设为 `dist`。
