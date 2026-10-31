# desktop：Electron 桌面客户端

状态：Windows Electron 账号、记录编辑/回收站、标签/分类及已有记录托管附件流程已实现；实际运行证据见对应任务交付区，产品分发待实现。更新日期：2026 年 10 月 29 日。

阅读时机：桌面界面、主进程、preload、设备能力和打包工作前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [前端技术](../docs/current/architecture/frontend-stack.md) 和 [Electron 协作提案](../docs/design/architecture/backend-electron-boundaries.md)。

`src/main.ts` 是宿主装配；`src/plugins` 中的窗口、连接、界面加载与快捷键能力均由 Cordis 管理。`src/preload.ts` 将插件提供的窄 IPC 能力暴露给隔离 renderer；`renderer/` 使用共享 Vue/Cordis UI，不导入后端实现。preload 构建为单个 CJS bundle，以适应 Electron sandbox。

根目录 `pnpm build` 后，单独启动 `pnpm dev:backend`，再用 `pnpm desktop` 打开界面。`pnpm test:desktop` 自动启动隔离后端和隐藏窗口，检查 HTTP/IPC/UI、插件撤回与恢复及 renderer 隔离，结束后释放资源。版本和结果见 [工程基线](../docs/current/development/engineering-baseline.md)。

`credentials` 插件使用 safeStorage 加密保存按后端地址区分的会话，连接插件持有 Bearer，renderer 仅通过固定方法白名单调用 API，不得到 token。`pnpm test:records:desktop` 用隔离数据库、动态端口与独立 userData 验证创建、保存查询、编辑、真实 409、错误草稿保留、重启读回及退出撤销。四阶段还实际触发窗口关闭和 `app.quit()`，分别验证取消后资源仍可用、确认后进程退出；仅用替身选择原生确认框的分支，不替换关闭/退出事件链。证据见 [T03 交付区](../docs/work/b001-record-editing/t03-editor.md)。

[B001-T01](../docs/work/b001-record-editing/t01-update-api.md) 已支持窄桥 `updateRecord` → `PUT /api/v1/records/{id}`，与 Web 使用同一编码，路径 id 不混入正文，409 等错误码经 IPC 原样保留。sender/frame 校验、固定操作白名单、loopback 和 token 隔离继续生效。构建后运行 `node backend/test/record-edit-desktop.mjs` 可检查真实 Electron 更新、旧 revision 冲突、主进程实际发送的 JSON 和后端重启持久化；隔离数据与结果保留在忽略的 `artifacts/t01-update-*`。

T03 使用共享编辑 UI 和离开守卫；设备端 `exit` Cordis 插件将正常退出先转为 `window.close()`，由 renderer 的 `beforeunload` 触发 `will-prevent-unload` 后显示原生确认。默认继续编辑；只有窗口确实关闭后才释放根插件资源并完成退出，取消不会提前 dispose 或破坏连接。移除插件会撤回服务与所有 app/window/webContents 监听，恢复不会重复注册；未增加 IPC。强杀、断电和系统回收无法保证拦截，内存草稿不能跨重启恢复。

