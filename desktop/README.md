# desktop：Electron 桌面客户端

状态：Windows Electron 账号与记录流程已运行验证，产品分发待实现。更新日期：2026 年 10 月 25 日。

阅读时机：桌面界面、主进程、preload、设备能力和打包工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [前端技术](../docs/current/architecture/frontend-stack.md) 和 [Electron 协作提案](../docs/design/architecture/backend-electron-boundaries.md)。

`src/main.ts` 是宿主装配；`src/plugins` 中的窗口、连接、界面加载与快捷键能力均由 Cordis 管理。`src/preload.ts` 将插件提供的窄 IPC 能力暴露给隔离 renderer；`renderer/` 使用共享 Vue/Cordis UI，不导入后端实现。preload 构建为单个 CJS bundle，以适应 Electron sandbox。

根目录 `pnpm build` 后，单独启动 `pnpm dev:backend`，再用 `pnpm desktop` 打开界面。`pnpm test:desktop` 自动启动隔离后端和隐藏窗口，检查 HTTP/IPC/UI、插件撤回与恢复及 renderer 隔离，结束后释放资源。版本和结果见 [工程基线](../docs/current/development/engineering-baseline.md)。

`credentials` 插件使用 safeStorage 加密保存按后端地址区分的会话，连接插件持有 Bearer，renderer 仅通过固定方法白名单调用 API，不得到 token。`pnpm test:records:desktop` 验证创建账号、保存查询、重启登录保持及退出撤销，详见 [账号记录流程](../docs/current/development/first-record-flow.md)。

[B001-T01](../docs/work/b001-record-editing/t01-update-api.md) 已支持窄桥 `updateRecord` → `PUT /api/v1/records/{id}`，与 Web 使用同一编码，路径 id 不混入正文，409 等错误码经 IPC 原样保留。sender/frame 校验、固定操作白名单、loopback 和 token 隔离继续生效；本任务未增加编辑 UI。构建后运行 `node backend/test/record-edit-desktop.mjs` 可检查真实 Electron 更新、旧 revision 冲突、主进程实际发送的 JSON 和后端重启持久化；隔离数据与结果保留在忽略的 `artifacts/t01-update-*`。

快捷键插件注册 `Ctrl+Shift+Space`，尚未实按验证；关闭最后窗口退出，无托盘常驻策略。剪贴板、拖拽、安装包和更新待实现；是否附带后端未定。目前连接限制 loopback，远程 HTTPS 未实现。所有新增能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

连接与传输工作按需读 [统一 API](../docs/design/interfaces/unified-api.md)；凭据、设备登记和退出工作读 [身份与多设备](../docs/design/security/identity-device-access.md)。本机后端启动或远程地址配置另参考 [部署接入](../docs/design/operations/deployment-access.md)。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
