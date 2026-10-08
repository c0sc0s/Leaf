# 开发插件

新增格式应当复用书架、阅读会话和批注交互。新增功能应当通过扩展插槽接入阅读流程。插件使用 `@leaf/contracts`、`@leaf/plugin-sdk`、`@leaf/ui`、`@leaf/shared`，禁止导入 `src/`、`electron/` 或其他插件的实现。

当前公开 API 版本为 `1.0.0`。manifest 的 `hostApi` 和 `dependencies` 支持精确版本、`^` 和 `~` 范围。

```json
{
  "id": "example.text",
  "name": "文本阅读",
  "description": "本地文本阅读",
  "version": "1.0.0",
  "hostApi": "^1.0.0",
  "entries": { "renderer": "renderer.js" },
  "contributes": {
    "documentProviders": ["example.text.document"],
    "views": ["example.text.view"]
  },
  "permissions": ["documents"],
  "dependencies": {}
}
```

渲染模块默认导出 `RendererPlugin`。所有注册项的 ID 必须在 manifest 中声明，宿主激活后也会检查声明是否完成注册。

```ts
import type { RendererPlugin } from '@leaf/plugin-sdk/context';
import { provider } from './document';
import { view } from './view';

const plugin: RendererPlugin = {
  activate(context) {
    context.registerDocumentProvider(provider);
    context.registerView(view);
  },
};
export default plugin;
```

## 格式插件

`DocumentProvider` 声明扩展名、MIME 与文件夹支持。`probe` 返回匹配程度，宿主选择最合适的 Provider；`import` 返回规范化的资源文件和 JSON 描述。文档 ID、资源哈希、书架写入和租约由宿主管理。

`open` 通过 `DocumentOpenServices.readResource` 读取资源，返回文档句柄。必须提供定位校验和标签；可选内容、搜索、目录、导航、缩略图、图片和导出能力。每次长操作都接收 `AbortSignal`，实现需要响应取消并释放 Worker、缓存、对象 URL 和订阅。

Locator 的 `documentId`、`revision` 必须与文档匹配。`schema`、`version` 与 payload 由格式插件设计，插件负责校验和解释。保证相同内容版本的定位稳定，便于恢复阅读位置、搜索跳转和批注。

`ViewFactory.providerId` 指向同一插件的 Provider。`mount` 在传入的容器内渲染，返回 `ViewCommands`。视图发送 `ready`、`position`、`selection`、`annotation`、`error` 事件；位置包含 Locator、JSON 视图设置与 viewport 状态。声明 selection、annotations 和设置能力，宿主据此组合界面。

批注和书签由宿主持久化。视图收到 `setAnnotations` 后绘制批注，通过 `capturePosition` 保存精确位置，通过 `restorePosition` 恢复。多页或跨区选区使用多个 Locator。视图与文档句柄都有 `dispose`，释放操作应可重复调用。

React 视图使用 `mountReact`，确保共享 React 与 UI Context。`@leaf/ui/reading` 提供骨架、目录树、阅读面板、颜色与局部滚动辅助。其余控件、图标和动效也通过公开包使用。

## 功能插件

功能插件可以注册选区动作、阅读工具栏动作、面板和设置。动作收到 `ReadableSession`、当前选区和 `openPanel`，由插件决定业务 Prompt、工作流与工具。通过 `context.host` 访问声明权限允许的服务。

- `documents`：当前阅读会话和书架元数据。
- `storage`：插件私有 JSON 数据和任务记录。
- `backend`：该插件后台服务的请求和流。
- `credentials`：后台凭据存取。
- `network`：后台网络请求。

私有存储以插件 ID 自动隔离，可传入文档 ID 保存文档相关数据。关闭或卸载前应等待业务保存与任务取消。通过 `context.scope.own` 管理订阅等资源；异步工作使用作用域的 `signal`。

后台模块默认导出 `BackendFactory` 函数，manifest 需要声明 `entries.backend` 与对应权限。宿主按需启动后台进程，调用工厂并传入 `BackendHostAPI`。工厂返回的 `BackendPlugin` 实现 `request` 和可选 `stream`，请求取消通过 signal 传递。后台宿主接口提供作用域内的存储、凭据和环境配置，模型插件在后台进程中执行网络请求。

