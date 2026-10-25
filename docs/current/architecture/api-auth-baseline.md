# Recorder 已确认 API 与认证主线

状态：技术方向已确认，账号与记录所需子集已实现，其余接口继续细化。更新日期：2026 年 10 月 25 日。

阅读时机：公共接口、客户端 SDK、登录、设备接入和业务插件公开能力相关工作。配合 [后端技术](backend-stack.md) 与 [架构概览](overview.md) 阅读。

## 已确认范围

| 部分 | 已确认方向 | 边界 |
| --- | --- | --- |
| 业务接口 | HTTP/REST | Windows、Web、Android 访问同一后端业务契约 |
| 接口描述 | OpenAPI | 描述跨语言 HTTP 契约；具体标准版本、生成器和 schema 未锁定 |
| 在线事件 | SSE | 用于在线变化与进度通知；不承担 Android 后台可靠提醒 |
| 账号 | Recorder 后端自行管理的本地账号 | PC 和服务器部署均适用；先个人使用，保留增加账号空间 |
| 会话 | 后端管理、可撤销的会话 | 支持撤销授权；设备绑定、凭据载体和续期细节继续设计 |

本地账号属于当前 Recorder 实例，不等于 Windows 系统账号。未来各端本地后端与同步的身份映射按 [本地宿主与同步](local-runtime-sync.md) 另行设计，不能用相同用户名关联多个实例；会话与设备秘密不直接同步。

## 仍需设计的配套

- Web HttpOnly Cookie、Electron 独立 Bearer、随机令牌摘要与 SQLite 会话 store 已用于 [账号记录流程](../development/first-record-flow.md)。Android 凭据适配仍待实现。
- 首次设置账号密码、之后可记住登录与撤销会话已确认并实现；本轮选择 scrypt 密码学提供者、30 天持久会话/12 小时非持久会话。加设备配对、改密/恢复、刷新令牌、远程 HTTPS 继续细化。
- 固定插件操作入口、动态能力清单、独立文件通道、幂等、并发版本和事件补发的具体契约仍为设计提案。
- 本机/LAN/服务器的 HTTPS、代理和监听范围尚未选定；不能因 API 方案确认就自动开放端口。

详细工作材料分别见 [统一 API 契约设计](../../design/interfaces/unified-api.md)、[身份与设备设计](../../design/security/identity-device-access.md) 和 [部署接入提案](../../design/operations/deployment-access.md)。它们保留未冻结部分，不需要因主线确认而整体归档。

## 验证状态

当前实现账号初始化/登录、会话查询/撤销与记录保存/查询；请求和响应 schema 共用，提供 OpenAPI 3.1 描述。自动测试和 Electron 实际流程见 [账号记录流程](../development/first-record-flow.md)。文件、SSE、Android 原生凭据及生产 HTTPS 尚未完成。

返回 [当前文档索引](../README.md) 或 [技术状态](../technical-status.md)。
