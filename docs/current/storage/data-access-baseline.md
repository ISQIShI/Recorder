# Recorder 已确认数据访问与迁移主线

状态：技术主线已确定；B002-T01 多版本迁移/安全启动与 T02 独占/恢复点已实现，T03 维护协调与隔离恢复已实现。更新日期：2026 年 10 月 28 日。

阅读时机：数据库查询、repository、事务、核心与插件迁移相关工作。结合 [后端技术](../architecture/backend-stack.md) 和 [数据模型主线](data-model-baseline.md) 阅读；追溯选择理由再看 [历史比较](../../history/research/sqlite-access-comparison.md)。

## 已确认范围

| 部分 | 已确认选择 | 边界 |
| --- | --- | --- |
| 数据访问 | Drizzle 的 SQL 风格查询 + better-sqlite3 | 用于集中后端；不把数据库实现放到客户端 |
| 迁移生成 | Drizzle Kit 辅助生成迁移 | 不代表自动生成结果无需审查，也不自动选用启动时 schema push |
| 迁移执行 | 由后端统一协调核心与业务插件迁移 | 不让每个 Cordis 插件独立决定何时升级共享数据库 |
| 账本与执行适配 | Recorder 统一命名空间账本 + 受控 SQL 执行适配 | 当前已有初始成功账本；B002 保留其兼容性并按实施契约扩展计划与执行，完整迁移包/恢复协议仍分阶段落实 |
| 插件卸载 | 默认保留数据 | 卸载代码不隐含清除资料；清除范围、重装和恢复的具体交互继续设计 |
| 升级体验 | 先说明需要升级，由用户点击确认后执行；暂停业务写入并先创建恢复点 | 普通启动不自动升级已有库；本批离线维护入口与后续桌面确认 UI 分别实施 |

SQL 特殊能力、统一事务、迁移账本字段和插件数据保留的具体规则继续设计。Drizzle、Kit、Node 与包管理器起步版本已锁定，后端 TypeScript + Node.js 已获用户确认，见 [工程基线](../development/engineering-baseline.md)。

## 工作边界与待定事项

- 业务服务与插件遵守相同的权限、数据归属和回收站规则。查询类型不会代替业务校验。
- 推荐统一管理连接与事务，原生 SQL 出口也经过同一上下文；具体 API 尚未定义。
- 后端采用 Recorder 统一命名空间账本与受控 SQL 执行适配，不再把各插件独立 Drizzle 账本作为并列待选主线；具体适配与故障验证见 [迁移机制提案](../../design/storage/plugin-migrations.md)。这不意味着自研 SQL 解析器或 schema diff。
- 插件卸载默认保留数据已确认。停用、移除代码、重新安装与清除插件数据分别处理，不以 dispose 执行删除；保留材料格式及清除操作仍需设计。
- [B002 实施契约](migration-recovery-contract.md) 的多 revision、版本依赖、旧账本兼容、逐步事务、安全启动、独占与升级恢复点已实现；T03 已补显式维护、中断协调和隔离恢复。正式恢复启用、复杂表变换、外部文件与保留清理继续设计。

具体职责和状态流程见 [核心与插件迁移](../../design/storage/plugin-migrations.md)，一般插件数据边界见 [插件数据契约](../../design/plugins/data-extension.md)，文件处理见 [存储生命周期](../../design/storage/storage-lifecycle.md)。备份已选统一恢复集合 + 后台复制，先读 [备份恢复主线](backup-baseline.md)，再按 [细化提案](../../design/storage/backup-recovery.md) 设计执行协议。日常只接受很短的快照窗口，采用本地独立副本与加密异地副本；这与允许停写的结构升级分别设计。

## 验证状态

已实际使用 Drizzle 查询与 Kit 生成身份/记录初始 SQL。T01 已实现只读计划、版本依赖、旧账本/摘要兼容、逐步 IMMEDIATE 事务及外键检查、安全启动；每步 SQL 与成功账本同提交，失败只回滚本步。T02 已补跨进程独占、异步使用排空、关闭故障保锁和可校验恢复点；60 项测试及 Windows Electron 四阶段通过，见 [批次交付及整合](../../work/b002-migration-recovery/README.md)。B003-T01 已新增正式 records revision 2（identity 仍为 revision 1），真实 v1 样本经维护 CLI 确认、恢复点和升级后保留原数据；原 revision 1 SQL 未改。普通 profile 不提供直接升级执行服务。T03 已补维护 CLI、未完成维护启动门禁与隔离恢复，Windows/Linux CI 76 项通过；维护 UI 与正式恢复启用仍未实现。

返回 [当前文档索引](../README.md) 或 [技术状态](../technical-status.md)。
