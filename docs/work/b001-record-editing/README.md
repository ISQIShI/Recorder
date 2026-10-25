# B001：记录编辑与自动检查

状态：T01/T02/T03 全部已合并，本批验收完成；验证范围与限制见末节。更新日期：2026 年 10 月 25 日。

阅读时机：启动本批任务、检查范围与依赖、接收交付或整合时。长期规则见 [AI 协作](../../current/development/ai-collaboration.md) 与 [Git 工作流](../../current/development/git-workflow.md)。

## 当前起点与选择理由

规划时审阅起点为 `10ee409da81c3745536d859030fdac8e712e61b3`：当时已有账号、创建、查询及 Electron 保存重启流程，记录表已有 revision/updatedAt，没有更新接口、编辑界面或 CI。派工基线为计划合并后的 `fb3e552024f732460dd86c8a6933e7f501f4ecda`。此段保留选择背景；当前更新接口与 CI 已完成，实际结果见末节整合记录。

本批先补齐“已有记录可以安全修改”，同时为多 AI 的 PR 建立自动检查。这样无需改动 schema，能独立验收用户价值。回收站需要新增删除状态，而迁移器仅允许 revision 1 初始化 DDL；安全升级与恢复先于该类 schema 扩展，另列后续工作，不塞进本批。

用户已确认手动保存、离开未保存编辑时提醒，以及冲突保留草稿让用户决定；见 [编辑契约](../../current/interfaces/record-editing.md)。接口形式、任务划分和 CI 检查为规划者在既定方向内的工程选择，不代表用户逐项选择技术参数。

## 范围与非目标

包含已有记录标题/正文/格式的手动编辑、基于 revision 的并发保护、错误/冲突草稿保留、Web/Electron 离开提醒，以及 Windows/Linux 自动构建、类型与测试检查和 PR 标题检查。

本批不实现回收站、附件、标签分类、数据库升级/备份、远程 HTTPS、Android 接入、自动保存、跨重启草稿和同步，不更换技术栈、不增加组件库或业务依赖。Android 真机继续延后。

## 基线、工作树与分支

各任务通过 PR 独立合入 `main`，本批无需 integration 分支。供派工的起点是**本计划合并后的 main**，不是上述审阅起点；规划者交付时公布实际 SHA。

第一轮 T01 和 T02 已由用户在两个独立工作树中完成，均从上述派工基线建立任务分支。原工作树保留，可顺序领取下一项任务。不要切换或写入其他工作树占用的 main。

T03 实际复用了原 T01 会话和工作树，从 `a7878684c1d2ee004e235e20e9e0d3d6a4386656` 新建任务分支并完成交付。全部任务已结束，不重复使用本批提示词派工；新任务仍从最新 main 建立独立分支。

## 任务索引与文件归属

| 任务与阅读时机 | 责任 | 前置/并行 | 建议分支 | 状态 |
| --- | --- | --- | --- | --- |
| [T01 更新接口与双端传输](t01-update-api.md)，实现/验收数据更新链路时读 | 后端、共享 API 契约、Web/Electron 传输、后端测试 | 前置已交付 | `feat/b001-t01-record-update-api` | 已合并，PR #4 |
| [T02 自动检查](t02-ci.md)，配置/审查 CI 时读 | `.github/workflows`、PR 标题检查脚本和操作说明 | 前置已交付 | `ci/b001-t02-quality-checks` | 已合并，PR #3 |
| [T03 编辑界面与离开提醒](t03-editor.md)，实现/验收 UI 与退出时读 | 共享 UI、Electron 退出适配、实际流程验证 | T01 已合并 | `feat/b001-t03-record-editor` | 已合并，PR #6 |
| [派工提示词](prompts.md)，追溯原派工范围时读 | 可直接复制的指令 | 遵守每段启动条件 | 不另设分支 | 本批已结束 |

公共文件按任务卡划定。T01 独占 `shared/contracts/src/api.ts` 与 API 传输，T03 仅在 T01 之后扩展必要的桌面窄桥契约。迁移/schema、根 package.json/锁文件本批默认不改；如确实需要，由整合者协调单独明确。CI 不能自行改业务逻辑来消除失败。全局文档、决策日志、批次总表由规划整合者更新。