## 包与验证

`.leaf-plugin` 是 gzip 压缩的 JSON 包，包含 manifest 和以 base64 编码、带 SHA-256 的文件。`electron/plugins/package.ts` 的 `writePackage` 负责生成，`readPackage` 负责校验。内置插件的构建配置在 `scripts/build.ts`。

插件把解析器和业务依赖打入自己的模块；将 React、Motion 及公开包设为 external，使用宿主 import map。Worker 和资源采用相对模块 URL，放在插件包中。不要依赖宿主源码路径、全局格式对象或主进程实现。

新增插件需验证导入、阅读、定位、关闭、取消、安装停用卸载，以及私有数据恢复。`tests/fixtures/plugin.ts` 是仅依赖协议的独立文本阅读插件，`tests/e2e/browser/app/plugins.spec.ts` 验证它的动态安装、PDF 卸载、最后一个阅读插件约束和重新安装后的数据保留。实际内置实现分别位于 `plugins/pdf`、`plugins/markdown`、`plugins/ai`。

## 在线目录与安装

「设置 → 插件」提供已安装和发现两个标签。发现页支持名称、功能与作者搜索，以及阅读格式／功能扩展筛选。详情显示发布者、版本、大小、权限和依赖；用户确认后开始下载。下载可取消，安装和启用阶段不可取消。

`@leaf/contracts/catalog` 定义目录、签名封装、快照与下载事件。`src/core/plugins/catalog.ts` 负责确认安装计划、解析依赖、禁止降级、协调启停和延迟重新加载；平台提供目录读取和下载端口。`electron/plugins/catalog.ts` 在主进程校验 Ed25519 签名、有效期、目录版本、包大小、SHA-256 和完整 manifest，随后交给现有安装器。浏览器开发服务使用同一校验实现。

目录与插件包使用 HTTPS；重定向也必须保持 HTTPS。桌面平台通过 `net.request` 暴露每次重定向，由目录服务检查目标地址并独立发起请求，同时支持流式读取与取消。目录 URL 和信任公钥由 `electron/plugins/catalog-source.ts` 固定，渲染端只能选择目录中的插件 ID 和已确认的包哈希。网络不可用时可展示尚未过期、签名有效的缓存目录；实际下载仍需要网络。目录变更后必须重新确认。更新完成后保留插件数据并重新加载，原本停用的插件在更新后仍保持停用。

安装计划最多包含 20 个安装或启用操作，总下载量不超过 256 MiB。如果更新版本不满足其他已启用插件的依赖要求，需先停用对应插件，再更新。所需包全部下载并校验成功后才开始修改安装状态，按依赖顺序逐个安装或启用；每个包继续使用安装器的事务与回滚。下载阶段失败不会安装任何包，安装阶段失败时已完成的依赖会保留，可修复后重试。

官方目录的信任范围是 Leaf 签名审核的插件。后台进程用于生命周期和故障隔离，不能隔离恶意 Node 代码；本地文件安装仍由用户自行判断发布者可信性。

## 发布官方目录

先执行完整检查与插件构建，再使用仓库外的 Ed25519 私钥签名：

```sh
npm run check
npm run build:plugins
npm run catalog:build -- --key-file /path/outside/repository/catalog-signing.pem
npm run catalog:publish
```

签名器会检查私钥对应的公钥是否与应用内的信任公钥一致。发布脚本把带版本和内容哈希的包先上传到 GitHub 的 `plugins-v1` 发布，再上传签名目录；这个发布不会成为应用的 Latest 发布。既有包保留，以支持缓存目录中的下载地址。

仓库的「Publish plugin catalog」手动工作流使用 `LEAF_PLUGIN_SIGNING_KEY` 仓库 Secret。私钥不进入源码、插件包或应用安装包；轮换签名公钥需要先发布信任新公钥的应用。目录当前仅收录 PDF、Markdown 和 AI 三个插件，不自动收录未经审核的第三方包。
