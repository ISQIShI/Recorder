# B001-T01：记录更新 API 与双端传输

状态：待开始。阅读时机：实现或验收本任务时；先读 [批次计划](README.md)、[编辑契约](../../current/interfaces/record-editing.md)、backend/shared/desktop/web 工程 README。

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

实际开工基线/会话/工作树：待领取后填写。实现说明与验证：尚未执行。返回 [批次计划](README.md)。
