# Recorder 后端技术选型比较

状态：历史选型依据。核对与归档日期：2026 年 10 月 24 日。

阅读时机：追溯后端选型理由、核对原研究证据或重新评估组合。用户已确认 Harness 维护版 Cordis 及配套 Loader、Fastify、SQLite + better-sqlite3，工作依据见 [已确认后端技术](../../current/architecture/backend-stack.md)。下文保留研究时的推荐与条件，“当前”“本轮”指原研究时点；其他实现建议与版本快照不因此全部获确认。进程与接口细节看 [协作提案](../../design/architecture/backend-electron-boundaries.md)。

## 1. 推荐组合与前提

| 层次 | 当前优先推荐 | 推荐理由 | 需要保留的边界 |
| --- | --- | --- | --- |
| 运行时与语言 | TypeScript + 受支持的 Node.js LTS | 顺着 Cordis 与 Electron/Web 的维护路径；后端独立运行 | Node 24 LTS 可作为验证基线，具体版本尚未锁定 |
| 插件核心 | Harness 维护的公开 Cordis 包 | 更贴近用户希望沿用的 Harness 当前机制与教程 | 不代表它一定比上游稳定；不直接复制 vendor 源码 |
| 插件加载 | 同发行方向的 Loader；文件配置采用配套 Include | 复用现成加载、依赖与配置机制 | 不混装两个发行方向，不自行另建插件加载器 |
| HTTP | Fastify 固定 API 门面 | 通用验证、文档、上传和事件配套较集中 | Cordis 继续掌管业务生命周期；动态操作经注册表分发 |
| 数据 | SQLite + better-sqlite3 + 后端资料库目录 | 适合个人、单后端实例，Windows PC 和单台服务器部署较省事 | 写事务应短；复杂并发或多实例时再考虑 PostgreSQL |
| 查询与迁移层 | 本轮不单独确定 ORM | 当前先明确事务、数据所有权与插件迁移边界更有价值 | 后续统一一种访问约定，不让每个插件自行选一套 |

推荐基于已明确的个人资料管理与集中后端场景，没有把持续高并发写入、多租户或多后端实例作为当前要求。多个客户端访问一个后端，与多个后端并行操作同一数据库不是同一种部署。

本轮核对了官方文档、源码及 Cordis 核心配套包的 npm registry 元数据；没有安装依赖、执行包代码、构建应用或测试实际运行组合。下面的版本是核对快照，不是 Recorder 已锁定的版本。

## 2. 上游 Cordis 与 Harness 维护版

### 实际发行关系

Harness 将 Cordis 及相关基础库纳入仓库维护，并采用 `@deepseek-ai` 包名。其 vendor 清单记录的上游源基线是 Core `4.0.0-rc.7`、Loader `1.0.0-rc.5`，再叠加本地修改；升级 rc.11 的文档在核对时仍标为提案。因此它不是上游当前版的简单改名。[版本来源与修改](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md) · [升级提案](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis-rc11-upgrade-plan.md)

| 比较项 | 上游 Cordis | Harness 维护版 |
| --- | --- | --- |
| 维护路线 | 直接跟随 Cordis 主线 | 跟随 Harness 维护的快照与修补 |
| 与用户目标的关系 | 同一插件范式，适合独立产品 | 同一范式，也更贴近 Harness 当前实际实现 |
| 新功能与变化 | 直接取得上游更新，同时承担其不兼容变更 | 有自身发布节奏，不保证同步拥有最新上游行为 |
| 教程和插件参考 | 应优先按上游选定版本阅读 | Harness 当前教程通常更贴近这一分支，但仍要核对版本 |
| 升级成本 | 跟踪上游 release 和 API 迁移 | 跟踪维护分支 release、上游合并进展及配套依赖 |
| 许可证 | 本次查到的 Core、Loader、Include 均为 MIT | 同样为 MIT；分发时仍需保留相应许可声明 |

