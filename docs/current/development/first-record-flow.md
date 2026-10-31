# 账号认证与第一条记录流程

状态：当前实现范围与使用说明；验证结果在末节记录。更新日期：2026 年 10 月 31 日。

阅读时机：运行账号和记录功能，修改认证、会话、记录 API、迁移、客户端连接或验收本轮功能时。架构扩展方向见 [本地宿主与同步](../architecture/local-runtime-sync.md)，所有能力遵守 [全面插件化](../architecture/plugin-everything.md)。

## 用户已确认与本轮范围

正文支持纯文本和 Markdown，格式明确保存；首次设置账号密码，之后可记住登录、主动退出并撤销其他会话。当前实现账号初始化、登录、会话查询/撤销、创建记录、列表/分页、标题正文关键字查询和详情；已补齐记录更新 API、版本冲突保护与 Web/Electron 传输，手动编辑、冲突草稿及正常离开提醒也已实现。B003 已补桌面回收站、恢复、确认清空，以及多标签关联和单标签加关键词筛选；B004 已补分类树管理、多分类归属和包含后代的去重筛选。Markdown 本轮以源码输入和查看，不执行 HTML，也未加入富文本或 Markdown 渲染器。

本轮默认连接 Node.js 本机后端。Android 真机验证按用户要求延后；Android 本地后端、云盘同步、SSE、提醒、完整备份恢复仍未完成；桌面已有记录附件已由 [B005-T01](../../work/b005-managed-attachments/README.md) 补齐，文件直接建记录待 T02。公开仓库不等于后端已可直接公开部署。

## 本机启动和首次设置

从仓库根目录先执行 `pnpm build`，分别在终端运行 `pnpm dev:backend`、`pnpm dev:web`，或在后端运行时执行 `pnpm desktop`。

后端从自己的工作目录解析 `RECORDER_DATA_DIR`；根目录提供的 pnpm 启动命令默认使用仓库根目录的 `.recorder/`。直接从其他目录运行时建议设置**绝对路径**。该目录包括 `recorder.sqlite`、SQLite WAL/SHM 及首次初始化的 `setup-code.txt`，已加入 Git 忽略。现有 foundation 探针仍只用于测试，业务入口不会把它当用户资料库。

首次页面要求输入初始化码、用户名和密码。初始化码位于后端数据目录，仅由能访问该主机文件的人取得，不通过公开 API 返回；未初始化时重启会重新生成。用户名为 3–64 位字母、数字、点、下划线或连字符，统一转小写；密码 12–128 字符。首次 owner 建立后，初始化入口由数据库状态关闭，码文件尝试删除，不开放公众注册。并发初始化由数据库事务和唯一约束控制。

创建账号后可直接保存记录。标题可空，最多 200 字符；正文非空，最多 200000 个 JavaScript 字符单位。输入暂存在当前界面内存中，关闭/刷新前未保存的草稿尚不保证保留。看到“已保存到后端”才表示创建已获确认；错误后内容保留，同内容重试使用同一请求 ID，避免重复建记录。

已有记录从详情进入编辑，手动保存标题、正文和格式。版本冲突保留原草稿与基线，查看最新只供对照；用户可明确放弃或选择新基线整理。切换记录、结束编辑、主动退出及撤销当前会话会在有未保存编辑时提醒；Web 刷新/关闭与 Electron 正常退出遵守平台限制。

“记住登录”使用 30 天绝对有效期；不勾选则服务端最多 12 小时，Web 不发持久 Cookie，Electron 不落盘凭据。会话到期或撤销后需重新登录，当前无刷新令牌/自动续期。页面可查询本账号会话并撤销；退出会在后端撤销当前会话，离线退出尚无额外本地清理模式。

## 插件边界

