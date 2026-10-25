# B001-T02：Windows/Linux 自动检查与 PR 标题

状态：待开始。阅读时机：实现或审查本任务时；先读 [批次计划](README.md)、[Git 工作流](../../current/development/git-workflow.md)、[工程基线](../../current/development/engineering-baseline.md) 与根 package.json。

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

实际开工基线/会话/工作树：待领取后填写。实现说明、Actions 链接和验证：尚未执行。返回 [批次计划](README.md)。
