# 活跃设计索引

状态：按任务阅读的建议与待定契约。更新日期：2026 年 10 月 25 日。

这里存放仍需讨论或验证的方案，不是默认全部必读，也不代表已实现。先以 [当前技术状态](../current/technical-status.md) 和 [当前架构](../current/architecture/overview.md) 确认边界。

| 文档 | 内容 | 何时阅读 |
| --- | --- | --- |
| [数据模型细化](storage/data-model.md) | 已确认模型下的候选实体、字段、约束与账号归属 | 细化表结构、查询、正文和文件关系时；先读当前模型主线 |
| [核心与 Cordis 插件迁移](storage/plugin-migrations.md) | 命名空间版本与账本、依赖排序、维护独占、事务与阶段恢复、卸载保留 | 设计升级、迁移执行适配、失败恢复、插件重装与清除数据时；先读当前数据访问主线 |
| [备份与恢复](storage/backup-recovery.md) | 已确认主线下的集合清单、短窗口协调、附件保护、密钥、恢复与搬迁细节 | 细化日常备份、升级恢复点、PC/服务器恢复或搬迁时；先读当前备份主线 |
| [restic 与 Cordis 集成](storage/restic-integration.md) | 已选 restic 的进程适配、双目标复制、保留、凭据、生命周期与跨平台验证 | 设计或实现备份适配、仓库、任务调度与恢复入口时；仅追溯选型理由读历史比较 |
| [存储与生命周期](storage/storage-lifecycle.md) | SQLite 访问、文件落盘、上传恢复、回收站、检索与备份 | 设计数据库运行、文件提交、删除恢复和长期存储时 |
| [业务插件数据扩展](plugins/data-extension.md) | 插件表与 JSON、事务、迁移、停用保留和附件引用契约 | 插件需要保存数据、升级 schema、清理或导出数据时 |
| [统一后端 API](interfaces/unified-api.md) | HTTP/OpenAPI、插件操作注册、文件传输、幂等并发和在线事件 | 设计公共接口、跨端 SDK、插件公开操作或传输契约时 |
| [身份认证与多设备](security/identity-device-access.md) | 个人账号、可撤销会话、Web Cookie、原生端凭据及设备授权 | 设计登录、会话续期、权限、设备接入或退出时 |
| [PC 与远程部署接入](operations/deployment-access.md) | 本机、局域网、PC 外出访问与服务器部署的网络和认证边界 | 设计监听地址、HTTPS、Web 发布、反向代理或后端连接配置时 |
| [Android 与 Cordis 协作](architecture/backend-android-boundaries.md) | 原生与 Vue 边界、分享接收、持久队列、幂等上传、提醒计划与通信 | 设计或实现 Android 采集、传输、系统通知及后端接入时 |
| [Cordis 与 Electron 协作](architecture/backend-electron-boundaries.md) | 模块职责、IPC/API、业务插件、UI 扩展、设备适配及生命周期 | 设计或实现后端与桌面连接、插件接口、文件输入输出时 |
| [桌面临时中转](product/temporary-shelf.md) | 后期功能的场景、候选交互与待定行为 | 用户要求推进临时中转功能时；其他任务无需默认阅读 |

后端主线、Vue 界面和 Android 外壳已经确认，工作先读 [后端技术](../current/architecture/backend-stack.md)、[前端技术](../current/architecture/frontend-stack.md) 或 [Android 方向](../current/architecture/android-stack.md)；选型理由已转入 [历史索引](../history/README.md) 中的对应比较。[API 与认证主线](../current/architecture/api-auth-baseline.md)、[数据模型主线](../current/storage/data-model-baseline.md) 和 [数据访问主线](../current/storage/data-access-baseline.md) 也已确认，具体契约与实现选择继续保留在本层。其他方案获确认后，同样将有效规则提炼到 `current/`，完成讨论的比较转入 `history/`。不要仅因提案已存在便锁定技术或扩大开发范围。返回 [总导航](../README.md)。
