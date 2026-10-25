# B001-T01：记录更新 API 与双端传输

状态：已合并，PR #4；实际交付与整合结果见末节。阅读时机：实现或验收本任务时；先读 [批次计划](README.md)、[编辑契约](../../current/interfaces/record-editing.md)、backend/shared/desktop/web 工程 README。

分支建议 `feat/b001-t01-record-update-api`，PR 目标 `main`；从包含本计划的已同步 main 开始，记录实际完整起点。可与 T02 并行，不依赖 T03。

## 目标与文件范围

实现 `updateRecord`、`PUT /api/v1/records/{id}` 和正确的 revision 条件更新，让 Web 与 Electron 传输可调用同一操作。API 参数、错误及持久化语义以编辑契约为准，不自行变更产品决策。

允许修改：

- `shared/contracts/src/api.ts`，仅必要时调整 `shared/contracts/src/index.ts` 的导出。
- `backend/src/domain.ts`、`backend/src/plugins/{record-store,records,records-api,api-http}.ts`。
- `shared/client/src/api-transport.ts`、`desktop/src/plugins/connection.ts`；必要的协议测试可放 `shared/client/test/api-transport.test.ts`。
- `backend/test/record-edit.test.ts` 等本任务新增测试；确需调整已有 application 测试时保留其原覆盖。
- backend/shared/web/desktop 的 README 中对应局部说明，以及本任务卡的交付区。

不修改记录/身份 schema、迁移 SQL/清单、根依赖/锁文件、UI 编辑表单、CI 和全局规划文档。不引入新依赖。需要扩大文件范围时说明原因，由规划者协调。

## 实现关注点

1. 在现有 Cordis 服务及操作贡献内实现更新；存储依赖契约，消费者不能直接导入 provider。记录插件移除后更新不可用，认证缺失不得退化放行。
2. 事务与 owner/id/revision 条件更新防止丢失修改；revision 只在成功时 +1，保留身份/来源/创建幂等字段。外部 owner 参数禁止进入业务上下文。
3. PUT 的路径/JSON body、Fastify 校验与 OpenAPI 必须一致。现有 POST-only 分支须逐项审阅，Origin/CSRF 也必须覆盖 PUT。维持 get/list/create 等旧行为。
4. Web 和 Electron 发送相同 HTTP 形态，响应保留已有 ApiError/IPC 错误码；主进程 Bearer 不泄露到 renderer，不能为更新开放任意 URL、HTTP 方法或 IPC 通道。
5. 选择不修改 schema 的实现；重复创建的原 requestId 仍指向同一记录，编辑不是新增记录。

## 必需验收

- 创建 plain/markdown 记录后更新标题、正文/格式，读回和重启后仍一致；id/createdAt/来源不变，revision 与 updatedAt 正确。
- 相同 expectedRevision 的两次竞争更新：恰好一次成功，另一次 409；旧版本和非法 revision 不写入。
- 不存在记录与其他账号记录都为 404，无法读取/修改他人内容；无登录为 401。
- PUT 缺少/错误 Origin、CSRF、混合凭据、非法路径/body 均按既有安全约束拒绝；有效 Cookie 和 native Bearer 各有成功用例。
- 超时后重试原 revision 不会再次覆盖；原始创建请求重放不产生新记录、不因编辑改动 hash 而误判。
- 卸载/恢复记录能力的更新路径明确，数据保留；OpenAPI 包含正确方法、路径参数和请求体。
- Web 与 Electron 请求编码都检查到，包括正文而不仅是类型编译；旧账号/保存查询 smoke 继续通过。

建议命令：根目录 `pnpm check`、`pnpm test:desktop`、`pnpm test:records:desktop`。新增后端测试使用现有 `backend/test/*.test.ts` 入口；不凭空新增测试框架。所有数据库放临时目录，记录实际结果；没有 UI 编辑功能不妨碍本任务的接口验收。

## 交付

使用 Conventional Commits，推送任务分支并创建 PR，不自行合并。按 [交付模板](../templates/task-brief.md) 输出任务分支、完整 HEAD、PR、工作树绝对路径、修改文件、检查结果与未执行项。记录应更新的全局说明，留给整合者落实。

### 实际交付（2026 年 10 月 25 日）

交付当时状态：待整合；T01 必需 API/传输验收通过，实现者未自行合并或启动下一任务。以下保留实现者原验收范围，后续整合结果另记于末节。

