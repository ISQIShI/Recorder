# Recorder 当前技术状态

状态：当前工作入口，严格区分已确认与候选。更新日期：2026 年 10 月 25 日。

阅读时机：开始新工作、选择实现依据或判断是否需要用户决定时。完整需求与职责分别见 [需求](product/requirements.md)、[架构概览](architecture/overview.md)。

## 已确认的工作依据

| 项目 | 当前决定 |
| --- | --- |
| 名称 | Recorder |
| 后端形态 | 当前 Node.js 宿主面向 Windows/Linux；未来允许 Android 等设备本地后端，不强制 PC/服务器常驻，见 [本地宿主与同步](architecture/local-runtime-sync.md) |
| 后端语言与运行时 | TypeScript + Node.js；具体版本与结果见 [工程基线](development/engineering-baseline.md) |
| 全面插件化 | 前端、后端及功能模块都以插件实现，沿用 Cordis 可替换服务与生命周期；见 [全面插件化](architecture/plugin-everything.md) |
| 插件核心与加载 | Harness 维护版 Cordis 及配套 Loader，使用现有机制构建独立产品 |
| HTTP 框架 | Fastify；不替代 Cordis 的业务插件生命周期 |
| 数据库与驱动 | SQLite + better-sqlite3，在集中后端使用 |
| 数据访问 | Drizzle 的 SQL 风格查询 + better-sqlite3；基础工程已锁定版本并验证隔离样本 |
| 迁移工具与执行 | Drizzle Kit 辅助生成迁移，由后端统一协调执行；采用 Recorder 统一命名空间账本 + 受控 SQL 执行适配，具体格式与实现未冻结 |
| 插件卸载 | 默认保留数据；清除数据为另行设计的操作 |
| 结构升级体验 | 可以暂停业务写入并显示维护状态，完成后恢复；优先数据完整与可靠恢复 |
| 日常备份体验 | 尽量保持可用，只接受很短的快照窗口；不能把大文件复制和异地上传变成全程停写 |
| 备份副本方向 | 本地独立副本 + 加密异地副本；具体目标、频率和保留期限未定 |
| 备份恢复主线 | 统一恢复集合 + 后台复制；数据库快照、对应附件、插件数据与必要恢复材料作为一套管理，范围见 [已确认备份主线](storage/backup-baseline.md) |
| 备份工具 | restic；具体版本、仓库配置、集成与密钥保存方式未锁定 |
| 数据模型 | 统一记录基础 + 独立附件 + 标签分类关联 + 插件业务表；具体字段与存储实现未冻结 |
| 统一 API | HTTP/REST + OpenAPI + SSE；具体路径、schema 与配套库未冻结 |
| 认证主线 | 当前实例本地账号与可撤销会话；已实现初始化、登录、退出/撤销，Web Cookie、Electron 主进程 Bearer 与加密持久化 |
| Windows | Electron；起步版本已锁定，实际窗口验证通过 |
| 共享 Web 界面 | Vue 3 + TypeScript + Vite；起步版本已锁定，路由等配套仍按需选择 |
| Android | Capacitor + Vue，必要时用 Kotlin 补充原生能力 |
| Android 收集暂存 | 后端不可达时先存手机，连通后自动重试，明确标为尚未保存到后端 |
| Android 提醒目标 | 尽量准点；短时断网或 PC 后端关机时，已有提醒仍希望继续触发 |
| 数据归属 | 保存到后端设备；文件默认托管，也保留关联原文件的需求 |
| 多端关系 | 可连接同一后端；新增未来各端本地处理、通过网盘等云存储同步的方向，协议与 Android 宿主未实现 |
| 使用主体 | 同一后端先供用户自己使用，保留未来增加账号的空间 |
| 资料组织 | 多个标签，同一记录可同时归入多个分类，分类可以分层 |
| 删除体验 | 先进入回收站，可恢复；清空时再次确认彻底删除 |
| 优先级 | 即时唤起与响应性能、维护、扩展同级，资源占用次之 |
| 正文与登录体验 | 纯文本 + Markdown；首次设置用户名密码，之后可记住登录并撤销会话 |
| 编辑体验 | 用户已确认手动保存、离开未保存修改时提醒、冲突保留草稿并由用户处理；[更新 API 与双端传输](interfaces/record-editing.md) 已实现，编辑界面/草稿/离开提醒待 T03 |
| 开源与提交 | 公有 GitHub 仓库、MIT 协议；后续提交使用 Conventional Commits |
| 工作分工 | 用户负责关键选择与验收；主会话辅助决策、规划文档、拆任务及 Git 整合，其他 AI 按任务卡在工作树实现，见 [AI 协作](development/ai-collaboration.md) |
| Git 协作 | 根据用户授权采用 GitHub Flow，短期任务分支与 PR squash 合并；设置、验证要求与清理见 [Git 工作流](development/git-workflow.md)；具体任务见 [工作台账](../work/README.md) |
| 自动检查 | Windows/Linux 构建、类型、测试和文档检查，以及 PR 标题检查已启用，均为 main 必需检查；见 [Git 工作流](development/git-workflow.md) |
| 当前阶段 | 已实现账号、记录保存/查询/更新 API；18 项测试、6 组标题检查与 Electron 基础/账号重启/更新链路通过；编辑界面、附件、完整恢复等继续开发 |

