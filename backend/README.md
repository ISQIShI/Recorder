# backend：集中后端

状态：本机账号认证及记录保存/查询/更新/回收站、标签与分层分类筛选、离线维护与隔离恢复已实现；验证结果见任务卡，生产接入和正式恢复启用待实现。更新日期：2026 年 10 月 29 日。

阅读时机：后端、业务插件、存储和服务部署工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，先读 [后端技术](../docs/current/architecture/backend-stack.md) 与 [架构概览](../docs/current/architecture/overview.md)。

`src/bootstrap.ts` 负责 Cordis/Loader 装配，保留基础验证 profile。`src/application.ts` 先装配资料库独占，再装配数据库、维护运行记录、迁移启动门禁、密码学、身份存储、认证、记录、操作注册表与 HTTP 插件；`main.ts` 启动业务 profile。默认数据为根目录 `.recorder/recorder.sqlite`，可用 `RECORDER_DATA_DIR` 指定绝对目录。`maintenance-profile.ts` 是独立最小维护装配，CLI 不启动业务应用。

先从根目录执行 `pnpm build`，再用 `pnpm dev:backend` 启动；默认仅监听 `127.0.0.1:4317`。`pnpm test` 包含后端插件生命周期、替换、持久数据保留、失败传播和事务回滚测试。版本和验证范围见 [工程基线](../docs/current/development/engineering-baseline.md)，所有新能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

当前请求契约、首次初始化、持久会话、正文格式、幂等和查询见 [账号记录流程](../docs/current/development/first-record-flow.md)。记录接口必须认证；无认证 foundation 诊断 profile 仅供原有测试，业务入口不加载它。当前仍限 loopback，暂不直接远程部署。

[B001-T01](../docs/work/b001-record-editing/t01-update-api.md) 已补充 `PUT /api/v1/records/{id}`（`updateRecord`）：正文为 `expectedRevision/title/body/format`，成功返回当前记录并递增 revision；版本过期返回 409 `REVISION_CONFLICT`，不存在或不属于当前账号均为 404。存储插件在 immediate 事务内执行 owner/id/revision 条件更新，创建请求摘要及身份/来源字段不变；未改 schema/迁移。PUT 同样校验 Origin、Cookie/CSRF 或 native Bearer，OpenAPI 分开描述路径和正文。更新能力随 Cordis 记录依赖撤回/恢复，认证撤回时 HTTP 不可用。

`test/record-edit.test.ts` 覆盖持久化、两个数据库连接竞争、输入/安全约束、创建幂等回归及插件撤回。构建并安装锁定 Electron 后，可另运行 `node backend/test/record-edit-desktop.mjs` 验证真实 renderer → preload → 主进程 → HTTP 更新/冲突和后端重启；它需要桌面环境，使用 `artifacts/t01-update-*` 隔离目录和动态端口，不纳入普通无桌面单测。

设计公共接口或登录前读 [API 与认证主线](../docs/current/architecture/api-auth-baseline.md)，细化时再读 [统一 API](../docs/design/interfaces/unified-api.md) 或 [身份与多设备](../docs/design/security/identity-device-access.md)。设计服务监听和发布时读 [部署接入](../docs/design/operations/deployment-access.md)，具体实现方案尚未冻结。

数据工作先读 [已确认模型主线](../docs/current/storage/data-model-baseline.md) 与 [数据访问主线](../docs/current/storage/data-access-baseline.md)。细化实体和查询时读 [模型设计](../docs/design/storage/data-model.md)，升级、版本账本和失败恢复先读 [B002 实施契约](../docs/current/storage/migration-recovery-contract.md)，更广范围参考 [迁移机制提案](../docs/design/storage/plugin-migrations.md)，落盘与删除恢复读 [存储生命周期](../docs/design/storage/storage-lifecycle.md)，插件新增字段读 [插件数据契约](../docs/design/plugins/data-extension.md)。[B002-T01](../docs/work/b002-migration-recovery/t01-versioned-migrations.md) 已实现下述多版本计划、底层逐步执行和启动门禁；[B002-T02](../docs/work/b002-migration-recovery/t02-upgrade-recovery-points.md) 接入普通后端独占并提供独立恢复点服务；[B002-T03](../docs/work/b002-migration-recovery/t03-maintenance-recovery-drill.md) 增加离线维护、中断协调与隔离恢复，正式恢复启用和桌面确认仍未实现。当前生产清单为 identity revision 1、records revision 1/2、tags revision 1、categories revision 1；`validation/migrations` 是 Kit 生成的隔离探针，不参与生产升级。

## 记录回收站（B003-T01）

