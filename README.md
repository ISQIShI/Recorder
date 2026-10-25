# Recorder

插件化的个人资料与事务管理工具。TypeScript + Node.js 后端、Electron / Web / Capacitor 客户端共用 Vue 界面，功能遵循 Harness Cordis 的插件机制。当前已实现本机账号登录、会话撤销、纯文本/Markdown 记录保存与查询、带版本保护的更新 API，以及手动编辑、冲突草稿和正常离开提醒。未来支持 Android 本地后端及云同步的方向正在设计。

阅读时机：首次进入项目或查找各端工程入口。AI 先读 [AGENTS.md](AGENTS.md)，产品与技术工作从 [文档总导航](docs/README.md) 和 [当前技术状态](docs/current/technical-status.md) 开始。

协作使用 [GitHub Flow 与工作树规范](docs/current/development/git-workflow.md)：任务分支通过 PR 审查验证后压缩合并到 `main`。用户负责关键决策与验收，主会话负责规划、提示词和整合，其他 AI 按任务卡实现；见 [协作流程](docs/current/development/ai-collaboration.md) 与 [工作台账及模板](docs/work/README.md)。

## 工程入口

| 目录 | 用途 | 何时阅读 |
| --- | --- | --- |
| [backend](backend/README.md) | Cordis + Fastify 集中后端 | 后端、数据、插件和服务部署相关工作 |
| [desktop](desktop/README.md) | Electron 桌面客户端，目前优先 Windows | 桌面界面、设备接入和打包相关工作 |
| [web](web/README.md) | 浏览器客户端入口 | Web 部署与浏览器适配相关工作 |
| [android](android/README.md) | Capacitor + Vue，按需 Kotlin 原生能力 | 手机界面、采集、传输和提醒相关工作 |
| [shared](shared/README.md) | 跨端契约与 Vue/Cordis 客户端插件 | 跨端复用与依赖边界相关工作 |

## 本机运行

项目使用 [MIT 协议](LICENSE)。提交遵循 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)；克隆后运行 `git config core.hooksPath .githooks` 启用标题检查。后续部署与同步方向见 [本地宿主和同步演进](docs/current/architecture/local-runtime-sync.md)。

使用 Node 24.14.1、pnpm 10.33.0，在根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @recorder/desktop exec install-electron
pnpm check
```

分别在两个终端运行 `pnpm dev:backend` 与 `pnpm dev:web`，或在后端运行时执行 `pnpm desktop`。默认资料保存在根目录 `.recorder/`；首次建账号需要其中 `setup-code.txt` 的初始化码。当前仅开放 loopback，远程 HTTPS、附件、提醒、完整恢复与同步尚未实现。

| 指引 | 何时阅读 |
| --- | --- |
| [工程基线与验证记录](docs/current/development/engineering-baseline.md) | 安装、启动、检查依赖版本或确认已验证范围 |
| [账号与第一条记录流程](docs/current/development/first-record-flow.md) | 首次设置账号、保存查询、更新 API、会话管理或修改当前业务实现 |
| [全面插件化要求](docs/current/architecture/plugin-everything.md) | 设计和实现任何前后端能力之前 |
| [工程目录与依赖边界](docs/current/development/repository-layout.md) | 新增模块或共享代码之前 |
| [Android 环境配置](docs/current/development/android-environment.md) | 首次配置 SDK、构建 APK 和连接手机之前 |

`pnpm test:desktop` 验证基础插件，`pnpm test:records:desktop` 验证 Electron 创建账号、保存查询、重启登录保持与退出撤销；`node backend/test/record-edit-desktop.mjs` 验证真实更新 IPC、冲突与持久化。Windows/Linux 的自动检查见 [CI 指南](.github/CI.md)。Android 真机验证按用户安排延后。当前处于早期开发，备份恢复尚未完成，先用可丢弃的样本体验。
