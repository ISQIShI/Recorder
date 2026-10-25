# Recorder SQLite 数据访问与迁移方案比较

状态：历史选型比较。2026 年 10 月 24 日，用户已确认 Drizzle SQL 风格查询 + better-sqlite3、Drizzle Kit 辅助生成迁移、后端统一协调执行；本文保留比较时的语境，不再作为当前待选清单。官方资料核对日期：2026 年 10 月 24 日。

阅读时机：追溯 Drizzle 的选择理由或需要重新比较时。日常工作先读 [已确认数据访问主线](../../current/storage/data-access-baseline.md)；迁移机制继续按 [核心与插件迁移提案](../../design/storage/plugin-migrations.md) 设计，插件的业务归属见 [插件数据契约](../../design/plugins/data-extension.md)。本轮不写应用代码，不安装依赖，也不生成迁移。

类型收益以当前推荐的 TypeScript 后端为比较前提；后端语言与具体运行时版本仍按技术状态维护，本次比较不额外确认这些选项。

## 1. 当时的推荐

优先验证 **Drizzle ORM 的 SQL 风格查询 + better-sqlite3 + 经审查的 SQL 迁移 + Recorder 统一迁移协调**。Drizzle Kit 可辅助生成迁移草稿；复杂 SQLite 查询和特殊 DDL 保留参数化 SQL 出口。Kysely 是主要备选。

推荐理由是 Recorder 已需要多表关联、业务插件扩展及长期维护。Drizzle 的表定义和查询类型能减少重复维护，仍能检查生成的 SQL；better-sqlite3 的连接可以由后端统一持有。代价是引入 schema 声明和工具版本兼容，插件迁移还需额外协调，不能完全交给自动 schema diff。

这是针对 Recorder 的工程判断，不是性能实测排名，也不是“所有 ORM 都更适合插件”。若更看重手工 SQL/迁移的直接性，可选原生 SQL；若更看重查询组合而希望迁移独立手写，可选 Kysely。

## 2. 先分清三层

| 层次 | 职责 | 当前状态 |
| --- | --- | --- |
| 数据库与驱动 | 存储数据、连接、执行语句 | SQLite + better-sqlite3 已确认 |
| 查询与映射 | 组织查询、返回类型、映射字段 | 原生 SQL、查询构建器、ORM 待选 |
| 迁移与发布协调 | 按版本升级表、数据回填、记录执行结果和恢复 | 工具与 Recorder 插件协调契约待选 |

查询库不会代替 Cordis 管理业务插件，也不会自动处理账号权限、附件回收、插件卸载或文件系统原子性。迁移生成和迁移执行是两项工作：生成的脚本仍需检查，执行时仍要考虑插件依赖和数据保留。

“ORM”包含不同抽象程度。Drizzle 偏 SQL 和显式表定义；TypeORM 偏实体与关系管理。不能仅凭这个分类推断它们有相同的运行机制。

## 3. 主要方案对照

| 方案 | better-sqlite3 接入 | 优势 | 对 Recorder 的主要成本 | 判断 |
| --- | --- | --- | --- | --- |
| 原生 SQL + 薄 repository | 直接使用驱动 | 依赖最少，SQL/事务清楚，SQLite 特性无额外映射层 | 手工维护结果类型、字段映射和查询片段，迁移规范要配套 | 可行；适合重视直接控制，保留为复杂查询出口 |
| Kysely 查询构建器 | SQLite dialect 可接 better-sqlite3 | 类型化 SQL 组合，连接、别名与结果推断较清晰，可用自定义迁移来源 | 类型声明与真实数据库需保持一致；Promise API 要统一管理事务 | 主要备选 |
| Drizzle ORM 的 SQL 风格 API | 官方提供 better-sqlite3 适配 | TS 表定义复用到查询类型，可生成 SQL 迁移，支持 SQL 模板 | schema/Kit/驱动需匹配；动态插件和独立迁移不是自动完成 | 当前优先推荐 |
| TypeORM 实体 ORM | 官方支持 better-sqlite3 | 实体、关系、repository 和迁移配套较完整 | DataSource 实体元数据与插件动态变化需协调，隐式关系行为增加审查面 | 可用，但当前不优先 |