`records` revision 2 在原表新增可空 `deleted_at` 和账号/状态/时间索引，Drizzle schema 与 Kit 元数据同步；Kit 的 ADD 写法补为受控执行器支持的 `ADD COLUMN`。identity/records revision 1 SQL 原字节和账本算法不变，Kit journal 不是第二套权威账本。全新空库自动初始化；已有库普通启动返回 `UPGRADE_REQUIRED`，不能删库或自动升级。

共享契约 `RecordData.deletedAt` 为整数时间或 null。`listRecords` 新增可选 `state: active | trash`，默认 active；两类均按原创建时间排序并复用关键词、limit/offset/total。归属自己的 `getRecord` 可读回收站详情，正文只读，PUT 返回 409 `RECORD_TRASHED`。新增认证 POST：

| 操作 | 路径与 JSON 正文 | 结果 |
| --- | --- | --- |
| `trashRecord` | `/api/v1/records/{id}/trash`，`{ expectedRevision }` | 当前记录，deletedAt 非空 |
| `restoreRecord` | `/api/v1/records/{id}/restore`，`{ expectedRevision }` | 当前记录，deletedAt 为 null |
| `emptyTrash` | `/api/v1/records/trash/empty`，`{ confirm: true }` | `{ deleted: number }` |

record-store 在 IMMEDIATE 事务内检查 owner/id/revision 并条件更新；移入/恢复仅改变 deletedAt、revision(+1) 和 updatedAt。当前 revision 的重复同状态请求不增加版本，旧 revision 返回 409；其他账号或已永久删除均 404。清空一次事务只删执行时当前账号回收站中的记录，失败回滚，正常记录不动，不声称擦除备份/介质。原创建重试对仍存在的记录返回当前状态（含回收站），不会恢复；清空后不保留永久去重墓碑，旧创建请求可产生新的 ID。

这些能力由既有 record-store → records → records-api 插件提供，HTTP 继续统一校验 Cookie/CSRF、native 通道与 OpenAPI；撤回记录服务会撤回操作，不删除数据。T01 不添加自动清空、单条永久删除或通用清理总线；T02 标签独立装配，见下节。

隔离旧 v1 样本的可复制升级步骤如下，路径父级须存在，先停止持有该样本库的后端；不要将样本路径替换为未经安排的真实资料：

```powershell
pnpm build
pnpm --filter @recorder/backend maintenance inspect --database C:/RecorderSamples/source/recorder.sqlite
# 查看需要执行的 records revision 2；只在确认该计划后粘贴其完整 plan.digest。
pnpm --filter @recorder/backend maintenance upgrade --database C:/RecorderSamples/source/recorder.sqlite --confirm <刚检查的plan.digest>
pnpm --filter @recorder/backend maintenance points --database C:/RecorderSamples/source/recorder.sqlite
# 成功后可以另行启动原业务后端，CLI 不自动启动。
```

