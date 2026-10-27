# B002-T03：维护入口与隔离恢复演练

状态：进行中；实现与组合验证中。负责会话：由用户明确派发，顺序复用原 T02 工作树。更新日期：2026 年 10 月 27 日。

阅读时机：集成或验收维护、故障恢复时。先读 [批次计划](README.md)、[迁移恢复契约](../../current/storage/migration-recovery-contract.md)、[T01](t01-versioned-migrations.md) 与 [T02](t02-upgrade-recovery-points.md) 的实际交付、[后端 README](../../../backend/README.md)。

## 起点与范围

- 分支：`feat/b002-t03-maintenance-recovery-drill`；PR 目标 `main`。
- 起点：包含 T02 合并提交 `8b4632a3245e084c15b7841b5274e262e09d19e6` 及本轮交接文档的最新 main；以实际契约实现，不猜测其他工作树。记录开工时完整 SHA，不直接从 T02 原始 HEAD 或尚未合并的文档分支派工。
- 目标：通过最小 Cordis 维护 profile 和 CLI 完成显式确认、恢复点前置、受控升级、中断判断与隔离恢复。
- 不做桌面维护按钮、远程维护 HTTP、在线切换/覆盖原库、会话恢复启用策略、restic 或新业务 schema。原库始终保留。

## 实施与验收

T02 的实际服务交接：类型为 `backend/src/storage-contract.ts`（domain 重导出）；复用 `recorderDatabaseOwnership`、`recorderDatabase.use/close`、`recorderMigrationPlanner.capture()` 和 `recorderRecoveryPoints.create/verify/list`，不重写锁、快照或 SQL 计划。数据库关闭失败保留租约，结束未完成迭代器后才能重试；错误应明确呈现，不能通过超时释放独占。恢复点验证会复制一个数据库到私有暂存目录，需要额外空间；封存目录拒绝 WAL/SHM/journal，SQLite 数据读取在校验后的隔离目标中进行，禁止为了检查而直接打开封存主文件。失败与中断的 `.pending-*` 材料保留，不自动清理。verify 只证明恢复点内容，仍须由本任务核对源库、计划摘要和维护运行，不授权自动升级。

1. CLI 仅解析参数、展示结果和传递确认；协调业务在 Cordis 插件中。profile 不依赖 auth/records 业务 schema 可用，不注册无认证管理 HTTP，不把整个业务应用启动后才做升级。
2. 提供检查、确认后升级、恢复点查看、恢复到新空目录和验证的明确命令；在 `backend/README.md` 给出可复制的样本命令、退出码、错误与权限说明。非交互执行必须明确绑定已检查计划摘要；计划过期、用户取消或缺少确认不执行升级。
3. 独占覆盖预检到结束，恢复点封存与校验通过才能执行；逐步调用 T01，保留 T02 提供的恢复证据。升级后整体校验通过才记录完成，提示普通后端可重新启动；不在 CLI 自动启动业务或桌面。
4. 保存最小持久维护运行记录，并与成功账本对照；把未完成维护检查接入普通应用启动，即使 schema 已到目标版本也不能绕过未完成的整体验证而启用业务。中断重启只显示事实与可选继续动作，不自行续跑、回滚或恢复覆盖；再次确认前检查原恢复点、材料和账本前缀。所有步骤已提交但最终验证未完成时仍须完成验证，不能重复执行迁移。
5. 恢复只写入新空隔离目标：校验封存、清单、文件摘要和路径范围；拒绝源库、已有目录数据、恢复点目录及别名/嵌套覆盖。不删除用户内容以满足“空目标”。恢复验证不得自动启用复制出来的会话或外部任务。
6. 用 fixture 升级前后对比账号、记录正文/格式/revision、创建幂等资料及迁移账本；恢复目标读回升级前内容并通过 SQLite 校验。记录所需程序版本，不用最新业务代码自动修改恢复出来的旧库。
7. 调用真实插件链验证替换/撤回与资源释放；仅为组合接线修复 T01/T02 局部问题，不另写迁移器、快照器或锁。

允许修改：后端新增维护插件、运行记录与恢复服务辅助模块、CLI/最小装配入口，`backend/package.json` 的维护脚本，必要的 `backend/src/domain.ts` 和既有插件局部集成修复，`backend/test/`、`backend/README.md`、本任务卡。根依赖/锁文件、CI、生产 schema/SQL、共享 API、全局文档和其他任务卡不自行修改；产品/数据语义变化先询问。

除 `pnpm check`、`git diff --check` 与 Windows `pnpm test:records:desktop` 外，新增样本流程进入自动测试：

- 当前库无需升级、空库初始化、旧库无确认拒绝、取消/计划变动拒绝、恢复点失败不执行 SQL、升级成功、重复执行无副作用。
- 用真实子进程在快照封存前、SQL 提交前、步骤提交后但结果记录前、最终验证前终止；重启核对实际账本、恢复点和运行状态，再经确认继续，已提交步骤不重做。
- 有效恢复点隔离恢复成功、被篡改/未封存恢复点拒绝、非空/相同/别名目标拒绝；源库和恢复点保持不变。
- Windows 本机与 Linux CI 结果分别记录；进程终止不代表断电/磁盘故障实测，Android 仍不验证。

