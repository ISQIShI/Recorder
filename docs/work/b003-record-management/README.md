# B003：桌面记录管理

状态：已完成范围内验收。T01 回收站（PR #15）、T02 标签与筛选（PR #16）均已实现，保留原任务卡与交付证据。更新日期：2026 年 10 月 28 日。

阅读时机：追溯本批交付或排查相关回归时。本页保留原计划和两张任务卡。入口：[工作台账](../README.md)；[原实现提示词](prompts.md) 仅作历史材料，不再派发。

## 目标与顺序

用户要求优先完成、完善主要核心功能，降低增强及附加功能优先级。本批据此补齐日常文本记录的删除、恢复与基本组织，不继续扩大维护基础设施。已确认依据：[当前需求](../../current/product/requirements.md)、[数据模型](../../current/storage/data-model-baseline.md)、[编辑契约](../../current/interfaces/record-editing.md)。

| 任务 | 用户可验收的结果 | 分支 / 前置 |
| --- | --- | --- |
| T01：回收站 | 桌面将记录移入回收站，查看、恢复，并明确确认清空 | `feat/b003-t01-record-trash`；已验收，见 PR #15 |
| T02：标签与筛选 | 给已有记录创建/添加/移除多个标签，按标签与关键词查找 | `feat/b003-t02-record-tags`；已验收，见 PR #16 |

一个实现会话顺序复用即可；每项从最新 main 新建分支、交付一个可独立验收的完整 PR。每项包括后端、共享契约、传输和桌面 UI，不再拆成纯后端与纯前端任务。用户自行启动实现会话；T01 未合并不启动 T02。

规划依据为 `5aa9b9d63bd97a9a81ecbea425fbb21d2d84cd05`，该提交尚不含本计划。实际派工基线必须包含本页；从合入计划的最新 `origin/main` 开始并记录完整 SHA。

后续优先接续分层分类与基础附件收存/取回，再按使用反馈安排待办等事务能力。这是建议顺序，不是已派发任务或完整排期。桌面维护 UI、正式恢复启用、restic 自动化、AI、同步、多端补齐、统计、复杂编辑器、插件市场和临时中转暂降优先级；既有需求保留。桌面托盘/快捷收集在基础记录管理后按实际使用需求安排。

## 共用实施边界

- 先读根 AGENTS、当前技术状态、[目录规则](../../current/development/repository-layout.md)，再读 [backend](../../../backend/README.md)、[shared](../../../shared/README.md)、[desktop](../../../desktop/README.md) 的相关部分。迁移只需按 [现有契约](../../current/storage/migration-recovery-contract.md) 使用 B002 成果，不重做恢复系统。
- 沿用 Cordis：存储、业务、API、UI 和传输都由现有或新增插件提供；入口只装配。复用现有服务，不为每个按钮另建抽象层，不引入通用查询框架、同步墓碑或批处理系统。
- 桌面优先。共享 API 类型、schema、响应校验、请求编码与 Electron IPC 白名单须一致；Web/Android 保留构建和已有流程，本批不做各端独立 UI 验收。共享 Vue 组件不得直接依赖 Electron。
- 每项当前实现者独占所需公共文件：`backend/src/`、`backend/migrations/`、`shared/contracts/`、`shared/client/`、`desktop/`、相关测试/桌面 smoke、各工程 README 和本页自己任务的交付区。可以同步必要装配和共享传输，不能改认证语义。根依赖/锁文件、CI、AGENTS、全局状态与决策日志由整合者负责；新增依赖先说明实际必要性。
- 允许新增正式迁移和更新 Drizzle schema/manifest；禁止改已应用的 revision 1 SQL。T01 增加 records 下一 revision；T02 新增标签命名空间和明确的 records 版本依赖。字段/表名由实现者按现有命名落地，不另建账本。
- 空库自动初始化；已有库仍通过维护 CLI inspect → 明确确认摘要 → upgrade，不能用自动升级、删库重建代替。开发/验收用独立样本；记录可复制的旧库升级命令，不操作用户真实 `.recorder/`。桌面维护 UI 不是本批前置。

