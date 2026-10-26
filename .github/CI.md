# GitHub 自动检查

本文件使用 `CI.md` 命名，避免 `.github` 下的 README 覆盖根目录 README 在 GitHub 仓库主页的展示。项目入口见 [根 README](../README.md)。

状态：当前 CI 配置与操作说明；初始实现证据见 [B001-T02](../docs/work/b001-record-editing/t02-ci.md)，后续变更见工作台账。核对日期：2026 年 10 月 26 日。

阅读时机：审查 [CI workflow](workflows/ci.yml)、排查 Actions 失败或准备配置必需检查时。协作规则见 [Git 工作流](../docs/current/development/git-workflow.md)，工程命令见 [工程基线](../docs/current/development/engineering-baseline.md)。

## 触发与检查名称

面向 `main` 的 PR 在 opened、reopened、synchronize、edited 时运行，包含标题修改；`main` push 和手动 workflow_dispatch 也运行质量检查。没有路径过滤。手动运行入口需 workflow 已存在于默认分支后才可使用。

| 实际配置的 job 名称 | Runner 标签 | 内容 |
| --- | --- | --- |
| `Quality (Windows)` | `windows-2025` | 冻结依赖安装、标题及文档范围脚本测试、`pnpm check` |
| `Quality (Linux)` | `ubuntu-24.04` | 同上 |
| `PR title` | `ubuntu-24.04` | PR 事件 JSON 中的 Conventional Commits 标题；push/手动事件跳过此 job |

质量检查超时 20 分钟，标题检查 5 分钟；同一 PR 的新运行取消旧运行，两个平台互不因另一平台失败而提前取消。没有 continue-on-error。PR 默认检查 GitHub 生成的合并提交，运行详情中的 head SHA 与实际 checkout SHA 应一同核对。Runner 镜像会更新，交付以每次日志的 Set up job 和 Report runner and toolchain 为准。

整合者已于 2026 年 10 月 25 日核验 PR #3 的成功运行，并将这三项配置为 main 必需检查，限定 GitHub Actions 来源（app ID 15368）、要求任务分支跟上目标；工作流本身不修改保护、不自动发布或合并。配置与证据见 [Git 工作流](../docs/current/development/git-workflow.md) 和 [B001 整合记录](../docs/work/b001-record-editing/README.md)。失败应阅读具体步骤日志，业务/基础测试问题交给对应负责人，不删测试或跳过平台。仅因 Action 下载超时等基础设施问题失败时，可重试失败 job，保留原失败记录。

## 锁定工具链与 Action 来源

Node 来自 `.node-version`（当前 24.14.1），pnpm 来自根 package.json 的 packageManager（当前 10.33.0），安装使用 `pnpm install --frozen-lockfile`。pnpm Action 缓存 store，以操作系统、架构和 `pnpm-lock.yaml` 内容构造缓存键；锁文件改变时可恢复同平台旧 store，但始终重新冻结安装。不缓存 node_modules，setup-node 的额外自动缓存关闭。

通过官方仓库 GitHub API 的 release、tag 对象与 action.yml 核对下列提交；pnpm 的带注释 tag 已解析到 commit，workflow 不使用可移动标签。

| Action / 核对版本 | 固定提交及官方源码 |
| --- | --- |
| actions/checkout v7.0.1 | [3d3c42e5aac5ba805825da76410c181273ba90b1](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1) |
| actions/setup-node v7.1.0 | [949feb2413d6458794dcd2491c4babbbce0c15c1](https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1) |
| pnpm/action-setup v6.1.0 | [ea17c68df8912ef543352723c149a84f56e3d413](https://github.com/pnpm/action-setup/tree/ea17c68df8912ef543352723c149a84f56e3d413) |

构建只使用 Electron 包和类型，不执行 install-electron 下载运行二进制。`pnpm check` 包含 workspace 构建、类型、现有 Node 测试与文档检查；Electron GUI smoke 和 Android APK/真机验证仍由相应任务单独执行。Linux runner 成功不代表生产部署验证。

## 相关文档检查

用户于 2026 年 10 月 26 日明确以后只检查相关文档。[检查脚本](../scripts/check-docs.mjs) 不遍历整个目录验证全部 Markdown，而是选择本次变更文件、代码所属工程 README、对应上级 README/AGENTS 导航。检查选中文档的 UTF-8、代码围栏、内部链接目标和导航登记；人工再核对受影响的状态事实。索引改动只追加已移除条目对应的文档，不递归审计所有链接页面。

删除/移动文件时搜索潜在引用，再按实际解析到旧路径的链接选择受影响文档；搜索引用不等于全量验证所有文档。未跟踪的用户 `.codex/`、`.agents/` 和构建/运行产物不纳入范围。

- 本地明确基线：`pnpm check:docs --base origin/main`；显式范围：`pnpm check:docs backend/README.md docs/work/b002-migration-recovery/t01-versioned-migrations.md`。两种方式分别使用。
- 本地无参数：选择 HEAD 与 origin/main 共同祖先以来的提交差异，再加暂存、未暂存及未跟踪文件；若共同祖先已是 HEAD，则比较上一提交。首次提交比较本次新增文件。输出实际基线和文件清单；指定基线缺失会报错，不回退为全仓扫描。
- CI 质量 job 获取 Git 历史，由 `RECORDER_DOCS_BASE` 传递 PR 的 base SHA 或 push 的 before SHA；手动运行使用上述默认范围。基线作为 Git 参数处理，不插入 shell 命令文本。PR/title 检查权限和必需检查名称不变。
- [范围脚本测试](../scripts/check-docs.test.mjs) 用隔离 Git 样本覆盖无关坏文档不触发、新文档登记、路径含空格、重命名断链、导航移除、多个提交和错误基线；不接触真实资料库。

`pnpm check` 仍执行构建、类型及业务测试，其中的文档步骤使用上述范围。需要审查较早提交时显式传入相应基线或文件，不能用当前默认输出宣称覆盖了全部旧文档。

## 标题规则与安全边界

[PR 标题脚本](../scripts/check-pr-title.mjs) 从 GITHUB_EVENT_PATH 读取 JSON，复用 [commit-msg 规则](../scripts/check-commit-message.mjs)。格式为小写字母 type、可选非空 scope、可选 `!`、冒号和一个空格、非空描述；不限制 type 白名单。接受中文描述。拒绝缺少前缀/描述、空 scope、嵌套括号、多行及控制字符。提交钩子仍只检查提交消息第一行。

引号、反引号、`$()`、管道等可作为描述的普通字符；它们从未插入 shell 源码，也不会被执行或原样输出至 Actions 日志。PR 缺少标题、缺少事件路径或 JSON 损坏均失败；push/手动事件不要求标题。工作流只用 `pull_request`，权限为 `contents: read`，checkout 不保留凭据，不传项目秘密，不使用 pull_request_target。

本地验证：

```powershell
node --test scripts/check-pr-title.test.mjs
node --test scripts/check-docs.test.mjs
pnpm check:docs
pnpm check
git diff --check
```

标题脚本测试在两个平台的质量 job 中单独执行，无需改根 package.json。官方参考：[触发工作流](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[安全使用](https://docs.github.com/en/actions/reference/security/secure-use)、[pnpm Action 用法](https://github.com/pnpm/action-setup/tree/ea17c68df8912ef543352723c149a84f56e3d413)。
