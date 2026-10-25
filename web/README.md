# web：浏览器客户端

状态：Vite + Vue/Cordis 入口已建立并通过构建，正式业务待实现。更新日期：2026 年 10 月 25 日。

阅读时机：浏览器界面入口、Web 构建、部署与平台适配工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [前端技术](../docs/current/architecture/frontend-stack.md) 和 [架构概览](../docs/current/architecture/overview.md)。

`src/main.ts` 装配共享 UI 插件，传输使用同源 fetch 提供者。`vite.config.ts` 将开发诊断请求代理到 loopback 后端。页面、设备能力和网络接入均遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)，不额外建立一套 Web 业务后端。静态资源生产部署方案仍待实现。

根目录 `pnpm build` 后，分别运行 `pnpm dev:backend` 与 `pnpm dev:web`。Web 生产资源输出到本目录 `dist/`；后端未承担静态文件发布。构建和类型检查已通过，共享 UI 在 Electron 中实际验证；独立浏览器端到端流程尚未验证，见 [工程基线](../docs/current/development/engineering-baseline.md)。

业务调用与在线事件读 [统一 API](../docs/design/interfaces/unified-api.md)，Cookie 与登录流程读 [身份与多设备](../docs/design/security/identity-device-access.md)，同源发布和反向代理读 [部署接入](../docs/design/operations/deployment-access.md)。前后端分目录不要求运行在不同域名。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
