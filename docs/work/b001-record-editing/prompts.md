# B001 可复制的派工提示词

状态：已准备，未启动实现 AI。阅读时机：用户在 Codex 为本批创建工作树并布置任务时。范围与验收以 [批次计划](README.md) 和对应任务卡为准。

先确保本计划已合入本地同步的 main。第一轮开两个独立工作树，都从 main 开始，分别粘贴 T01/T02；每个 AI 在自己的任务分支提交。Codex 可能使用 detached HEAD，任务提示词会要求核对并建立分支。T03 要等 T01 已合入 main 再开新的工作树。[Codex 工作树说明](https://learn.chatgpt.com/docs/environments/git-worktrees)（核对日期：2026 年 10 月 25 日）。

## AI 1：T01（现在可领取，前提是规划已合并）

```text
你是 Recorder 的实现者，请完成 B001-T01：记录更新 API 与双端传输。
先读 AGENTS.md、docs/README.md、docs/current/technical-status.md，
再读 docs/work/b001-record-editing/README.md、t01-update-api.md，
以及 docs/current/interfaces/record-editing.md 和相关工程 README。

使用本会话的独立工作树，从包含本计划的已同步 main 开始，记录完整基线 SHA。
检查当前 HEAD、分支和已有修改；若基线不符或任务卡缺失，先报告。
若为 detached HEAD，建立 feat/b001-t01-record-update-api；
已有本任务专属 codex 分支可沿用并报告，不修改其他工作树或 main。

实现任务卡中的更新接口、原子版本检查、鉴权、OpenAPI 和 Web/Electron 传输，
继续一切皆 Cordis 插件，不改 schema/初始迁移或产品语义，不提前实现 UI。
严格遵守允许文件范围，执行相关测试；有新的产品/数据选择先询问，
其他可独立工作继续推进。不要修改批次总表和全局技术状态。

完成后更新自己的任务卡交付区，按 Conventional Commits 提交，
推送任务分支并创建指向 main 的 PR，未验证完标为 Draft，不自行合并。
最终提供完整 HEAD、PR、工作树绝对路径、变更和验收结果、未执行项、
遗留问题以及希望整合者更新的文档事实。不要自行开始下一项任务。
```

## AI 2：T02（可与 T01 同时开始）

```text
你是 Recorder 的实现者，请完成 B001-T02：Windows/Linux 自动检查与 PR 标题检查。
先读 AGENTS.md、docs/README.md、docs/current/technical-status.md，
再读 docs/work/b001-record-editing/README.md、t02-ci.md，
以及 docs/current/development/git-workflow.md 和 engineering-baseline.md。

使用独立工作树，从包含本计划的已同步 main 开始，记录完整基线 SHA。
核对当前 HEAD、已有修改和分支；若为 detached HEAD，建立
ci/b001-t02-quality-checks，已有本任务专属 codex 分支可沿用并报告。

按任务卡配置 GitHub Actions 和安全的 Conventional Commits PR 标题检查，
使用锁定工具链，实际运行 Windows/Linux 检查并提供运行链接。
只修改任务卡指定的 CI/检查文件，不改业务逻辑、迁移、依赖锁文件，
不通过跳过检查掩盖失败，不自行调整 main 保护或自动发布/合并。
需跨任务修改时报告给用户/整合者，继续完成不受影响的部分。

更新自己的任务卡，按 Conventional Commits 提交并推送，创建指向 main 的 PR。
最终提供完整 HEAD、PR、工作树路径、真实 Actions 链接与检查名称、
本地验证、失败或未执行项；由整合者核验后启用必需检查，不自行合并。
```

## AI 3：T03（等 T01 合并后再使用）

```text
你是 Recorder 的实现者，请完成 B001-T03：编辑界面、冲突草稿与离开提醒。
先读 AGENTS.md、docs/README.md、docs/current/technical-status.md，
再读 docs/work/b001-record-editing/README.md、t03-editor.md，
docs/current/interfaces/record-editing.md 和 shared/desktop/web README。

先确认 T01 已通过 PR 合入 main，实际 updateRecord 接口和传输已经存在。
从更新后的 main 建立独立工作树/任务分支 feat/b001-t03-record-editor，
记录完整基线 SHA；若前置尚未合并，不猜接口开工，报告启动条件不满足。
已有本任务专属 codex 分支可沿用；保留未知改动，不修改其他工作树。

按任务卡实现手动编辑、版本冲突保留草稿、错误状态、Web/Electron 离开确认。
界面与设备行为均为 Cordis 插件；重点验证 Electron 正常退出不会绕过草稿提醒。
不添加自动保存、强制覆盖、回收站或跨重启草稿，不改后端/CI/依赖锁文件。
执行有意义的单元/集成检查及真实 Electron、独立浏览器流程；
有新产品选择先询问，未执行的验证明确记录。

完成后更新自己的任务卡和局部说明，按 Conventional Commits 提交、推送、
创建指向 main 的 PR，不自行合并。提供完整 HEAD、PR、工作树路径、
检查结果和证据、遗留事项及全局文档更新建议，等待整合。
```

各任务返回后，将交付报告发回规划主会话；整合者按 [批次计划](README.md) 处理。无需用户手工复制工作树文件。
