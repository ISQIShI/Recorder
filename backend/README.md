# backend：集中后端

状态：本机账号认证及记录保存/查询已实现，生产接入和完整恢复待实现。更新日期：2026 年 10 月 25 日。

阅读时机：后端、业务插件、存储和服务部署工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，先读 [后端技术](../docs/current/architecture/backend-stack.md) 与 [架构概览](../docs/current/architecture/overview.md)。

`src/bootstrap.ts` 负责 Cordis/Loader 装配，保留基础验证 profile。`src/application.ts` 装配数据库、初始迁移、密码学、身份存储、认证、记录、操作注册表与 HTTP 插件；`main.ts` 启动业务 profile。默认数据为根目录 `.recorder/recorder.sqlite`，可用 `RECORDER_DATA_DIR` 指定绝对目录。

先从根目录执行 `pnpm build`，再用 `pnpm dev:backend` 启动；默认仅监听 `127.0.0.1:4317`。`pnpm test` 包含后端插件生命周期、替换、持久数据保留、失败传播和事务回滚测试。版本和验证范围见 [工程基线](../docs/current/development/engineering-baseline.md)，所有新能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

当前请求契约、首次初始化、持久会话、正文格式、幂等和查询见 [账号记录流程](../docs/current/development/first-record-flow.md)。记录接口必须认证；无认证 foundation 诊断 profile 仅供原有测试，业务入口不加载它。当前仍限 loopback，暂不直接远程部署。

设计公共接口或登录前读 [API 与认证主线](../docs/current/architecture/api-auth-baseline.md)，细化时再读 [统一 API](../docs/design/interfaces/unified-api.md) 或 [身份与多设备](../docs/design/security/identity-device-access.md)。设计服务监听和发布时读 [部署接入](../docs/design/operations/deployment-access.md)，具体实现方案尚未冻结。

数据工作先读 [已确认模型主线](../docs/current/storage/data-model-baseline.md) 与 [数据访问主线](../docs/current/storage/data-access-baseline.md)。细化实体和查询时读 [模型设计](../docs/design/storage/data-model.md)，升级、版本账本和失败恢复读 [迁移机制提案](../docs/design/storage/plugin-migrations.md)，落盘与删除恢复读 [存储生命周期](../docs/design/storage/storage-lifecycle.md)，插件新增字段读 [插件数据契约](../docs/design/plugins/data-extension.md)。`validation/migrations` 保存 Kit 实际生成的隔离探针 SQL；它与测试中的示例账本不等于正式迁移协调器。依赖已锁定，生产字段和迁移协议尚未冻结。

完整备份、恢复与搬迁先读 [已确认备份主线](../docs/current/storage/backup-baseline.md)，再读 [流程细化](../docs/design/storage/backup-recovery.md)；设计适配插件时读 [restic 与 Cordis 集成](../docs/design/storage/restic-integration.md)。统一恢复集合 + 后台复制以及 restic 已确认；具体版本和协议未冻结，未安装工具或初始化仓库。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