- 已同步并核验的完整 main 基线：`fb3e552024f732460dd86c8a6933e7f501f4ecda`。开工时 HEAD/main/origin/main 一致，计划和任务卡齐全；detached HEAD 上建立任务分支，未改动其他工作树或 main。
- 分支：`feat/b001-t01-record-update-api`。
- 完整实现/验证提交：`31e35326766b9a7d63219affcb778fdbd3e5b9f1`。本交付区在其后以文档提交补充；最终完整 HEAD 见交付报告和 PR 的 headRefOid，避免在自身提交内记录自指 SHA。
- PR：[Recorder #4](https://github.com/ISQIShI/Recorder/pull/4)，目标 main，非 Draft，待整合者审查。
- 会话：本次用户指定的 B001-T01 实现会话；没有可核验的会话 ID，不虚构。
- 工作树：`C:\Users\30828\.codex\worktrees\b74a\Recorder`。
- 开工时已有未跟踪 `.codex/environments/`，保留且未提交；运行样本、会话和截图在忽略目录，不纳入 PR。

实现范围：

- `shared/contracts/src/api.ts`：`RecordUpdateInput`、updateRecord 输入/响应、PUT 路由、路径与正文 schema；共用固定路由编码 `encodeApiRequest`。
- `backend/src/domain.ts` 与允许的四个插件：更新服务契约、业务输入校验、注册操作、immediate 事务内 owner/id/revision 条件更新；成功递增 revision，过期 409，无记录/他人记录 404，失败不写入。
- `api-http` 补齐 PUT 的 Origin/CSRF/凭据通道、严格 JSON 类型、路径参数和 OpenAPI。保留记录创建摘要、创建请求 ID、身份、来源与创建时间，原始创建重放返回当前表示。
- Web fetch 与 Electron 连接共用编码，id 只进入路径，正文为 expectedRevision/title/body/format；既有 ApiError/IPC 错误码与主进程 Bearer 隔离不变。
- 新增 `backend/test/record-edit.test.ts`、`shared/client/test/api-transport.test.ts`；另以 `backend/test/record-edit-desktop.mjs` 和 `record-edit-electron.mjs` 提供需要桌面环境的手动端到端检查。
- backend/shared/web/desktop README 仅补充局部事实。未改 schema、初始迁移、根依赖/锁文件、UI、CI、批次总表或全局技术状态。

实际验收环境：Windows、Node 24.14.1、pnpm 10.33.0。所有数据库、userData 与端口均隔离。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm check` | 通过：全部工程构建和类型检查、18/18 测试（原有 10、新增 8）、文档检查 |
| `pnpm test:desktop` | 通过：真实 Electron HTTP/IPC/UI 链路、界面插件生命周期和 renderer 隔离 |
| `pnpm test:records:desktop` | 两阶段通过：账号初始化、保存查询、重启会话保持、退出撤销 |
| `node backend/test/record-edit-desktop.mjs` | 通过：真实 renderer → preload →主进程 → HTTP 更新、代理核对 PUT 路径/正文/native Bearer、旧 revision 409、renderer 无 token/require、后端重启持久化 revision 2 |
| 更新持久化与竞争 | plain/markdown 互换、标题/正文保存、身份/来源/创建时间/创建摘要不变；两个数据库连接使用相同 revision 恰好一次 200、一次 409；超时语义下原 revision 重试不再次覆盖，原始创建请求重放不新增记录 |
| 权限与输入 | 无会话/已撤销会话 401；他人/不存在记录 404；非法 revision、路径、未知/只读字段、正文空白/超长、标题长度、格式均拒绝且不写入；Cookie Origin/CSRF、Host、请求标记、混合凭据与通道隔离通过 |
| 插件与 OpenAPI | records-api/records/record-store 卸载后更新 503，恢复后数据保留；认证撤回后 HTTP 不可用；OpenAPI 方法/路径参数/四字段正文/错误语义检查通过 |
| 双端正文检查 | Web 检查实际 fetch 的 PUT/JSON/same-origin Cookie/CSRF；真实 Electron 连接插件单测仅替换宿主 IPC，验证正文、主进程 Bearer、sender/frame、固定操作白名单、错误码与清理；另有真实 Electron 端到端证据 |
| 文档与源码检查 | 局部 README 更新后 `pnpm check:docs` 通过；两份新增 `.mjs` 的 `node --check` 与 `git diff --check` 通过；交付区更新后再检查文档链接 |

真实 Electron 更新证据目录：`artifacts/t01-update-1pgBaR/`，包含隔离数据库、profile 和 result.json；常规两组 smoke 的结果位于 artifacts。测试脚本已纳入本任务允许的 backend/test，可由整合者重跑，不依赖未提交的临时 harness。

环境重试说明：首次沙箱依赖安装遇网络解析/链接失败，权限重试后按冻结锁文件安装成功；Electron 基础 smoke 首次在沙箱内以 2147483651 退出，获桌面运行权限后通过。补充端到端 harness 调试中修正过观测时机和 Electron ready 调用；提交版已重跑通过，以上失败不视为功能通过证据。

未执行：Linux、独立浏览器编辑界面、Android APK/真机、生产部署/性能；T03 的编辑表单、草稿及离开提醒未实现。Web 本任务仅验收 fetch 编码和真实后端 Cookie 安全路径，不声称已有独立浏览器编辑端到端。当前无新增产品/数据选择，无已知 T01 阻塞。

希望整合者更新的全局事实：记录更新 API 与双端传输已实现且验收；编辑契约、账号记录流程和技术状态应区分“API/传输完成”与“T03 UI/离开提醒尚未完成”；批次总表记录实际 PR/最终合并 SHA 与组合验证。本实现者未改这些文件。

### 整合结果（2026 年 10 月 25 日）

原交付完整 HEAD 为 `5656991a26f38ffe053e8cddbf0b4e7537174052`。整合者在自己的分支合入 T02 的 CI 基线，得到 `848782b30ae28c4d1e9762264878321d71364860` 并推送原 PR；没有修改实现者工作树。该 HEAD 的 [Windows/Linux/标题检查](https://github.com/ISQIShI/Recorder/actions/runs/40203843719) 全部通过；本机另复验 18 项测试、6 组标题检查和三组真实 Electron 检查，均通过。

PR #4 已正常 squash 合入 main，最终提交 `3115e5d1556910ebad8cced7c60bcb2ff0d26dcd`；组合树与本机复验版本一致。Linux runner 检查现已补齐，生产部署、独立浏览器编辑和 Android 验证仍未执行。T03 可基于最新 main 开始；API 完成不代表编辑界面已完成。完整整合证据见 [批次计划](README.md)。
