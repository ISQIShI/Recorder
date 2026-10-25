# B001 可复制的派工提示词

状态：T01/T02/T03 全部已合并；以下提示词保留为历史材料，不重复启动任务。阅读时机：追溯本批派工范围时。范围与验收以 [批次计划](README.md) 和对应任务卡为准。

T03 实际复用了原 T01 会话与工作树，并从最新 main 建立新任务分支。本批已结束，下一批尚未派工。[Codex 工作树说明](https://learn.chatgpt.com/docs/environments/git-worktrees)（核对日期：2026 年 10 月 25 日）。

## AI 1：T01（已合并，保留原派工提示词）

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

## AI 2：T02（已合并，保留原派工提示词）

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

## T03（已合并，保留原派工提示词）

```text
你是 Recorder 的实现者，请完成 B001-T03：编辑界面、冲突草稿与离开提醒。
可以继续使用本会话原来的工作树，无需新建会话或检出 main。
先读当前 AGENTS.md，检查 git status、分支和 HEAD；保留 .codex/ 等已有内容。
有未提交成果或旧任务新增提交时先辨明归属，不自动 stash/reset/clean。
T01 的 PR #4 和 T02 的 PR #3 已合并；核对远端状态并执行 git fetch origin。
在旧任务成果已保全、切换不会带入无关修改时执行：
git switch --no-track -c feat/b001-t03-record-editor origin/main
若该分支已经存在，先核对是否属于本任务，不覆盖或强制重建。
记录完整基线 SHA，不在已合并的 T01/T02 分支上继续提交。

切换后重新读取最新版 AGENTS.md、docs/README.md、docs/current/technical-status.md，
再读 docs/work/b001-record-editing/README.md、t03-editor.md，
docs/current/interfaces/record-editing.md 和 shared/desktop/web README。
确认 updateRecord 的实际契约和双端传输已存在；基线或文档不符先报告。
只在本工作树和任务分支工作，不修改其他工作树或 main。

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
