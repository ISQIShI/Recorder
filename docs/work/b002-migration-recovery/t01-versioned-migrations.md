# B002-T01：多版本迁移与安全启动

状态：待开始。负责会话：由用户启动。更新日期：2026 年 10 月 26 日。

阅读时机：实现、审查或整合本任务时。先读 [批次计划](README.md)、[迁移恢复契约](../../current/storage/migration-recovery-contract.md)、[数据访问主线](../../current/storage/data-access-baseline.md) 和 [后端 README](../../../backend/README.md)。Git/协作按根 AGENTS 执行。

## 起点与范围

- 分支：`feat/b002-t01-versioned-migrations`；PR 目标 `main`。
- 起点：包含本批计划的最新 main；派工消息提供完整 SHA，开工时核对并登记。
- 当前只有命名空间 revision 1 初始化；实际入口为 `backend/src/plugins/migrations.ts`、`src/data/migration-manifest.ts`、`src/application.ts`。
- 目标：把版本预检与实际执行分开，支持多 revision 的确定性依赖顺序和逐步事务，并阻止普通业务启动擅自升级已有库。
- 不做恢复点、维护 CLI、桌面 UI、真实新业务字段、DML 数据变换或破坏性迁移。

## 实施与验收

1. 保留已有账本格式、SQL 和摘要；引入完整迁移历史、明确依赖版本与兼容旧 `requires` 的规范化。拒绝重复、缺口、循环、缺失依赖、摘要变化以及已安装提供者不理解的更高数据版本。未安装提供者的遗留数据不删除。
2. 提供只读计划：区分空库、已兼容、需升级、阻塞；包含现状、目标、步骤及计划摘要。预检失败不能写入账本或业务表，计划变化时旧确认失效。
3. 受控执行器逐步使用事务；SQL 和成功账本同提交，FK 失败回滚本步，前序步骤保留并能被后续计划识别。事务只接受契约限定 SQL；验证 ADD COLUMN 和多语句边界、账本保护。
4. 普通应用启动只允许空库初始化或兼容库；已有库缺少步骤返回明确的需要维护原因，撤回业务服务并关闭资源。新增命名空间也属于已有库升级。非空但无账本不能当新库重建。
5. 执行器能力由 Cordis 服务提供；生产装配不暴露不经恢复点的“直接升级”入口。T01 的升级执行由隔离测试调用，T03 才接入完整维护协调。现有测试用辅助函数若保留，明确其层次和业务入口禁止绕过的边界。
6. 公布可供 T02/T03 使用的后端服务类型、失败分类及样本调用；状态名称可按现有风格实现，不能把“事务成功”写成整批已恢复。

允许修改：`backend/src/plugins/migrations.ts` 及归属它的新增辅助模块/类型，`backend/src/domain.ts`、`backend/src/data/migration-manifest.ts` 的类型与兼容适配，`backend/src/application.ts` 和 `main.ts` 的安全启动接线，相关 `backend/test/` 样本/测试、`backend/README.md`、本任务卡。保留初始生产 SQL 原字节和现有业务 schema；共享 HTTP 契约、根依赖/锁文件、全局文档和其他任务卡只读。确需超范围先报告。

`pnpm test` 覆盖：已有 v1 库及账号/记录不变、空库、非空无账本、多个版本/命名空间拓扑、重复执行、SQL/FK 失败、跨步提交后再次计划、摘要/依赖/降级拒绝，以及启动失败资源释放。使用 fixture 证明 v1→v2→v3，不为测试增加真实业务 migration。执行 `pnpm check`、`git diff --check`；安全启动接线后 Windows 运行 `pnpm test:records:desktop`。Linux 结果以 PR CI 为证，不能由 Windows 通过推断。

## 交付记录

- 实际开工基线 / 工作树：待填写。
- 分支 / PR：待填写；完整 HEAD 放交付消息和 PR，避免自引用提交。
- 服务接口与兼容说明：待填写，供 T02/T03 读取。
- 验收命令、环境、结果及未执行项：尚未执行。
- 未提交文件、仍在运行的进程、需保留材料：待填写。
- 需要整合者更新的事实、偏离与待定项：待填写。

实现完成仅标“待整合”，不合并 PR 或推送 main，不自动开始 T02。可复制派工提示见 [提示词](prompts.md)。
