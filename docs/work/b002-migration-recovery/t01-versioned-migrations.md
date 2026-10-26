# B002-T01：多版本迁移与安全启动

状态：已合并；PR #9 已经整合者审查复验并完成本项验收。负责会话：原 B001-T03 实现会话顺序复用，由用户明确派发本任务。更新日期：2026 年 10 月 26 日。

阅读时机：实现、审查或整合本任务时。先读 [批次计划](README.md)、[迁移恢复契约](../../current/storage/migration-recovery-contract.md)、[数据访问主线](../../current/storage/data-access-baseline.md) 和 [后端 README](../../../backend/README.md)。Git/协作按根 AGENTS 执行。

## 起点与范围

- 分支：`feat/b002-t01-versioned-migrations`；PR 目标 `main`。
- 起点：包含本批计划的最新 main；派工消息提供完整 SHA，开工时核对并登记。
- 当前只有命名空间 revision 1 初始化；实际入口为 `backend/src/plugins/migrations.ts`、`src/data/migration-manifest.ts`、`src/application.ts`。
- 目标：把版本预检与实际执行分开，支持多 revision 的确定性依赖顺序和逐步事务，并阻止普通业务启动擅自升级已有库。
- 不做恢复点、维护 CLI、桌面 UI、真实新业务字段、DML 数据变换或破坏性迁移。

## 实施与验收

1. 保留已有账本格式、SQL 和摘要；引入完整迁移历史、明确依赖版本与兼容旧 `requires` 的规范化。拒绝重复、缺口、循环、缺失依赖、摘要变化以及已安装提供者不理解的更高数据版本。未安装提供者的遗留数据不删除。
2. 提供只读计划：区分空库、已兼容、需升级、阻塞；包含现状、目标、步骤及计划摘要。预检失败不能写入账本或业务表，计划变化时旧确认失效。
3. 受控执行器逐步使用事务；SQL 和成功账本同提交，FK 失败回滚本步，前序步骤保留并能被后续计划识别。事务只接受契约限定 SQL；验证 ADD COLUMN 和多语句边界、账本保护。
4. 普通应用启动只允许空库初始化或兼容库；已有库缺少步骤返回明确的需要维护原因，撤回业务服务并关闭资源。新增命名空间也属于已有库升级。非空但无账本不能当新库重建。
5. 执行器能力由 Cordis 服务提供；生产装配不暴露不经恢复点的“直接升级”入口。T01 的升级执行由隔离测试调用，T03 才接入完整维护协调。现有测试用辅助函数若保留，明确其层次和业务入口禁止绕过的边界。
6. 公布可供 T02/T03 使用的后端服务类型、失败分类及样本调用；状态名称可按现有风格实现，不能把“事务成功”写成整批已恢复。

允许修改：`backend/src/plugins/migrations.ts` 及归属它的新增辅助模块/类型，`backend/src/domain.ts`、`backend/src/data/migration-manifest.ts` 的类型与兼容适配，`backend/src/application.ts` 和 `main.ts` 的安全启动接线，相关 `backend/test/` 样本/测试、`backend/README.md`、本任务卡。保留初始生产 SQL 原字节和现有业务 schema；共享 HTTP 契约、根依赖/锁文件、全局文档和其他任务卡只读。确需超范围先报告。

`pnpm test` 覆盖：已有 v1 库及账号/记录不变、空库、非空无账本、多个版本/命名空间拓扑、重复执行、SQL/FK 失败、跨步提交后再次计划、摘要/依赖/降级拒绝，以及启动失败资源释放。使用 fixture 证明 v1→v2→v3，不为测试增加真实业务 migration。执行 `pnpm check`、`git diff --check`；安全启动接线后 Windows 运行 `pnpm test:records:desktop`。Linux 结果以 PR CI 为证，不能由 Windows 通过推断。

## 交付记录

