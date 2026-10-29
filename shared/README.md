# shared：跨端共享部分

状态：共享契约与客户端插件包已建立，含记录编辑、回收站、标签、分类和已有记录附件界面；附件文件设备仅 Windows Electron 适配。更新日期：2026 年 10 月 29 日。

阅读时机：抽取共享组件、网络契约、业务客户端和 UI 扩展接口前。遵守根目录 [AGENTS.md](../AGENTS.md)，阅读 [前端技术](../docs/current/architecture/frontend-stack.md) 和 [工程目录规划](../docs/current/development/repository-layout.md)。

`contracts/` 提供框架无关的账号/记录 API 类型、schema、响应校验及诊断协议；`client/` 提供 Cordis 面板、Vue 宿主、账号状态、账号/记录 UI 和传输提供者。`mountApplication` 装配当前业务，`mountClient` 保留诊断 profile；生命周期属于 Cordis。

这里不保存后端数据库访问或业务规则；不直接依赖 Electron、Capacitor 或 Android SDK。平台工程注入自身适配。UI 及传输插件遵守 [全面插件化](../docs/current/architecture/plugin-everything.md)；Kotlin 可依据同一协议生成或实现客户端，但不能直接复用 TypeScript 运行时代码。

契约、生成客户端和动态插件调用工作读 [统一 API 提案](../docs/design/interfaces/unified-api.md)。共享部分约定操作语义，Web Cookie、Electron IPC 和 Android 原生会话由平台适配处理。

[B001-T01](../docs/work/b001-record-editing/t01-update-api.md) 增加 `RecordUpdateInput` / `updateRecord`。框架无关的 `encodeApiRequest` 为 Web 与 Electron 共用固定路由编码：id 只进入路径，PUT JSON 只发送其余输入；响应继续使用 `RecordData` 和既有 `ApiError`。共享传输测试检查实际 fetch 参数、正文、CSRF、错误保留及真实 Electron 连接插件的 IPC 转发（替换宿主 IPC 表面，不需桌面环境）。

[B001-T03](../docs/work/b001-record-editing/t03-editor.md) 提供 `record-editor` 与 `leave-guard` Cordis 插件：详情重新读取后进入编辑，手动保存标题、正文和格式；保存中冻结表单，失败保留草稿，超时提示结果未确认。409 保留原基线，查看最新只作对照；用户可放弃草稿或明确改用新基线整理后再手动保存。应用内切换、结束编辑、退出登录和撤销当前会话均使用同一离开守卫；浏览器监听只在有待保护编辑时注册，插件撤回会清理监听与内存状态。会话变化会立即清除旧身份草稿并忽略旧回包。草稿仅在当前窗口内存中，不支持跨重启恢复；纯文本与 Markdown 均按源文编辑、查看。

