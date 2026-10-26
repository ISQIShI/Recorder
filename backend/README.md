# backend：集中后端

状态：本机账号认证及记录保存/查询/更新已实现，生产接入和完整恢复待实现。更新日期：2026 年 10 月 26 日。

阅读时机：后端、业务插件、存储和服务部署工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，先读 [后端技术](../docs/current/architecture/backend-stack.md) 与 [架构概览](../docs/current/architecture/overview.md)。

`src/bootstrap.ts` 负责 Cordis/Loader 装配，保留基础验证 profile。`src/application.ts` 装配数据库、迁移启动门禁、密码学、身份存储、认证、记录、操作注册表与 HTTP 插件；`main.ts` 启动业务 profile。默认数据为根目录 `.recorder/recorder.sqlite`，可用 `RECORDER_DATA_DIR` 指定绝对目录。

先从根目录执行 `pnpm build`，再用 `pnpm dev:backend` 启动；默认仅监听 `127.0.0.1:4317`。`pnpm test` 包含后端插件生命周期、替换、持久数据保留、失败传播和事务回滚测试。版本和验证范围见 [工程基线](../docs/current/development/engineering-baseline.md)，所有新能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

当前请求契约、首次初始化、持久会话、正文格式、幂等和查询见 [账号记录流程](../docs/current/development/first-record-flow.md)。记录接口必须认证；无认证 foundation 诊断 profile 仅供原有测试，业务入口不加载它。当前仍限 loopback，暂不直接远程部署。

[B001-T01](../docs/work/b001-record-editing/t01-update-api.md) 已补充 `PUT /api/v1/records/{id}`（`updateRecord`）：正文为 `expectedRevision/title/body/format`，成功返回当前记录并递增 revision；版本过期返回 409 `REVISION_CONFLICT`，不存在或不属于当前账号均为 404。存储插件在 immediate 事务内执行 owner/id/revision 条件更新，创建请求摘要及身份/来源字段不变；未改 schema/迁移。PUT 同样校验 Origin、Cookie/CSRF 或 native Bearer，OpenAPI 分开描述路径和正文。更新能力随 Cordis 记录依赖撤回/恢复，认证撤回时 HTTP 不可用。

`test/record-edit.test.ts` 覆盖持久化、两个数据库连接竞争、输入/安全约束、创建幂等回归及插件撤回。构建并安装锁定 Electron 后，可另运行 `node backend/test/record-edit-desktop.mjs` 验证真实 renderer → preload → 主进程 → HTTP 更新/冲突和后端重启；它需要桌面环境，使用 `artifacts/t01-update-*` 隔离目录和动态端口，不纳入普通无桌面单测。

设计公共接口或登录前读 [API 与认证主线](../docs/current/architecture/api-auth-baseline.md)，细化时再读 [统一 API](../docs/design/interfaces/unified-api.md) 或 [身份与多设备](../docs/design/security/identity-device-access.md)。设计服务监听和发布时读 [部署接入](../docs/design/operations/deployment-access.md)，具体实现方案尚未冻结。

数据工作先读 [已确认模型主线](../docs/current/storage/data-model-baseline.md) 与 [数据访问主线](../docs/current/storage/data-access-baseline.md)。细化实体和查询时读 [模型设计](../docs/design/storage/data-model.md)，升级、版本账本和失败恢复先读 [B002 实施契约](../docs/current/storage/migration-recovery-contract.md)，更广范围参考 [迁移机制提案](../docs/design/storage/plugin-migrations.md)，落盘与删除恢复读 [存储生命周期](../docs/design/storage/storage-lifecycle.md)，插件新增字段读 [插件数据契约](../docs/design/plugins/data-extension.md)。[B002-T01](../docs/work/b002-migration-recovery/t01-versioned-migrations.md) 已实现下述多版本计划、底层逐步执行和启动门禁；独占、恢复点、维护协调与桌面确认尚未接入。生产清单仍只有 identity/records revision 1；`validation/migrations` 是 Kit 生成的隔离探针，不参与生产升级。

