# B002 派工提示词

状态：T01/T02 已完成并合并；现在使用下方 T03 提示词，由用户启动实现会话。更新日期：2026 年 10 月 27 日。

阅读时机：用户向实现会话派工时。按 [批次计划](README.md) **T01 → 合并 → T02 → 合并 → T03**，不要同时发送三项。可以复用现有会话和工作树；旧分支已合并后也不继续复用，每次从最新 main 建新任务分支。本批不要求新建三个会话。

基线校验：先确认本计划已在远端 main，T02/T03 还要确认前置任务已由整合者合并。提示词采用获取并核验 `origin/main` 的方式，实际完整 SHA 写入任务交付；最终派工消息也会提供首项的确定 SHA。若不含计划或前置尚未合并，报告并停止依赖实现，不自行合并前置 PR。

## 历史提示：T01（已完成，不再派发）

```text
你是 Recorder 的实现者，请完成 B002-T01 多版本迁移与安全启动。
任务卡：docs/work/b002-migration-recovery/t01-versioned-migrations.md
批次计划：docs/work/b002-migration-recovery/README.md
契约：docs/current/storage/migration-recovery-contract.md
任务分支：feat/b002-t01-versioned-migrations；PR 目标 main。

先检查本工作树状态，保留已有修改与 .codex/，不要操作主仓库或其他工作树。
获取 origin，确认 origin/main 包含上述计划，记录完整基线 SHA；
从它建立本任务新分支，不沿用 B001 的旧任务分支，不强制覆盖同名分支。
读取最新 AGENTS.md、文档导航、技术状态、Git 工作流、批次计划、任务卡与后端 README。
只完成 T01：迁移计划、多 revision/依赖/摘要、受控逐步事务与安全启动；
遵守已确认的手动升级原则，不给真实旧库自动升级，不改已应用 SQL。
保持 Cordis 一切皆插件，使用隔离样本验证，不操作用户真实 .recorder/。
按任务卡执行检查并记录 Windows/Linux 实际结果，未执行不得写通过。
只更新任务允许的文件和自己的任务卡；全局状态与批次总表交给整合者。
有产品、数据或公共契约分歧先说明影响并问用户，不能把未答复当成同意。
按 Conventional Commits 提交并推送本任务分支、创建 PR（未验证完保持 Draft），
不推送 main、不合并 PR、不强推、不删除本地或远端其他分支/工作树。
交付工作树绝对路径、实际基线、完整 HEAD、PR、检查证据、遗留和未提交项，
任务卡标待整合，等待用户转交下一项，不自动开始 T02。
```

## 历史提示：T02（已完成，不再派发）

```text
请作为 Recorder 实现者完成 B002-T02 资料库独占与升级恢复点。
任务卡：docs/work/b002-migration-recovery/t02-upgrade-recovery-points.md
批次计划：docs/work/b002-migration-recovery/README.md
契约：docs/current/storage/migration-recovery-contract.md
任务分支：feat/b002-t02-upgrade-recovery-points；PR 目标 main。

先保留当前工作树的用户修改，获取 origin，核对 T01 已合并且当前 main 包含其交付。
从最新 origin/main 建立上述新分支，记录完整基线 SHA；不要沿用旧任务分支。
重读 AGENTS.md、导航、技术状态、Git 工作流、批次与任务卡、T01 实际接口和后端 README。
实现可替换的 Cordis 独占与恢复点能力，完成 Windows/Linux 跨进程和快照验证；
不自行增加新依赖、不更改真实业务 schema、不实现覆盖恢复或日常备份。
用隔离样本测试，不操作真实资料；按任务范围更新代码、后端 README 和自己的任务卡。
关键分歧先向用户说明并询问。按 Conventional Commits 提交，推送自己的分支并开 PR；
不推送 main、不合并 PR、不强推、不修改/清理其他工作树或分支。
交付路径、基线、完整 HEAD、PR、检查证据、支持限制及遗留，状态标待整合；
等待用户后续安排，不自动开始 T03。
```

## 当前派工：T03

```text
请作为 Recorder 实现者完成 B002-T03 维护入口与隔离恢复演练。
任务卡：docs/work/b002-migration-recovery/t03-maintenance-recovery-drill.md
批次计划：docs/work/b002-migration-recovery/README.md
契约：docs/current/storage/migration-recovery-contract.md
任务分支：feat/b002-t03-maintenance-recovery-drill；PR 目标 main。

保留现有修改，获取 origin，确认 T01/T02 均已由整合者合并；
确认包含 T02 合并提交 8b4632a3245e084c15b7841b5274e262e09d19e6 及本轮交接文档；
从最新 origin/main 建上述新分支，记录完整基线 SHA，不续用已合并任务分支。
重读 AGENTS.md、导航、技术状态、Git 工作流、批次与任务卡、前置交付和后端 README。
使用真实 Cordis 服务构建最小维护 profile 和 CLI，确认计划后先建恢复点再升级。
读取 T02 实际 storage-contract；关闭失败保留独占，不直接打开封存数据库，
通过恢复点服务校验并在隔离目标中读取数据，预留校验副本空间，不自动清理 pending。
实现中断识别、显式确认后继续以及恢复到新空目录；禁止覆盖原库或自动启动恢复库。
本任务不新增桌面维护 UI、无认证 HTTP 管理入口、restic 或真实业务字段。
执行任务卡的真实子进程故障测试、隔离恢复、Windows/Linux 检查和桌面旧流程回归，
使用样本数据，记录未验证项；仅更新许可文件、后端 README 与自己的任务卡。
产品/数据分歧先询问。按 Conventional Commits 提交、推送自己的分支并开 PR；
不推送 main、不自行合并、不强推或清理其他工作树/分支。
交付路径、基线、完整 HEAD、PR、组合验证证据、遗留与未提交项，标待整合，
等待主会话审查并更新全局状态，不自行开始下一批。
```

返回 [批次计划](README.md)。
