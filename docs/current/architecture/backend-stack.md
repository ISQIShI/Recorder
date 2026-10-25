# Recorder 已确认后端技术

状态：技术主线已确认，起步依赖已锁定并完成基础验证；正式接口仍待细化。更新日期：2026 年 10 月 25 日。

阅读时机：后端实现、依赖选择、兼容验证、存储和部署相关工作。本文是工作依据；只有需要追溯理由或重新评估时，才阅读 [后端选型比较](../../history/research/backend-technology-selection.md)。

## 已确认选择

| 层次 | 当前采用 | 确认范围 |
| --- | --- | --- |
| 语言与运行时 | TypeScript + Node.js | 用户已确认；具体版本以工程锁定和验证为准 |
| 插件核心 | Harness 维护版 `@deepseek-ai/cordis` | 使用公开发行方向构建独立 Recorder，不引入完整 Harness 应用 |
| 插件加载 | 配套 `@deepseek-ai/cordis-plugin-loader` | 与维护版核心采用匹配的依赖家族，不混装上游 Loader |
| HTTP 框架 | Fastify | 负责网络接入；业务插件机制继续由 Cordis 承担 |
| 数据库 | SQLite | 当前单个集中后端的结构化存储 |
| 数据库驱动 | better-sqlite3 | 在后端访问 SQLite，不放到 Electron UI 中执行 |
| 数据访问 | Drizzle 的 SQL 风格查询 | 配合 better-sqlite3；版本已锁定，正式 repository 接口未冻结 |
| 迁移生成与执行 | Drizzle Kit 辅助生成，Recorder 统一命名空间账本 + 受控 SQL 执行适配 | 不让各业务插件自行并发升级数据库；账本格式与适配实现继续设计 |
| 备份执行工具 | restic | 与统一恢复集合 + 后台复制配合；具体版本、部署、凭据和执行协议未冻结 |

这些选择不再作为待选项反复询问。用户确认技术主线，AI 在授权实现中核验并锁定起步版本，见 [工程基线](../development/engineering-baseline.md)；前期研究版本表不覆盖实际 lockfile。核心后端运行在 PC 或远程服务器，前端通过后端接口工作；不因 SQLite 是嵌入式数据库就改为每个客户端各存一份业务库。

HTTP/REST + OpenAPI + SSE、本地账号与后端可撤销会话也已确认，确认范围见 [API 与认证主线](api-auth-baseline.md)。

数据模型采用统一记录基础、独立附件、标签分类关联和插件业务表，范围见 [数据模型主线](../storage/data-model-baseline.md)。Drizzle 与迁移工具的确认范围见 [数据访问主线](../storage/data-access-baseline.md)，具体表结构仍未冻结。用户接受结构升级时暂停业务写入并显示维护状态，优先数据完整与可靠恢复。

## 仍需细化的事项

- 后端语言和运行时已选 TypeScript + Node.js；起步版本、pnpm workspace 与构建方式已落地，升级时按工程基线复验。
- 若采用文件配置，使用同一维护分支的 `@deepseek-ai/cordis-plugin-include`；是否采用该配置入口及辅助插件清单尚待细化。HMR、Timer 和日志等按需加入。
- 固定 API 门面配动态业务操作注册表、完整 schema、文件和事件恢复契约仍按 [统一 API 设计](../../design/interfaces/unified-api.md) 细化。
- Web Cookie、原生 Bearer 凭据及配套库见 [身份与设备设计](../../design/security/identity-device-access.md)；本机/LAN/服务器的入口和代理见 [部署提案](../../design/operations/deployment-access.md)，具体实现尚未选定。
- Drizzle、Kit 与驱动已锁定并验证查询、生成 SQL 和事务回滚；Recorder 统一命名空间账本、受控 SQL 执行适配和插件卸载默认保留数据已确认，具体格式、升级依赖与失败恢复见 [迁移机制提案](../../design/storage/plugin-migrations.md)，完整迁移协调器尚未实现。
- 具体表结构、插件迁移、中文检索和资料库布局按 [模型细化](../../design/storage/data-model.md)、[存储生命周期](../../design/storage/storage-lifecycle.md) 和 [插件数据契约](../../design/plugins/data-extension.md) 继续设计。
- 桌面安装包是否附带后端，以及启动、更新和备份恢复的具体执行方式继续讨论；备份总体方案已确认，见下文。

## 实现时应保持的边界

所有后端产品能力都以 Cordis 插件提供，包括 HTTP、数据库、迁移、认证、任务与备份，要求同前端和设备能力一起遵守 [全面插件化](plugin-everything.md)。消费者通过服务契约取用能力，启动装配不固化提供者。

业务校验、访问控制和持久化在后端完成。Cordis 管理服务依赖与运行资源，不能把插件停用解释为删除业务数据；迁移、在途任务和已提交事务需要独立规则。

Fastify 的业务接入应服从同一后端服务边界，避免重复维护第二套业务插件生命周期。动态扩展的路由与操作分发策略按协作提案进一步设计。

文件默认复制到后端托管资料库，结构化数据记录附件引用；数据库事务不自动覆盖普通文件写入。备份已选统一恢复集合 + 后台复制，覆盖数据库、对应附件、插件保留数据及必要恢复材料，范围见 [备份主线](../storage/backup-baseline.md)。日常只接受很短的快照窗口，副本方向为本地独立副本与加密异地副本，工具已选 restic；执行细节见 [备份恢复提案](../../design/storage/backup-recovery.md) 和 [restic 集成](../../design/storage/restic-integration.md)，运行参数仍需验证。

## 验证状态

已完成依赖安装、锁定、基础启动与插件测试，结果及边界见 [工程基线](../development/engineering-baseline.md)。目前仅隔离诊断接口，不能视为生产可用。后续继续验证：

1. 所选 Cordis、Loader 及辅助包的 exports、类型、peer 依赖和运行环境，保证核心依赖来源一致。
2. 插件启停、依赖不可用、配置失败与重载时的资源清理及数据保留。
3. Fastify 接口校验、扩展操作分发、连接恢复与文件传输。
4. better-sqlite3 的平台覆盖、实际 SQLite 版本、写入竞争、异常恢复、附件一致性与备份恢复。

只有出现新的实际需求或兼容问题，才重新评估上游 Cordis、其他 HTTP 框架或 PostgreSQL；当前不同时建设多套后端。

返回 [当前技术状态](../technical-status.md) 或 [当前文档索引](../README.md)。
