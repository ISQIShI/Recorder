# B001-T02：Windows/Linux 自动检查与 PR 标题

状态：待整合。阅读时机：实现或审查本任务时；先读 [批次计划](README.md)、[Git 工作流](../../current/development/git-workflow.md)、[工程基线](../../current/development/engineering-baseline.md) 与根 package.json。

分支建议 `ci/b001-t02-quality-checks`，PR 目标 `main`；从包含本计划的已同步 main 开始，记录完整起点。可与 T01 并行，也可与后续 T03 并行。

## 目标与范围

为 PR 和主分支提供可重复的基本验证，避免多个 AI 的结果只有口头“通过”。使用 GitHub Actions，依照 `.node-version` 与 `packageManager` 安装锁定的 Node/pnpm；固定并核验所用 Action 的官方来源和提交 SHA，实际 runner 版本记入交付。

允许修改 `.github/workflows/ci.yml`、必要的 `scripts/check-pr-title.mjs` 与针对标题检查的独立脚本测试、`scripts/check-commit-message.mjs` 的复用性局部调整、`.github/README.md` 和本任务卡。新增说明需互相链接。不得改业务源码/迁移、升级依赖/重写锁文件、重构现有测试或调整主分支保护。

发现跨平台业务/基础测试失败时保留失败证据，报告具体文件及原因，由整合者协调归属；不能以平台跳过或删测试代替修复。少量纯 CI 路径/脚本问题可在上述范围内处理。

## 检查方案

- 在 Windows 与 Linux hosted runner 分别 `pnpm install --frozen-lockfile` 后运行 `pnpm check`，覆盖 workspace 构建、类型、现有测试及文档；不能将失败设为 continue-on-error。
- PR 触发覆盖 opened/reopened/synchronize/edited，主分支 push 也检查；可手动触发。PR 标题遵守 Conventional Commits，标题更改后能够重新检查；无 PR 的 push/手动事件不误报缺少标题。
- 不以未发布到 runner 的 Electron GUI/Android 真机作为本轮 CI 必需检查；本地 smoke 仍由功能任务与整合者执行。构建不要求下载 Electron 运行二进制，若实际需要，核实原因再处理。
- job 名称稳定且互不重复，设置合理超时与同一 PR 的并发取消，缓存依赖与锁文件一致，失败日志可定位。
- PR 标题来自事件数据，作为数据读取，不直接拼进 shell 源码。最小 `contents: read` 权限，不需要项目秘密或部署权限，不用 `pull_request_target` 运行 PR 代码。
- Actions 出错只修复本任务范围；不自动发布、部署或合并 PR。

