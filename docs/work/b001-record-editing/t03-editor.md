# B001-T03：编辑界面、草稿冲突与离开提醒

状态：待整合；实现及本机验收完成，尚未合并。阅读时机：实现/验收编辑界面与正常退出时；先读 [批次计划](README.md)、[编辑契约](../../current/interfaces/record-editing.md)、shared/desktop/web README 和 T01 实际交付。

分支建议 `feat/b001-t03-record-editor`，PR 目标 `main`。基线必须是已包含 T01 的最新 main，记录完整 SHA；不能基于 T01 的未合并任务分支，不提前实现不同接口。

## 目标与范围

用现有共享 Vue/Cordis UI 完成已有记录编辑；手动保存、冲突保留草稿、离开前提醒在 Web 与 Electron 形成可验证流程。保持原创建、搜索、分页和登录流程。

允许修改：

- `shared/client/src/plugins/records-panel.ts`，以及新增的编辑状态/未保存保护插件；`services.ts`、`application.ts`、`index.ts`、必要的 theme 样式。
- `shared/client/src/plugins/account-panel.ts`、必要的 `account.ts` 和 shell，只为主动退出/撤销当前会话等离开确认，不改变认证协议。
- `desktop/src/plugins/window.ts`、新增正常退出/确认设备插件、`contracts.ts`、`preload.ts`、`renderer/main.ts`；`main.ts` 只做必要的插件装配及最小生命周期接入。
- 必要时 `shared/contracts/src/index.ts` 中的窄设备桥契约；不改 T01 已落地的 API 语义和传输。设备能力不能泄露 Node 对象或会话秘密。
- `shared/client/test/record-editor.test.ts` 等相关测试、`desktop/src/business-smoke.ts` 与 `scripts/smoke-records-desktop.mjs` 的编辑场景扩展；shared/desktop/web README 及本任务卡。

不修改后端/schema/迁移/CI/依赖锁文件。新增运行或测试依赖须先交给规划者协调，不直接更换编辑器、组件库、构建体系或测试框架。

## 必需行为与验收

1. 从详情进入编辑，修改标题、正文和格式；保存成功更新列表与详情，重启后读回一致；无修改不发更新请求。Markdown 仍按源文处理。
2. 保存中不能重复提交或修改正在提交的表单；异常回包不覆盖新的会话状态。普通网络/服务失败保留编辑内容；超时说明结果未确认。
3. 用同一记录的两个基线制造真实 409，保留草稿并呈现最新内容。查看最新不偷偷重置 expectedRevision；用户可放弃草稿或显式整理到新基线上，没有无条件覆盖。
4. 有未保存编辑时切换记录、取消编辑、主动退出登录或撤销当前会话，出现确认；取消离开后内容仍在，确认放弃才清除。保存后离开不误报。
5. Web 在真实浏览器验证刷新/关闭提醒；Electron 验证窗口关闭和正常应用退出均可取消，确认后可干净退出。特别检查现有 before-quit/dispose/window.destroy 路径，不能只添加一个 renderer 监听就宣称完成。
6. 守卫和设备能力由 Cordis 插件提供，移除后监听/IPC/effect 清理且不会重复注册；正常退出获准后才释放资源。共享 UI 不导入 Electron SDK。
7. 无法拦截强杀、系统回收等情况如实说明；不以本轮承诺跨重启草稿。认证被远端撤销时遵守身份清理，不把旧身份草稿展示给新身份。

具体交互与 API 以 [编辑契约](../../current/interfaces/record-editing.md) 为准。草稿留存和丢弃按钮文案应让用户知道当前数据位于内存还是后端。

## 验证与交付

运行 `pnpm check`、`pnpm test:desktop`、扩展后的 `pnpm test:records:desktop`；添加针对 revision、失败草稿保留和离开取消的有效测试。实际 Electron smoke 不能只检查按钮存在。Web 至少记录一次独立浏览器真实操作，无法执行时明确为缺口交付，不以 Electron 替代。

所有测试使用样本与独立数据目录；端口和 desktop userData 不能与其他工作树共享。截图/日志放忽略的 artifacts，交付报告给证据路径且不包含秘密；不提交运行库。

按 [交付模板](../templates/task-brief.md) 输出完整 HEAD、PR、工作树路径、验证命令/结果、未执行范围、所需全局文档更新。提交与 PR 标题使用 Conventional Commits，不自行合并。

可复用原 T01 会话/工作树，保留已有修改后从最新 `origin/main` 建立新的 T03 分支；不能继续使用已 squash 的旧任务分支。具体提示词见 [派工说明](prompts.md)。返回 [批次计划](README.md)。

## 实现者交付区（2026 年 10 月 25 日）

- 负责会话：原 T01 实现会话顺序复用；未派出子代理或改动其他工作树。
- 工作树：`C:\Users\30828\.codex\worktrees\b74a\Recorder`。
- 分支：`feat/b001-t03-record-editor`，目标 `main`；完整 HEAD 见最终交付消息和 PR。
- 完整开工基线：`a7878684c1d2ee004e235e20e9e0d3d6a4386656`；开工前与交付前均 fetch 核对，T01 PR #4 与 T02 PR #3 已合并，交付时 `origin/main` 仍为此 SHA。
- 旧 T01 成果及远端提交已保全；本任务从 `origin/main` 新建分支，不在旧任务分支继续提交。原有未跟踪 `.codex/` 保留且不提交；样本、截图、日志及运行库均在忽略目录中。
- PR：待创建，链接将在交付时补齐；不自行合并。

