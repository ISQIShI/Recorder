# web：浏览器客户端

状态：共享账号、记录编辑与冲突草稿界面已实现，并通过独立 Chrome 操作验收；生产部署待验证。更新日期：2026 年 10 月 25 日。

阅读时机：浏览器界面入口、Web 构建、部署与平台适配工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [前端技术](../docs/current/architecture/frontend-stack.md) 和 [架构概览](../docs/current/architecture/overview.md)。

`src/main.ts` 装配共享账号和记录 UI 插件，fetch 提供者携带同源 Cookie 与 CSRF 标记。`vite.config.ts` 固定本机 5173 端口，代理 API 到 loopback 后端。能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)，不额外建立 Web 业务后端。静态资源生产发布仍待实现；当前流程见 [账号记录说明](../docs/current/development/first-record-flow.md)。

[B001-T01](../docs/work/b001-record-editing/t01-update-api.md) 的共享 fetch 传输已支持 `updateRecord`，发送带 CSRF 的 PUT JSON，id 置于路径，409 `REVISION_CONFLICT` 保留为 `ApiError`。自动测试核对请求正文与凭据选项；真实后端测试覆盖 Cookie/Origin/CSRF 更新。[T03](../docs/work/b001-record-editing/t03-editor.md) 增加详情编辑、手动保存、内存草稿、最新内容对照及显式基线整理。应用内离开先确认，Web 刷新/关闭使用脏状态驱动的 `beforeunload`，监听随 Cordis 插件清理；浏览器是否显示提醒仍受平台与用户交互限制。没有自动保存或跨重启草稿。

根目录 `pnpm build` 后，分别运行 `pnpm dev:backend` 与 `pnpm dev:web`。Web 生产资源输出到本目录 `dist/`；后端未承担静态文件发布。2026 年 10 月 25 日，在独立 Chrome 中使用隔离后端/同源测试静态服务完成登录、创建、标题/正文/格式编辑与双标签页真实冲突验收；用户另外确认刷新和关闭时均出现弹窗。自动化未完成浏览器原生离开弹窗的选择分支；用户确认只证明提醒出现。截图与详细来源见 [T03 交付区](../docs/work/b001-record-editing/t03-editor.md)，不将该本机验收扩大为生产部署或所有浏览器的结论。

业务调用与在线事件读 [统一 API](../docs/design/interfaces/unified-api.md)，Cookie 与登录流程读 [身份与多设备](../docs/design/security/identity-device-access.md)，同源发布和反向代理读 [部署接入](../docs/design/operations/deployment-access.md)。前后端分目录不要求运行在不同域名。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