## 多版本迁移服务（B002-T01）

后端契约由 `src/domain.ts` 重导出 `src/migration-contract.ts` 的类型和 `MigrationError`，消费者依赖注入服务。实现分为 `plugins/migrations.ts`、其 `migrations/` 辅助模块与独立的 `migration-executor.ts` 插件；后者不在普通业务 profile 中装配。

| 服务或入口 | 语义 |
| --- | --- |
| `recorderMigrationPlanner.inspect(): MigrationPlan` | 只读预检，不建账本或业务表，返回 `empty` / `compatible` / `upgrade-required` / `blocked`、各命名空间 current/target revision、独立 packageVersion、成功账本、待执行顺序、原因和计划 digest |
| `recorderMigrationExecutor.execute(expectedDigest)` | 仅明确装配的维护/隔离测试 profile 提供；每步重新核对计划后以 IMMEDIATE 事务执行 SQL、FK 检查和成功账本写入，返回 `{ committed, plan }`；不代表恢复点或整批维护已完成 |
| `recorderMigrations.ready` | 业务依赖的启动门禁；普通 `mode: 'startup'` 仅为空库初始化或兼容库提供，inspect profile 即使兼容也不提供 |
| `applyMigrations(raw, steps)` | 保留给原隔离测试的低层兼容辅助函数，使用同一计划/逐步事务实现；没有独占、用户确认或恢复点，禁止从业务入口调用 |

清单来源 `MigrationSource` 保留 `namespace/revision/requires/file`，增加 `dependencies: { namespace, revision }[]` 与独立的可选 `packageVersion`。`requires: ['identity']` 规范化为 identity 最低 revision 1；前一 revision 是隐式依赖，同一命名空间重复依赖取最大最低版本。`file` 支持相对生产 migrations 目录的路径或隔离 fixture 的 file URL。每个已安装命名空间必须提交从 1 开始的完整历史，不把 packageVersion 当成数据 revision。identity/records 的 SQL 原字节和 `sha256(UTF-8 SQL)` 算法不变，原四列成功账本不增加字段。

`retainedSources` 提供已卸载命名空间的可信历史材料，仅供核验，不安排执行；未安装提供者的数据/账本默认保留。新步骤依赖保留数据时，所需历史前缀必须有材料、摘要正确且已提交，依赖图也包含这些历史边，不能借卸载绕过缺失或循环。

计划 digest 绑定实际库的 realpath（内存库使用句柄独立身份）、schema、成功账本（含 applied_at）及安装/保留材料的原 SQL、规范化依赖和包版本。同库未变化时可重现；改 SQL、有效依赖、包版本、schema、账本或库位置会使旧确认失效。`materialsDigest` 单独标识材料，逐步提交改变账本后也不接受中途更换 SQL/依赖/包版本。执行只接收 digest，重新读取材料和账本，不信任调用者改过的 plan 对象。路径绑定不是资料库独占或任意别名的安全保证，跨进程与路径别名协调由 T02 接续。

受控 SQL 保留 Drizzle `--> statement-breakpoint`；轻量词法边界区分字符串、带引号标识符和注释，驱动 `prepare` 每次只接受一条语句。允许普通 CREATE TABLE/INDEX（含 UNIQUE INDEX）及如下可空列子集：

```sql
ALTER TABLE ordinary_table ADD COLUMN new_column TEXT;
-- 类型可为 TEXT / INTEGER / REAL / BLOB / NUMERIC，可加 DEFAULT NULL。
```