## 尚未确认的技术选择

下列“推荐”用于后续讨论，不是默认已选，也不是依赖锁定。

| 项目 | 当前推荐方向 | 详细依据与待定点 |
| --- | --- | --- |
| 后端配置与扩展配套 | 当前使用代码 profile 装配 Loader；文件配置可使用已锁定的 Include | [工程基线](development/engineering-baseline.md)；Include 未启用，HMR、任务、日志等按需求引入 |
| 网络契约细节 | 在已选 HTTP/REST、OpenAPI、SSE 上细化独立文件通道、插件操作入口及并发/幂等协议 | [API 与认证主线](architecture/api-auth-baseline.md) → [接口设计](../design/interfaces/unified-api.md)；完整路径和 schema 未冻结 |
| 认证后续 | 当前 Cookie / Electron Bearer 已实现；Android 凭据、改密找回、配对、HTTPS 与刷新继续设计 | [已实现账号流程](development/first-record-flow.md) 与 [身份提案](../design/security/identity-device-access.md) |
| 数据模型细节 | 按已确认模型细化字段、约束、索引、附件对象和少量版本化 JSON | [数据模型主线](storage/data-model-baseline.md) → [模型细化](../design/storage/data-model.md)；具体表结构未冻结 |
| 迁移机制细节 | 在已选 Recorder 账本与受控执行适配上细化维护独占、版本摘要、依赖排序、逐步事务及显式恢复 | [数据访问主线](storage/data-access-baseline.md) → [核心与插件迁移提案](../design/storage/plugin-migrations.md)；账本格式、执行适配实现、锁与清除契约未冻结 |
| 存储生命周期 | 同库业务表、托管文件目录、分阶段提交、回收站与可恢复清理 | [存储设计](../design/storage/storage-lifecycle.md)；SQLite 参数、索引、文件清理与备份策略待定 |
| 备份与恢复细节 | 细化已确认的统一恢复集合 + 后台复制：短协调窗口、在线数据库快照、不可变附件保留 | [备份恢复提案](../design/storage/backup-recovery.md)；窗口预算、保留保护、清单、恢复切换与密钥管理待定 |
| restic 集成 | 工具已选；建议由 Cordis 适配插件调用受控子进程，Recorder 统一管理任务 | [restic 集成设计](../design/storage/restic-integration.md)；版本、双目标复制、保留映射、密钥与分发方式未冻结 |
| 部署接入 | 本机默认 loopback；跨设备使用可信 HTTPS；服务器通过反向代理提供统一入口 | [部署提案](../design/operations/deployment-access.md)；PC 外出访问需求待明确，网络方案与代理未选定 |
| Windows 内部组织 | 主进程设备与连接协调、preload 窄桥接、共享 UI | [Electron 协作提案](../design/architecture/backend-electron-boundaries.md)；后端独立，是否随桌面安装包提供待定 |
| 前端配套与扩展契约 | 基础面板插件已验证，进一步细化路由、状态与正式 UI 扩展 | [前端技术](architecture/frontend-stack.md)；组件库、独立分发与正式契约尚未选择 |
| Android 内部组织 | 原生入口、持久待提交队列、共享会话与传输、Vue 轻量收集界面 | [Android 协作提案](../design/architecture/backend-android-boundaries.md)；存储实现、任务库、桥接与 API 契约未冻结 |
| Android 提醒实现 | 后端计算并提前下发计划，手机系统定时通知；优先验证 FCM 辅助更新与投递 | 同上；体验目标已确认，具体插件、渠道与投递策略待确定，未进行真机验证 |