上游 rc.11/rc.12 调整了配置处理、依赖卸载顺序、Service 元数据、`ctx.root` 访问方式和 YAML 解析。跨分支迁移可能触及 Loader 与配置语义，不能仅替换 import。也不能把“维护版包含补丁”推导为“上游缺少相同修复”：本轮检查的 Node Loader 形状兼容处理已存在于两边当前源码。[rc.11](https://github.com/cordiverse/cordis/releases/tag/v4.0.0-rc.11) · [rc.12](https://github.com/cordiverse/cordis/releases/tag/v4.0.0-rc.12) · [上游 Loader](https://github.com/cordiverse/cordis/blob/main/packages/loader/src/internal.ts) · [维护版 Loader](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/loader/src/internal.ts)

### 公开发布快照

| 用途 | 上游公开 latest | Harness 维护版公开 latest |
| --- | --- | --- |
| Core | `cordis@4.0.0-rc.12` | `@deepseek-ai/cordis@4.0.5` |
| Loader | `@cordisjs/plugin-loader@1.0.0-rc.9` | `@deepseek-ai/cordis-plugin-loader@1.0.6` |
| Include | `@cordisjs/plugin-include@1.2.0` | `@deepseek-ai/cordis-plugin-include@1.0.10` |
| 本组查得发布日期（北京时间） | 2026 年 10 月 22 日 | 2026 年 10 月 16 日 |

来源为 npm 官方元数据：[上游 Core](https://registry.npmjs.org/cordis) · [Loader](https://registry.npmjs.org/@cordisjs%2fplugin-loader) · [Include](https://registry.npmjs.org/@cordisjs%2fplugin-include)；[维护版 Core](https://registry.npmjs.org/@deepseek-ai%2fcordis) · [Loader](https://registry.npmjs.org/@deepseek-ai%2fcordis-plugin-loader) · [Include](https://registry.npmjs.org/@deepseek-ai%2fcordis-plugin-include)。

维护版公开 Core 元数据中的 peer 范围包含 Loader `~1.0.6`、Include `~1.0.10`；Loader 依赖 Core `~4.0.5`。仓库中的 `workspace:~` 已在公开元数据中转换成版本范围，说明这些底层包不只是仓库内部名称。但公开发布与依赖配套不等于独立安装和运行已验证。

两套被核对的三包均未声明 `engines.node`。这不能推导为任意 Node 都兼容。Harness 整仓根清单要求 `>=24.9.0`，也不能反过来当成每个独立底层包已证明的最低要求。建议以受支持的 Node 24 LTS 具体补丁版开展后续验证，后端不与 Electron 内置 Node 版本绑定。[Harness 根清单](https://github.com/deepseek-ai/deepseek-harness/blob/master/package.json)

### Recorder 的推荐

优先验证 Harness 维护的这组公开 npm 包，理由是更贴近用户的既定偏好与可参考实现。Recorder 作为独立应用依赖它们，不必把整个 Harness 的 agent、会话、profiles 或产品服务搬进来。

如果后续更重视直接跟随 Cordis 主线，或维护分支的发布与兼容问题影响 Recorder，就改以上游配套包为优先。两个分支的版本号不能直接排序可靠性；论文也没有替这次具体版本组合完成验证。

当前不推荐自行复制 vendor 源码。这样会额外承担构建配置、内部依赖、补丁同步和发布维护。插件包也应使用选定核心的 peer 依赖与统一类型来源，避免一个进程中出现不兼容的 Cordis 核心副本。[官方包名迁移说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/rescope.md)

## 3. Loader 应如何配套

| 组件 | 负责什么 | Recorder 建议 |
| --- | --- | --- |
| Core | Context、服务依赖、插件作用域、事件及受管理 effects | 插件运行底座 |
| Loader | 插件条目、配置树与加载关系 | 采用选定发行的现成实现 |
| Include | 从文件读取配置并接入 Loader | 文件配置路线使用；配置持久化入口应统一 |
| HMR | 开发期模块替换与相关监听 | 按需使用，不等同于安装插件或业务数据迁移 |
| Timer | 与作用域关联、可回收的定时器 | 可供运行期任务使用；不等同于持久化提醒调度器 |
| 日志、分组等辅助插件 | 对应公共能力 | 按实际需要加入，不因“成套”就全部安装 |

维护版 Core 的 CLI 会引入 Loader 并创建 Include 条目；使用文件配置启动时应明确三者配套。仅编程使用 Context 不要求把所有附加插件都引入。[CLI 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/bin.js) · [Loader 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/loader/README.md)

插件生命周期、配置热更新、代码 HMR、软件包安装升级是四件事。建议早期将依赖安装与升级作为受控的部署操作，运行期启停交给 Cordis。以后需要管理 UI 时，由后端统一校验并修改既有配置入口，避免 YAML 与数据库各自保存一份互不一致的启用状态。

还需按选定发行验证配置失败行为。Harness 当前维护说明明确部分 Loader 树变更不是事务性的，不能承诺任何热更新失败都恢复到完全相同的旧状态。插件 effects 清理也不负责撤销数据库迁移或已经发送的外部请求。[维护版配置行为](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md)

## 4. HTTP 框架比较

| 方向 | 优点 | 代价与限制 | 推荐地位 |
| --- | --- | --- | --- |
| Fastify | JSON Schema 验证与响应序列化；官方 Swagger、multipart、SSE 配套；支持流式响应 | 启动后不能任意追加路由；自身生命周期要与 Cordis 明确衔接 | 当前首选，用固定 API 门面连接动态业务操作 |
| Hono | Fetch 风格接口，官方 Node adapter 与 SSE helper，组合直接 | 验证和 OpenAPI 需配套；默认 SmartRouter 首次匹配后也限制追加路由 | 偏好薄 HTTP 层与 Fetch 接口时的备选 |
| Koa + Router | 中间件机制简洁，可灵活组织 Node stream | 路由、校验、OpenAPI、上传和 SSE 需更多组装；没有通用的动态注销契约 | 当前无既有积累，优先级较低 |
| Harness Webserver | 自有 Node HTTP/HTTPS 服务，路由注册返回 disposer，适合动态注册与撤销 | 通用 REST 验证、文档、错误与上传策略需补；有 Harness 特定约定与依赖 | 若未来明确优先复用其 HTTP 服务或需要动态路径，再提高优先级 |

Fastify 的官方验证能力、Swagger、multipart 和 SSE 可以减少通用接入层的组装工作。SSE 插件提供发送与连接管理，并不自动提供业务事件历史；流式上传也不等于已支持断点续传、附件事务或媒体 Range。[验证与序列化](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) · [Swagger](https://github.com/fastify/fastify-swagger) · [multipart](https://github.com/fastify/fastify-multipart) · [官方 SSE](https://github.com/fastify/sse) · [流式响应](https://fastify.dev/docs/latest/Reference/Reply/#streams)

Hono 在 Node 上需要适配器，SSE 可使用 `streamSSE`；其多运行时优势对当前确定围绕 Node/Cordis 的产品不是主要收益。默认 SmartRouter 的行为不能概括成“天然支持热增删路由”。Koa 的 Router `delete()` 是注册 HTTP DELETE 方法，不是卸载路由。[Hono Node](https://hono.dev/docs/getting-started/nodejs) · [Streaming](https://hono.dev/docs/helpers/streaming) · [SmartRouter](https://github.com/honojs/hono/blob/main/src/router/smart-router/router.ts) · [Koa](https://koajs.com/) · [Router](https://github.com/koajs/router)

### Fastify 如何服从 Cordis 的业务生命周期

建议由一个 Cordis 接入插件负责 Fastify 实例的启动与关闭；HTTP 框架只管理网络层。业务插件继续通过 Cordis 服务和 effects 注册业务操作，不再通过第二套 Fastify 业务插件生命周期组织。

稳定的记录、附件、事件等使用固定接口；扩展操作使用固定的发现与分发入口。注册表保存操作 ID、所属插件、版本、输入输出 schema、权限和 handler。注册表只是公开业务能力的服务，不是新的插件框架。

Fastify 启动后不能继续任意添加路由，所以业务插件启停改变的是注册表中的操作，不是反复调用路由注册方法。固定入口的包络校验不会自动校验所有动态插件参数，需要按当前操作 schema 继续校验。OpenAPI 可描述稳定 API；动态操作还要有可发现的契约，静态 SDK 不会自动获得未来插件的类型。[Fastify 路由实现](https://github.com/fastify/fastify/blob/main/lib/route.js) · [OpenAPI](https://spec.openapis.org/oas/latest.html)

撤回操作时检查注册归属，避免旧 disposer 误删重新注册的处理器；停止接收新调用后，再按策略等待或取消在途操作。重建整个 HTTP 服务时，SSE 连接会断开，客户端需重连并重新查询。

### 为什么不默认复用 Harness HTTP

`@deepseek-ai/dsh-host-webserver` 使用 `node:http/https`，其包声明维护版 Cordis peer；exact、prefix 与 upgrade 路由可注册并返回清理函数。它有可复用价值，但并不等同于已经为 Recorder 提供完整的 REST 层；换上游 Core 也不能默认兼容。[包清单](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/package.json) · [源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/src/index.ts)

该服务当前还要求绑定具体本机地址，拒绝通配监听地址，认证与 Host/Origin 策略由其他插件配合。部署到云服务器时须重新核对这些约定是否适合 Recorder。注销路由也不代表已取消该路由建立的所有在途请求。[HTTP 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md)

证据边界：已查到该包的公开 npm 索引，但本轮未核实其最新 dist-tag 与仓库 manifest 是否一致；不像上文的六个 Core/Loader/Include 包，不能给出同等完整的发布快照。正式采用前需另外核对选定发布包。[npm 索引](https://www.npmjs.com/package/%40deepseek-ai/dsh-host-webserver)

## 5. SQLite 与 PostgreSQL

| 比较项 | SQLite | PostgreSQL |
| --- | --- | --- |
| 合适部署 | 个人使用、单个后端实例、PC 或单台服务器 | 持续并发写入、多后端实例或明确的数据库运维需求 |
| 安装维护 | 数据库嵌入后端，无需另装数据库服务 | 需要服务、账号、连接池、升级和备份管理 |
| 并发 | WAL 可使读取与写入并行，但同库仍只有一个写入者 | MVCC 适合并发事务，仍需处理锁与冲突 |
| Windows 与 Linux | 两者可用，具体驱动包需核对 | 两者可用，不是 Linux 专属 |
| 对 Recorder 的建议 | 当前优先 | 条件出现时再提高优先级，不因“上云”自动切换 |

SQLite 官方区分了“应用服务器访问本机数据库”和“多个客户端跨网络直接打开数据库文件”。Recorder 符合前一种方向。资料库变大或客户端变多，不一定立即需要换库；应看实际写入负载、事务长度和部署形态。[SQLite 适用场景](https://www.sqlite.org/whentouse.html) · [PostgreSQL MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html) · [Windows 安装](https://www.postgresql.org/download/windows/)

### Node 驱动选择

| 候选 | 已核对特点 | 当前判断 |
| --- | --- | --- |
| better-sqlite3 | 查询为同步 API；提供事务、扩展和备份接口；发布线有预编译分发 | SQLite 的优先驱动候选，核对选定发行包与平台 |
| node:sqlite | Node 内置，减少额外 npm 原生驱动；常规查询仍同步 | 重点备选，但须按 Node 分支确认 API 稳定性与查询层支持 |
| PostgreSQL + pg | 异步调用、连接池、事务 | PostgreSQL 路线的直接候选；一次事务使用同一连接 |

当前 Node 24 文档将 `node:sqlite` 标为 Stability 1.2 / Release candidate，历史记录说明 24.15 起进入该状态；Node 22 文档仍为 1.1 / Active development。因此不能把“Node 内置”或“LTS 运行时”直接等同于模块 API 已稳定。[Node 24 SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) · [Node 22 SQLite](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)

better-sqlite3 官方说明 13.0.0 转向 N-API 与随包预编译分发，当前主仓 Node 要求为 `>=22`。具体发行包仍应核验平台覆盖，不泛化为“一定要本机编译”或“一定随每个 Electron 版本重建”。Recorder 后端独立运行，其数据库驱动不必装进 Electron 客户端。[发行说明](https://github.com/WiseLibs/better-sqlite3/releases) · [包清单](https://github.com/WiseLibs/better-sqlite3/blob/master/package.json) · [驱动 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

两种 SQLite 驱动的同步查询占用执行线程。短查询可先保持简单；长统计、批量导入和索引重建要分批或交给独立 worker。套一层 Promise 不会把同步查询变成非阻塞。PostgreSQL 的连接池也不能让同一事务任意换连接。[better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · [pg 事务](https://node-postgres.com/features/transactions)

### 查询层不必现在单独决策

Drizzle 的 TypeScript 表结构与 SQL 迁移适合内置模块为主的开发；Kysely 提供接近 SQL 的类型化查询和自定义迁移来源；Prisma 的统一 schema 与生成客户端也能使用，但独立插件增加表时要协调生成和部署。它们都不会自动解决插件依赖或跨数据库迁移。

当前先要求可检查的 SQL、清晰事务及统一迁移协调，避免每个插件选一套 ORM。进入实现时再按选定驱动和版本选择查询层；不把这一细节增加为本轮必须由用户决定的架构问题。Drizzle 当前 SQLite 入门含 RC 示例，Kysely 官方核心 SQLite dialect 与 node:sqlite 的适配来源也不同，届时须核对实际版本。[Drizzle SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite) · [Kysely dialects](https://kysely.dev/docs/dialects) · [迁移接口](https://kysely.dev/docs/migrations) · [Prisma 迁移限制](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues)

## 6. 存储与插件架构必须一起考虑

### 数据服务与迁移

建议由统一数据库服务管理连接、事务和迁移；插件拥有命名空间内的结构和迁移，通过公共服务协作，避免直接修改其他插件的私有表。

迁移按插件标识、结构版本和校验值记账，按依赖顺序串行执行，成功后再暴露相应业务能力。关闭或重载插件保留已保存数据；删除插件数据另有明确操作。Cordis disposer 不承担数据库降级或业务事务回滚。未来多后端实例还需跨实例迁移互斥。

### WAL、文件与备份

SQLite WAL 的共享内存要求数据库访问进程位于同一主机；不把数据库文件放到跨主机网络共享后让多个后端直接打开。长读事务也可能阻碍 checkpoint，写事务和连接应集中管理。[SQLite WAL](https://www.sqlite.org/wal.html)

附件放在后端资料库，数据库记录附件标识、元数据与有效引用。建议先写临时文件，完整落盘并完成校验后移入资料库，再提交有效引用；故障恢复识别孤立文件与未完成上传。数据库事务不会自动使普通文件操作一起原子提交。

数据库在线备份应使用一致性备份接口，不能只复制正在使用的 `.db` 而忽略 WAL。附件、配置和插件迁移记录也需要进入恢复方案。个人部署可先讨论暂停写入后的完整备份；在线备份再设计附件清单与备份期间的回收约束。[SQLite 备份](https://www.sqlite.org/backup.html) · [备份与损坏注意事项](https://www.sqlite.org/howtocorrupt.html) · [PostgreSQL 备份](https://www.postgresql.org/docs/current/backup.html)

WAL 的 `synchronous` 设置影响断电后的耐久性，不能仅为性能默认弱化“已保存”的含义。锁定驱动时还要核对其实际绑定的 SQLite 版本是否包含官方已知 WAL 数据损坏修复。[同步策略](https://www.sqlite.org/pragma.html#pragma_synchronous) · [WAL 修复说明](https://www.sqlite.org/wal.html#the_wal_reset_bug)

### 中文检索

SQLite FTS5 默认 tokenizer 不等于中文分词；trigram 支持子串方向，但不足三个 Unicode 字符的全文查询有其限制。不能仅写“使用 FTS5”就承诺中文短词检索体验。需要在实际中文资料上比较基础子串、中文分词或搜索扩展；PostgreSQL 也不自动解决全部中文检索需求。[FTS5](https://www.sqlite.org/fts5.html) · [PostgreSQL parser](https://www.postgresql.org/docs/current/textsearch-parsers.html)

## 7. 何时更换推荐

| 条件发生变化 | 应重新评估的选择 |
| --- | --- |
| 希望直接跟随 Cordis 主线，或维护分支兼容与发布不满足需要 | 上游 Core + 上游 Loader/Include |
| 明确要求复用 Harness 的 HTTP 实现、优先动态路径注册 | Harness Webserver 的独立接入，而非假设必须 Fastify |
| 更偏好 Fetch API 与更薄的网络适配，愿意组合验证及文档工具 | Hono |
| 实际持续写入竞争明显、多后端实例或更完整运维恢复需求 | PostgreSQL + pg |
| 选定 Node 分支的 node:sqlite 稳定性和适配满足项目要求 | 重新比较内置驱动，减少外部依赖 |

这些条件是复评入口，不代表当前要同时实现多个后端或数据库。

## 8. 采用前需要的验证与尚待决定事项

归档补记：用户已确认 Cordis 维护发行及配套 Loader、Fastify、SQLite + better-sqlite3，详见当前后端说明。本节保留采用前的验证思路；具体 ORM、日志输出等局部细节可在授权实现后按需要选择，不必提前增加大量选择题。

开始实现前，围绕选定组合做有限且有意义的验证：

1. 在目标 Windows 与服务器运行环境独立安装公开包，检查 exports、类型、peer 依赖及单一 Cordis 核心来源；记录精确版本和锁文件。
2. 验证插件启停、依赖丢失、配置失败与重载行为；确认资源回收、在途操作和持久数据的边界。
3. 验证固定 API 分发、动态参数校验、SSE 断线恢复以及文件流；不把查询到 API 存在当成流程已可用。
4. 验证数据库驱动、实际 SQLite 版本、写入竞争、异常中断、备份恢复与附件一致性；用中文样本检验检索行为。

原研究实际完成的是资料核对、方案比较和文档检查，上述运行验证尚未执行。返回 [历史索引](../README.md)。