| 能力 | 提供者与消费者 |
| --- | --- |
| 数据库 | `database` 维护 SQLite/Drizzle 连接，effect 关闭资源；业务服务不直接导入该提供者 |
| 迁移与安全启动 | `migrations` 提供只读多版本计划，仅空库初始化或兼容库启动才提供 ready；低层执行器另以维护/测试插件装配 |
| 身份数据与记录数据 | `identity-store`、`record-store` 实现 repository 契约，当前用 Drizzle；可替换适配不要求重写 UI |
| 密码学和认证 | `crypto` 提供 Node 密码学适配；`auth` 提供账号、会话、初始化，停止后不能继续完成异步认证写入 |
| 分类业务与 UI | `category-store` / `categories` / `categories-api` 与 `record-categories` / `categories-panel`；基础记录和标签不依赖分类提供者，停用保留数据 |
| 标签业务与 UI | `tag-store` / `tags` / `tags-api` 与 `record-tags` / `tags-panel`；基础记录不依赖标签提供者，停用默认保留数据 |
| 记录业务 | `records` 校验正文并调用存储契约；API 只接受认证上下文中的 owner |
| API | `api-operations` 管理操作贡献；`auth-api` / `records-api` 随生命周期撤回；`api-http` 提供固定 REST 门面和输入校验 |
| UI | 账号状态、账号面板、记录面板、Vue 宿主、Web/原生传输均是 Cordis 插件 |
| Electron | 连接插件仅开放固定 API 方法，主进程校验 sender/frame；凭据插件使用 safeStorage 加密落盘，renderer 不接收会话秘密 |

操作注册表只管理接口贡献，不是新的生命周期框架。记录插件停用返回 503；认证提供者不可用会撤回依赖的 HTTP 入口，不能退化为未认证访问。移除插件不删除账号、记录或账本。

## API 与持久化契约

`shared/contracts/src/api.ts` 是本轮请求/响应类型及 JSON Schema 的共同来源。HTTP 使用相同输入 schema 校验、输出 schema 序列化；`GET /openapi.json` 输出 OpenAPI 3.1 描述。客户端还校验响应，插件暂不可用、会话失效与输入错误有不同错误码。

| 方法与路径 | 功能 |
| --- | --- |
| GET `/api/v1/info` | 实例 ID 与是否初始化，不公开账号或密钥 |
| POST `/api/v1/auth/setup`、`/auth/login` | 初始化 / 登录；完整路径均以 `/api/v1` 为前缀 |
| GET `/api/v1/me`、`/auth/sessions` | 当前身份 / 本人可用会话 |
| POST `/api/v1/auth/logout`、`/auth/sessions/revoke` | 当前退出 / 按会话 ID 撤销，只影响本人会话 |
| POST `/api/v1/records` | `requestId`、`title`、`body`、`format` 创建 |
| GET `/api/v1/records?q=&limit=&offset=&state=` | 分页查询，默认 30、最多 100；按创建时间和 ID 倒序；state 默认 active，trash 查询回收站 |
| GET `/api/v1/records/{id}` | 仅返回当前账号的记录（含只读回收站记录）；不属于本人等同不存在 |
| PUT `/api/v1/records/{id}` | 正文为 `expectedRevision`、`title`、`body`、`format`；原子更新，过期版本返回 409 `REVISION_CONFLICT` |
| POST `/api/v1/records/{id}/trash`、`/api/v1/records/{id}/restore` | 正文 expectedRevision；移入/恢复递增 revision，过期 409，同版本同状态无新版本 |
| POST `/api/v1/records/trash/empty` | confirm 必须为 true；事务清空当前账号整个回收站，返回 deleted 数量 |

记录包含可空删除时间 deletedAt、全局随机 UUID、owner、来源实例 ID、正文格式/格式版本、修订号和 UTC 毫秒时间。`requestId` 按 owner 唯一，并与内容摘要同事务保存：同键同内容返回原记录，同键不同内容返回 409。重启后仍有效；创建重试不会恢复已回收记录，永久清空后不保留去重墓碑。回收站记录拒绝正文更新（409 RECORD_TRASHED），界面只读并保留冲突草稿。清空需明确确认，含搜索未显示的回收站内容，不影响正常记录；取消不发送请求。查询使用参数化 SQL 与字面子串匹配，`%` / `_` 不作为通配符；中文可按子串查找，ASCII 不区分大小写，未实现全文分词或完整 Unicode 大小写折叠。

更新在 immediate 事务内按 owner/id/revision 条件执行，只改标题、正文、格式与 revision/updatedAt；创建请求 ID/摘要、归属、来源与创建时间不变。重复原始创建请求返回同一记录的当前表示。具体更新契约和已实现交互见 [编辑与版本冲突](../interfaces/record-editing.md)。

SQLite 使用 foreign_keys、WAL、FULL synchronous、5 秒 busy timeout。身份与记录各有 Kit 生成的初始 SQL；运行时不调用 schema push。统一 `recorder_migrations` 记录 namespace/revision/SHA-256/应用时间，在 `BEGIN IMMEDIATE` 事务内按依赖顺序应用并检查外键。重启校验已应用摘要，拒绝历史被改写和代码落后于 schema。