## 交付记录

- 实际开工基线：`ca5ee23aaf05253490de03d56aa3837c64baec1e`。已 fetch，核验 T01 PR #9、T02 PR #11 均已合并；包含指定 T02 合并提交 `8b4632a3245e084c15b7841b5274e262e09d19e6` 和交接文档 PR #12。
- 工作树：`C:\Users\30828\.codex\worktrees\b74a\Recorder`；分支 `feat/b002-t03-maintenance-recovery-drill` 从该 origin/main 新建。切换前只有原未跟踪 `.codex/`，已保留，未 stash/reset/clean、未检出 main 或修改其他工作树。PR 待创建；完整 HEAD 放最终消息与 PR，避免自引用提交。

### 实现与接口

详细命令、退出码、磁盘空间及支持限制见 [后端 README](../../../backend/README.md#离线维护与隔离恢复b002-t03)。

- `maintenance-profile.ts` 通过真实 Loader 组合 ownership/database/migrations/recovery-points、单步执行器、维护记录、协调与隔离恢复；不装配 auth/records/HTTP/外部任务。CLI 仅解析/显示/确认/收尾，必须显式指定源库。
- `recorderMaintenance.inspect/upgrade/resume`：按当前 plan.digest 确认；先持久意图、建立并 verify 恢复点，绑定源/原计划/材料/账本前缀后逐步执行，最后整体验证并写 complete。空库首次初始化无旧数据恢复点；已有兼容库无操作。不自动继续、回滚、覆盖或启动业务。
- T01 兼容增补可选 `executeStep(expectedDigest)`，复用原 `executeMigrations` 的同一 IMMEDIATE 事务算法，最多一步；原 execute 行为不变，没有第二套迁移器。缺少单步入口的替身明确拒绝用于维护。
- `recorderMaintenanceRuns` 保存私有 run JSON 与 checksum；独立于成功账本，阶段 snapshot/executing/validating/complete，原子发布并保留历史/pending。重启承认真实已提交前缀，不按结果文件猜测回滚。无有效正式运行对应的 pending 或材料/恢复点/账本不匹配进入 manual。
- 普通 application 的迁移门禁通过 Cordis 注入记录服务，先拒绝未完成/损坏记录和隔离恢复标记，再提供业务 readiness；数据版本已兼容也不能越过未完成验证。旧低层插件隔离测试保持兼容，不能作为普通启动绕行入口。
- `recorderIsolatedRecovery.restore/verify` 消费 T02 verify，只在新的私有空目录复制/读取数据库，不以 SQLite 打开封存文件；核对原点与目标摘要、账本、integrity/FK，保留旧程序版本要求。拒绝源/恢复点目录及祖先/子目录/别名；不清理用户内容。失败目标为 incomplete，成功为 isolated；普通启动均禁止启用该标记库，正式启用策略尚未实现。
- 预检目标与校验副本的共存空间，同卷估算两份数据库、异卷分别检查；空间检查不是预留或容量承诺。T02 pending、孤立恢复点、维护记录及失败恢复目标不自动清理。

### 验证进度与证据

- 本机 Windows：编译与后端类型检查通过；首轮三个组合测试通过（最小真实 Loader、升级/隔离恢复数据等价、空库/兼容库与业务启动、真实 CLI 缺确认/取消/过期拒绝）。日志 `artifacts/b002-t03-initial-tests.log`。后续完整 T03 组合测试执行中，不能由该首轮结果推导全部通过。
- 四个真实进程终止点：native backup 封存前、实际 SQL/FK/账本已写但事务尚未提交、真实事务提交后但协调观察未发布、最终验证开始前。通过 fixture 包装真实驱动/记录服务暂停，父进程终止后重新装配真实服务判断，再通过 CLI 显式确认继续；没有生产故障参数或绕过检查的测试专用迁移器。
- 完整 `pnpm check`、Windows Electron 旧流程、最终 Windows/Linux CI：待执行与补充。

### 遗留与整合建议

- 未验证真实断电、介质写满/损坏、未支持文件系统、Linux 图形 Electron、生产部署、Android；ENOSPC 等为受控 API 故障注入，进程终止不代表断电。
- 当前维护 profile 消费 T02 能力，源库须能被该 profile 打开；不宣称覆盖丢失源介质/不可打开源库的完整灾难恢复。正式恢复启用、会话策略、外部任务去重、桌面确认 UI 与 restic 不在本任务。
- 测试样本在 `recorder-t03-*` 临时目录和忽略 artifacts；不操作真实 `.recorder/`，不提交证据中的数据库/凭据。原 `.codex/` 保留。运行中测试进程与未提交实现将在最终交付前核对。
- 请整合者复核组合结果后再更新全局状态、批次总表和契约事实；本任务只更新后端局部说明及自己的卡，不自行标整个 B002 已验收或开始下一批。

完成标“待整合”，交付本批组合结果，但不能自行标整个 B002 已验收。整合者复核后再安排桌面确认界面和回收站。提示词见 [派工入口](prompts.md)。