### 实现事实

- 共享 `record-editor` Cordis 插件维护详情、编辑基线、草稿与异步请求代次，复用实际 `updateRecord`。重新读取后进入编辑，手动保存，脏状态只比较 title/body/format；无改动不发更新请求。保存中冻结表单并阻止重复提交，成功后更新详情与查询列表。
- 普通失败保留草稿，超时/连接或回包异常提示“结果尚未确认”。409 保留原草稿和 expectedRevision；查看最新不改变基线，用户可继续保留、确认放弃并重新读取，或显式选用新基线整理后手动保存。再次竞争仍返回冲突，未引入自动合并或强制覆盖。
- `leave-guard` Cordis 插件集中提供应用内确认及按脏状态注册的 `beforeunload`；切换记录、结束编辑、退出登录和撤销当前会话先确认。会话变化立即清除旧草稿与会话列表，旧身份回包/错误不覆盖新状态；认证 401 清理不受主动离开守卫阻止。未登录的 `me` 401 能正常结束初始化。
- Electron `exit` Cordis 插件把 `before-quit` 先转成 `window.close()`；renderer 的离开拦截触发原生确认，默认继续编辑。窗口真正关闭后才 dispose 根插件并完成退出；取消不提前释放连接或进入无法恢复的退出状态。设备插件移除时清理 app/window/webContents 监听，未新增 IPC 或向共享 UI 导入 Electron。
- 本任务只改允许的 UI、设备、相关测试、三份工程 README 及本任务卡；未改后端、schema、迁移、公共 API 语义、CI、依赖/锁文件、批次总表或全局技术状态。没有新增产品或数据选择。

### 实际验证与证据

环境：Windows 本机，使用仓库现有 Node/pnpm/Electron 与依赖；测试数据库、动态端口和 desktop userData 与其他工作树隔离。截图/日志均不提交。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm check` | 构建、类型检查、26 项测试及文档链接检查通过；含原有 18 项与本任务 8 项有效测试，Android 仅构建/类型兼容 |
| `pnpm test:desktop` | 真实 Electron HTTP/IPC/UI、插件撤回/恢复及 renderer 隔离通过；一次与另一 Electron 检查同时启动时出现 `UnknownVizError`，单独重试及最终顺序运行通过 |
| `pnpm test:records:desktop` | create/resume/discard-quit/discard-close 四阶段均通过，覆盖手动保存、列表/详情、真实 409、原基线保留、显式整理、服务失败草稿、应用内取消/确认、重启 revision 5 读回、会话撤销、窗口关闭/正常 app.quit 取消后继续保存与批准后进程退出 |
| 插件与异步单元检查 | 保存冻结/防重复、无改动不提交、失败/超时、二次竞争、401/身份变化/延迟回包、守卫撤回恢复、主动登出、未登录初始化、设备退出监听清理及延后释放通过 |
| 独立 Chrome 实际操作 | 在本工作树构建的 Web + 隔离后端同源服务完成登录、创建、修改标题/正文/格式、手动保存至版本 2；第二标签页先保存版本 3，原标签页提交得到真实冲突并保留版本 2 草稿，查看版本 3 后原基线仍为 2 |
| Chrome 刷新/关闭提醒 | **用户人工确认**：“我可以确认刷新和关闭时有弹窗提醒”。自动化曾观察到退出登录 confirm，但取消后的页面核对被工具中断，不能据此声称已自动验证原生弹窗选择分支 |

证据相对本工作树：`artifacts/t03-check.log`、`artifacts/t03-desktop.log`、`artifacts/t03-records-desktop.log`、`artifacts/records-desktop.png`、`artifacts/t03-chrome-conflict.png`；四阶段结果文件位于本次 `artifacts/records-smoke-*` 的 create/resume/discard-quit/discard-close JSON 中。Chrome 样本使用 `artifacts/t03-web-*`，只提交说明，不提交运行数据。

### 未执行项与遗留限制

- Chrome 原生刷新/关闭弹窗的“取消/确认”选择分支未由自动化完成；用户确认范围为两类提醒出现。其余浏览器、生产同源发布、远程 HTTPS 未验收。
- Linux 图形 Electron 与 Android 原生/真机、系统返回行为未验证；不把共享构建通过等同于设备行为通过。
- 内存草稿不跨重启，强杀、断电、系统回收不能保证提醒或恢复；Web 提醒受浏览器用户交互规则限制。这些是既定范围，不新增持久草稿/自动保存。
- 真实 Electron 测试替换原生对话框返回值以确定分支，实际关闭、退出、beforeunload、释放与进程终止链均保留；未声称人工点击过 Electron 原生对话框。

### 请整合者汇总的文档事实

合并后请更新批次总表、`docs/current/technical-status.md`、`docs/current/interfaces/record-editing.md`、`docs/current/development/first-record-flow.md`、工程基线与 AGENTS 中“T03 尚待实现”的状态：共享手动编辑、冲突内存草稿及 Web/Electron 正常离开提醒已实现；注明 Chrome 的自动操作证据与用户人工提醒确认、Windows Electron 真实退出检查范围及上述未验证项。无需修改 API、schema、数据保留决定或扩展下一批范围。当前任务等待整合，不自行开始下一项。
