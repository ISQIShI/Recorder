# shared：跨端共享部分

状态：共享契约与客户端插件包已建立。更新日期：2026 年 10 月 25 日。

阅读时机：抽取共享组件、网络契约、业务客户端和 UI 扩展接口前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [前端技术](../docs/current/architecture/frontend-stack.md) 和 [工程目录规划](../docs/current/development/repository-layout.md)。

`contracts/` 提供框架无关的隔离诊断契约与运行时响应校验；`client/` 提供 Cordis 服务契约、面板注册表、Vue 宿主、UI 贡献和传输提供者。`clientProfile` 选择插件及配置，`mountClient` 只负责 Context 和装配，生命周期仍属于 Cordis。

这里不保存后端数据库访问或业务规则；不直接依赖 Electron、Capacitor 或 Android SDK。平台工程注入自身适配。UI 及传输插件遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)；Kotlin 可依据同一协议生成或实现客户端，但不能直接复用 TypeScript 运行时代码。

契约、生成客户端和动态插件调用工作读 [统一 API 提案](../docs/design/interfaces/unified-api.md)。共享部分约定操作语义，Web Cookie、Electron IPC 和 Android 原生会话由平台适配处理。

根目录构建会先编译共享包，再构建依赖它们的客户端；`pnpm test` 包含 UI 服务撤回、兼容替换和响应校验测试。尚无独立发布、任意第三方热安装或正式业务 SDK；结果和版本见 [工程基线](../docs/current/development/engineering-baseline.md)。返回 [工程总入口](../README.md)。