`test/record-trash.test.ts` 使用真实 v1 SQL/账本，验证普通启动拒绝、缺少/过期确认拒绝、恢复点先行、正式 v2 升级、账号/会话/记录/幂等字段保持，以及新空库的完整操作。必要本机检查与 Windows/Linux CI 证据见 [T01 交付区](../docs/work/b003-record-management/README.md#t01-任务卡回收站)。

## 标签与筛选（B003-T02）

`tags` revision 1 依赖 `records` revision 2，新增 `tags_dictionary`（账号/精确名称唯一）和 `tags_record_links`（record/tag 联合主键、级联删除外键）。Kit SQL、snapshot/journal 与 Recorder manifest 同步；identity/records 三份已应用 SQL 不变。生成命令为 `pnpm --filter @recorder/backend exec drizzle-kit generate --dialect sqlite --schema ./src/data/tags-schema.ts --out ./migrations/tags --name initial`；仅生成 tags 两表，不重新迁移被引用表，Kit 不是第二套权威账本。

独立 Cordis 插件为 `tag-store` → `tags` → `tags-api`，契约在 `src/tags-contract.ts`，由 domain 重导出。tag-store 消费 `recorderRecordStore.get(ownerId,id)` 的归属查询契约，在同一 SQLite IMMEDIATE 事务内检查记录正常状态和标签归属再写关联。基础记录提供者不依赖标签；搜索条件和记录转换复用无服务副作用的 `data/record-query.ts`。撤回 tags 或 tag-store 会撤回对应 API，普通列表、编辑、回收/恢复/清空继续可用；重新启用保留标签数据。

全部接口需要认证，沿用 Cookie/CSRF 或 native Bearer。不存在/不归属自己的记录或标签为 404，回收站关联写入为 409 `RECORD_TRASHED`。名称 trim 后非空、最多 64 个 UTF-16 代码单元（沿用现有 TypeScript 字符串长度规则）；同账号精确同名复用，不做大小写/Unicode 归一。响应不暴露 ownerId。独立添加/移除幂等，不写正文 revision、updatedAt 或创建幂等字段。

| 契约操作 | HTTP 路径与输入 | 返回 |
| --- | --- | --- |
| `listTags` | GET `/api/v1/tags` | `{ items: TagData[] }`，名称/id 排序 |
| `createTag` | POST `/api/v1/tags`，`{ name }` | `TagData { id, name, createdAt }`，创建或复用 |
| `getRecordTags` | GET `/api/v1/records/{id}/tags` | `{ items: TagData[] }`，含自己的回收站记录 |
| `addRecordTag` | POST `/api/v1/records/{id}/tags/add`，`{ tagId }` | `{ ok: true }` |
| `removeRecordTag` | POST `/api/v1/records/{id}/tags/remove`，`{ tagId }` | `{ ok: true }`，保留字典/记录 |
| `listTagRecords` | GET `/api/v1/tags/{id}/records`，可选 q/limit/offset | `{ items: RecordData[], total }`，只含正常记录 |

筛选沿用标题/正文的 literal `instr(lower(...),lower(q))`、createdAt/id 倒序及 limit=30/offset=0（limit 1–100、offset 0–1000000），不提供 trash/state 或多标签组合。回收/恢复保留关联；清空时 SQLite 外键在同一事务删除关联，即使标签提供者已停用也生效，字典保留，无通用插件清理框架。

已有 T01 样本升级先停止样本宿主，使用独立绝对路径执行，不操作真实资料：

```powershell
pnpm --filter @recorder/backend maintenance inspect --database C:/RecorderSamples/t01/recorder.sqlite
# 查看 tags revision 1 及 records revision 2 依赖；确认本次完整 plan.digest 后执行。
pnpm --filter @recorder/backend maintenance upgrade --database C:/RecorderSamples/t01/recorder.sqlite --confirm <刚检查的plan.digest>
pnpm --filter @recorder/backend maintenance points --database C:/RecorderSamples/t01/recorder.sqlite
```

普通启动拒绝待升级旧库；CLI 先创建并验证恢复点，再执行迁移。`test/record-tags.test.ts` 使用真实 T01 SQL/账本验证确认门禁、恢复点与正常/回收站记录完整保留，并覆盖权限/CSRF、名称边界、分页、幂等、只读、重启、清空回滚/FK 和插件撤回恢复。原 v1 升级测试保留并适配新增命名空间。验证证据见 [T02 交付区](../docs/work/b003-record-management/README.md#t02-任务卡标签与筛选)。

## 分层分类与记录归属（B004-T01）

`categories` revision 1 显式依赖 `records` revision 2，新增 `categories_nodes` 和 `categories_record_links`；identity/records/tags 四份已应用 SQL 保持原字节。Kit 生成命令为 `pnpm --filter @recorder/backend exec drizzle-kit generate --dialect sqlite --schema ./src/data/categories-schema.ts --out ./migrations/categories --name initial`。节点自引用外键和关联外键均级联删除；记录清空即使分类提供者停用仍清理关联，分类树保留。

`category-store` → `categories` → `categories-api` 为独立 Cordis 插件，服务契约位于 `src/categories-contract.ts`，由 domain 重导出。存储依赖 `recorderRecordStore` 的归属查询与现有纯 SQL 搜索辅助函数；基础记录和标签不依赖分类提供者。撤回分类插件仅撤回相关能力，重新启用读回持久树和归属。

`CategoryData` 为 `{ id, parentId: string | null, name, revision, createdAt, updatedAt }`，不暴露 owner。名称 trim 后 1–64 个 UTF-16 代码单元；同账号同父精确重名返回 409 `CATEGORY_NAME_CONFLICT`，异父可同名，不归一大小写。普通联合唯一索引和顶层 partial UNIQUE INDEX 分别保护子节点与 NULL 父节点；列表按名称/id 排序。

| 操作 | HTTP 路径与输入 | 返回 |
| --- | --- | --- |
| `listCategories` | GET `/api/v1/categories` | `{ items: CategoryData[] }` |
| `createCategory` | POST `/api/v1/categories`，`{ name, parentId }`，顶层显式 null | `CategoryData`，revision 1 |
| `updateCategory` | PUT `/api/v1/categories/{id}`，`{ name, parentId, expectedRevision }` | 当前节点，revision +1 |
| `deleteCategory` | POST `/api/v1/categories/{id}/delete`，`{ expectedRevision, confirm: true }` | `{ deleted: number }`，删除节点数 |
| `getRecordCategories` | GET `/api/v1/records/{id}/categories` | `{ items: CategoryData[] }`，含自己的回收站记录 |
| `addRecordCategory` / `removeRecordCategory` | POST `/api/v1/records/{id}/categories/add` 或 `/remove`，`{ categoryId }` | `{ ok: true }`，独立幂等关联 |
| `listCategoryRecords` | GET `/api/v1/categories/{id}/records`，可选 q/limit/offset | `{ items: RecordData[], total }` |

全部操作沿用认证、Cookie/CSRF 或 native Bearer、固定传输与 OpenAPI。不存在/不归属自己的分类、父节点或记录返回 404；回收站关联写入返回 409 `RECORD_TRASHED`。更名/移动在 IMMEDIATE 事务内检查 owner、旧 revision、同父重名和递归后代；自指/移入后代返回 409 `CATEGORY_CYCLE`，旧版本返回 409 `REVISION_CONFLICT`。添加子节点不会修改父节点版本。

确认删除在同一事务核对根版本并删除执行时整棵子树及关联，失败回滚；所有正常/回收站记录、标签和树外归属保持不变，恢复记录不会重建已删分类。分类写入不更改正文 revision/updatedAt。筛选使用 recursive CTE 包含所选节点及全部后代，以 EXISTS 按记录去重，total 同样去重；复用标题/正文关键词规则、createdAt/id 倒序及 limit=30/offset=0（范围沿用标签），只查询正常记录。

已有 B003 样本须先停止其宿主，使用独立绝对路径运行以下命令；不对真实资料自动升级：

```powershell
pnpm --filter @recorder/backend maintenance inspect --database C:/RecorderSamples/b003/recorder.sqlite
# 核对 categories revision 1 和 records revision 2 依赖，再明确确认当前完整摘要。
pnpm --filter @recorder/backend maintenance upgrade --database C:/RecorderSamples/b003/recorder.sqlite --confirm <刚检查的plan.digest>
pnpm --filter @recorder/backend maintenance points --database C:/RecorderSamples/b003/recorder.sqlite
```

普通启动拒绝待升级旧库，CLI 先建并验证恢复点，再执行迁移。`test/record-categories.test.ts` 验证真实 B003 SQL/账本升级、原账号/会话/正常与回收站正文/标签/revision 保持、owner/CSRF/严格输入、树约束、删除回滚、去重分页与插件撤回恢复；旧 v1/T01 升级 fixture 只适配待执行命名空间。实际检查与平台范围见 [B004 交付区](../docs/work/b004-record-categories/README.md#交付与整合记录)。

## 多版本迁移服务（B002-T01）

后端契约由 `src/domain.ts` 重导出 `src/migration-contract.ts` 的类型和 `MigrationError`，消费者依赖注入服务。实现分为 `plugins/migrations.ts`、其 `migrations/` 辅助模块与独立的 `migration-executor.ts` 插件；后者不在普通业务 profile 中装配。

| 服务或入口 | 语义 |
| --- | --- |
| `recorderMigrationPlanner.inspect(): MigrationPlan` | 只读预检，不建账本或业务表，返回 `empty` / `compatible` / `upgrade-required` / `blocked`、各命名空间 current/target revision、独立 packageVersion、成功账本、待执行顺序、原因和计划 digest |
| `recorderMigrationPlanner.capture?()` | T02 的可选兼容增补；一次读取安装/保留 SQL，复用原算法返回 `{ plan, installed, retained }`；包含已应用 SQL，供恢复点归档。旧计划提供者可继续只实现 inspect；恢复点遇到没有 capture 的替身会明确拒绝 |
| `recorderMigrationExecutor.execute(expectedDigest)` / `executeStep?(expectedDigest)` | 仅明确装配的维护/隔离测试 profile 提供；每步重新核对计划后以 IMMEDIATE 事务执行 SQL、FK 检查和成功账本写入，返回 `{ committed, plan }`。T03 的可选单步入口复用同一事务算法、最多提交一步，旧 execute 全部执行行为不变；缺少单步能力的替身不能用于维护协调。不代表恢复点或整批维护已完成 |
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

普通 `createApplication()` 不提供直接升级服务：非空无可信账本、摘要/依赖/版本错误或任何待执行步骤（含新增命名空间）均拒绝启动，Loader 释放资源，账号/记录及 HTTP 不进入可用状态。`main.ts` 返回非零退出码与结构化 `code`，不会把需要维护写成普通网络失败。空库初始化若已有步骤提交后失败，后续普通启动同样要求维护，不自动续跑。T03 已接入维护运行门禁：生产装配为 migrations 设置 `maintenanceGuard: true`，通过 Cordis 注入维护运行服务，先核验未完成记录/隔离恢复标记，再提供业务 readiness；该服务撤回会连带撤回 readiness。全部 SQL 已提交但最终验证/完成记录未写时仍拒绝启动。直接装配低层迁移插件的旧隔离测试默认不启用这个应用门禁，不能据此绕过普通应用入口。

`test/versioned-migrations.test.ts` 使用独立临时库/fixture 验证 v1→v2→v3、跨命名空间拓扑、保留历史、SQL/依赖/摘要拒绝、逐步回滚、旧确认失效、服务撤回与替换、旧 v1 数据保持、忙/损坏分类和失败启动关闭句柄及进程结束。`pnpm check` 与 Windows `pnpm test:records:desktop` 的本机结果、Linux CI 结果与未执行范围见 [T01 交付记录](../docs/work/b002-migration-recovery/t01-versioned-migrations.md)。没有对真实 `.recorder/` 做升级实验；该 T01 交付时未新增真实业务 migration 或维护命令；后续 B003 已新增上述回收站迁移。

## 资料库独占与恢复点（B002-T02）

类型由 `domain.ts` 重导出 `storage-contract.ts`；提供者为 `database-ownership.ts`、`database.ts`、`recovery-points.ts`，辅助模块归属这些插件。消费者声明 Cordis 注入，不自行持有第二套锁或复制数据库/WAL 文件。

| 服务 | 契约与释放边界 |
| --- | --- |
| `recorderDatabaseOwnership` | 一个 filename 的所有权；`filename` 是实际规范路径，`controlFile` 是独立控制库路径，`assertHeld()` 检查有效，`retain()` 返回必须 release 的句柄租约。`:memory:` 仅按提供者隔离，无跨进程文件锁 |
| `recorderDatabase.use(async raw => ...)` | 注册异步数据库使用；开始时检查所有权，数据库撤回后拒绝新使用，等全部在途使用结束再关闭 raw，确认 raw.open 为 false 后释放所有权租约。快照/异步句柄必须经此入口注册；原 raw 只供生命周期内的同步业务访问，不能在撤回后缓存使用 |
| `recorderDatabase.close()` | 供宿主停止/插件生命周期清理使用，与 dispose 共用关闭路径，不重新启用服务。未结束的真实查询迭代器可使 close 失败：返回 DATABASE_CLOSE_FAILED（含 cause），Cordis 清理错误进入 logger，独占继续保留且拒绝新 use；结束迭代器后可用此前保留的服务引用重试 close。成功重试确认句柄关闭才释放租约；不自动轮询、超时解锁或吞掉错误。故障未排除时所有权清理会继续等待，须明确诊断后人工处理或停止宿主 |
| `recorderRecoveryPoints.create(expectedPlanDigest)` | 仅维护 profile 装配。重新 capture 同一计划，归档完整材料，调用驱动原生 backup，完整验证后才返回 RecoveryPoint；不确认、不执行升级 |
| `verify(id)` / `list()` | 重新校验封存清单、所有 SQL、数据库摘要/大小、integrity/FK/账本；list 分开返回 valid、invalid、incomplete。verify 证明该恢复点内容可校验，不替代 T03 对当前源库/计划/维护记录的匹配 |

独占以 **实际数据库文件** 定位，不依赖 dataDir。现有文件先 realpath，未创建文件先 realpath 父目录；符号链接/Windows junction 和相对路径归一。控制库为 `<实际 filename>.recorder-lock.sqlite`，使用已有 better-sqlite3 的 rollback/DELETE 模式 `BEGIN EXCLUSIVE` 并设 `busy_timeout=0`；竞争立即抛 `StorageError(DATABASE_BUSY)`，失败不打开业务库。控制库事务保持到数据库句柄及在途操作全部结束；退出/崩溃交给操作系统释放锁，不按 mtime/PID 推断过期，不删除/替换控制库。控制库不能被恢复切换或随资料库文件复制替代。SQLite 锁机制见 [rollback locking](https://www.sqlite.org/lockingv3.html)。这是遵守协议的 Recorder 宿主之间的协调：升级前须停止旧版 Recorder 和第三方 SQLite 工具；不防御有目录修改权限的用户删除/替换控制文件。

支持限制：本机 Windows 固定 NTFS 盘（需要系统 Windows PowerShell/.NET Framework），Linux 限 ext4、XFS、Btrfs、tmpfs、overlayfs 类型；Windows 本机及 Ubuntu CI 的实际结果以任务卡为准，不代表清单内每种文件系统均已实测。拒绝 UNC/映射网络盘、设备/URI/ADS 路径、未验证文件系统、非普通文件、多硬链接数据库/控制库、控制库符号链接、悬空数据库符号链接及 Linux 文件 bind mount。目录 bind mount 若指向同一目录，会访问同一个控制文件；不承诺任意路径别名均可安全识别。网络文件系统不支持，所有权有效期间不得外部改名、移动、硬链接或替换数据库/控制目录。首次取得锁需有实际父目录的创建/写入权限。

恢复点默认位于 `<实际 filename>.recovery-points/`，也可用插件配置 `directory` 指向父目录已存在的独立本地目录；不能让恢复目录包含源数据库。Linux 新根目录 0700、文件 0600，检查当前 uid 与非组/其他访问；Windows 通过 .NET DirectorySecurity 在创建时设置当前用户 SID 独占 FullControl 与子项继承、禁用继承，再校验 owner/DACL。既有目录不自动改权限；过宽、链接或无法核验时拒绝。Windows `chmod(0700)` 不能代替 ACL。管理员/root、备份权限、同一 OS 用户及存储设备访问不被此机制隔离；当前不加密或上传。[Windows 安全目录创建](https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.createdirectory?view=netframework-4.8.1) · [Node 文件权限](https://nodejs.org/docs/latest-v24.x/api/fs.html#fschmodpath-mode-callback)

封存格式 v1：内部随机 UUID；先创建 `.pending-<id>/` 与 incomplete 标识，写入 `materials/000000.sql` 等原 UTF-8 SQL，再由 `raw.backup()` 生成 `database.sqlite`（包含源 WAL 的已提交内容，不直接复制 WAL/SHM）。同时检查 integrity、FK、完整成功账本和每条已应用 SQL 的摘要；任何历史命名空间缺可信 SQL 时返回 MATERIALS_UNAVAILABLE，不能生成材料不全的恢复点。原计划前后不符、SQL 归档受损、空间不足、写入/封存失败均拒绝返回可用结果，保留 pending 供人工检查，不自动清理。

`manifest.json` 保存格式/封存状态、ID/时间、实际源路径与计划/materials 摘要、完整计划与账本、Recorder/Node/SQLite/驱动版本、安装/保留 SQL 元数据及文件摘要、数据库摘要/大小、校验结果；`seal.json` 绑定完整 manifest 的 SHA-256。README.txt 明示没有归档旧版可执行程序，不能仅凭版本号承诺恢复后可启动。文件先 fsync，Linux 再 fsync 子目录；在同一父目录将 pending 原子 rename 为 UUID 是可用性边界，list 从不把 pending 当有效。Windows Node 不提供这里需要的目录 fsync，未验证真实断电持久性；即使有完整封存目录，读取时也必须再次 verify。[better-sqlite3 backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise) 使用及故障行为按锁定 13.0.3 实测，官方资料核对日期 2026-10-26。

封存前和 verify 都拒绝快照相邻的 `-wal`、`-shm`、`-journal`（包括链接）；不删除、checkpoint 或吸收这些未封存文件。readonly SQLite 仍可读 WAL，故验证不会直接打开恢复点原路径：在私有根目录新建 `.pending-validation-<随机值>/`，只复制已核对摘要的快照主文件，再核对副本摘要后以 readonly SQLite 检查 integrity/FK/账本；复核原文件摘要/大小与无旁路文件，确保校验读取与封存主文件一致。正常删除本次已知临时文件和空目录，中断遗留目录按 incomplete 展示，不成为恢复点。校验需要额外一个数据库副本的临时空间及复制 I/O；空间不足明确失败。此复制只针对已由 native backup 生成的恢复点文件，不复制活跃源库/WAL；支持既有 WAL 模式主文件，不改变封存格式。驱动 13.0.3 默认关闭 URI 支持，因此没有依赖进程级 URI 开关来启用 immutable；[SQLite WAL 只读规则](https://www.sqlite.org/wal.html#read_only_databases) 与锁定驱动源码于 2026-10-26 核对。

恢复插件撤回时停止接收新调用，让在途 backup 取消/结束并等待清理；数据库 use 和所有权 retain 确保快照完成前 raw/控制库不关闭。默认快照传输超时 60 秒，可配置正整数 `timeoutMs`，最高 300 秒；不是性能承诺。StorageError 的 code 包含 DATABASE_BUSY、DATABASE_CLOSE_FAILED、PATH_UNSUPPORTED、OWNERSHIP_LOST、SERVICE_WITHDRAWN、RECOVERY_FAILED、RECOVERY_INVALID、RECOVERY_CANCELLED、STALE_PLAN、MATERIALS_UNAVAILABLE、PERMISSION_DENIED；日志仅输出原因，不输出数据库正文、密码摘要或会话秘密。

T03 最小装配顺序为 ownership（filename）→ database（相同 filename）→ maintenance-runs / migrations（完整 sources/retainedSources，mode inspect）→ recovery-points / migration-executor → maintenance / isolated-recovery。协调服务在独占下确认计划、记录意图、创建并验证恢复点、核对源库与计划后调用单步执行器；整体校验通过且完成记录发布后才提示可以另行启动业务。普通 createApplication 不装配 recovery/executor，不自动创建恢复点或升级旧库。多客户端仍可访问同一业务后端。

## 离线维护与隔离恢复（B002-T03）

`maintenance-profile.ts` 仅通过 Loader 组合真实 Cordis 提供者，不装配认证、记录业务、HTTP 或外部任务。`maintenance-cli.ts` 只做参数、显示、确认和生命周期收尾；升级、中断判断与恢复由可替换服务执行。CLI 必须显式指定 `--database`，不默认打开真实 `.recorder/`；使用当前锁定 Node/pnpm，先构建。下列均为**隔离样本路径**，目录父级须已存在，源与恢复目标为互不嵌套的兄弟目录：

```powershell
pnpm build
pnpm --filter @recorder/backend maintenance inspect --database C:/RecorderSamples/source/source.sqlite
pnpm --filter @recorder/backend maintenance upgrade --database C:/RecorderSamples/source/source.sqlite --confirm <inspect输出的plan.digest>
# 交互模式先显示计划；须输入当前完整摘要，其他输入取消。
pnpm --filter @recorder/backend maintenance upgrade --database C:/RecorderSamples/source/source.sqlite --interactive
pnpm --filter @recorder/backend maintenance points --database C:/RecorderSamples/source/source.sqlite
# 只对已检查的未完成运行继续；全部步骤已提交时只做最终验证，不重跑 SQL。
pnpm --filter @recorder/backend maintenance resume --database C:/RecorderSamples/source/source.sqlite --confirm <最新inspect输出的plan.digest>
pnpm --filter @recorder/backend maintenance restore --database C:/RecorderSamples/source/source.sqlite --point <封存UUID> --target C:/RecorderSamples/restored
pnpm --filter @recorder/backend maintenance verify --database C:/RecorderSamples/source/source.sqlite --target C:/RecorderSamples/restored
```

Linux 使用相同命令与绝对路径，例如 `/tmp/recorder-drill/source/source.sqlite`、`/tmp/recorder-drill/restored`。CLI 使用安装的生产迁移清单，当前 identity 为 v1、records 为 v2、tags/categories 各为 v1，真实旧样本可按上述回收站/标签/分类步骤升级；更广的多版本故障测试通过 `createMaintenance({ filename, sources, retainedSources })` 装配 file URL 指向的隔离多版本材料，没有新增任意 SQL 的 CLI 参数。

| 服务 / 命令 | 实际行为 |
| --- | --- |
| `recorderMaintenance.inspect()` / `inspect` | 计划四态、当前账本、未完成运行、已提交步数、pending 文件与 `idle/snapshot-needed/can-continue/final-validation/manual`。读取不执行迁移、不自动续跑；可信但未完成的检查可以成功输出，manual/blocked 退出 4 |
| `upgrade(expectedDigest)` / `upgrade` | 旧库无当前摘要确认不执行；快照和验证失败不执行 SQL。兼容且无未完成运行时返回无操作；全新空库初始化没有旧数据恢复点，普通应用仍可自动首次初始化 |
| `resume(expectedDigest)` / `resume` | 仅对唯一、可信的未完成运行；核对原恢复点 ID/manifest 摘要、完整原计划/源路径、当前材料摘要、原账本及有序提交前缀，再次绑定当前 plan.digest。原 SQL 已提交但结果未写时承认真实账本，不重复执行。快照未完成且尚无 SQL 提交时，重新确认后可创建新恢复点，旧 pending/孤立封存点保留 |
| `recorderRecoveryPoints.list()` / `points` | 成功列出 valid/invalid/incomplete；列表本身不授权升级，也不清理失败材料 |
| `recorderIsolatedRecovery.restore(id, target)` / `restore` | 先由 T02 verify 封存，再复制主文件到新空私有目标，核对摘要/账本/integrity/FK，再次 verify 原恢复点。绝不以 SQLite 打开封存原路径、不修改源库、不启动恢复库 |
| `verify(target)` / `verify` | 核对隔离标记和原恢复点，在隔离目标读取 SQLite；拒绝未验证 WAL/SHM/journal、摘要和账本变化。不启用账号会话或外部任务 |

退出码：0 命令成功（包括无升级或列出无效/未完成点）；2 缺确认、取消、计划过期；3 资料库/维护忙；4 inspect 显示阻塞计划、未完成维护需处理、运行记录不可信或隔离库禁止启动；1 其余执行/快照/校验/空间/路径/权限/关闭失败（包括 upgrade 遇到不支持的数据版本）；64 参数错误。错误输出结构化 code/message，不输出用户正文、密码摘要或 token。无非交互 `--yes`，无自动升级、回滚或覆盖恢复。

运行记录位于 `<实际 filename>.maintenance/<运行UUID>.json`，私有目录与 T02 相同权限要求。文件包含 `{run, checksum}`，checksum 为完整 run JSON 的 SHA-256，用于发现损坏，不是防恶意同用户修改的签名。run v1 保存源实际路径、完整原计划、阶段、已观察账本、恢复点 ID/manifest 摘要与时间。阶段为 snapshot → executing → validating → complete；意图先持久发布，记录与 SQL 成功账本不是同一事务。每步仍由 T01 在原 IMMEDIATE 事务中提交，协调者随后发布观察结果；最后 integrity/FK/计划校验通过才写 complete。每次更新采用独占新文件 → fsync → rename，并在 Linux fsync 目录；Windows 不声称目录 fsync/真实断电可靠性。异常 `.pending-*` 保留；有对应正式运行文件时以后者为发布边界，无对应运行的残留要求人工检查。历史运行不自动删除。

普通业务启动拒绝未完成或损坏的运行记录，即使当前 schema 已兼容；只读检查不解决该门禁。`manual` 表示源/材料/恢复点/账本前缀无法对应，不能通过重新确认直接越过。没有自动修复或删除记录的命令。CLI 收尾先等待命令完成，再显式 close 数据库以呈现 DATABASE_CLOSE_FAILED；失败保留独占，不靠超时放锁。使用 programmatic profile 的宿主同样须等待工作并处理关闭失败。

恢复目标必须是新建或已有且为空、权限已足够私有的普通目录；拒绝源目录、恢复点根目录及任一祖先/子目录，拒绝指向这些位置的别名与链接目标，不删除用户内容来满足空目录。写入 `database.sqlite.restore.json` 的 incomplete 标记后才复制；成功改为 isolated。失败保留目标与标记，不自动清理。启动门禁始终拒绝带此标记的库；正式恢复启用、会话失效/重新认证、身份和任务去重仍待后续设计。

复制前预检磁盘空间：目标数据库与 T02 校验副本可能同时存在，同卷按两份数据库估算、异卷分别检查；这是即时可用空间检查，不能保证其他进程不消耗空间。封存从不直接读取 SQLite，校验副本不进入有效恢复点。目标验证只清理本次只读连接新建的 WAL/SHM；预先存在的旁路文件明确拒绝，不删除或 checkpoint。当前维护 profile 仍依赖 T02 打开源库，不宣称支持原介质丢失或无法打开源库的完整灾难恢复。

组合测试见 `test/maintenance-recovery.test.ts` 与真实子进程 fixture；Windows/Linux、四个中断点、数据等价、桌面旧流程和未验证项的实际结果见 [T03 交付记录](../docs/work/b002-migration-recovery/t03-maintenance-recovery-drill.md)。不修改生产 schema/SQL、根依赖/锁文件、CI 或公共 HTTP 契约。

`test/storage-recovery.test.ts` 和独立 Node 子进程 fixture 覆盖真实争用/正常退出/强制终止、关闭顺序、别名拒绝与归一、WAL 快照、样本账号/会话/记录保留、空间/写入/摘要/FK/封存失败、在途撤回及服务替换。命令/平台实测、证据与未执行项见 [T02 交付记录](../docs/work/b002-migration-recovery/t02-upgrade-recovery-points.md)。生产 schema/SQL 未改，未操作真实资料；日常备份、覆盖恢复、附件/restic、维护 CLI 与桌面交互不在 T02。

完整备份、恢复与搬迁先读 [已确认备份主线](../docs/current/storage/backup-baseline.md)，再读 [流程细化](../docs/design/storage/backup-recovery.md)；设计适配插件时读 [restic 与 Cordis 集成](../docs/design/storage/restic-integration.md)。统一恢复集合 + 后台复制以及 restic 已确认；具体版本和协议未冻结，未安装工具或初始化仓库。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