依据：[Drizzle SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)、[Kysely 类型化查询](https://kysely.dev/docs/intro)、[Kysely SQLite 接入](https://kysely-org.github.io/kysely-apidoc/interfaces/SqliteDialectConfig.html)、[TypeORM SQLite](https://typeorm.io/docs/drivers/sqlite/)。

Knex 也是可用的查询构建器，官方支持 better-sqlite3，并提供自定义 migrationSource；如果维护者已有 Knex 经验可以优先考虑。当前没有既有代码或团队熟悉度优势，比较重点放在 Kysely 的类型化查询与 Drizzle 的 schema 工作流，不额外引入另一套查询工具。[Knex 接入](https://knexjs.org/guide/)、[Knex 迁移](https://knexjs.org/guide/migrations.html)

## 4. 原生 SQL：透明，但需要承担类型和重复逻辑

对 Recorder 的标签交集、分类子树、回收站过滤和统计查询，手写 SQL 容易看到实际连接和过滤条件。预编译与参数绑定可直接使用 better-sqlite3；原生 SQL 不等于拼接用户输入。

建议按业务建立小型 repository，集中公共的 owner、删除状态、分页与版本条件，而不是让每个 HTTP 处理器随意执行 SQL。SQL 参数绑定处理值，动态表名和列名仍应来自受信任声明/白名单；不能把插件或用户输入直接拼入标识符。

不足在于：列更名、可空性变化和返回值映射不一定能在编译期发现；为查询手写一个 TS 泛型也不会让数据库验证结果形状。业务多了以后，需要避免复制粘贴查询、漏过滤条件，以及无意中自建一个大型通用 ORM。

如果最终采用原生方案，推荐“显式参数化 SQL + 薄 repository + 有版本迁移”，而非无组织散落 SQL。类型、实际 schema 和业务行为仍需分别验证。

## 5. Kysely：查询表达能力与独立迁移

Kysely 适合用接近 SQL 的方式组合查询，并让表、列、连接和返回类型受到 TS 约束。它不是对象自动持久化系统；业务服务仍显式决定哪些数据写入、怎样提交。

每个插件可以携带自身表类型和数据访问实现，复用核心表的稳定契约。类型来源可以手写或通过工具生成，但类型文件不会随运行中的新插件自动增长；未知插件的数据由该插件自己的已编译模块处理，不把任意字符串表名伪装成静态类型安全。

迁移可使用 Kysely 的 schema builder 或 SQL，通过 MigrationProvider 提供。官方提供排序及迁移记录机制，并有 allowUnorderedMigrations 选项；后装插件的旧时间戳会影响全局排序，不能简单把所有插件文件堆进一个目录。允许乱序也不会替 Recorder 解决插件依赖和表归属。[Kysely 迁移](https://kysely.dev/docs/migrations)

它的主要取舍是：查询类型与建表迁移通常分别维护；相比从 TS schema 生成差异，修改字段时需主动同步两者。若希望迁移始终手写且查询层少承担 schema 职责，这反而可能符合维护习惯。

## 6. Drizzle：显式表定义、查询与可审查迁移

建议优先采用显式 select/insert/update 等 SQL 风格操作和模块化表定义。业务插件持有自己的 schema 模块和 repository，公共表通过稳定契约引用；不用要求整个后端维护一个包罗未来所有插件的总类型。

可用 SQL 模板表达查询构建器不方便覆盖的部分。模板参数化与 sql.raw 是不同能力；后者不能直接接收不可信输入。sql<T> 只是类型辅助，不执行运行时校验或数据转换，不能把它当作结果已经验证的证明。[Drizzle SQL 模板](https://orm.drizzle.team/docs/sql)

Drizzle Kit 能从 schema 变化生成 SQL，也支持自定义迁移。推荐把生成结果当草稿审查：例如列更名、数据回填、索引、外键、FTS、触发器和 STRICT 表是否按预期保留；没有被当前工具完整表达的结构，应采用受控 SQL 并验证后续 diff 不会破坏它。[Drizzle Kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)

Drizzle 官方也允许生成 SQL 后交给其他工具或应用执行。因此可让 Kit 负责辅助编写迁移，让 Recorder 协调核心和插件的升级，而不是必须让各插件分别调用默认 migrator。[Drizzle 迁移工作流](https://orm.drizzle.team/docs/migrations)

不推荐对用户资料库在启动/HMR 时自动 push 当前 schema。缺少某插件的声明不意味着它的历史表应被删除。复杂关系查询 API 若需要完整注册 schema，也不能自动假定支持运行中加入任意新实体；本方案优先用插件自身的显式查询边界。

## 7. better-sqlite3 的同步与事务边界

| 路径 | 应怎样理解 |
| --- | --- |
| 原生驱动 | 查询执行同步；驱动 transaction 回调不能跨 await |
| Drizzle 的 better-sqlite3 适配 | 已核对源码的该适配使用同步 session 和原生事务；锁定发行版本后需再次验证 |
| Kysely SQLite dialect | 查询接口是 Promise 风格，由它管理连接与事务；底层驱动调用仍同步 |

better-sqlite3 明确说明其事务函数不支持 async 回调。Drizzle 已核对的适配源码调用原生 transaction；Kysely 则在自己的驱动层执行 begin/commit/rollback。不要把 Kysely 的异步事务误写为不能使用，也不要把它包进 better-sqlite3 的同步 transaction 回调。[驱动事务](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)、[Drizzle 适配源码](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/better-sqlite3/session.ts)、[Kysely 驱动源码](https://github.com/kysely-org/kysely/blob/master/src/dialect/sqlite/sqlite-driver.ts)

无论选哪一种，都由统一服务创建执行上下文：同一个原子操作里的核心和插件查询使用同一事务对象；原生 SQL 出口也必须经过这一路径。不能一半用库的事务、一半绕过它直接用另一个连接，更不能在 Kysely 管理事务期间直接使用共享裸句柄绕过调度。

网络请求、上传和模型调用留在事务外。Promise 外观不等于 SQLite 运算已离开 Node 主线程；性能取决于查询计划、索引、数据量与任务划分，本轮没有内存、CPU 或吞吐实测。

## 8. 与 Cordis 插件配合

推荐由一个基础数据库服务持有连接、统一配置和事务入口；公共记录服务与业务插件通过依赖关系使用它。业务插件停用时回收自己的运行资源，不关闭其他插件仍在使用的数据库，也不自动删表。

生命周期建议为：发现安装元数据 → 核验核心/插件 schema 兼容 → 协调必要迁移 → 允许业务服务和公开操作就绪。具体启动编排仍需设计，不声称 Loader 已自动提供数据库迁移能力，也不重写其插件加载机制。

插件包可以携带本包类型和 schema 定义。主程序无需在编译时知道所有第三方表，但共享事务适配、公共表契约和查询库版本范围需要统一。优先声明兼容依赖，不能让不同插件带入互不兼容的查询库实例并各自控制同一数据库。

TypeORM 的实体列表和相关配置属于 DataSource；如果采用它，需要设计插件加载前收集实体或受控重建元数据的时机。它能支持模块化产品，但并不天然等于 Cordis 的随时启停。其 synchronize 选项也不适合作为真实资料库的发布迁移策略。[TypeORM DataSource](https://typeorm.io/docs/data-source/data-source-options/)

## 9. 统一迁移协调的推荐职责

| 职责 | Recorder 需要明确的规则 |
| --- | --- |
| 标识与账本 | 核心/插件命名空间、迁移 ID、顺序、内容摘要、执行结果；不能只以全库最新时间戳判断所有插件是否升级 |
| 依赖和执行顺序 | 核心先满足所需版本，插件按声明依赖升级；全库一个协调入口，避免并行改表 |
| 生成范围 | 固定发布的核心可使用完整 schema 集；独立插件只生成其拥有结构的变化，引用核心表不代表获得修改权 |
| 执行和恢复 | 兼容检查、必要备份、暂停相关写入、受控执行、校验；失败不激活要求新 schema 的功能 |
| 保留与卸载 | 不因插件未加载或被卸载而推导 DROP TABLE；迁移历史随数据保留 |

优先适配所选工具的执行和账本能力，确有缺口再补薄的受控 SQL 适配，不自行开发 SQL 解析器或另一套通用 schema diff。账本可以按命名空间维护，但需要唯一协调者；不能让 ORM 账本和自建账本互相矛盾。

对 Drizzle，独立输出目录不自动证明默认迁移账本已隔离；需核对所选版本的 migrator 行为。对 Kysely，自定义 MigrationProvider 和已有锁机制可复用，但仍需设计插件命名空间与依赖顺序。两者都不能省略 Recorder 的应用规则。

插件独立生成迁移必须验证“依赖核心表但只修改本插件表”的范围。无法可靠生成时允许手写迁移，不为省步骤对真实用户数据库执行全局自动对齐。迁移脚本冻结当时所需定义，避免导入最新业务模型导致旧迁移行为变化。

普通 DDL/数据变更尽量在事务内完成；特殊维护操作和分批回填声明自己的恢复方式。具体 SQLite 表重建、外键和文件一致性继续遵守 [存储生命周期](../../design/storage/storage-lifecycle.md)，不能把有迁移库等同于升级一定无损。

## 10. 可维护性判断与下一步

主要由 AI 开发时，类型推断可帮助发现字段与连接错误，但不能证明 owner 条件、回收站过滤、金额精度或业务规则正确。维护重点是：模块职责明确、生成 SQL 能读、迁移能审查、异常能恢复，避免复杂泛型或隐式对象操作掩盖行为。

当前排序为：**Drizzle 优先验证；Kysely 作为查询构建器备选；原生 SQL 保留为精确控制路径；TypeORM 等实体 ORM 暂不优先。** 这不意味着同时安装和维护多套查询库。

版本暂不锁定。核对时 Drizzle 的部分 SQLite 文档示例使用 @rc，官方源码主分支也不等于公开稳定发行；不能直接照抄示例版本。实现前选择相互兼容的 ORM/Kit/better-sqlite3/Node 版本，再核对同步事务和迁移行为，不据本轮研究安装预发布包。

后续验证应覆盖：记录和多个插件表的同事务回滚；标签/分类筛选与分页；不同插件按不同顺序安装；缺席插件表保留；迁移失败恢复；FTS/触发器等结构在生成迁移后保留；SQL 出口不绕过事务或权限。本轮只核对资料和文档，未执行上述测试。

返回 [历史索引](../README.md) 或 [当前技术状态](../../current/technical-status.md)。
