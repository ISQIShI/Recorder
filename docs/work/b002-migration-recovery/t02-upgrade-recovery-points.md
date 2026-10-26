# B002-T02：资料库独占与升级恢复点

状态：待整合；本机实现与 Windows/Linux PR CI 已通过。负责会话：原 B002-T01 实现会话顺序复用，由用户明确派发。更新日期：2026 年 10 月 26 日。

阅读时机：实现、审查或整合独占、快照与恢复清单时。先读 [批次计划](README.md)、[迁移恢复契约](../../current/storage/migration-recovery-contract.md)、[T01 交付](t01-versioned-migrations.md)、[备份主线](../../current/storage/backup-baseline.md) 与 [后端 README](../../../backend/README.md)。

## 起点与范围

- 分支：`feat/b002-t02-upgrade-recovery-points`；PR 目标 `main`。
- 起点：T01 已合并且通过验证的最新 main；不从 T01 尚未 squash 的任务 HEAD 开始。
- T01 合并提交为 `762e98cb3cd2151b9f88a6167dfc218f8b0fdc88`；实际起点还须包含本轮交接与相关文档检查规则，从最新 origin/main 记录完整 SHA。可消费 `recorderMigrationPlanner.inspect()` 与独立维护 profile 的 `recorderMigrationExecutor.execute(expectedDigest)`，具体边界见 T01 卡和后端 README。
- 目标：普通业务后端和维护宿主对同一资料库共享跨进程独占机制；提供可封存、可校验的升级前数据库恢复点。
- 非目标：完整维护 CLI、桌面 UI、覆盖式恢复、附件/restic/日常备份、自动清理历史恢复点、加密异地上传。

## 实施与验收

1. 新增独占能力插件，在业务数据库打开前取得所有权，所有句柄和在途快照结束后才释放；库忙明确失败，不能杀另一进程、删除活跃锁或等待到无限期挂起。
2. 优先用现有驱动验证独立控制库事务锁；不能满足要求时提交替代方案证据。用两个实际 Node 进程验证争用、正常退出、强制终止后释放、释放次序；不能只有单进程 mock。验证规范化实际 filename、不同 dataDir 指向同一数据库、符号链接/junction 等别名。无法可靠支持的路径显式拒绝并记录，不默认为不同资料库。
3. 将独占接入现有普通 `createApplication` 生命周期；内存样本按明确规则隔离。只协调受该协议管理的 Recorder 后端，README 说明旧版本/第三方数据库工具须先停止。不能破坏多客户端访问同一后端。
4. 提供 Cordis 恢复点服务，消费 T01 迁移计划，使用 SQLite 一致快照接口。临时目录 → 完整校验 → 封存，目录/状态可区分未完成与有效；任何失败不能返回“可用于升级”。
5. 清单与快照包含契约规定的账本、版本、迁移材料和摘要；同时校验完整性、外键和材料一致性。校验日志不输出资料、密码摘要或会话秘密。建立受本机权限保护的本地目录，显式报告 Windows/Linux 权限实现与限制。
6. 证明提供者可以经 Cordis 替换/撤回，并正确处理快照仍在运行时的销毁，不能先释放独占再继续访问数据库。

允许修改：新增后端独占/恢复点插件及其辅助类型与实现，`backend/src/plugins/database.ts`、`backend/src/application.ts`、`backend/src/domain.ts` 等必要生命周期接线，相关 `backend/test/`、`backend/README.md`、本任务卡。T01 的服务类型若需兼容增补先说明；不重写其算法。生产 schema/SQL、根依赖/锁文件、共享 HTTP 契约、全局文档和其他任务卡只读；如必须增加依赖，由整合者协调。

`pnpm test` 覆盖：两个进程独占、崩溃与 dispose、别名、来源含 WAL 的快照、校验失败、受控写入/空间不足故障、半成品不封存、摘要被改拒绝、快照后源库内容未丢失。故障注入要验证升级前置条件确实失败，不能仅测试一个布尔值；CLI 接线由 T03 完成。执行 `pnpm check`、`git diff --check` 及 Windows `pnpm test:records:desktop`，Linux 独占与恢复点测试进入现有 CI。平台无法执行的项目注明，不把跳过写成通过。

## 交付记录