## 仍需讨论的产品与部署问题

- 桌面是否附带本机后端，以及服务的启动、升级和退出方式。
- PC 后端是否需要在外出时访问；账号初始化、登录便利性、凭据恢复和会话有效期。
- Android 暂存的容量、保留与取消规则；Windows/Web 是否也需要持久暂存另议。
- 提醒提前登记范围、系统能力不足时的提示、多设备投递及错过提醒的处理；Android 的准点与短时离线目标已确认。
- UI 扩展是否必须独立热安装，以及未来第三方扩展的边界。
- 原文件关联范围、文件规模、临时资料保留规则和 AI 数据访问规则。
- 正文已确认纯文本和 Markdown；富文本/预览、分类移动与删除体验、附件复用、修订历史，以及备份具体目标、周期、保留期限、可接受丢失的最近数据范围和恢复耗时继续讨论。
- Android 本地宿主、跨实例账号/资料库关联、网盘同步对象和冲突处理，详见本地宿主与同步演进。

上述问题按任务需要询问用户，不要求一次性全部决定。MVP、实现排期、插件市场、数据库同步和完整 AI agent 系统均未定案。

## 使用与维护

[B001 记录编辑与自动检查](../work/b001-record-editing/README.md) 正在进行：T02 自动检查（PR #3）、T01 更新接口/双端传输（PR #4）已合并；T03 编辑界面和离开提醒前置已满足，待用户启动实现会话。原会话/工作树可以复用，但须从最新 main 建立新任务分支并读取更新后的任务卡。当前 schema 已有 revision，本批不改库结构；回收站前须先完成后续迁移与恢复验证。此顺序不是完整 MVP 或排期。

当前完成基础工程及账号初始化、登录、会话撤销、记录保存、列表/关键字查询、带版本保护的更新 API 与双端传输。验证范围见 [账号与第一条记录流程](development/first-record-flow.md)；版本和首轮插件验证保留在 [工程基线](development/engineering-baseline.md)。编辑 UI 尚未完成；初始命名空间迁移已实现，历史版本升级、完整恢复、附件和 restic 集成仍未实现，不冻结完整 MVP 或排期。

后端、共享界面和 Android 主线已确认，细节见 [后端技术](architecture/backend-stack.md)、[前端技术](architecture/frontend-stack.md) 和 [Android 方向](architecture/android-stack.md)。工程入口见 [目录规划](development/repository-layout.md)。Android 原生工程已生成并同步资源；用户确认没有 SDK，APK 与真机测试待按 [环境指南](development/android-environment.md) 配置后进行。Linux CI runner 检查已通过，Linux 生产部署、独立浏览器编辑端到端与性能未验证。新决定获用户确认后更新本页及对应有效说明，再补入 [历史决策记录](../history/decisions/decision-log.md)。已有明确决定不反复询问，候选不自动转为已确认。

返回 [当前文档索引](README.md) 或 [总导航](../README.md)。
