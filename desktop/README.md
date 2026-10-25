# desktop：Electron 桌面客户端

状态：Windows Electron 基础工程已启动验证，产品分发待实现。更新日期：2026 年 10 月 25 日。

阅读时机：桌面界面、主进程、preload、设备能力和打包工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [前端技术](../docs/current/architecture/frontend-stack.md) 和 [Electron 协作提案](../docs/design/architecture/backend-electron-boundaries.md)。

`src/main.ts` 是宿主装配；`src/plugins` 中的窗口、连接、界面加载与快捷键能力均由 Cordis 管理。`src/preload.ts` 将插件提供的窄 IPC 能力暴露给隔离 renderer；`renderer/` 使用共享 Vue/Cordis UI，不导入后端实现。preload 构建为单个 CJS bundle，以适应 Electron sandbox。

根目录 `pnpm build` 后，单独启动 `pnpm dev:backend`，再用 `pnpm desktop` 打开界面。`pnpm test:desktop` 自动启动隔离后端和隐藏窗口，检查 HTTP/IPC/UI、插件撤回与恢复及 renderer 隔离，结束后释放资源。版本和结果见 [工程基线](../docs/current/development/engineering-baseline.md)。

快捷键插件目前注册 `Ctrl+Shift+Space`，本轮未实按验证；关闭最后窗口退出应用，尚无托盘常驻策略。剪贴板、拖拽、安装包和更新均待实现。是否附带本机后端仍待决定；当前连接仅允许 loopback 诊断后端，未支持生产凭据或远程接入。所有新增能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

连接与传输工作按需读 [统一 API](../docs/design/interfaces/unified-api.md)；凭据、设备登记和退出工作读 [身份与多设备](../docs/design/security/identity-device-access.md)。本机后端启动或远程地址配置另参考 [部署接入](../docs/design/operations/deployment-access.md)。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