- 实际基线：`fc11275640bbc631587ee5e61650aa99811ff81c`；已 fetch，核验 PR #9 的 T01 squash `762e98cb3cd2151b9f88a6167dfc218f8b0fdc88` 是 origin/main 的祖先，且迁移实现与 T01 交付相符，包含最新交接/相关文档检查规则。
- 分支：`feat/b002-t02-upgrade-recovery-points`，从该 origin/main 新建；工作树 `C:\Users\30828\.codex\worktrees\b74a\Recorder`。原任务成果已提交/推送且已合并；本次切换前仅未跟踪 `.codex/`，已保留，无 stash/reset/clean 或其他工作树操作。
- [PR #11](https://github.com/ISQIShI/Recorder/pull/11)，目标 main；完整 HEAD 在最终交付及 PR 提供，避免在提交中自引用。

### 实现与 T03 服务交接

类型见 `backend/src/storage-contract.ts`，由 domain 重导出；实现和明确支持限制见 [后端 README](../../../backend/README.md#资料库独占与恢复点b002-t02)。

| 服务/材料 | 实际接口和边界 |
| --- | --- |
| `recorderDatabaseOwnership` | `filename/controlFile/assertHeld/retain`；独立控制 SQLite 的 DELETE/EXCLUSIVE 事务，busy_timeout=0。retain 返回 filename/assertHeld/release 租约，停止新租约后等待旧租约释放再 close 控制库；不删除控制文件、强夺或按时间过期 |
| `recorderDatabase.use(async raw => ...)` | 数据库依赖所有权，打开前校验目标相同并 retain；撤回拒绝新 use、等待在途 use、close raw、release 租约。业务同步 raw 仍按原生命周期使用，异步快照必须注册 use |
| `recorderMigrationPlanner.capture?()` | 已向用户说明的可选兼容增补；读取同一份完整安装/保留 SQL 后复用 T01 inspect 算法，返回 `{ plan, installed, retained }`，未重写计划/执行算法。原仅 inspect 替身继续可用，恢复点缺 capture 或任一已应用 SQL 则明确拒绝 |
| `recorderRecoveryPoints.create(expectedPlanDigest)` | 与源库所有权/数据库/只读计划依赖；驱动 native backup 后核对完整性、外键、成功账本、SQL 原材料摘要、原计划；只有完整封存后返回 RecoveryPoint。普通业务不装配该插件/执行器，不自动为真实旧库升级 |
| `verify(id)` / `list()` | 重读 manifest/seal、SQL 文件、快照 hash/大小、integrity/FK/账本；list 区分 valid/invalid/incomplete。T03 仍须匹配当前源库、计划和维护运行，verify 自身不授权升级或恢复 |

恢复目录默认 `<实际 filename>.recovery-points`，可配置独立本地 directory（父目录须已存在，不包含源库）。内部 UUID；`.pending-<id>` → 完整材料/数据库/manifest/seal 校验 → 同父目录 rename 为 UUID。失败保留 pending，不返回可用点、不自动清理。manifest v1 包含源路径、计划与材料摘要、完整计划/成功账本、程序与依赖版本、安装/保留 SQL 元数据和逐文件摘要、数据库大小/hash、校验结果；seal 绑定 manifest SHA-256。明确未归档可执行程序，不承诺仅凭版本号就能重启旧版。

Windows 使用系统 PowerShell/.NET 在创建时设当前 SID 的受保护独占 DACL 并核验；Linux 0700 目录/0600 文件并检查 uid/权限。既有过宽目录拒绝，不改用户 ACL。管理员/root、同一用户、备份权限不被隔离；没有加密/上传。文件 fsync；Linux 目录 fsync，Windows 不声称 Node 目录 fsync 或断电持久性已验证。

实际 filename 优先 realpath，未建库先规范化父目录；不同 dataDir 不影响同一文件的独占。支持 Windows 固定 NTFS 与 Linux 指定本地文件系统类型，实测平台见下表。拒绝网络/映射网络盘、URI/设备/ADS、未知文件系统、多硬链接/非普通库、链接控制文件、悬空文件链接、Linux 文件 bind mount；不能可靠识别的任意别名不宣称支持。目录 symlink/junction 与相对路径已实测；其他文件系统、卷挂载等限制在后端 README。旧版本/第三方工具须停用，协议不防御外部有目录修改权者删除/替换控制文件。

### 验证与证据

Windows Node 24.14.1 / pnpm 10.33.0 / better-sqlite3 13.0.3 / SQLite 3.53.4；样本全部在独立临时目录，未操作真实 `.recorder/`。

| 检查 | 实际结果 |
| --- | --- |
| Windows 初轮隔离测试 | 沙箱中 junction/硬链接被 EPERM 拒绝，私有 DACL 目录受 token 限制；不计通过。沙箱外首轮 14/14 通过，见 `artifacts/b002-t02-storage-elevated.log` |
| 最终 `pnpm check` | 通过：构建、类型、57/57 项测试（原 41 项 + 新增 16 项）、相关文档检查；日志 `artifacts/b002-t02-check.log` |
| 新增真实 Node 跨进程检查 | 争用立即 DATABASE_BUSY；正常 close、SIGKILL 后重新取得；在途 use 时第二进程仍忙；真实关闭事件顺序 use-finished → database-closed → ownership-closed；不同 dataDir、相对路径和 Windows junction 同锁，硬链接拒绝 |
| 新增恢复点检查 | 源含已提交 WAL；保留账号/会话/记录值和原生产 SQL；SQL/DB/manifest 篡改、hash 正确但 FK/账本/坏库异常拒绝；备份/材料写入 ENOSPC、封存 EACCES、半成品不可用；进行中撤回、原生 backup 取消与提供者替换；现有过宽 ACL 不被静默修改 |
| 旧连接竞争测试适配 | 原两个 createApplication 宿主共享库的假设已不成立；改为同一所有权下两条受管理连接与实际 record-store，保留原 200/409、revision、创建身份、重启持久化断言。初次全仓检查因此失败，修复后该文件 4/4 已通过，没有放宽独占或删断言 |
| Windows `pnpm test:records:desktop` | 四阶段 create/resume/discard-quit/discard-close 均通过；日志 `artifacts/b002-t02-records-desktop.log`，JSON/截图 `artifacts/records-smoke-f1ZMFq/`；含正常 app.quit/window.close 取消/批准和重启持久化 |
| Linux/Windows PR CI | [验证 CI](https://github.com/ISQIShI/Recorder/actions/runs/40338540907)：提交 `fb1f9559cdd01d23351ceb45cc52871046d8ea09` 的 Ubuntu 24.04 与 Windows 2025 均完成 57/57、构建/类型/相关文档和标题检查；日志 `artifacts/b002-t02-verified-ci.log`。初轮 Linux 57/57、Windows 55/57，Windows 临时目录 RUNNER~1 短路径导致两项旧测试按原始输入路径比较失败；已改为规范路径，未放松摘要绑定/真实 close 断言或修改 T01 算法；本机迁移回归 15/15 通过。最后仅补本交付说明，最终 HEAD 复跑以 PR checks 与最终交付链接为准 |
| 范围与文档 | `git diff --check`、`pnpm check:docs --base fc11275640bbc631587ee5e61650aa99811ff81c` 通过（7 份相关文档，164 个内部链接）；生产 schema/SQL、根依赖/锁文件、CI、shared HTTP、全局文档、批次总表及其他任务卡未改 |

### 遗留、未执行与整合建议

- T03 接续：在同一独占下明确确认、创建并核验匹配的恢复点、再次检查计划、维护运行记录和未完成运行启动门禁、逐步执行、最终验证与隔离恢复。T02 没有 CLI、覆盖恢复、真实旧库升级或恢复启用。
- 未执行真实断电、真实介质写满/损坏、网络/非支持文件系统兼容、Linux 图形 Electron、生产部署、Android 原生/真机、附件/restic/日常备份或性能基准。ENOSPC/EACCES 是受控 API 故障注入，SIGKILL 不等于真实断电。
- 保留未跟踪 `.codex/` 及忽略 artifacts 中日志/历史证据，不提交本机资料或凭据；失败沙箱临时样本保留为环境证据，未清理用户资料或其他工作树。所有测试/子进程已结束，无常驻业务实例；本任务提交后仅原 `.codex/` 保持未跟踪。
- 请整合者合并后汇总全局状态、批次台账、迁移恢复契约与存储说明：普通后端独占及可校验恢复点能力已实现，生产仍 identity/records v1；完整维护协调/恢复演练仍待 T03，桌面确认和日常备份不在本任务。

实现完成标“待整合”，只提交自己的分支并开 PR；不自行开始 T03。提示词见 [派工入口](prompts.md)。
