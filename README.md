# Leaf

Leaf 是一个本地桌面阅读器。书架、续读、书签、批注和笔记由应用提供；文档格式和扩展功能通过插件安装。

桌面安装包默认启用 PDF 阅读插件。Markdown 阅读和 AI 阅读助手分别生成独立的 `.leaf-plugin` 文件，可在「设置 → 插件」中安装、停用或卸载。安装其他阅读插件后也可以卸载 PDF；应用会保留至少一个启用的阅读插件。

PDF 支持虚拟化渲染、搜索、目录、双页、批注及批注 PDF 导出。Markdown 支持单文件与文件夹、章节链接、图片、代码高亮、搜索和批注。AI 插件支持 OpenAI 兼容接口、原文问答、总结、可跳转引用以及模型用量和执行记录；API Key 保存在桌面的凭据服务中。

```sh
npm ci
npm run desktop
```

需要 Node.js 22.18 或更新版本。开发应用默认也只安装 PDF；可从 `dist-plugins/` 安装另外两个插件。

- [架构与依赖边界](docs/architecture.md)
- [插件协议与开发](docs/plugins.md)
- [开发、测试与打包](docs/development.md)

本项目使用 MIT 许可证。第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
