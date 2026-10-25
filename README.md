# Recorder

统一后端驱动的个人资料与事务管理工具。已开始工程实现：TypeScript + Node.js 后端、Electron / Web / Capacitor 客户端，共用 Vue 界面，所有功能遵循 Harness Cordis 的插件机制。当前交付为可运行的工程验证台，正式资料管理仍待实现。

阅读时机：首次进入项目或查找各端工程入口。AI 先读 [AGENTS.md](AGENTS.md)，产品与技术工作从 [文档总导航](docs/README.md) 和 [当前技术状态](docs/current/technical-status.md) 开始。

## 工程入口

| 目录 | 用途 | 何时阅读 |
| --- | --- | --- |
| [backend](backend/README.md) | Cordis + Fastify 集中后端 | 后端、数据、插件和服务部署相关工作 |
| [desktop](desktop/README.md) | Electron 桌面客户端，目前优先 Windows | 桌面界面、设备接入和打包相关工作 |
| [web](web/README.md) | 浏览器客户端入口 | Web 部署与浏览器适配相关工作 |
| [android](android/README.md) | Capacitor + Vue，按需 Kotlin 原生能力 | 手机界面、采集、传输和提醒相关工作 |
| [shared](shared/README.md) | 跨端契约与 Vue/Cordis 客户端插件 | 跨端复用与依赖边界相关工作 |

## 本机运行

使用 Node 24.14.1、pnpm 10.33.0，在根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @recorder/desktop exec install-electron
pnpm check
```

分别在两个终端运行 `pnpm dev:backend` 与 `pnpm dev:web`。构建后运行 `pnpm desktop` 可查看 Electron 界面，后端需要单独启动。当前只使用 loopback 诊断接口与隔离验证数据，未实现正式记录、认证、附件、提醒或备份。

| 指引 | 何时阅读 |
| --- | --- |
| [工程基线与验证记录](docs/current/development/engineering-baseline.md) | 安装、启动、检查依赖版本或确认已验证范围 |
| [全面插件化要求](docs/current/architecture/plugin-everything.md) | 设计和实现任何前后端能力之前 |
| [工程目录与依赖边界](docs/current/development/repository-layout.md) | 新增模块或共享代码之前 |
| [Android 环境配置](docs/current/development/android-environment.md) | 首次配置 SDK、构建 APK 和连接手机之前 |

`pnpm test:desktop` 执行真实 Electron 隐藏窗口检查；Android 已生成原生工程并同步资源，APK 与真机验证待 SDK 配置后进行。完整范围及未完成事项以工程基线为准。
