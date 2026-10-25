# android：Capacitor Android 客户端

状态：Capacitor 原生工程已生成、资源同步通过；SDK 尚未安装，APK 和真机验证待执行。更新日期：2026 年 10 月 25 日。

阅读时机：Android 界面、原生桥接、采集、队列、传输和通知工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [Android 当前方向](../docs/current/architecture/android-stack.md)、[前端技术](../docs/current/architecture/frontend-stack.md) 和 [Android 与 Cordis 协作提案](../docs/design/architecture/backend-android-boundaries.md)。

`src/` 装配共享 Vue/Cordis UI，`capacitor.config.ts` 配置壳，`native/` 是需版本管理的 Android Gradle 工程。未来原生能力通过插件桥接到 Cordis 服务；共享 UI 不直接导入平台 SDK。暂存与系统通知属于设备状态，业务规则与正式记录仍在后端。

在根目录 `pnpm build` 后运行 `pnpm --filter @recorder/android native:sync`。SDK/JDK、打开 `native/`、APK 构建与手机连接步骤见 [Android 环境配置](../docs/current/development/android-environment.md)；版本及已验证边界见 [工程基线](../docs/current/development/engineering-baseline.md)。

当前 Android 连接插件明确显示尚未配置后端；分享、持久待提交、自动重试和提醒尚未实现。生成的 Java Activity 仅是最小平台入口，必要的原生功能后续用 Kotlin 插件补充，遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。`dev.recorder.foundation` 为验证应用 ID，正式签名与发布身份待定。

业务契约和幂等提交读 [统一 API](../docs/design/interfaces/unified-api.md)，原生凭据与队列归属读 [身份与多设备](../docs/design/security/identity-device-access.md)，PC/LAN/服务器连接与证书信任读 [部署接入](../docs/design/operations/deployment-access.md)。具体协议与配套库仍是提案。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