本任务实现时核对官方用法：[触发工作流](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[安全使用](https://docs.github.com/en/actions/reference/security/secure-use)（规划核对日期：2026 年 10 月 25 日）。版本与是否成功必须以实际运行记录为准。

## 验收与交付

1. 提交可审查的 workflow；测试合法/非法 Conventional Commit 标题、包含 shell 特殊字符的数据输入，明确哪些标题应拒绝。
2. 本地运行文档和标题相关检查；推送 PR 后读取真实 Actions 结果，记录 Windows/Linux 各检查名称、运行链接、检查所针对的 HEAD 与结果。
3. 网络/权限/runner 问题如实报告；仅写了 YAML 不算 CI 通过。不得将当前尚未验证的 Linux 环境描述为已支持生产运行。
4. 整合者在成功运行后启用 main 的必需检查；实现者不更改保护设置、不自批或自合并。GitHub API 返回权限问题时说明，不请求无关密钥。

按 [交付模板](../templates/task-brief.md) 输出分支、完整 HEAD、PR、工作树路径、验证和局限，并说明建议启用的**实际检查名称**。尚未实施的自动检查不得写成已启用。

## 实现与交付记录

- 开工日期：2026 年 10 月 25 日；实现会话为当前 B001-T02 会话。
- 实际开工基线：`fb3e552024f732460dd86c8a6933e7f501f4ecda`，已 fetch 核对与 origin/main 一致，包含本计划。
- 工作树：`C:\Users\30828\.codex\worktrees\31a4\Recorder`；从 detached HEAD 建立 `ci/b001-t02-quality-checks`，目标 `main`。原有未跟踪 `.codex/` 保留且不提交。
- 变更：[CI workflow](../../../.github/workflows/ci.yml)、[操作说明及 Action 来源](../../../.github/README.md)、PR 标题脚本与独立测试、提交标题规则的小范围复用调整。本任务不改业务、迁移、依赖锁文件或分支保护。
- 本地 Windows、Node 24.14.1 / pnpm 10.33.0：`pnpm install --frozen-lockfile` 成功；`pnpm check` 通过（全部构建/类型、现有 10 项测试、文档检查）；`node --test scripts/check-pr-title.test.mjs` 6 组通过；`pnpm check:docs` 与 `git diff --check` 通过。
- 初次受限环境安装出现 npm ENOTFOUND 与 pnpm 链接错误；获准联网后用相同冻结安装命令重试成功。安装提示 better-sqlite3 build script 按现有 pnpm 策略忽略，现有测试实际加载包内预构建文件成功；未放宽构建策略。
- PR：[ISQIShI/Recorder #3](https://github.com/ISQIShI/Recorder/pull/3)。最终完整 HEAD 与本记录提交后的再次运行结果在 PR/交付消息提供，避免自引用提交；交付前核对远端分支与本地 HEAD 一致。

### 实际 Actions 证据

首轮 [运行 40202577760](https://github.com/ISQIShI/Recorder/actions/runs/40202577760) 全部成功，PR head 为 `bae63f3239bd11a53af7cf1f93c5a7b9de248c15`，实际 checkout 的 PR 合并提交为 `95146565f4ef757150cd6871020739883a379654`，目标基线仍为上述 main。两个质量 job 均完成冻结安装、6 组标题脚本测试、完整 pnpm check（现有 10 项测试通过，无跳过）。

| 实际检查名称与日志 | 结果 | 实际 runner / 工具链 |
| --- | --- | --- |
| [Quality (Windows)](https://github.com/ISQIShI/Recorder/actions/runs/40202577760/job/121196672840) | success | runner 2.338.0；标签 windows-2025，镜像 windows-2025-vs2026 / 20261021.278.1；Node 24.14.1 / pnpm 10.33.0 |
| [Quality (Linux)](https://github.com/ISQIShI/Recorder/actions/runs/40202577760/job/121196672685) | success | runner 2.338.0；标签 ubuntu-24.04；Set up job 报镜像 20261012.334.1，环境 ImageVersion 报 20261023.334.3，保留此日志差异；Node 24.14.1 / pnpm 10.33.0 |
| [PR title](https://github.com/ISQIShI/Recorder/actions/runs/40202577760/job/121196672895) | success | ubuntu-24.04；runner 2.338.0；Node 24.14.1 |

另实测将此 Draft PR 标题改为 `B001 T02 title rejection probe`，edited 事件触发 [运行 40202749452](https://github.com/ISQIShI/Recorder/actions/runs/40202749452)，其中 [PR title](https://github.com/ISQIShI/Recorder/actions/runs/40202749452/job/121197180306) 按预期 failure；已恢复规范标题并触发重检。这是有意的拒绝用例，不以删除检查或放宽规则解决。恢复/后续提交可能按并发策略取消旧质量 job，以对应运行日志为准。

### 交接与未执行项

- 建议整合者核验最终 PR 后，启用实际必需检查名称 `Quality (Windows)`、`Quality (Linux)`、`PR title`；本任务未修改 main 保护，也未自批或合并。
- workflow 的 main push / 手动触发分支已配置，合并前未对 main push 或 workflow_dispatch 事件做远端执行；非 PR 事件无需标题的行为已由独立脚本测试覆盖。
- 未运行 Electron GUI smoke、Android APK/真机、Linux 生产部署或性能测试；CI 没有下载 Electron 运行二进制。此处只证明实际 hosted runner 上的检查结果。
- 无跨任务业务/迁移/依赖修改需求；全局技术状态、工程基线、批次总表仍由整合者依据验收更新。工作树保留原有 `.codex/`，忽略的 node_modules、dist 和 `.tmp/` 验证日志不提交；交付时没有应用常驻进程。

返回 [批次计划](README.md)。