整合结果：原始 HEAD `d2a5c369074640455505b4233a933d5e2528881f` 经 [PR #9](https://github.com/ISQIShI/Recorder/pull/9) squash 为 `762e98cb3cd2151b9f88a6167dfc218f8b0fdc88`。最终 CI、本机复验、相关文档检查及环境失败记录见 [批次整合记录](README.md)。以下保留实现者交付事实；其中“待整合”的流程说明不再代表当前状态。

- 实际开工基线：`c853abd56070deb148bc1bf546da71082cd64d00`；开工与交付前均 fetch 核对 `origin/main`，包含本批计划、任务卡与契约。
- 工作树：`C:\Users\30828\.codex\worktrees\b74a\Recorder`；仅在本工作树操作，保留原 B001 成果与未跟踪 `.codex/`，未操作主仓库或其他工作树。
- 分支：`feat/b002-t01-versioned-migrations`，由该基线新建，不沿用 B001 分支；[PR #9](https://github.com/ISQIShI/Recorder/pull/9) 目标 `main`。完整 HEAD 放最终交付消息/PR，不写入文件产生自引用提交。

### 实现事实与服务交接

后端公共类型见 `backend/src/migration-contract.ts`，由 `domain.ts` 重导出；装配与消费者声明 Cordis 注入，不绕过提供者调用运行时业务。具体样本、失败分类和 SQL 子集见 [backend README](../../../backend/README.md#多版本迁移服务b002-t01)。

| 接口 | T02/T03 可依赖的事实与边界 |
| --- | --- |
| `MigrationSource` / `Migration` | 完整连续 revision 历史，显式 `dependencies: { namespace, revision }[]`、兼容旧 `requires`，独立可选 packageVersion；原生产 SQL 与 SHA-256 算法不变 |
| `recorderMigrationPlanner.inspect()` | 只读返回四态、库位置、各 namespace current/target、账本、步骤、原因、digest；提供者 `migrations` 的 inspect profile 不激活业务 readiness |
| `recorderMigrationExecutor.execute(expectedDigest)` | 独立 `migration-executor` Cordis 插件提供，生产 profile 不加载；同步逐步 IMMEDIATE 事务，SQL/FK 检查/成功账本一起提交；返回 `{ committed, plan }`，不代表整批维护完成 |
| `MigrationError` | code/plan/step/committed/cause；区分需维护、更高数据版本、摘要/历史不可信、清单/依赖/SQL 拒绝、旧计划、步内/FK 失败、忙/损坏/不可用、外层事务、服务撤回 |
| `recorderMigrations.ready` | 普通启动只对空库初始化或兼容库提供；已有库 pending（包括新命名空间）拒绝，不能按“没有业务记录”推定为空库；失败关闭 Loader 资源，主入口非零退出并输出结构化原因 |

digest 绑定库实际路径（内存库按句柄区分）、schema、全部成功账本及规范化 SQL/依赖/包版本材料。每次执行和每步事务内重新检查，拒绝旧确认，忽略调用者对返回 plan 对象的篡改；`materialsDigest` 防止已提交部分步骤后静默接受中途替换的材料。相同库重开摘要稳定，内容完全相同的另一路径仍需新确认。被卸载提供者的表和账本保留；若步骤依赖它，必须提供已提交且摘要可验证的历史前缀，历史也参加循环检测。

受控适配仅允许普通 CREATE TABLE/INDEX 与可空普通列 ADD COLUMN（TEXT/INTEGER/REAL/BLOB/NUMERIC，可带 DEFAULT NULL）。轻量词法边界保留 Drizzle breakpoint，识别引号/注释中的伪分隔；单语句 prepare 边界不接受脚本尾随 DML。拒绝事务控制、PRAGMA、ATTACH、扩展、触发器、虚/临时表、改名/删列/重建、约束回填及修改账本。未引入 SQL 解析器/依赖或新业务 migration。

原测试辅助 `applyMigrations` 保留为隔离测试底层适配，改用同一计划和逐步事务；普通业务入口不调用它。原“后步失败整批回滚”初始化测试按本批契约改为“已提交前缀保留”，另测步内多条 SQL 和 FK 失败时本步 SQL/账本全部回滚，不能把这个调整误解成整批已恢复。

T02/T03 仍须实现并验证：独占持有覆盖预检至维护结束、升级前可用恢复点、显式确认/再次确认与维护运行记录。T01 执行器只由隔离样本调用，不是可用于真实旧库的维护入口。尤其 `compatible` 只说明 schema/账本兼容，不证明未完成维护运行已结束；T03 必须增加该状态门禁，全部步骤已提交但最终验证/结束记录未完成时仍禁止业务启动。本任务未提前实现 T02/T03。

### 验证与证据

Windows 本机：Node `24.14.1`、pnpm `10.33.0`、better-sqlite3 `13.0.3`、实际 SQLite `3.53.4`。全程用独立临时样本库/动态端口/desktop userData，未打开、升级或恢复用户真实 `.recorder/`。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm check` | 通过：全仓构建、类型、41 项测试（原 26 项与本任务新增 15 项）、文档检查；日志 `artifacts/b002-t01-check.log` |
| `backend/test/versioned-migrations.test.ts` | 15 项：四态只读预检、跨 namespace 的 fixture v1→v2→v3、保留数据、连续历史/摘要/依赖/降级拒绝、SQL 子集/引号与多语句边界、步内 SQL/FK 失败与已提交前缀、计划失效/库路径绑定、中途材料替换停止、服务撤回/恢复/替换、原 v1 账本/账号/记录保持、需维护/损坏/无账本启动拒绝与真实句柄关闭、子进程非零退出、busy 不强夺 |
| `pnpm test:records:desktop` | Windows 真实 Electron 四阶段 create/resume/discard-quit/discard-close 均通过；日志 `artifacts/b002-t01-records-desktop.log`，最终复跑结果 `artifacts/records-smoke-V7pGUS/{create,resume,discard-quit,discard-close}.json`；成功保存/冲突/会话、重启 revision 5、正常关闭/退出取消与批准回归均通过 |
| `git diff --check` | 通过；生产 SQL/schema、共享 HTTP 契约、根依赖/锁文件、CI、其他任务卡和全局文档未改 |
| Linux / Windows PR CI | [首轮 CI](https://github.com/ISQIShI/Recorder/actions/runs/40326162975) 已通过：实现提交 `dc6defa3804e8a94b92a1b97af867cb3c74b8077` 的 Ubuntu 24.04 与 Windows 2025 均完成 `pnpm check`（41/41）及标题检查；Linux 原始日志保存在 `artifacts/b002-t01-linux-ci.log`。本次仅补交付说明，最终 HEAD 的复跑结果以 PR checks 为准并在最终交付提供链接 |

### 未执行项、材料与整合建议

- 未执行跨进程独占、路径别名互斥、恢复点/恢复/维护中断协调及最终恢复演练（T02/T03）；未做真实旧库升级、真实断电/磁盘损坏实验、Linux 图形 Electron、生产部署、Android 原生/真机。损坏拒绝测试仅用明确的坏文件样本；不声称灾难恢复完成。
- 无额外依赖、产品/数据或公共 HTTP 契约选择，无超范围文件修改；未派出子代理，不修改其他工作树、不推送 main、不合并 PR。
- 原有未跟踪 `.codex/` 保留且不提交；忽略的 `artifacts/` 中保留日志、Electron JSON/截图与本会话早期证据，不提交运行库或凭据。本任务测试进程已退出，无常驻实例。
- 请整合者合并后汇总 B002 总表、技术状态、数据访问主线、迁移恢复契约和工程/业务状态：多版本只读计划、逐步事务及普通启动门禁已实现；生产仍为 identity/records v1，独占/恢复点/维护协调与桌面确认仍待后续，不能将本任务写成完整升级恢复已完成。客户端仅保留原共享构建与 Windows Electron 回归，没有新增 Web/Android 迁移 UI。

实现完成仅标“待整合”，不合并 PR 或推送 main，不自动开始 T02。可复制派工提示见 [提示词](prompts.md)。
