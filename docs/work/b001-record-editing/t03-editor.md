# B001-T03：编辑界面、草稿冲突与离开提醒

状态：待开始；T01 已通过 PR #4 合并，启动前置已满足。阅读时机：实现/验收编辑界面与正常退出时；先读 [批次计划](README.md)、[编辑契约](../../current/interfaces/record-editing.md)、shared/desktop/web README 和 T01 实际交付。

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

可复用原 T01 会话/工作树，保留已有修改后从最新 `origin/main` 建立新的 T03 分支；不能继续使用已 squash 的旧任务分支。具体提示词见 [派工说明](prompts.md)。实际开工基线/会话/工作树由实现者领取时填写。实现说明与验证：尚未执行。返回 [批次计划](README.md)。
