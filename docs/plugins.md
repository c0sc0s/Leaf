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

当前安装从本地文件选择包，没有在线市场或签名校验。后台进程用于生命周期和故障隔离，不能隔离恶意 Node 代码；只安装可信插件。
