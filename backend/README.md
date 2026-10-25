# backend：集中后端

状态：独立后端基础工程已实现，正式业务与生产接入待实现。更新日期：2026 年 10 月 25 日。

阅读时机：后端、业务插件、存储和服务部署工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，先读 [后端技术](../docs/current/architecture/backend-stack.md) 与 [架构概览](../docs/current/architecture/overview.md)。

`src/bootstrap.ts` 只装配 Cordis 与配套 Loader；`src/plugins/` 提供操作注册表、SQLite 验证存储、状态操作和 Fastify 接入。消费者通过 Context 服务契约访问能力，插件资源纳入 effect。真实业务数据目录尚未决定，当前默认内存验证库。

先从根目录执行 `pnpm build`，再用 `pnpm dev:backend` 启动；默认仅监听 `127.0.0.1:4317`。`pnpm test` 包含后端插件生命周期、替换、持久数据保留、失败传播和事务回滚测试。版本和验证范围见 [工程基线](../docs/current/development/engineering-baseline.md)，所有新能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

按任务阅读 [Electron 协作提案](../docs/design/architecture/backend-electron-boundaries.md) 或 [Android 协作提案](../docs/design/architecture/backend-android-boundaries.md)。客户端通过网络契约调用服务，不导入这里的运行时实现。当前诊断 API 无认证，不承载真实资料，也不用于远程部署。

设计公共接口或登录前读 [API 与认证主线](../docs/current/architecture/api-auth-baseline.md)，细化时再读 [统一 API](../docs/design/interfaces/unified-api.md) 或 [身份与多设备](../docs/design/security/identity-device-access.md)。设计服务监听和发布时读 [部署接入](../docs/design/operations/deployment-access.md)，具体实现方案尚未冻结。

数据工作先读 [已确认模型主线](../docs/current/storage/data-model-baseline.md) 与 [数据访问主线](../docs/current/storage/data-access-baseline.md)。细化实体和查询时读 [模型设计](../docs/design/storage/data-model.md)，升级、版本账本和失败恢复读 [迁移机制提案](../docs/design/storage/plugin-migrations.md)，落盘与删除恢复读 [存储生命周期](../docs/design/storage/storage-lifecycle.md)，插件新增字段读 [插件数据契约](../docs/design/plugins/data-extension.md)。`validation/migrations` 保存 Kit 实际生成的隔离探针 SQL；它与测试中的示例账本不等于正式迁移协调器。依赖已锁定，生产字段和迁移协议尚未冻结。

完整备份、恢复与搬迁先读 [已确认备份主线](../docs/current/storage/backup-baseline.md)，再读 [流程细化](../docs/design/storage/backup-recovery.md)；设计适配插件时读 [restic 与 Cordis 集成](../docs/design/storage/restic-integration.md)。统一恢复集合 + 后台复制以及 restic 已确认；具体版本和协议未冻结，未安装工具或初始化仓库。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
