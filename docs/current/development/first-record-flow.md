# 账号认证与第一条记录流程

状态：本轮实现范围与使用说明；验证结果在末节记录。更新日期：2026 年 10 月 25 日。

阅读时机：运行账号和记录功能，修改认证、会话、记录 API、迁移、客户端连接或验收本轮功能时。架构扩展方向见 [本地宿主与同步](../architecture/local-runtime-sync.md)，所有能力遵守 [全面插件化](../architecture/plugin-everything.md)。

## 用户已确认与本轮范围

正文支持纯文本和 Markdown，格式明确保存；首次设置账号密码，之后可记住登录、主动退出并撤销其他会话。当前实现账号初始化、登录、会话查询/撤销、创建记录、列表/分页、标题正文关键字查询和详情。Markdown 本轮以源码编辑和查看，不执行 HTML，也未加入富文本或 Markdown 渲染器。

本轮默认连接 Node.js 本机后端。Android 真机验证按用户要求延后；Android 本地后端、云盘同步、附件、修改删除、标签分类、SSE、提醒、完整备份恢复均未作为本轮已完成项。公开仓库不等于后端已可直接公开部署。

## 本机启动和首次设置

从仓库根目录先执行 `pnpm build`，分别在终端运行 `pnpm dev:backend`、`pnpm dev:web`，或在后端运行时执行 `pnpm desktop`。

后端从自己的工作目录解析 `RECORDER_DATA_DIR`；根目录提供的 pnpm 启动命令默认使用仓库根目录的 `.recorder/`。直接从其他目录运行时建议设置**绝对路径**。该目录包括 `recorder.sqlite`、SQLite WAL/SHM 及首次初始化的 `setup-code.txt`，已加入 Git 忽略。现有 foundation 探针仍只用于测试，业务入口不会把它当用户资料库。

首次页面要求输入初始化码、用户名和密码。初始化码位于后端数据目录，仅由能访问该主机文件的人取得，不通过公开 API 返回；未初始化时重启会重新生成。用户名为 3–64 位字母、数字、点、下划线或连字符，统一转小写；密码 12–128 字符。首次 owner 建立后，初始化入口由数据库状态关闭，码文件尝试删除，不开放公众注册。并发初始化由数据库事务和唯一约束控制。

创建账号后可直接保存记录。标题可空，最多 200 字符；正文非空，最多 200000 个 JavaScript 字符单位。输入暂存在当前界面内存中，关闭/刷新前未保存的草稿尚不保证保留。看到“已保存到后端”才表示创建已获确认；错误后内容保留，同内容重试使用同一请求 ID，避免重复建记录。

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

记录包含全局随机 UUID、owner、来源实例 ID、正文格式/格式版本、修订号和 UTC 毫秒时间。`requestId` 按 owner 唯一，并与内容摘要同事务保存：同键同内容返回原记录，同键不同内容返回 409。重启后仍有效。查询使用参数化 SQL 与字面子串匹配，`%` / `_` 不作为通配符；中文可按子串查找，ASCII 不区分大小写，未实现全文分词或完整 Unicode 大小写折叠。

SQLite 使用 foreign_keys、WAL、FULL synchronous、5 秒 busy timeout。身份与记录各有 Kit 生成的初始 SQL；运行时不调用 schema push。统一 `recorder_migrations` 记录 namespace/revision/SHA-256/应用时间，在 `BEGIN IMMEDIATE` 事务内按依赖顺序应用并检查外键。重启校验已应用摘要，拒绝历史被改写和代码落后于 schema。

**当前迁移适配仅支持每个命名空间 revision 1 的初始化 DDL**，保留未加载命名空间数据，不自动降级。尚无历史版本升级、备份前置、维护 UI、跨文件恢复或清除数据操作；首次后续 schema 升级前必须补齐这些流程，不能把本次初始化器当完整恢复系统。

## 认证与访问边界

密码使用 Node 内置异步 scrypt：N=131072、r=8、p=1，独立 16 字节随机 salt；验证采用恒定时间比较。最多并行 2 次派生，匿名用户名也执行同成本验证；登录/初始化按来源 IP 限 10 次/5 分钟。高熵会话 token 为随机 32 字节，数据库只保存 SHA-256 摘要。密码学为独立提供者，未来 Android 运行环境另行验证。

Web 使用 host-only、HttpOnly、SameSite=Strict、Path=/api Cookie；当前只监听 loopback HTTP，因此未加 Secure。写请求同时检查允许的 Origin、自定义请求标记及已认证会话的 CSRF 标记。Electron 使用独立 native 会话 Bearer，限制固定 loopback 后端、不跟随重定向，凭据按后端地址区分并由系统 safeStorage 加密；系统安全存储不可用时不退回明文。

HTTP 校验 Host，拒绝未知 Origin 和 Cookie/Bearer 混用。当前允许 Web 开发来源 `http://127.0.0.1:5173` / `http://localhost:5173`，Vite 固定 5173；无开放 CORS。跨设备 HTTPS、代理、密码修改/找回、资料库加密、实例替换后的凭据重新绑定等仍待实现。本轮不要直接开放到公网，也不要将运行中的 `.recorder` 放在云同步目录。

实现核对参考：[Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html)、[OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)（2026 年 10 月 25 日）。没有自创密码算法，也不宣称完整 OAuth 或第三方插件隔离。

## 验证与已知限制

构建和类型检查通过；`pnpm test` 当前 10 项通过，新增覆盖实际账号初始化、跨重启记录/会话、幂等冲突、账号归属、撤销、插件撤回、Cookie/CSRF/Origin、OpenAPI 输入契约，以及初始迁移回滚、摘要和依赖拒绝。`pnpm test:records:desktop` 实际运行 Electron 完成创建账号、Markdown 保存和查询，然后重启后端及客户端、恢复加密凭据与记录，最后退出并核验会话已撤销；检查通过。基础插件检查 `pnpm test:desktop` 也通过，界面截图已查看。

Android 真机和本地运行、Linux 实机、远程 HTTPS、浏览器独立进程端到端与完整恢复仍未验证。账号认证并不能替代备份，当前仍处于早期开发，不应存入唯一一份重要资料。后续优先补齐记录修改/回收站和数据恢复，再扩大正式使用。

返回 [当前索引](../README.md) 或 [总导航](../../README.md)。