不接受 DML、CTAS、事务脚本、PRAGMA、ATTACH、扩展加载、触发器/虚表/临时表、改名/删列/重建表、约束回填、账本或 sqlite_ 对象修改及额外尾随语句。ADD COLUMN/索引执行前还核对目标为 main 中的普通表。结构预检不模拟完整执行，SQLite 语法/表列解析错误仍可在步内发生并回滚。每步 FK 检查包含在事务内；任一步失败保留前序成功账本，下一次计划只列剩余步骤，不能宣传为整批自动回滚。SQLite ADD COLUMN 与 FK 检查限制参考 [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)、[SQLite PRAGMA](https://www.sqlite.org/pragma.html#pragma_foreign_key_check)，单语句边界参考 [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)（2026-10-26 核对，并在当前锁定驱动实测）。这是可信已安装代码的协调边界，不是恶意插件安全沙箱。

低层服务样本（**仅隔离测试；未来维护协调须先持有独占、完成确认与可用恢复点**）：

```ts
// 装配 migrations 的 mode: 'inspect' 与 migration-executor 后，消费者声明注入两项服务。
const plan = ctx.recorderMigrationPlanner.inspect();
if (plan.status === 'blocked') throw new MigrationError(plan.reasons[0]!.code, plan.reasons[0]!.message, plan);
const result = ctx.recorderMigrationExecutor.execute(plan.digest);
// result.committed 是本次观察到的步骤提交；result.plan.applied 是当前成功账本。
// compatible 只表示迁移材料/账本兼容，不证明整批维护结束或可以绕过未完成运行记录启动业务。
```

`MigrationError` 的 `code/plan/step/committed/cause` 可供 T02/T03 分类处理：`UPGRADE_REQUIRED` 是已有库需维护；`VERSION_UNSUPPORTED` 是软件不理解更高数据版本；`DIGEST_MISMATCH`、`INVALID_LEDGER`、`UNTRACKED_DATABASE`、`UNVERIFIED_HISTORY` 代表不能信任当前历史；清单的重复/缺口/缺失依赖/循环和 `SQL_NOT_ALLOWED` 均阻止执行。`STALE_PLAN` 要求重新检查并确认，`STEP_FAILED` / `FOREIGN_KEY_FAILED` 需核对实际账本；`DATABASE_BUSY`、`DATABASE_CORRUPT`、`DATABASE_UNAVAILABLE` 区分忙/损坏/不可访问。外层事务拒绝为 `TRANSACTION_ACTIVE`，撤回后的旧服务引用拒绝为 `SERVICE_WITHDRAWN`。精确枚举以契约类型为准，不记录用户资料正文或凭据。

普通 `createApplication()` 不提供直接升级服务：非空无可信账本、摘要/依赖/版本错误或任何待执行步骤（含新增命名空间）均拒绝启动，Loader 释放资源，账号/记录及 HTTP 不进入可用状态。`main.ts` 返回非零退出码与结构化 `code`，不会把需要维护写成普通网络失败。空库初始化若已有步骤提交后失败，后续普通启动同样要求维护，不自动续跑。T03 还须接入未完成维护运行记录门禁：全部 SQL 已提交但整体验证/结束记录未完成时，不得只凭这里的 compatible 启动。

`test/versioned-migrations.test.ts` 使用独立临时库/fixture 验证 v1→v2→v3、跨命名空间拓扑、保留历史、SQL/依赖/摘要拒绝、逐步回滚、旧确认失效、服务撤回与替换、旧 v1 数据保持、忙/损坏分类和失败启动关闭句柄及进程结束。`pnpm check` 与 Windows `pnpm test:records:desktop` 的本机结果、Linux CI 结果与未执行范围见 [T01 交付记录](../docs/work/b002-migration-recovery/t01-versioned-migrations.md)。没有对真实 `.recorder/` 做升级实验；没有新增真实业务 migration 或维护命令。

完整备份、恢复与搬迁先读 [已确认备份主线](../docs/current/storage/backup-baseline.md)，再读 [流程细化](../docs/design/storage/backup-recovery.md)；设计适配插件时读 [restic 与 Cordis 集成](../docs/design/storage/restic-integration.md)。统一恢复集合 + 后台复制以及 restic 已确认；具体版本和协议未冻结，未安装工具或初始化仓库。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
