# 账号认证与第一条记录流程

状态：本轮实现范围与使用说明；验证结果在末节记录。更新日期：2026 年 10 月 25 日。

阅读时机：运行账号和记录功能，修改认证、会话、记录 API、迁移、客户端连接或验收本轮功能时。架构扩展方向见 [本地宿主与同步](../architecture/local-runtime-sync.md)，所有能力遵守 [全面插件化](../architecture/plugin-everything.md)。

## 用户已确认与本轮范围

正文支持纯文本和 Markdown，格式明确保存；首次设置账号密码，之后可记住登录、主动退出并撤销其他会话。当前实现账号初始化、登录、会话查询/撤销、创建记录、列表/分页、标题正文关键字查询和详情；已补齐记录更新 API、版本冲突保护与 Web/Electron 传输，手动编辑、冲突草稿及正常离开提醒也已实现。Markdown 本轮以源码输入和查看，不执行 HTML，也未加入富文本或 Markdown 渲染器。

本轮默认连接 Node.js 本机后端。Android 真机验证按用户要求延后；Android 本地后端、云盘同步、附件、删除、标签分类、SSE、提醒、完整备份恢复均未作为本轮已完成项。公开仓库不等于后端已可直接公开部署。

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
| 初始迁移 | `migrations` 在统一账本中应用已安装的命名空间清单；完成后才提供 ready 服务 |
| 身份数据与记录数据 | `identity-store`、`record-store` 实现 repository 契约，当前用 Drizzle；可替换适配不要求重写 UI |
| 密码学和认证 | `crypto` 提供 Node 密码学适配；`auth` 提供账号、会话、初始化，停止后不能继续完成异步认证写入 |
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
| GET `/api/v1/records?q=&limit=&offset=` | 分页查询，默认 30、最多 100；按创建时间和 ID 倒序 |
| GET `/api/v1/records/{id}` | 仅返回当前账号的记录；不属于本人等同不存在 |
| PUT `/api/v1/records/{id}` | 正文为 `expectedRevision`、`title`、`body`、`format`；原子更新，过期版本返回 409 `REVISION_CONFLICT` |

记录包含全局随机 UUID、owner、来源实例 ID、正文格式/格式版本、修订号和 UTC 毫秒时间。`requestId` 按 owner 唯一，并与内容摘要同事务保存：同键同内容返回原记录，同键不同内容返回 409。重启后仍有效。查询使用参数化 SQL 与字面子串匹配，`%` / `_` 不作为通配符；中文可按子串查找，ASCII 不区分大小写，未实现全文分词或完整 Unicode 大小写折叠。

更新在 immediate 事务内按 owner/id/revision 条件执行，只改标题、正文、格式与 revision/updatedAt；创建请求 ID/摘要、归属、来源与创建时间不变。重复原始创建请求返回同一记录的当前表示。具体更新契约和已实现交互见 [编辑与版本冲突](../interfaces/record-editing.md)。

SQLite 使用 foreign_keys、WAL、FULL synchronous、5 秒 busy timeout。身份与记录各有 Kit 生成的初始 SQL；运行时不调用 schema push。统一 `recorder_migrations` 记录 namespace/revision/SHA-256/应用时间，在 `BEGIN IMMEDIATE` 事务内按依赖顺序应用并检查外键。重启校验已应用摘要，拒绝历史被改写和代码落后于 schema。

**当前迁移适配仅支持每个命名空间 revision 1 的初始化 DDL**，保留未加载命名空间数据，不自动降级。尚无历史版本升级、备份前置、维护 UI、跨文件恢复或清除数据操作；首次后续 schema 升级前必须补齐这些流程，不能把本次初始化器当完整恢复系统。

## 认证与访问边界

密码使用 Node 内置异步 scrypt：N=131072、r=8、p=1，独立 16 字节随机 salt；验证采用恒定时间比较。最多并行 2 次派生，匿名用户名也执行同成本验证；登录/初始化按来源 IP 限 10 次/5 分钟。高熵会话 token 为随机 32 字节，数据库只保存 SHA-256 摘要。密码学为独立提供者，未来 Android 运行环境另行验证。

Web 使用 host-only、HttpOnly、SameSite=Strict、Path=/api Cookie；当前只监听 loopback HTTP，因此未加 Secure。写请求同时检查允许的 Origin、自定义请求标记及已认证会话的 CSRF 标记。Electron 使用独立 native 会话 Bearer，限制固定 loopback 后端、不跟随重定向，凭据按后端地址区分并由系统 safeStorage 加密；系统安全存储不可用时不退回明文。

HTTP 校验 Host，拒绝未知 Origin 和 Cookie/Bearer 混用。当前允许 Web 开发来源 `http://127.0.0.1:5173` / `http://localhost:5173`，Vite 固定 5173；无开放 CORS。跨设备 HTTPS、代理、密码修改/找回、资料库加密、实例替换后的凭据重新绑定等仍待实现。本轮不要直接开放到公网，也不要将运行中的 `.recorder` 放在云同步目录。

实现核对参考：[Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html)、[OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)（2026 年 10 月 25 日）。没有自创密码算法，也不宣称完整 OAuth 或第三方插件隔离。

## 验证与已知限制

构建和类型检查通过；整合者在 B001 最终组合版本执行 `pnpm check`，当前 26 项测试通过：原有账号/记录/传输 18 项，以及编辑、守卫、身份变化与退出生命周期新增 8 项。独立标题脚本 6 组由本批 CI 验证，Windows/Linux 及 PR 标题检查均为 main 合并门槛。

`pnpm test:records:desktop` 的 create/resume/discard-quit/discard-close 四阶段复验通过，覆盖手动保存、真实 409、失败草稿、正常关闭/退出取消后继续保存、批准后进程终止、重启 revision 5 读回与会话撤销。仅替换原生确认框的选择结果，实际事件链保留。`pnpm test:desktop` 与 `node backend/test/record-edit-desktop.mjs` 也通过。独立 Chrome 编辑、双标签页冲突证据来自实现者实际操作；用户人工确认刷新/关闭提醒出现。证据与范围见 [B001 台账](../../work/b001-record-editing/README.md)，CI 说明见 [自动检查](../../../.github/CI.md)。

Linux 目前验证的是 CI runner 上的安装、构建、类型和测试。Chrome 原生离开弹窗的选择分支未自动验收；其他浏览器、Linux 图形 Electron/生产部署、Android 原生/真机/本地后端、远程 HTTPS 与完整恢复仍未验证。草稿仅在当前窗口内存中，不支持强杀/断电后的恢复。B001 已完成；后续迁移/恢复和回收站尚未派工，当前仍先使用可丢弃样本。

返回 [当前索引](../README.md) 或 [总导航](../../README.md)。
