# B002：多版本迁移与升级恢复演练

状态：本批实施与范围内验收完成；T03 由 PR #13 交付，合并状态以 PR 为准。更新日期：2026 年 10 月 28 日。

阅读时机：领取、审查、整合本批任务时。入口：[工作台账](../README.md)。长期依据：[升级与恢复演练契约](../../current/storage/migration-recovery-contract.md)、[数据访问主线](../../current/storage/data-access-baseline.md)、[桌面优先交付](../../current/architecture/frontend-stack.md)。

## 目标与授权

用户要求清理已结束任务的远端分支并继续下一步，明确先推进 Windows 桌面，Web/Android 后续再按桌面成果补齐；另已确认已有库升级需先说明、手动确认，停写并先创建恢复点。

规划者选择先补数据库升级与恢复基础，再进入需要新 schema 的回收站。规划时迁移器只支持 revision 1 初始化，直接继续加业务表会把已有数据升级风险留到后面；当前进度以本页整合记录为准。本批不改桌面产品交互，也不要求三端同步开发；桌面升级确认 UI 仍是后续待实现能力。

基于 `f7c891dd95c3cce03f9f26e6f7f356e808aa75b5` 审查现状并编制本计划。**派工需以包含本计划的 main 为准**：整合者在派工消息公布完整 SHA，实现者把实际基线记录到自己的任务卡。不要把上述文档生成前的提交当作派工基线，也不要在本提交中填写自身 SHA。

本批三项顺序执行，建议复用一个实现会话/工作树。每项经 PR → main squash 合并，下一项从更新后的 main 建新分支。未采用临时批次整合分支，不同时启动依赖尚未合并的任务。

## 范围与验收

- 多版本与依赖预检、摘要和旧账本兼容、受控逐步事务；已有库升级不自动执行。
- 普通后端与离线维护遵守同一资料库独占；升级前建立可验证的本地数据库恢复点。
- 显式确认的离线维护 CLI、中断状态识别和再次确认后继续；隔离恢复并核对样本数据。
- 全部能力由 Cordis 插件提供，入口仅装配；不增加另一套业务后端或插件框架。
- 不加入真实业务字段、回收站、附件、restic、日常备份调度、在线替换资料库、桌面维护 UI 或 Android 原生功能。代码回退不等于数据库恢复。
- 不改变 identity/records 已应用的 revision 1 SQL。后续版本用 fixture 验证；停用插件保留表和账本。

本批没有阻塞 T01 的产品待选项。正式恢复启用、维护 HTTP 认证、桌面后端打包、备份长期保留等仍待后续决定；如果实现必须依赖其中某项，先报告，不默认为已授权方案。

## 任务索引与启动顺序

| 任务 | 内容与何时阅读 | 前置 | 分支 | 状态 |
| --- | --- | --- | --- | --- |
| [B002-T01](t01-versioned-migrations.md) | 多版本迁移与安全启动；实现/审查计划与执行器时 | 本计划合入 main | `feat/b002-t01-versioned-migrations` | 已合并，PR #9 |
| [B002-T02](t02-upgrade-recovery-points.md) | 资料库独占与升级恢复点；实现/审查锁、快照与清单时 | T01 已合并；读取其实际服务契约 | `feat/b002-t02-upgrade-recovery-points` | 已合并，PR #11 |
| [B002-T03](t03-maintenance-recovery-drill.md) | 维护 CLI、恢复演练与组合故障测试；集成/验收时 | T02 已合并；读取前两项交付 | `feat/b002-t03-maintenance-recovery-drill` | 已验收，PR #13 |
| [提示词](prompts.md) | 用户向实现会话派发指定任务时复制；每次只发当前可开工的一项 | 核对依赖已进入 main | 不单独建立实现分支 | 已准备 |

## 公共文件归属

| 内容 | 唯一修改负责人 | 其他任务的规则 |
| --- | --- | --- |
| 迁移执行器、计划/版本类型、迁移清单格式 | T01 | T02 消费其服务，T03 仅为集成修复作必要修改，不改用户/数据契约 |
| 独占与恢复点实现、恢复清单类型 | T02 | T03 调用服务实现协调与恢复演练，不重复实现快照或锁 |
| `backend/src/domain.ts` 等后端契约、`application.ts`/数据库生命周期 | 当前正在实施的任务 | 严格 T01 → T02 → T03；前项合并后才交接所有权 |
| `backend/package.json` | T03 可添加维护脚本 | 不升级依赖；T01/T02 如需脚本或依赖改动向整合者报告 |
| 根依赖/锁文件、`shared/contracts`、生产 schema/SQL、CI 配置 | 规划整合者 | 本批预计无需修改；需要变更先提出具体方案与证据 |
| 全局状态、AGENTS、历史决策、总索引、本批 README | 规划整合者 | 实现者只更新自己的任务卡、后端 README 和任务局部说明 |

文件拆分名称可以按实际代码调整；语义边界、依赖顺序和修改范围不能自行扩大。任务卡对局部文件给出更具体范围。禁止编辑其他任务工作树、提交 `.codex/` 或真实运行数据。

## 联合验收与整合

