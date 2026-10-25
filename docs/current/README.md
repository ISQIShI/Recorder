# 当前文档索引

状态：日常工作依据。更新日期：2026 年 10 月 25 日。

先读 [技术状态](technical-status.md)，再按任务选择下列文档；无需默认阅读历史。AI 行为规则见根目录 [AGENTS.md](../../AGENTS.md)。

| 文档 | 内容 | 何时阅读 |
| --- | --- | --- |
| [技术状态](technical-status.md) | 已确认选型、当前阶段、待定选择及推荐入口 | 每次开始新工作或判断是否可以按某项选型实施时 |
| [需求](product/requirements.md) | 目标、场景、用户偏好、范围和开放问题 | 需求设计、功能验收、范围变更以及首次理解项目时 |
| [架构概览](architecture/overview.md) | 集中后端、客户端、设备输入和资料存放边界 | 后端、客户端、存储、通信或插件相关工作前 |
| [本地宿主与同步演进](architecture/local-runtime-sync.md) | Android 本地后端、任意设备处理及网盘同步的未来方向与未实现边界 | 部署、身份、Android、存储或同步工作之前 |
| [全面插件化要求](architecture/plugin-everything.md) | 前后端全部能力的 Cordis 插件约束、最小启动边界和替换含义 | 实现任何功能、服务、UI 或设备适配之前 |
| [已确认后端技术](architecture/backend-stack.md) | Cordis 维护发行及配套 Loader、Fastify、SQLite + better-sqlite3，确认范围与验证状态 | 后端实现、依赖、存储与部署相关工作前 |
| [已确认 API 与认证主线](architecture/api-auth-baseline.md) | HTTP/REST、OpenAPI、SSE、本地账号与可撤销会话，已确认范围与待定配套 | 公共接口、SDK、登录、设备接入及插件公开能力相关工作前 |
| [记录编辑与版本冲突契约](interfaces/record-editing.md) | 已确认手动保存、离开提醒与冲突保留原则，以及待实现的更新 API/并发规则 | 开发或验收 B001 的后端更新、客户端编辑、传输与退出时 |
| [已确认数据模型主线](storage/data-model-baseline.md) | 统一记录基础、独立附件、标签分类关联与插件业务表，确认范围和未冻结细节 | 记录、附件、组织关系、数据库访问与插件持久化工作前 |
| [已确认数据访问与迁移主线](storage/data-access-baseline.md) | Drizzle、better-sqlite3、Kit、Recorder 统一命名空间账本与受控执行适配、卸载默认保留及维护体验 | 数据查询、事务、迁移工具、升级或插件卸载相关工作前 |
| [已确认备份与恢复主线](storage/backup-baseline.md) | 统一恢复集合 + 后台复制、restic、本地独立副本与加密异地副本，以及未冻结细节 | 备份、恢复、附件保留、插件数据备份、备份工具与 PC/服务器搬迁相关工作前 |
| [已确认前端技术](architecture/frontend-stack.md) | Vue 3 + TypeScript + Vite、Electron、Capacitor，跨端复用边界与待定配套 | Web、桌面界面、共享组件、UI 扩展与 Android 接入相关工作前 |
| [Android 当前方向](architecture/android-stack.md) | Capacitor + Vue、按需 Kotlin，以及收集暂存和提醒目标 | Android 界面、采集、设备存储、传输和通知工作前 |
| [工程目录规划](development/repository-layout.md) | 根目录各端工程、shared 的归属和依赖边界，各目录 README 入口 | 初始化工程、添加文件、拆分模块或设置构建前 |
| [Git 工作流与工作树整合](development/git-workflow.md) | GitHub Flow、任务分支、Conventional Commits、PR、保护与合并清理流程 | 建立工作树、提交、开 PR、整合成果或清理环境前 |
| [决策与 AI 协作](development/ai-collaboration.md) | 用户/规划整合者/实现者职责，决策到派工、交付与整合步骤 | 规划下一批工作、分配任务、生成提示词和接收交付时；具体材料见 [工作台账](../work/README.md) |
| [工程基线与验证记录](development/engineering-baseline.md) | 实际锁定版本、安装运行命令、插件实现范围和验证证据 | 运行工程、升级依赖、修改宿主或判断实现状态时 |
| [账号与第一条记录流程](development/first-record-flow.md) | 当前账号、会话、记录保存查询、schema/迁移边界与运行验收 | 运行产品流程、修改认证/记录/客户端或检查本轮完成范围时 |
| [Android 环境配置](development/android-environment.md) | Windows 安装 SDK/JDK、同步工程、构建 APK 与连接手机的步骤及未验证范围 | 首次配置 Android 环境、执行原生构建或真机检查时 |
| [开发启动评估](development/project-readiness.md) | 当前准备度、需先落实的契约、关键验证与建议启动顺序；不是已确认排期 | 判断能否开工、准备初始化工程或选择下一项设计工作时 |

本层将已确认内容作为当前依据；明确列出的待定项只是提示，不是默认采用。详细比较与设计从 [设计索引](../design/README.md) 进入；理由追溯从 [历史索引](../history/README.md) 进入。返回 [总导航](../README.md)。
