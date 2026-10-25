# Recorder 工程基线与验证记录

状态：起步版本与首轮基础验证记录。后续账号和记录流程已实现，当前使用以 [账号记录流程](first-record-flow.md) 为准。更新日期：2026 年 10 月 25 日。

阅读时机：安装依赖、运行工程、修改工具链、编写插件或判断某项能力是否已经验证时。先读 [全面插件化要求](../architecture/plugin-everything.md)，目录与归属见 [工程布局](repository-layout.md)。

## 首轮工程范围（已完成）

用户已确认后端 TypeScript + Node.js，并授权正式开始工程搭建和关键技术验证。当前完成独立后端、三个客户端入口、共享契约与 UI 的 pnpm workspace，以及一条隔离诊断链：Vue UI → 平台传输插件 → Fastify → Cordis 操作插件 → SQLite/Drizzle。它用于验证选定技术和可插拔边界，尚不提供正式记录保存。

所有产品能力采用 Cordis 插件。后端实际使用维护版 Loader；UI 侧使用同一 Cordis 核心管理服务、界面贡献和副作用。浏览器打包只包含适合该环境的核心，不引入 Node Loader。没有另写依赖解析器或插件生命周期状态机。

## 锁定的起步版本

| 部分 | 当前工程版本 | 说明 |
| --- | --- | --- |
| Node.js / pnpm | 24.14.1 / 10.33.0 | 本机实际运行；Node 24 为当前工作线，`.node-version` 与 packageManager 记录基线 |
| TypeScript | 5.9.3 | 本轮编译基线，未为了追逐最新大版本扩大迁移范围 |
| Harness Cordis / Loader | 4.0.5 / 1.0.6 | `@deepseek-ai/cordis`、`@deepseek-ai/cordis-plugin-loader`；实际启停测试通过 |
| 配套 Include | 1.0.10 | 已安装、锁定，尚未作为启动配置入口启用；当前以代码中的 profile 装配 |
| Fastify | 5.12.7 | loopback 诊断 HTTP 接入插件 |
| better-sqlite3 / Drizzle ORM / Kit | 13.0.3 / 0.45.4 / 0.31.11 | 原生驱动、SQL 风格查询、隔离迁移 SQL 生成已运行 |
| Vue / Vite | 3.5.44 / 8.3.5 | 三端共享插件界面；当前组件以 TypeScript 定义，未引入 SFC 编译配套 |
| Electron | 45.0.0 | Windows 实际启动并执行隐藏窗口检查；安装包与自动更新未实现 |
| Capacitor core / android / CLI | 8.5.3 | 生成 `android/native`，Web 构建和原生资源同步通过 |

准确依赖树以根目录 `pnpm-lock.yaml` 为准，直接依赖使用精确版本。版本来自官方注册表及实际安装包核验；这些是可调整的工程基线，不是用户逐个确认的永久版本。Node 和原生模块支持范围需在升级时重新检查。restic 尚未安装或锁定版本。

## 安装与运行

在仓库根目录使用 Node 24.14.1 和 pnpm 10.33.0：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @recorder/desktop exec install-electron
pnpm check
```

Electron 二进制使用已锁定包提供的安装命令下载；当前 Electron 包不依赖传统 install 生命周期自动下载。首次下载需要访问官方包及 Electron 分发资源。better-sqlite3 当前版本随包提供原生预构建文件，本机运行测试已验证可加载，不能据此推断所有平台都通过。

另开终端分别运行：

```powershell
pnpm dev:backend
pnpm dev:web
```

后端默认 `http://127.0.0.1:4317`，Web 使用 Vite 输出的本机地址并代理到该后端。先构建再运行 `pnpm desktop` 可打开桌面验证界面。当前桌面不自动启动后端。`RECORDER_PORT` 可调整后端端口，桌面相应通过 `RECORDER_BACKEND_URL` 指向该 loopback 地址；Web 开发代理端口目前在 Vite 配置中指定。

首轮仅提供隔离诊断数据；后续业务入口已切换至可持久化的账号与记录插件，运行方法及限制见 [账号记录流程](first-record-flow.md)。旧 foundation profile 仍用于插件测试。当前仍只监听 loopback，生产 HTTPS、上传和 SSE 尚未完成。

## 已实现的插件边界