**生产清单为 identity revision 1、records revision 2（回收站）、tags revision 1、categories revision 1、attachments revision 1（后三者依赖 records revision 2）。** B004 库需显式升级安装 attachments，命令见后端 README；B005-T01 已验证旧资料及版本保留。 已有 B003 库须按 [分类升级说明](../../../backend/README.md#分层分类与记录归属b004-t01) 显式确认安装 categories。已有 T01 库还需按 [标签升级说明](../../../backend/README.md#标签与筛选b003-t02) 显式升级；普通启动不自动安装新命名空间。已有 v1 库须按 [维护命令](../../../backend/README.md#记录回收站b003-t01) inspect、确认摘要并 upgrade；先创建恢复点，原数据保留。普通启动只自动初始化空库，拒绝需要升级、历史/摘要不可信或数据版本高于代码的已有库；不自动降级。低层执行器由独立 Cordis 插件提供，生产 profile 不加载，升级验证使用隔离样本，未操作用户真实资料库。B002-T02 已让普通后端先取得规范 filename 对应的独占再打开数据库；异步使用经 `use()` 注册，关闭失败保留独占，不允许第二宿主趁旧连接仍可写时进入。可校验恢复点由独立插件提供，普通业务不装配。T03 已提供独立维护 CLI、确认与中断协调，并在普通启动阻止未完成维护或隔离恢复库，不代表完整恢复系统已完成，见 [实施契约](../storage/migration-recovery-contract.md)。

## 标签操作与筛选

选中或保存记录后，可创建或复用标签、添加已有标签或移除关联；支持多个标签，按一个标签叠加标题/正文关键词分页查询正常记录。名称 trim 后 1–64 个 UTF-16 代码单元，同账号精确同名复用；不做大小写归一。

标签由独立插件提供，六项 API 与 schema/固定传输契约见 [后端标签接口](../../../backend/README.md#标签与筛选b003-t02)。标签关联不随正文 PUT 保存，不改正文 revision/updatedAt；编辑中先经过既有草稿守卫结束编辑，取消不发送标签请求。回收站标签只读，恢复保留；清空级联删除关联，保留标签字典，即使标签提供者停用也有效。全局标签改名/删除、多标签组合尚未实现。

## 分层分类

桌面支持顶层/子分类创建、更名、移动、明确确认删除整棵分类树，以及当前记录的多分类归属。名称 trim 后 1–64 个 UTF-16 代码单元，同父节点下精确同名拒绝（顶层也适用）；移动禁止自身和后代，更名/移动/删除检查节点 expectedRevision，冲突保留输入，用户刷新核对后明确重载。

分类查询包含所选分类及全部后代，叠加标题/正文关键词；列表与 total 按记录去重，只返回正常记录。删除在事务中清理执行时的整棵子树及分类关联，所有正常/回收站记录、标签和树外归属保留。记录回收/恢复保留尚存分类，清空记录清理关联而保留分类树；恢复不重建已删分类。归属增删不改正文 revision/updatedAt，写入复用记录编辑草稿守卫。八项统一 API、插件边界和升级命令见 [后端分类说明](../../../backend/README.md#分层分类与记录归属b004-t01)。

## 认证与访问边界

密码使用 Node 内置异步 scrypt：N=131072、r=8、p=1，独立 16 字节随机 salt；验证采用恒定时间比较。最多并行 2 次派生，匿名用户名也执行同成本验证；登录/初始化按来源 IP 限 10 次/5 分钟。高熵会话 token 为随机 32 字节，数据库只保存 SHA-256 摘要。密码学为独立提供者，未来 Android 运行环境另行验证。

Web 使用 host-only、HttpOnly、SameSite=Strict、Path=/api Cookie；当前只监听 loopback HTTP，因此未加 Secure。写请求同时检查允许的 Origin、自定义请求标记及已认证会话的 CSRF 标记。Electron 使用独立 native 会话 Bearer，限制固定 loopback 后端、不跟随重定向，凭据按后端地址区分并由系统 safeStorage 加密；系统安全存储不可用时不退回明文。

HTTP 校验 Host，拒绝未知 Origin 和 Cookie/Bearer 混用。当前允许 Web 开发来源 `http://127.0.0.1:5173` / `http://localhost:5173`，Vite 固定 5173；无开放 CORS。跨设备 HTTPS、代理、密码修改/找回、资料库加密、实例替换后的凭据重新绑定等仍待实现。本轮不要直接开放到公网，也不要将运行中的 `.recorder` 放在云同步目录。

实现核对参考：[Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html)、[OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)（2026 年 10 月 25 日）。没有自创密码算法，也不宣称完整 OAuth 或第三方插件隔离。

## 验证与已知限制

2026 年 10 月 29 日，B004 代码 HEAD `729862311b03c164df4dae42603a28102a0bfd3f` 的 Windows/Linux CI 全绿；整合者本地复验构建与 Windows Electron 十阶段通过。新增 categories/categories-resume 覆盖树管理、真实版本冲突、去重分页、重启、回收站配合及整树删除保留记录；旧库升级与 API/模型回归复用对应 CI，见 [B004 验收记录](../../work/b004-record-categories/README.md)。Web/Android 分类流程、Linux 图形 Electron 与真实资料升级未独立验收。

B003-T02 代码 HEAD `2d1a4a1fbe9a1f44f0826ddc7b9633d55490c426` 的 Windows/Linux CI 通过，含标签权限/生命周期、回收站关联及真实 T01 旧库升级；整合者复验构建与 Windows Electron 八阶段通过。tags/tags-resume 覆盖草稿守卫、多标签与筛选分页、重启、回收/恢复/清空，见 [B003 验收记录](../../work/b003-record-management/README.md)。Web/Android 标签 UI、Android 原生/真机与 Linux 图形 Electron 尚未独立验收。

B003-T01 代码 HEAD `8019c5adde4500a8eccab665053e9982cb6decb8` 的 Windows/Linux CI 通过，含真实 v1 样本升级与回收站 API/存储测试；整合者复验构建和 Windows Electron 六阶段通过。新增 trash/trash-resume 验证重启保留、恢复、冲突草稿、分页和确认清空，见 [B003 验收记录](../../work/b003-record-management/README.md)。Web/Android 新流程尚未独立验收。

2026 年 10 月 28 日，T03 代码审查提交 `3dbc6eff566561f9d9430345019e056a85377ce9` 的 Windows/Linux CI 构建、类型及 76/76 测试通过；整合者本地复验构建、Electron 四阶段，并定向验证新增维护测试，结果见 [B002 验收记录](../../work/b002-migration-recovery/README.md)。复用 CI，不重复本机全套检查。

2026 年 10 月 27 日，整合者在 T02 修复后的 HEAD 运行 `pnpm check`，构建、类型、60/60 测试与相关文档检查通过，Electron 四阶段再次通过，Windows/Linux 最终 PR CI 全绿。上轮发现的关闭失败提前放锁与未封存 WAL 被接受两项问题已补回归；原 WAL 探针复验返回 `RECOVERY_INVALID`。未修改生产 SQL/schema、依赖与公共 HTTP 契约。下文保留此前各阶段证据。

构建和类型检查通过；B001 的 26 项测试保留。2026 年 10 月 26 日整合者在 T01 原始 HEAD 执行 `pnpm build`、`pnpm typecheck`、`pnpm test`，41 项通过（新增迁移测试 15 项），Windows Electron 四阶段复验通过；文档仅查本项相关文件。Windows/Linux 及 PR 标题检查均成功且继续作为 main 合并门槛，具体证据见 [B002 整合记录](../../work/b002-migration-recovery/README.md)。

`pnpm test:records:desktop` 的 create/resume/discard-quit/discard-close 四阶段复验通过，覆盖手动保存、真实 409、失败草稿、正常关闭/退出取消后继续保存、批准后进程终止、重启 revision 5 读回与会话撤销。仅替换原生确认框的选择结果，实际事件链保留。`pnpm test:desktop` 与 `node backend/test/record-edit-desktop.mjs` 也通过。独立 Chrome 编辑、双标签页冲突证据来自实现者实际操作；用户人工确认刷新/关闭提醒出现。证据与范围见 [B001 台账](../../work/b001-record-editing/README.md)，CI 说明见 [自动检查](../../../.github/CI.md)。

Linux 目前验证的是 CI runner 上的安装、构建、类型和测试。Chrome 原生离开弹窗的选择分支未自动验收；其他浏览器、Linux 图形 Electron/生产部署、Android 原生/真机/本地后端、远程 HTTPS 与完整恢复仍未验证。草稿仅在当前窗口内存中，不支持强杀/断电后的恢复。B001/B002 已完成；B003 回收站与标签筛选、B004 分层分类已完成；桌面升级确认与正式恢复启用尚未完成，当前仍先使用可丢弃样本。

返回 [当前索引](../README.md) 或 [总导航](../../README.md)。
