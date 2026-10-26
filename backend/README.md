# backend：集中后端

状态：本机账号认证及记录保存/查询/更新已实现，生产接入和完整恢复待实现。更新日期：2026 年 10 月 26 日。

阅读时机：后端、业务插件、存储和服务部署工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，先读 [后端技术](../docs/current/architecture/backend-stack.md) 与 [架构概览](../docs/current/architecture/overview.md)。

`src/bootstrap.ts` 负责 Cordis/Loader 装配，保留基础验证 profile。`src/application.ts` 先装配资料库独占，再装配数据库、迁移启动门禁、密码学、身份存储、认证、记录、操作注册表与 HTTP 插件；`main.ts` 启动业务 profile。默认数据为根目录 `.recorder/recorder.sqlite`，可用 `RECORDER_DATA_DIR` 指定绝对目录。

先从根目录执行 `pnpm build`，再用 `pnpm dev:backend` 启动；默认仅监听 `127.0.0.1:4317`。`pnpm test` 包含后端插件生命周期、替换、持久数据保留、失败传播和事务回滚测试。版本和验证范围见 [工程基线](../docs/current/development/engineering-baseline.md)，所有新能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

当前请求契约、首次初始化、持久会话、正文格式、幂等和查询见 [账号记录流程](../docs/current/development/first-record-flow.md)。记录接口必须认证；无认证 foundation 诊断 profile 仅供原有测试，业务入口不加载它。当前仍限 loopback，暂不直接远程部署。

[B001-T01](../docs/work/b001-record-editing/t01-update-api.md) 已补充 `PUT /api/v1/records/{id}`（`updateRecord`）：正文为 `expectedRevision/title/body/format`，成功返回当前记录并递增 revision；版本过期返回 409 `REVISION_CONFLICT`，不存在或不属于当前账号均为 404。存储插件在 immediate 事务内执行 owner/id/revision 条件更新，创建请求摘要及身份/来源字段不变；未改 schema/迁移。PUT 同样校验 Origin、Cookie/CSRF 或 native Bearer，OpenAPI 分开描述路径和正文。更新能力随 Cordis 记录依赖撤回/恢复，认证撤回时 HTTP 不可用。

`test/record-edit.test.ts` 覆盖持久化、两个数据库连接竞争、输入/安全约束、创建幂等回归及插件撤回。构建并安装锁定 Electron 后，可另运行 `node backend/test/record-edit-desktop.mjs` 验证真实 renderer → preload → 主进程 → HTTP 更新/冲突和后端重启；它需要桌面环境，使用 `artifacts/t01-update-*` 隔离目录和动态端口，不纳入普通无桌面单测。

设计公共接口或登录前读 [API 与认证主线](../docs/current/architecture/api-auth-baseline.md)，细化时再读 [统一 API](../docs/design/interfaces/unified-api.md) 或 [身份与多设备](../docs/design/security/identity-device-access.md)。设计服务监听和发布时读 [部署接入](../docs/design/operations/deployment-access.md)，具体实现方案尚未冻结。

数据工作先读 [已确认模型主线](../docs/current/storage/data-model-baseline.md) 与 [数据访问主线](../docs/current/storage/data-access-baseline.md)。细化实体和查询时读 [模型设计](../docs/design/storage/data-model.md)，升级、版本账本和失败恢复先读 [B002 实施契约](../docs/current/storage/migration-recovery-contract.md)，更广范围参考 [迁移机制提案](../docs/design/storage/plugin-migrations.md)，落盘与删除恢复读 [存储生命周期](../docs/design/storage/storage-lifecycle.md)，插件新增字段读 [插件数据契约](../docs/design/plugins/data-extension.md)。[B002-T01](../docs/work/b002-migration-recovery/t01-versioned-migrations.md) 已实现下述多版本计划、底层逐步执行和启动门禁；[B002-T02](../docs/work/b002-migration-recovery/t02-upgrade-recovery-points.md) 接入普通后端独占并提供独立恢复点服务。维护协调、CLI、恢复演练与桌面确认仍未实现。生产清单仍只有 identity/records revision 1；`validation/migrations` 是 Kit 生成的隔离探针，不参与生产升级。

## 多版本迁移服务（B002-T01）

后端契约由 `src/domain.ts` 重导出 `src/migration-contract.ts` 的类型和 `MigrationError`，消费者依赖注入服务。实现分为 `plugins/migrations.ts`、其 `migrations/` 辅助模块与独立的 `migration-executor.ts` 插件；后者不在普通业务 profile 中装配。

| 服务或入口 | 语义 |
| --- | --- |
| `recorderMigrationPlanner.inspect(): MigrationPlan` | 只读预检，不建账本或业务表，返回 `empty` / `compatible` / `upgrade-required` / `blocked`、各命名空间 current/target revision、独立 packageVersion、成功账本、待执行顺序、原因和计划 digest |
| `recorderMigrationPlanner.capture?()` | T02 的可选兼容增补；一次读取安装/保留 SQL，复用原算法返回 `{ plan, installed, retained }`；包含已应用 SQL，供恢复点归档。旧计划提供者可继续只实现 inspect；恢复点遇到没有 capture 的替身会明确拒绝 |
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

T03 最小装配顺序为 ownership（filename）→ database（相同 filename）→ migrations（完整 sources/retainedSources，mode inspect）→ recovery-points → 维护协调。维护协调在独占下展示/确认计划，先 `await recorderRecoveryPoints.create(plan.digest)`，再核对计划/恢复点后才能调用独立执行器；失败必须中止。协调者还须保证无业务写入、记录维护运行、核对恢复点与当前资料库/计划的对应关系，并实现隔离恢复，不能把此样本当现成 CLI 或绕过确认的旧库升级入口。普通 createApplication 装配独占，不装配 recovery/executor，不自动创建恢复点或升级旧库。多客户端仍可访问同一业务后端。

`test/storage-recovery.test.ts` 和独立 Node 子进程 fixture 覆盖真实争用/正常退出/强制终止、关闭顺序、别名拒绝与归一、WAL 快照、样本账号/会话/记录保留、空间/写入/摘要/FK/封存失败、在途撤回及服务替换。命令/平台实测、证据与未执行项见 [T02 交付记录](../docs/work/b002-migration-recovery/t02-upgrade-recovery-points.md)。生产 schema/SQL 未改，未操作真实资料；日常备份、覆盖恢复、附件/restic、维护 CLI 与桌面交互不在 T02。

完整备份、恢复与搬迁先读 [已确认备份主线](../docs/current/storage/backup-baseline.md)，再读 [流程细化](../docs/design/storage/backup-recovery.md)；设计适配插件时读 [restic 与 Cordis 集成](../docs/design/storage/restic-integration.md)。统一恢复集合 + 后台复制以及 restic 已确认；具体版本和协议未冻结，未安装工具或初始化仓库。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