每个实现者只改自己的任务卡交付区，不修改本总表或另一张卡。每个 PR 交付完整 HEAD、检查证据与未完成项；未开始不填虚构会话 ID、工作树路径或测试结果。

## 验收与整合顺序

1. 优先整合 T02：核验真实 Actions 运行，确认实际检查名称后由整合者设置 main 的必需检查；不能预先填一个尚未运行的名称锁住合并。T01 不依赖 CI 的代码，可独立推进。
2. 审查合并 T01：验证无 schema 变化、更新原子性、鉴权/CSRF、双端请求一致性、创建和查询回归。主分支可暂时具备后端更新能力而 UI 尚未开放编辑。
3. 启动 T03：基于已合并 T01 的 main；验证手动编辑、冲突保留和正常退出。若 T02 未完成，可先进行 T03，但整批完成须包含自动检查证据。
4. 最终由整合者在组合版本执行 `pnpm check`、`pnpm test:desktop`、`pnpm test:records:desktop`，以及 T03 扩展的实际编辑/冲突/离开场景。Web 至少一次真实浏览器人工或自动流程，不能仅用 Electron 界面替代。
5. 更新编辑契约、账号记录流程、技术状态、相关工程 README 和 CI 当前状态。报告通过/失败/未执行分别有哪些，记录实际 main SHA。失败不通过删除检查、修改已应用 SQL或覆盖一方改动解决。

所有验证使用隔离账号、数据库目录和 Electron userData；并行实例分配不同端口。Linux CI 通过仅证明 runner 上的相关检查，不代表生产部署验证。Android 构建不代表 APK/真机通过。

## 后续建议顺序（未派工）

1. **数据库后续迁移与最小恢复演练。** 明确升级前恢复材料、维护锁、失败回滚/重启对账，保留已卸载插件数据；在改变当前 schema 前通过旧库升级样本。完整 restic 集成可分步完成，但不能靠修改已应用的初始 SQL 跳过升级。
2. **回收站。** 在安全升级前置完成后实现移入、查询、恢复和确认彻底删除；遵守不默认自动清空。
3. **附件与统一恢复集合。** 联合验证数据库/文件一致性，再接入 restic 副本，逐步扩大真实使用。
4. 分类、快速收集、远程/Android 接入按用户下一步偏好排序；Android 本地宿主与同步先做独立技术验证，不假定 Node 原生依赖可直接运行。

这不是完整 MVP、排期或所有后续功能的实施授权。

## 整合记录