以下为规划者据已确认需求落实的本批实现约定，不代表额外用户决策或既有代码事实。仅有影响范围、数据保留或主要体验的分歧再询问；路由、文件拆分等局部细节可沿用现有习惯。

## T01 任务卡：回收站

**范围：** 单条移入、回收站列表/关键词搜索/分页、详情只读、单条恢复、确认清空全部；复用现有列表 `limit/offset/total`，不增加批量勾选、单条永久删除、自动清空或保留期限。

1. 记录新增可空删除时间；默认列表/搜索只包含正常记录，回收站显式查已删除记录。保留正文、格式、ID、创建时间及其他现有字段；普通详情可返回归属自己的回收站记录，但必须明确只读，不能当成可编辑记录。
2. 移入/恢复采用现有 `expectedRevision` 和事务条件更新，成功递增 revision、更新 updatedAt；恢复保留原 ID 和 createdAt。过期操作返回 409 并刷新状态，不强行覆盖。已永久删除或无权访问返回 404；回收站记录不能更新正文。重复同状态操作不再产生新版本；旧 revision 重试可沿用冲突处理，不另建操作幂等系统。
3. 建议共用契约名 `trashRecord`、`restoreRecord`、`emptyTrash`；前两者为带 id/expectedRevision 的 POST 操作，清空需要显式确认字段。`listRecords` 增加可选 `state: active | trash`（默认 active），`RecordData` 增加可空 `deletedAt`。同步 OpenAPI/schema/校验和窄 IPC，业务规则在后端。
4. 清空只删除执行时该账号回收站中的记录，正常记录不受影响；界面说明不可恢复，取消不发请求。后台一次事务执行并返回删除数量；失败显示原因，不假报成功。它是逻辑永久删除，不声称擦除备份或介质。删除后的创建请求幂等只覆盖仍存在的记录：回收站中的旧创建重试不得悄悄恢复记录；永久删除后的旧请求不保留永久去重墓碑。
5. 删除/切换列表/打开回收站沿用现有未保存草稿守卫，不能丢弃草稿；错误与冲突保留当前内容。回收站提供恢复、清空、加载中/空列表/失败状态；清空或恢复后刷新分页，末页为空时回退到有效页。普通移入回收站不增加第二套复杂确认流程，主要保护未保存修改和不可逆清空。

**验收：** 普通记录 → 回收站（正常搜索消失）→ 重启后仍在 → 恢复后正文/格式/身份不变；取消清空无变化、确认后仅回收站内容消失；两个界面过期 revision 不覆盖，脏草稿不丢失；其他账号不能读改或清空此账号内容。真实旧 v1 样本通过 CLI 升级且内容保留，新空库直接具备功能。一次完整桌面流程证明按钮真实到达后端。

**交付区（2026-10-28）：已通过整合验收。**