[B003-T01](../docs/work/b003-record-management/README.md#t01-任务卡回收站) 扩展标准 `RecordData.deletedAt`、`RecordRevisionInput`、`RecordState` 和 `trashRecord/restoreRecord/emptyTrash`；路径/正文、state 查询、响应校验与固定操作白名单均来自 contracts，Web fetch/Electron 复用编码。清空只接受 `confirm: true`，返回 deleted 数量；后端负责最终权限、版本与事务。

现有 records-panel/record-editor 插件增加正常/回收站切换、关键词分页、只读详情、恢复和不可恢复清空的明确确认。切换、查询、分页与移入沿用同一草稿守卫；冲突刷新状态但保留编辑基线和草稿，失败不假报成功，回收站记录不能作为编辑新基线。清空作用于整个账号回收站（包括被查询过滤的内容），取消不发请求；恢复/清空后刷新，空末页回退。共享 Vue 不引入 Electron SDK；资源进入各端构建，但本任务只验收 Windows Electron，Web/Android 新增流程尚未独立验收。

[B003-T02](../docs/work/b003-record-management/README.md#t02-任务卡标签与筛选) 新增 `TagData` 与 listTags/createTag/getRecordTags/addRecordTag/removeRecordTag/listTagRecords，统一 schema/OpenAPI、响应校验、固定路径/正文编码及窄 IPC 白名单；完整 HTTP 契约见 [后端说明](../backend/README.md#标签与筛选b003-t02)。标签独立于 RecordData 和正文 PUT，不更改正文 revision。Web fetch 的 Cookie/CSRF、Electron 主进程 Bearer 和错误码均复用既有传输。

`record-tags` Cordis 模型与 `tags-panel` UI 贡献在已有记录面板下显示当前记录的多个标签，以及单标签+标题/正文关键词分页。先保存/选择记录；创建或精确同名复用后添加、选择已有、独立移除关联。写入先通过 editor.cancel 的同一离开守卫结束编辑，取消不发标签请求；回收站只读。请求失败、部分创建成功但关联失败、未加载、空结果分别提示，刷新与关联变化后重取结果并回退空末页。会话变化清空标签状态和表单，迟到回包忽略。撤回 record-tags 提供者会撤回 tags-panel，基础记录面板不依赖它；重新启用读取持久标签。UI 生命周期/草稿/会话竞态与 Web 请求有定向测试，真实 Electron 复用既有 smoke。

[B005-T01](../docs/work/b005-managed-attachments/README.md) 增加 AttachmentData、listAttachments/deleteAttachment 元数据 REST/schema/响应校验，以及固定二进制路径和 `FileDeviceBridge`。字节不经 JSON IPC；窄桥只有 choose/upload/save/cancel/clear，选择器返回 handle/name/bytes，进度仅传标识、阶段和字节数，不向 renderer 暴露路径、URL 或 Bearer。完整 HTTP/持久状态见 [后端说明](../backend/README.md#已有记录托管附件b005-t01)。

`file-transfer` 是可替换 Cordis 设备适配，`record-attachments` 管理选择、手动上传/同请求重试、列表、另存及明确永久删除，`attachments-panel` 独立贡献界面；基础记录/标签/分类不注入附件模型。选择/上传/删除先走 editor.cancel 草稿守卫；取消不发请求，失败保留选择与 uploadId 以核对/重试。传输期间注册既有离开守卫，强制会话变化取消设备传输、清选择句柄并忽略迟到回包；撤回只移除附件贡献。删除失败显示持久待清理状态；回收站只读列表/另存，恢复读回，附件操作不改变正文 revision。没有文件设备适配时明确提示 Windows 桌面，Web/Android 保留构建及契约但未独立适配。

`test/record-attachments.test.ts` 定向检查草稿守卫、结果未确认时相同 uploadId 重试、进度/待清理反馈、回收站只读、会话取消和迟到结果、提供者撤回及无设备能力。真实 Electron 使用隔离 HTTP/SQLite/文件链路，实际 1 GiB 摘要验收见任务交付区。

[B004-T01](../docs/work/b004-record-categories/README.md) 增加 `CategoryData` 和八个固定分类操作，路径/正文编码、响应校验和 IPC 白名单仍统一来自 contracts；完整 HTTP 契约见 [后端说明](../backend/README.md#分层分类与记录归属b004-t01)。分类独立于正文 PUT，更名/移动、关联不改变正文 revision。Web Cookie/CSRF 与 Electron 主进程 Bearer 沿用原传输。

`record-categories` 模型和 `categories-panel` 独立贡献分类树、完整路径、创建/更名/移动/整树删除、当前记录多分类归属及包含后代的关键词分页。分类写入先用既有 editor.cancel 草稿守卫结束记录编辑，取消不发请求；查询/分页/选择结果沿用离开守卫。分类节点冲突保留名称、父节点和 expectedRevision，刷新不自动重置编辑输入，用户须明确重新载入。删除提示执行时全部子分类及关联会删除、所有正常/回收站记录、标签和树外关系保留；取消不发删除，失败保留确认状态。回收站归属只读，恢复保留，清空记录保留树。模型包含加载/失败/空结果反馈、空末页回退、会话切换清空和迟到回包隔离；撤回只移除分类面板，基础记录/标签仍可用，重新启用读取持久数据。无新增通用状态框架或平台 SDK。

根目录先编译共享包，再构建客户端；已有 UI 生命周期测试与 Electron 实际业务流程检查。分类的守卫、冲突、分页、失败、撤回/恢复及会话竞态由 `test/record-categories.test.ts` 定向验证，Web 请求由 `test/api-transport.test.ts` 验证；真实 Windows Electron 证据见 B004 交付区。账号/编辑原流程见 [账号记录流程](../docs/current/development/first-record-flow.md)，回收站/标签契约与验证以 B003 交付和后端 README 为准。Web/Android 新分类流程未独立验收，保留构建和公共契约检查。尚无独立 SDK 发布或任意第三方热安装。返回 [工程总入口](../README.md)。