| 任务 | 原始 HEAD / PR | 最终合并提交 | 实际验证 | 遗留事项 |
| --- | --- | --- | --- | --- |
| T01 | `5656991a26f38ffe053e8cddbf0b4e7537174052`；[PR #4](https://github.com/ISQIShI/Recorder/pull/4)；同步 CI 后 HEAD 为 `848782b30ae28c4d1e9762264878321d71364860` | `3115e5d1556910ebad8cced7c60bcb2ff0d26dcd` | 组合 `pnpm check` 18 项测试、两组 Electron smoke、真实更新 IPC 与持久化检查均通过；[PR CI](https://github.com/ISQIShI/Recorder/actions/runs/40203843719) 三项成功 | UI 编辑/离开提醒由 T03 完成 |
| T02 | `7db3db034bd9c9f32f4815990b9f4d5925f750c7`；[PR #3](https://github.com/ISQIShI/Recorder/pull/3) | `675fa4aee916bbcf1949503c8037134a2431bf54` | [最终 PR CI](https://github.com/ISQIShI/Recorder/actions/runs/40202901462) 三项成功；标题脚本 6 组通过 | 必需检查已启用；无 T02 阻塞 |
| T03 | `2272442b12fdbf6bbeeedd97778dcf47fec64fe7`；[PR #6](https://github.com/ISQIShI/Recorder/pull/6) | `999f3f3132660ca5fbc6acd802c0e7d52778b885` | [PR CI](https://github.com/ISQIShI/Recorder/actions/runs/40208319366) 三项成功；本机复验 26 项测试、基础 Electron、四阶段编辑/退出及真实更新 IPC 通过 | Chrome 提醒出现由用户确认，原生弹窗选择分支未自动验收；Android 继续延后 |

整合者于 2026 年 10 月 25 日先合并 T02，再在自己的审查分支将新 main 合入 T01 并推送原 PR；未修改实现者的工作树。T01 当前提交检查成功后正常 squash 合并，未绕过保护。合并后的 main 与本机复验的组合树完全一致；没有 schema、依赖或额外应用代码变更。

T01 合并后的 main 提交 `3115e5d1556910ebad8cced7c60bcb2ff0d26dcd` 的 [push CI](https://github.com/ISQIShI/Recorder/actions/runs/40204292128) 也已成功。后续整合文档通过独立 PR 更新；T03 开工时获取最新 main，不固定在上述应用合并提交。

主分支已要求 `Quality (Windows)`、`Quality (Linux)`、`PR title`，来源限定 GitHub Actions（app ID 15368），并要求分支跟上目标。T02 合并后 [main 首次运行](https://github.com/ISQIShI/Recorder/actions/runs/40203761642) 的 Windows job 在下载 Action 时连接超时，尚未执行项目代码；只重试失败 job 后成功。此环境失败保留记录，不归作应用测试失败或略过检查。

本机组合复验为 Windows / Node 24.14.1 / pnpm 10.33.0：`pnpm check`、`node --test scripts/check-pr-title.test.mjs`、`pnpm test:desktop`、`pnpm test:records:desktop`、`node backend/test/record-edit-desktop.mjs` 和 `git diff --check` 均通过。真实更新检查证据在整合工作区忽略目录 `artifacts/t01-update-jIIkwE/`，验证两个 PUT、旧 revision 的 409、renderer 隔离及重启后 revision 2。CI 的 Linux 检查已通过，Linux 生产部署、独立浏览器编辑、Android APK/真机仍未验证。

### T03 与整批验收

上述 18 项检查为第一轮历史结果。T03 合并前，整合者在其完整 HEAD 上执行 pnpm check（26 项测试）、pnpm test:desktop、pnpm test:records:desktop（四阶段）及 node backend/test/record-edit-desktop.mjs，全部通过。实际复验关闭/退出取消后继续保存、批准后进程终止、重启 revision 5 读回与会话撤销；原生确认框仅替换选择结果，保留真实事件链。合并前确认 HEAD、目标基线与三项必需检查未变，正常 squash 合并，main 的应用树与复验版本一致。

独立 Chrome 编辑、双标签页竞争及查看最新的证据来自实现者实际操作，整合者已核对任务卡、冲突截图和原会话中用户对刷新/关闭提醒的人工确认。未将这些证据写成整合者再次执行的浏览器流程，也未声称 Chrome 原生弹窗取消/确认分支自动通过。Linux 图形 Electron、生产部署、其他浏览器与 Android 原生/真机仍未验收。

本批已完成，下一批尚未派工。CI 说明同时改名为 .github/CI.md 并更新引用，避免替代根 README 的仓库主页展示。

### 工作树清理核对

目前有两个实现工作树：31a4/Recorder（T02）与 b74a/Recorder（T01 后复用为 T03）。两者交付提交均已通过 PR 合入 main，会话空闲，无未提交业务代码；仍有未跟踪 .codex/，不要用强制删除丢弃配置。

整合者已将 T02 两份 Actions 日志、T03 三份验证日志、两张截图及四阶段结果 JSON 复制到主工作区忽略目录 artifacts/b001-handoff-20261025/，未复制运行数据库或凭据，也未提交本机证据。两个工作树不再是保留成果的必要条件，可以由各自会话/用户通过 Codex 归档；本主会话没有其工作树附件，未绕过归属手工删除。归档前仍应保全用户另外需要的忽略文件，详见 [Git 工作流](../../current/development/git-workflow.md)。返回 [工作台账](../README.md)。