| 工程 | 插件或能力 | 替换与清理 |
| --- | --- | --- |
| backend | 操作注册表、SQLite 验证存储、状态操作、Fastify 接入 | Loader 装配；服务依赖控制激活；操作随所属插件撤回；HTTP 和数据库关闭可等待 |
| shared/client | 面板注册表、Vue 宿主、状态面板、生命周期示例、传输及平台提供者 | 使用 Cordis 注入；面板按所属插件注册；Vue mount/unmount 纳入 effect；兼容传输可替换 |
| desktop | 窗口、后端连接、界面加载、快捷键、preload IPC 提供者 | 窄桥接；连接校验调用窗口及 frame；卸载移除 handler、取消请求、释放快捷键/窗口 |
| web | 共享 UI 插件组合、同源 fetch 传输 | 开发代理复用同一 HTTP 契约，不导入后端实现 |
| android | Capacitor 工程与共享 UI 插件组合 | 连接提供者明确返回“未配置”；未伪装成已接入后端或已保存内容 |

Context 初始化、平台 ready/quit、模块装配、固定 preload ABI 和生成的 Android Activity 属于最低启动边界。正式功能不得继续塞进入口。原生插件、权限或二进制变化可能要求重建/重启；此次未实现第三方插件下载与独立热安装。

## 首轮验证证据与范围

环境为本机 Windows、Node 24.14.1；以下记录仅覆盖实际执行结果。

| 检查 | 结果与能证明的范围 |
| --- | --- |
| `pnpm build` | 后端、共享包、Electron、Web、Android Web 资源构建通过 |
| `pnpm typecheck` | 各工程源码、Electron renderer、后端及共享客户端测试类型检查通过 |
| `pnpm test` | 7 项通过：Loader 依赖撤回/重载，兼容存储替换与卸载保留，HTTP 重载及输入拒绝，启动失败传播，生成 SQL 与示例账本事务回滚，UI 依赖撤回/恢复，响应运行时校验 |
| `pnpm --filter @recorder/backend verify:generate` | Drizzle Kit 实际生成隔离 `validation_probe` 的迁移 SQL；测试实际读取该 SQL 执行 |
| `pnpm test:desktop` | 实际 Electron 隐藏窗口检查通过：后端 TCP → IPC → Vue 展示，界面插件移除和重装，renderer 无 Node require；截图人工查看通过 |
| `pnpm --filter @recorder/android native:sync` | Capacitor 原生工程生成后资源复制及插件同步通过；不表示 Gradle 或 APK 构建通过 |

`pnpm check` 组合构建、类型检查、测试和文档检查；桌面 smoke 单独运行，因为需要能启动 Electron 的桌面环境。截图与 JSON 结果位于忽略的 `artifacts/`，不作为源码提交。失败的启动探针和被修复的 ESM/Loader 类型问题不当作已支持能力。

首轮未覆盖的账号与记录保存查询现已补充验证，后续 T01 又完成更新 API 与双端传输。B001 最终整合版本 `pnpm check` 的 26 项测试、独立标题脚本的 6 组测试、基础/编辑冲突及四阶段退出/真实更新三组 Electron 检查均通过，见 [账号记录流程](first-record-flow.md) 与 [B001 整合记录](../../work/b001-record-editing/README.md)。以上是首轮之后的验证，不改写本节原始结果。

Windows/Linux CI 已通过冻结安装、构建、类型、测试与文档检查，并成为 main 的必需检查，操作见 [CI 指南](../../../.github/CI.md)。Linux 生产部署、Windows 分发/托盘/快捷键实按/剪贴板/拖拽、其他浏览器和 Chrome 原生离开弹窗选择分支、Android APK/真机/本地宿主/分享/暂存/提醒、完整升级恢复、附件和 restic 一致性及性能仍未验证。Android 环境按 [配置指南](android-environment.md) 后续补齐。

首轮 foundation profile 默认内存探针，持久化测试使用临时文件；`backend/validation` 不是正式 schema。当前业务入口使用 `.recorder/` 数据库及 `backend/migrations` 的初始迁移，详见账号记录流程。

## 后续工作

账号与记录创建/查询/手动编辑、冲突草稿和正常离开提醒已完成；Chrome 编辑操作由实现者验收，刷新/关闭提醒由用户确认，范围见 [B001 记录](../../work/b001-record-editing/README.md)。下一步建议安全升级/恢复，再实现回收站；尚未派工或冻结完整 MVP、排期，Android 本地宿主及同步另行验证。

返回 [当前文档索引](../README.md) 或 [总导航](../../README.md)。
