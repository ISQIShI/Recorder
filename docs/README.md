# Recorder 文档总导航

状态：项目文档入口。更新日期：2026 年 10 月 25 日。

AI 从根目录 [AGENTS.md](../AGENTS.md) 开始，再阅读 [当前技术状态](current/technical-status.md)。项目已按授权开始工程实现：后端 TypeScript + Node.js，前端、后端和功能模块全面插件化；技术选择继续遵守此前确认主线。基础 workspace、插件宿主和隔离诊断链已经运行，实际范围见 [工程基线](current/development/engineering-baseline.md)。正式记录、认证、迁移协调、附件与备份恢复仍待实现，活跃提案不等于已完成能力。

## 三层文档与阅读时机

| 层次 | 入口 | 何时阅读 | 如何使用 |
| --- | --- | --- | --- |
| 当前有效说明 | [current 索引](current/README.md) | 开始工作时，按任务读取需求、架构和技术状态 | 日常依据；候选项明确标为待定 |
| 活跃设计提案 | [design 索引](design/README.md) | 工作涉及相应功能、技术选择或尚未冻结的契约时 | 用于完善方案；不视作已获确认或已实现 |
| 历史背景 | [history 索引](history/README.md) | 追溯决策理由、需求变化或重新比较旧方向时 | 按需参考，不加入默认必读清单 |

## 按任务找文档

| 当前任务 | 阅读路径 |
| --- | --- |
| 了解项目或检查需求范围 | [技术状态](current/technical-status.md) → [需求](current/product/requirements.md) |
| 设计或实现任何插件能力、判断启动底座边界 | [全面插件化要求](current/architecture/plugin-everything.md) → 对应工程 README；不能另写一套生命周期 |
| 安装、运行、验证工程或升级依赖 | [工程基线与验证记录](current/development/engineering-baseline.md) → 对应工程 README |
| 准备构建 APK 或连接 Android 手机 | [Android 环境配置](current/development/android-environment.md)；用户尚未安装 SDK，APK/真机验证待执行 |
| 调整后端或多端职责 | [架构概览](current/architecture/overview.md) → [后端与 Electron 协作提案](design/architecture/backend-electron-boundaries.md) |
| 设计三端共用接口、SDK 或插件公开操作 | [API 与认证主线](current/architecture/api-auth-baseline.md) → [统一 API 设计](design/interfaces/unified-api.md)；客户端适配再读对应协作提案 |
| 设计账号、凭据、权限或多设备管理 | [API 与认证主线](current/architecture/api-auth-baseline.md) → [身份与设备设计](design/security/identity-device-access.md)；具体认证库和登录交互仍待定 |
| 设计 PC 本机、局域网或远程服务器接入 | [部署接入提案](design/operations/deployment-access.md)；PC 外出访问的需求仍待明确 |
| 后端开发、依赖或存储相关工作 | [技术状态](current/technical-status.md) → [已确认后端技术](current/architecture/backend-stack.md)；需要追溯时再读 [后端比较](history/research/backend-technology-selection.md) |
| 设计记录、附件、标签分类和查询 | [数据模型主线](current/storage/data-model-baseline.md) → [模型细化](design/storage/data-model.md)；产品范围参考 [当前需求](current/product/requirements.md) |
| 设计 SQLite 查询、repository 或事务 | [已确认数据访问主线](current/storage/data-access-baseline.md)；追溯选型时再读 [历史比较](history/research/sqlite-access-comparison.md) |
| 设计核心与插件升级、版本账本或失败恢复 | [数据访问主线](current/storage/data-access-baseline.md) → [迁移机制提案](design/storage/plugin-migrations.md)；账本与执行适配方向、升级停写已确认，具体格式和恢复机制仍需细化 |
| 设计上传落盘、回收站、文件清理或检索 | [存储与生命周期提案](design/storage/storage-lifecycle.md)；逻辑关系再读 [数据模型](design/storage/data-model.md) |
| 设计备份、整库恢复或 PC/服务器搬迁 | [已确认备份主线](current/storage/backup-baseline.md) → [备份恢复细化](design/storage/backup-recovery.md)；统一恢复集合 + 后台复制已确认，清单和执行协议继续设计 |
| 实现 Cordis 备份适配或管理仓库 | [备份主线](current/storage/backup-baseline.md) → [restic 集成](design/storage/restic-integration.md)；工具已选，具体版本和协议待细化；追溯理由再读 [历史比较](history/research/backup-tool-comparison.md) |
| 业务插件新增数据或卸载保留 | [插件数据契约](design/plugins/data-extension.md) → 按需读 [迁移与保留机制](design/storage/plugin-migrations.md)；公开操作同时参考 [统一 API](design/interfaces/unified-api.md) |
| 设计桌面输入、通信或插件 UI | [协作提案](design/architecture/backend-electron-boundaries.md)；仅涉及中转时再读 [临时中转设计](design/product/temporary-shelf.md) |
| 开展界面、共享组件或 UI 扩展工作 | [已确认前端技术](current/architecture/frontend-stack.md) → 按需阅读 [协作提案](design/architecture/backend-electron-boundaries.md)；追溯框架理由再读 [Vue 与 React 历史比较](history/research/ui-framework-comparison.md) |
| 设计 Android 采集、暂存、传输或提醒 | [Android 当前方向](current/architecture/android-stack.md) → [Android 与 Cordis 协作提案](design/architecture/backend-android-boundaries.md)；追溯选型再看 [历史比较](history/research/android-client-comparison.md) |
| 初始化工程、添加文件或划分共享模块 | [工程目录规划](current/development/repository-layout.md) → [项目工程入口](../README.md) 中对应目录的 README |
| 判断设计是否足以开工、选择接下来的工作 | [开发启动评估](current/development/project-readiness.md)；区分当前依据、实现前契约和需实际验证的事项，不把建议顺序当成已确认 MVP |
| 查 Electron 选择理由或旧需求变化 | [历史索引](history/README.md)，选择对应比较或决策记录 |

## 后续文档放在哪里

已确认且供实现使用的接口、身份与权限、存储、插件契约、开发方法、测试、部署和用户说明，按需放入 `current/interfaces/`、`current/security/`、`current/storage/`、`current/plugins/`、`current/development/`、`current/testing/`、`current/operations/`、`current/user-guide/`。未冻结的对应设计放入 `design/` 下同类目录；被替代的方案归入 `history/`。产生实际内容时再创建目录。

每份文档都要在其所属层级的 README 中登记用途和阅读时机。移入历史的文档保留当时分析，但在顶部指向当前依据；当前正文不保留整段讨论时间线或已经结束的选型比较。状态、日期与内部链接应一同维护。

## 本次整理的迁移关系

原 `product/vision.md` 与 `architecture/overview.md` 的有效说明进入 `current/`；原协作提案与临时中转设计进入 `design/`；前期技术比较、Windows 比较、命名候选和决策记录进入 `history/`。完整文件清单与阅读时机分别见三层索引，不再维护旧路径副本。