[B003-T01 回收站](../docs/work/b003-record-management/README.md#t01-任务卡回收站) 复用共享记录 UI 和主进程连接插件；contracts 中的固定操作表为窄 IPC 白名单增加 `trashRecord/restoreRecord/emptyTrash`，编码为认证 POST，renderer 仍不取得 token。回收站提供关键词分页、只读详情、恢复和明确确认清空；沿用编辑草稿守卫，不增加桌面维护入口。

`pnpm test:records:desktop` 已扩展为六阶段：原四阶段加 trash/trash-resume。在真实 Electron/HTTP/SQLite 链路中验证脏草稿取消、回收失败和过期 revision 保留内容、正常搜索排除、后端与桌面重启保留回收站、恢复身份/正文/格式、恢复后空末页回退，以及筛选下取消/失败/确认清空且正常记录不变。只用隔离样本，结果和截图在忽略 artifacts，实际证据见 T01 交付区。Web/Android 新增流程未独立验收。

[B003-T02 标签与筛选](../docs/work/b003-record-management/README.md#t02-任务卡标签与筛选) 由共享 record-tags/tags-panel 插件贡献独立面板，基础记录插件不依赖它。窄 IPC 复用 contracts 的六个固定标签操作与编码，不增加自定义 URL 或向 renderer 暴露 token。详情关联多标签、创建复用/选择/移除、单标签+关键词分页，草稿守卫先结束编辑；回收站只读，恢复保留标签，清空只移除关联、保留字典。

`pnpm test:records:desktop` 增加 tags/tags-resume，现为八阶段。新阶段真实 UI/IPC/HTTP/SQLite 验证 trim 同名复用、多标签、移除/添加已有、取消脏编辑不请求、确认结束编辑、503 错误、正文元数据不变、关键词空结果、31 条标签分页及移除后空末页回退，重启后回收标签只读、恢复保留与清空字典保留。隔离样本和截图 `artifacts/records-desktop-tags.png` 不提交，证据见 T02 交付区。Web/Android 新标签流程及 Linux 图形 Electron 未独立验收。

[B004-T01 分层分类](../docs/work/b004-record-categories/README.md) 复用独立共享 record-categories/categories-panel 插件及八个固定窄 IPC 操作。树显示完整路径，支持顶层/子节点创建、版本检查的更名/移动、明确确认删除整棵子树；记录可加入多个分类，关键词查询包含全部后代并按记录去重。写入保护现有记录草稿，冲突保留分类输入，回收站只读；没有新增桌面维护 UI 或自动升级。

`pnpm test:records:desktop` 增加 categories/categories-resume，共十阶段。新增流程通过真实 UI/IPC/HTTP/SQLite 检查完整路径、关联/解除、草稿取消零写入、真实分类版本冲突、明确重载后更名/移至其他父节点/顶层、重叠关联的 31 条去重分页和空末页回退，后端/Electron 重启读回、回收只读及恢复保留、取消/失败/确认删除整树而记录/标签/树外归属不变，以及清空记录保留树。只在隔离样本用窄 API 准备分页和竞争写入，不替换实际业务链路；结果与截图 `artifacts/records-desktop-categories.png` 不提交，实际通过与未验证项见 B004 交付区。首次登录的 smoke 等待初始列表加载完成再点击保存。Web/Android 分类流程与 Linux 图形 Electron 未独立验收。

[B005-T01 已有记录附件](../docs/work/b005-managed-attachments/README.md) 新增 `files` Cordis 设备插件，由主进程系统选择器授予句柄；preload 的 `recorder.files` 仅开放 choose/upload/save/cancel/clear 和进度订阅。主进程保留路径并校验文件大小/修改时间；renderer 任意路径/URL/额外输入、错误 sender/frame 均拒绝。连接服务用既有 Bearer 访问固定附件路由，字节经 Node 文件流和 HTTP，不进入 JSON/base64/IPC。共享 Vue 只消费文件传输服务，无 Electron SDK。

单文件上限 1 GiB，显示字节进度并可取消；超时按无实际进度 120 秒处理，区别于 JSON 的 15 秒。另存为沿用系统覆盖确认，先写目标同目录独占 `.part`，流式计数/SHA-256、fsync 后替换；失败清理本次临时文件并保留原目标，不自动打开。会话替换/撤销、退出与插件撤回取消所属任务并清选择授权，已提交资料不主动删除；取消上传结果可未确认，UI 刷新后允许同一 uploadId 重试。仍限 loopback，未增加远程配置。

`pnpm test:records:desktop` 现为十二阶段，新增 attachments/attachments-resume：真实 renderer/preload/主进程/HTTP/SQLite/文件流，检查选择取消/草稿守卫、上传取消与重试、进度/摘要、后端与 Electron 重启、另存失败保留旧目标、删除取消/确认且最后一个附件保留记录、回收只读另存/恢复/清空，以及源文件不变。仅原生对话框选择与可控故障响应使用替身；文件读写与成功传输不替换。Windows 手动点击原生选择/覆盖框尚未独立验收，Linux 图形 Electron、Web/Android 附件设备未验收。

根构建后，PowerShell 用 `$env:RECORDER_SMOKE_ATTACHMENT_ONLY='1'; $env:RECORDER_SMOKE_LARGE_FILE='1'; pnpm test:records:desktop` 可只运行两个附件阶段，实际生成、上传并另存 **1,073,741,824 字节**样本，验证 SHA-256；随后清除这两个环境变量，普通 CI 不运行大文件。样本库、userData、源文件/另存文件、结果及截图均在忽略的 artifacts；不提交大文件。2026-10-29 Windows 实测通过及摘要见 T01 交付区，不宣称未测内存峰值或传输性能。

快捷键插件注册 `Ctrl+Shift+Space`，尚未实按验证；关闭最后窗口退出，无托盘常驻策略。剪贴板、拖拽、安装包和更新待实现；是否附带后端未定。目前连接限制 loopback，远程 HTTPS 未实现。所有新增能力遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)。

连接与传输工作按需读 [统一 API](../docs/design/interfaces/unified-api.md)；凭据、设备登记和退出工作读 [身份与多设备](../docs/design/security/identity-device-access.md)。本机后端启动或远程地址配置另参考 [部署接入](../docs/design/operations/deployment-access.md)。

返回 [工程总入口](../README.md)；目录规则见 [工程目录规划](../docs/current/development/repository-layout.md)。
