# Recorder 已确认数据访问与迁移主线

状态：技术主线与起步版本已确定；正式迁移协议未冻结。更新日期：2026 年 10 月 25 日。

阅读时机：数据库查询、repository、事务、核心与插件迁移相关工作。结合 [后端技术](../architecture/backend-stack.md) 和 [数据模型主线](data-model-baseline.md) 阅读；追溯选择理由再看 [历史比较](../../history/research/sqlite-access-comparison.md)。

## 已确认范围

| 部分 | 已确认选择 | 边界 |
| --- | --- | --- |
| 数据访问 | Drizzle 的 SQL 风格查询 + better-sqlite3 | 用于集中后端；不把数据库实现放到客户端 |
| 迁移生成 | Drizzle Kit 辅助生成迁移 | 不代表自动生成结果无需审查，也不自动选用启动时 schema push |
| 迁移执行 | 由后端统一协调核心与业务插件迁移 | 不让每个 Cordis 插件独立决定何时升级共享数据库 |
| 账本与执行适配 | Recorder 统一命名空间账本 + 受控 SQL 执行适配 | Recorder 维护核心和各插件的权威迁移状态；具体字段、迁移包与适配实现未冻结 |
| 插件卸载 | 默认保留数据 | 卸载代码不隐含清除资料；清除范围、重装和恢复的具体交互继续设计 |
| 升级体验 | 可以暂停业务写入并显示维护状态，优先保证数据完整与恢复可靠 | 没有要求零停机；具体暂停范围、自动升级时机与交互未冻结 |

SQL 特殊能力、统一事务、迁移账本字段和插件数据保留的具体规则继续设计。Drizzle、Kit、Node 与包管理器起步版本已锁定，后端 TypeScript + Node.js 已获用户确认，见 [工程基线](../development/engineering-baseline.md)。

## 工作边界与待定事项

- 业务服务与插件遵守相同的权限、数据归属和回收站规则。查询类型不会代替业务校验。
- 推荐统一管理连接与事务，原生 SQL 出口也经过同一上下文；具体 API 尚未定义。
- 后端采用 Recorder 统一命名空间账本与受控 SQL 执行适配，不再把各插件独立 Drizzle 账本作为并列待选主线；具体适配与故障验证见 [迁移机制提案](../../design/storage/plugin-migrations.md)。这不意味着自研 SQL 解析器或 schema diff。
- 插件卸载默认保留数据已确认。停用、移除代码、重新安装与清除插件数据分别处理，不以 dispose 执行删除；保留材料格式及清除操作仍需设计。
- 迁移粒度、依赖描述、失败恢复与保留策略均有设计建议，尚未成为完整实现规范；备份总体方案已确认，具体协议仍需细化。

具体职责和状态流程见 [核心与插件迁移](../../design/storage/plugin-migrations.md)，一般插件数据边界见 [插件数据契约](../../design/plugins/data-extension.md)，文件处理见 [存储生命周期](../../design/storage/storage-lifecycle.md)。备份已选统一恢复集合 + 后台复制，先读 [备份恢复主线](backup-baseline.md)，再按 [细化提案](../../design/storage/backup-recovery.md) 设计执行协议。日常只接受很短的快照窗口，采用本地独立副本与加密异地副本；这与允许停写的结构升级分别设计。

## 验证状态

已实际使用 Drizzle 查询与 Kit 生成身份/记录初始 SQL。初始迁移适配通过统一 namespace/revision/摘要账本、依赖排序、SQLite IMMEDIATE 事务及外键检查执行；测试覆盖回滚、摘要变动和依赖拒绝。仅支持命名空间 revision 1 初始化，尚无历史版本升级、备份前置、维护 UI 或完整故障恢复。范围见 [账号记录流程](../development/first-record-flow.md)，不将初始化器当作完整迁移系统。

返回 [当前文档索引](../README.md) 或 [技术状态](../technical-status.md)。