1. T01 通过后先合并：旧库正常启动、空库初始化、需升级拒绝启动、版本/摘要/依赖错误、步内失败不留部分 SQL、已提交步骤不重跑。此前业务流程继续可用。
2. T02 在新基线上验证：两个独立进程争用同库、退出/崩溃释放、路径别名、恢复点未封存不可用、空间/写入失败阻止执行。复验正常后端生命周期，核对自定义 filename。
3. T03 验证确认前不升级、确认失效拒绝、恢复点失败无升级、完整升级与重复运行、提交前后中断识别、重新确认后继续、隔离恢复数据等价和路径覆盖拒绝。至少一个真实 Cordis 提供者替换/撤回测试。
4. 各任务执行 `pnpm check` 与 `git diff --check`；Windows/Linux 必需 CI 全绿。新增恢复/中断测试应通过现有 `pnpm test` 自动执行。后端实际生命周期变化后，Windows 运行 `pnpm test:records:desktop`；整批再按新变化必要性决定是否补其他 smoke，不重复无关检查。
5. 所有测试使用独立临时库/随机端口。模拟进程终止不声称断电测试；Linux CI 不代表 Linux 生产部署，Android SDK/真机继续延后。

## 整合记录

| 任务 | HEAD / PR | main 合并提交 | 验证结果 | 遗留 |
| --- | --- | --- | --- | --- |
| T01 | `d2a5c369074640455505b4233a933d5e2528881f`；[PR #9](https://github.com/ISQIShI/Recorder/pull/9) | `762e98cb3cd2151b9f88a6167dfc218f8b0fdc88` | [最终 PR CI](https://github.com/ISQIShI/Recorder/actions/runs/40326517187) 三项成功；整合者 Windows 构建、类型、41 项测试、Electron 四阶段和相关文档复验通过 | 独占/恢复点/维护协调仍属 T02/T03 |
| T02 | `b4b412960064176fc40dbc22f0cb29e7d604810b`；[PR #11](https://github.com/ISQIShI/Recorder/pull/11) | `8b4632a3245e084c15b7841b5274e262e09d19e6` | [最终 PR CI](https://github.com/ISQIShI/Recorder/actions/runs/40355352088) 三项成功；整合者 Windows `pnpm check`（60/60）、Electron 四阶段和原 WAL 探针复验通过 | 维护运行门禁、CLI/隔离恢复待 T03；支持限制见 T02 卡 |
| T03 | 代码审查 HEAD `3dbc6eff566561f9d9430345019e056a85377ce9`；[PR #13](https://github.com/ISQIShI/Recorder/pull/13) | 最终文档提交与 squash SHA 见 PR；不为回填自身 SHA 另开 PR | [代码 CI](https://github.com/ISQIShI/Recorder/actions/runs/40538805131) Windows/Linux 各 76/76；本机定向结果见下文 | 桌面确认、正式恢复启用、日常备份不在本批 |

整合者对 T01 原始 HEAD 核对代码和生产 SQL/schema、依赖、公共 HTTP 契约未变化；Windows 本机执行 `pnpm build`、`pnpm typecheck`、`pnpm test`（41/41）、`pnpm test:records:desktop` 及 `git diff --check`。桌面 smoke 首次在受限沙箱中进程提前退出、无应用结果，放开桌面进程执行权限后四阶段通过，保留为环境失败记录。文档只校验 backend README、T01 卡及批次索引（3 份、39 个内部链接），并人工检查相关契约。最终 CI HEAD 与基线未变后正常 squash 合并，合并树与复验树一致，未修改实现者工作树。

2026 年 10 月 27 日整合 T02：初审 `a36944b01fd85cda0dfdb148b260e4b83da1453c` 时发现真实查询迭代器导致 close 失败仍释放独占、主文件哈希不变的未封存 WAL 被 verify 接受，原 PR 保持未合并并退回修复。最终 HEAD 修复两项并新增三项测试；关闭失败继续保锁，结束迭代器后重试真实关闭才释放；封存与校验拒绝辅助文件，在私有临时副本中读取 SQLite。整合者复查差异、真实子进程回归及上轮 WAL 探针（现为 `RECOVERY_INVALID`），运行 `pnpm check`（60/60，相关文档 7 份/164 个内部链接）、`pnpm test:records:desktop` 四阶段及 `git diff --check` 均通过。忽略日志为 `.tmp/pr11-rereview-check.log` 与 `.tmp/pr11-rereview-desktop.log`，不随仓库分发。生产 SQL/schema、公共 HTTP、依赖/锁文件和 CI 未变。核对最终 HEAD/基线与 CI 后 squash 合并，合并树与复验树一致；未修改实现者工作树或用户 `.codex/`。

T01/T02/T03 已完成本批范围：多版本受控迁移、独占、升级恢复点、离线维护 CLI、未完成维护启动门禁、中断后显式继续与新空目录隔离恢复。生产仍 identity/records v1，样本演练不代表用户真实库已升级。桌面确认、正式恢复启用、源介质丢失场景、附件/restic 与回收站继续按后续需求设计，不自动启动下一批。

2026 年 10 月 28 日整合 T03：复用当前代码 HEAD 的 Windows/Linux CI 76/76，核对最终成功运行而非先前被取消的重复 CI。本机构建、Electron 四阶段及相关文档检查（21 份相关文件、388 个内部链接）通过；新增维护测试结果见整合最终交付，本地日志为 `.tmp/pr13-maintenance.log`。不重复无变更的全套测试。主流程包含确认后升级、四个真实进程中断点、按账本前缀显式继续、账号/记录数据等价和隔离恢复不启用业务；未扩展低概率故障清单。生产 SQL/schema、公共 HTTP、根依赖/锁文件与 CI 未变。相关状态与效率原则由整合者随同 PR #13 追加，不修改实现者工作树或用户 `.codex/`。