- 基线 `d9585875f8fecf5e5967319ce181299992f28c12`，fetch 后的最新 origin/main，包含 B003 计划；新分支 `feat/b003-t01-record-trash`。工作树 `C:\Users\30828\.codex\worktrees\b74a\Recorder`；原未跟踪 `.codex/` 保留，未操作其他工作树/main。[PR #15](https://github.com/ISQIShI/Recorder/pull/15) 指向 main；完整 HEAD 见 PR 与最终交付（提交避免自引用 SHA）。
- 迁移：records revision 2（`0001_trash.sql`）新增 nullable deleted_at 和状态查询索引；Drizzle schema、Kit snapshot/journal 与 Recorder manifest 同步。Kit SQL 的 ADD 补为现有受控子集的 ADD COLUMN；两份 revision 1 SQL SHA-256 未改。全新空库自动具备功能；真实 v1 旧库需既有维护 CLI inspect → 确认 digest → 先建并验证恢复点 → upgrade，命令见 [后端说明](../../../backend/README.md#记录回收站b003-t01)。
- 契约：`RecordData.deletedAt: number | null`；listRecords 的 state 默认 active，可显式 trash，沿用关键词/分页/排序。新增认证 POST `trashRecord`、`restoreRecord`（路径 id + 正文 expectedRevision），`emptyTrash`（正文 confirm 必须 true，返回 deleted 数量）。schema/OpenAPI/响应校验/固定编码与 Electron 窄 IPC 共用契约，认证语义未改。
- 行为：IMMEDIATE 事务内检查 owner/id/revision，移入/恢复递增 revision，保留身份、正文、格式和创建幂等字段；同 revision 同状态无新版本，过期 409、无权或永久删除 404。回收站正文 PUT 拒绝。创建重试不恢复回收站；清空只删当前账号执行时的回收站记录，失败整体回滚，无永久去重墓碑。
- 桌面：复用 records-panel/editor/leave-guard Cordis 插件；移入、回收站搜索分页/只读详情、恢复、明确确认清空全部。查询/分页/切换使用草稿守卫；错误/冲突保留草稿和基线并显示最新状态，不能用回收站内容重新建立编辑基线。取消清空不发请求；恢复/清空刷新分页，末页为空回退。
- 本机验证：全工程 build/typecheck 通过；后端回收站/编辑及客户端定向 19/19 通过，新增草稿/传输断言后的客户端 13/13 通过，受影响的迁移/安全启动 3/3 通过。正式 Kit SQL 同步后再次定向验证真实 v1 CLI 升级；日志 `artifacts/b003-t01-build.log`、`b003-t01-typecheck.log`、`b003-t01-targeted.log`、`b003-t01-client-tests.log`、`b003-t01-migration-regression.log`、`b003-t01-final-sql-upgrade.log`。
- Windows 真 Electron 六阶段通过：原 create/resume/discard-quit/discard-close 保留，新 trash/trash-resume 覆盖脏草稿取消/故障/真实 409、重启后只读回收站、身份/正文/格式恢复、32 条分页的空末页回退、筛选下取消/失败/确认清空且正常记录不变。日志 `artifacts/b003-t01-electron.log`，六份结果在 `artifacts/records-smoke-ph7LbW/`，截图 `artifacts/records-desktop-trash-readonly.png` 与 `records-desktop-trash-empty.png`。仅为隔离样本，不提交数据库/凭据。
- 相关文档检查通过：8 文件、189 个内部链接、0 错误；git diff --check 通过。Windows/Linux 完整检查由现有 CI 执行，最终 HEAD 结果以 PR #15 Checks 与最终交付为准，未完成前保持 Draft。本机不重复 B002 全套故障注入。
- 未执行 Web/Android 新增流程独立验收、Android 原生/真机、Linux 图形 Electron；仅保留各端构建与公共契约检查。未操作真实 `.recorder/`，不提供自动清空、单条永久删除、标签、附件、备份擦除或桌面维护 UI；原有维护/隔离恢复限制不变。
- 整合者已核对代码 HEAD `8019c5adde4500a8eccab665053e9982cb6decb8`，未发现阻塞问题；[对应 Windows/Linux CI 与 PR 标题检查](https://github.com/ISQIShI/Recorder/actions/runs/40548657685) 均成功。本地复验 `pnpm build` 和 `pnpm test:records:desktop` 六阶段通过（`.tmp/pr15-build.log`、`.tmp/pr15-desktop.log`）；原 identity/records v1 SQL、根依赖/锁文件和 CI 未改。未重复本机全套后端测试，真实 v1 升级测试由对应 CI 覆盖。全局事实及 T02 交接随本 PR 更新，相关文档检查通过（17 文件、365 个内部链接、0 错误），git diff --check 通过。最终提交与合并 SHA 以 PR #15 为准。

## T02 任务卡：标签与筛选

**范围：** 详情展示多个标签、创建并添加、选择已有标签、移除某条记录的标签、按一个标签筛选并叠加现有关键词/分页。先保存记录再管理标签。标签全局改名/删除、多标签 AND/OR、分层分类、颜色/图标和自动分类留待后续，不阻塞本项。

1. 标签字典与记录关联表独立持久化，归属当前账号；同账号标签名去除首尾空白后非空、长度 1–64、精确同名复用，暂不引入大小写/拼音等归一系统。单记录同标签不重复关联；取消关联不删除标签或记录。
2. 标签能力为可替换 Cordis 插件，调用明确的记录查询/归属契约，不导入具体记录服务提供者。可以为必要查询补充窄服务方法，不构建通用扩展注册框架。普通记录列表、编辑和回收站不强依赖标签提供者；停用标签插件撤回对应入口，保留标签数据，启用后重新可用。
3. 使用独立的“添加关联/移除关联”操作并做到重复调用不重复数据，不把整个标签数组附在正文 PUT 中覆盖。标签不修改正文 revision；原正文/回收站的冲突规则保留。未保存编辑期间先沿用离开守卫结束编辑，再进行标签操作，避免混合草稿保存语义。
4. 标签插件提供列表、创建、记录标签查询/添加/移除、按标签分页查询记录的 API 与 UI 贡献；筛选结果复用标准记录结构和现有标题/正文搜索规则，默认排除回收站。接口名、路径和内部查询由实现者在共享契约统一落地并记录，不要求先单独交付接口 PR。
5. 回收站只读展示已有标签；移入不删关联，恢复后保留；永久清空时删除对应关联，保留标签字典。用外键/事务维护现有关系，不提前实现未来附件或任意插件数据清理总线。拒绝把其他账号标签附到记录，服务端不信任前端传入的归属。

**验收：** 创建/复用标签 → 同记录多标签 → 标签加关键词筛选 → 刷新/重启仍在；重复关联无重复、移除不伤正文；记录回收/恢复保留标签、清空后无悬空关联；停用标签提供者仍能使用基础记录，重启提供者后恢复；T01 旧库通过 CLI 升级并保留正文、回收站与 revision。桌面完成一次真实全流程。

**交付区（2026-10-28）：已通过整合验收。**

- 前置：已 fetch origin，核对 PR #15 已合并，最新 main 包含 T01 代码与整合交接。实际基线 `209e332a1800317f6c9915606c3b743e670566a4`（PR #15 squash）；从它新建 `feat/b003-t02-record-tags`，工作树 `C:\Users\30828\.codex\worktrees\b74a\Recorder`。原未跟踪 `.codex/` 保留，旧任务成果已提交保全；未操作其他工作树/main。[PR #16](https://github.com/ISQIShI/Recorder/pull/16) 指向 main，完整 HEAD 见最终交付及 PR，避免提交自引用；CI 未完成前保持 Draft。
- 迁移：tags revision 1 显式依赖 records revision 2；新增账号标签字典、record/tag 联合主键关联表和外键/索引，Drizzle Kit SQL/元数据及 Recorder manifest 同步。identity revision 1、records revision 1/2 的 SQL SHA-256 不变。真实 T01 样本升级需 CLI inspect → 确认 digest → 先建并验证恢复点 → upgrade；[后端说明](../../../backend/README.md#标签与筛选b003-t02) 有可复制命令。普通启动拒绝旧库，空库自动初始化；不操作真实资料。
- 插件与契约：tag-store → tags → tags-api，服务类型由 tags-contract/domain 导出。消费 RecordStore.get 的明确归属契约，关联在 IMMEDIATE 事务内检查正常记录及同账号标签；独立 add/remove 幂等，不改变正文 revision/updatedAt。共享 TagData 与六个操作 listTags/createTag/getRecordTags/addRecordTag/removeRecordTag/listTagRecords 的 schema、OpenAPI、响应校验、固定编码及窄 IPC 一致；路径/输入/输出见后端 README。筛选标准 RecordData，单标签+现有标题/正文关键词，默认正常记录，沿用 limit/offset/total/排序。trim 精确同名复用，多标签、不做大小写归一。
- 回收站配合：读自己的回收站标签，关联写入 409；回收/恢复保留关联，永久清空以 SQLite 外键在同一事务级联删关联、保留字典，停用标签存储提供者时也有效。不存在/其他账号记录或标签 404，认证/CSRF 规则不变。基础记录不依赖标签，后端停用/恢复标签仍能列表/编辑/回收/恢复/清空；前端撤回 record-tags 服务会撤回 tags-panel，恢复重新读取持久数据。
- 桌面：独立 record-tags 模型及 tags-panel 面板展示当前已保存/所选记录的多个标签，创建复用、选择已有、移除、单标签+关键词分页。先用既有 editor/leave-guard 结束编辑，取消不发标签请求；回收站只读；错误、部分创建成功/关联失败、加载与空结果分别显示，失败不将旧结果当成新筛选成功。关联变化/刷新回退空末页，会话变化清空状态/表单并忽略旧回包。未增加平台 SDK 或依赖。
- 本机：全工程 build、typecheck 通过；后端 tags/trash 定向 6/6（含真实 T01 和原 v1 两种 CLI 升级）、共享传输/编辑/标签生命周期定向 16/16 通过。证据 `artifacts/b003-t02-build.log`、`b003-t02-final-client-build.log`、`b003-t02-typecheck.log`、`b003-t02-storage-tests.log`、`b003-t02-client-tests.log`。检查了精确名称与长度边界、owner/CSRF、幂等/分页、字段不变、清空回滚/FK、停用恢复与迟到回包；本机不重复 B002 全套故障注入，完整回归交给既有 CI。
- Windows 真 Electron 八阶段通过：原 create/resume/discard-quit/discard-close/trash/trash-resume 保留，新 tags/tags-resume 真实 UI→IPC→HTTP→SQLite 覆盖脏草稿取消不请求/确认结束、创建复用/多标签/移除添加、503、正文元数据不变、关键词/空结果、31 条分页与空末页回退、后端和桌面重启、回收只读/恢复保留/清空保留字典。最终日志 `artifacts/b003-t02-electron.log`，八份结果在 `artifacts/records-smoke-gmW5wY/`，截图 `artifacts/records-desktop-tags.png`；仅隔离样本，数据/凭据/运行目录不提交。
- 相关文档检查通过（8 文件、194 个内部链接、0 错误），git diff --check 通过；Windows/Linux 完整检查由现有 CI 执行，最终 HEAD 结果以 [PR #16 Checks](https://github.com/ISQIShI/Recorder/pull/16/checks) 和最终交付为准，未完成不写通过。未执行 Web/Android 标签 UI 独立验收、Android 原生/真机、Linux 图形 Electron；保留跨端构建与公共契约检查。不提供分类、全局改名/删除、附件、AI、自动升级或通用清理框架。
- 整合者核对代码 HEAD `2d1a4a1fbe9a1f44f0826ddc7b9633d55490c426`，未发现阻塞问题；[该提交的 Windows/Linux CI 与 PR 标题检查](https://github.com/ISQIShI/Recorder/actions/runs/40555407839) 均成功。本地 `pnpm build`、`pnpm test:records:desktop` 八阶段复验通过，日志 `.tmp/pr16-build.log`、`.tmp/pr16-desktop.log`；复用对应 CI 的后端/客户端和旧库升级测试，未重复本机全套检查。原 identity/records 迁移、根依赖/锁文件和 CI 未改。相关文档检查通过（18 文件、385 个内部链接、0 错误），git diff --check 通过。全局状态与批次结项随同一 PR 更新；最终提交、CI 与合并 SHA 以 PR #16 为准。

## 验证与整合

每项在变更稳定后运行一次构建/类型、受影响 API/存储/客户端测试、一次覆盖新功能及原编辑的 Windows Electron 流程、相关文档检查及 `git diff --check`。可扩展现有 smoke，不复制一套测试平台。真实旧库升级样本是必要检查；不重复 B002 全套故障注入。现有 Windows/Linux CI 必需检查全绿；整合者复用对应 HEAD 的 CI，仅补具体疑点或平台缺口，不要求实现者再额外重复完整本机检查。

PR 目标 main，Conventional Commits，正常推送自己的分支，不合并、不强推、不修改别的工作树。交付简要列出分支、完整 HEAD、工作树、PR、验证及未完成项。整合者逐项验收后汇总当前状态；T01/T02 均已验收，本批结束；没有自动派发下一批。
