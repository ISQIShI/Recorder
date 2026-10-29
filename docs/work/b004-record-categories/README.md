# B004：桌面分层分类

状态：查询与删除交互已由用户确认，计划定稿；尚未实现，计划合入 main 后可派发 T01。更新日期：2026 年 10 月 28 日。

阅读时机：实现、审查或验收本批时。本页兼作批次计划和唯一任务卡；入口为 [工作台账](../README.md)，派工用 [提示词](prompts.md)。已结束 B003 只在追溯时阅读。

## 目标、基线与顺序

用户要求继续核心功能、桌面优先与简单流程。规划者安排一个完整任务 **T01：分层分类管理与记录归属**，一次交付后端、迁移、公共契约、桌面 UI 和必要验证；一名实现 AI、一条短期分支、一个 PR，不拆纯后端/前端任务，也不并行争用公共文件。

当前代码基线为 `59f75eeb0fadb7074f4040ca0525ace193446160`（PR #16），已具备记录、回收站与标签。实际开工须从包含本计划及确认结果的最新 `origin/main` 建立 `feat/b004-t01-record-categories`，记录完整基线 SHA；不要沿用已合并的 T02 分支。用户启动会话，规划者不自动派出 AI。工作树与会话可顺序复用，先保留已有修改。

本批完成后再规划基础附件收存/取回。文件上传/下载、外部关联、预览、分类拖拽排序、颜色、未分类专页、标签与分类联合高级查询、AI、同步、维护 UI 和三端独立适配不属于本批；需求仍保留，不冻结完整 MVP。

## 需求依据与本轮确认

既有确认：一条记录可归入多个分类，分类分层；业务及 UI 全部插件化，桌面优先。依据：[当前需求](../../current/product/requirements.md)、[数据模型](../../current/storage/data-model-baseline.md)、[全面插件化](../../current/architecture/plugin-everything.md)。用户于 2026 年 10 月 28 日进一步确认：

- 分类查询：默认包含所选分类及全部子分类，按记录 ID 去重。当前不另加“仅直接归属”模式。
- 删除分类：允许明确确认后删除所选整棵分类树及其关联；所有正常/回收站记录保留，记录的标签和树外分类归属也保留。不是将这些记录移入回收站。

其余条目是规划者在现有技术方向内落实的本批工程约定，不是新增用户决定。若实现遇到影响产品范围、数据保留或主要体验的新分歧，先询问；常规目录、命名和局部实现自行处理。

## T01 任务卡

### 可验收的功能

1. 分类树支持创建顶层/子分类、更名、移动至另一父分类或顶层、确认删除整棵分类子树。界面清楚展示层级和完整分类路径，异父同名节点可辨认。先用列表/树和选择框完成，不要求鼠标拖拽或手工排序。
2. 一条已保存记录可加入多个分类，逐项添加/解除归属；没有关联时正常显示“暂无分类”。创建记录继续沿用已有流程，先保存再归类，不改正文格式和保存语义。
3. 选择一个分类，包含该分类及全部后代并叠加现有标题/正文关键词及 limit/offset 分页；只返回正常记录，同一记录只能出现一次，total 同样去重。显示当前查询范围，查询/分页/选择结果使用现有草稿守卫，末页为空回退有效页。
4. 回收站可只读查看仍存在的分类归属；记录回收/恢复保留关联。永久清空记录只清理对应关联，分类树保留；分类删除只清理所删节点及其关联，记录正文、标签和其他分类归属保留。恢复记录不会重建已被用户删除的分类。
5. 分类关联独立添加/移除，不将整个数组加入正文 PUT；重复关联/解除无重复副作用，不更改正文 revision/updatedAt。编辑记录期间先通过现有守卫结束编辑，用户取消不发送分类写请求；回收站拒绝关联写入。
6. 提供加载、空状态、失败和成功反馈；请求失败保留输入，冲突不强行覆盖，登录切换/插件撤回不展示上一会话迟到数据。沿用已有模型和测试方式，不扩充通用状态框架。

### 数据、接口与插件边界

- 使用独立 categories 命名空间、分类节点表与记录关联表；节点采用稳定 ID、owner、parentId（顶层为空）、名称、revision 和创建/更新时间。关联去重；分类更名/移动不改记录或附件位置。新增 revision 1 显式依赖 records revision 2，不依赖 tags 提供者；identity/records/tags 已应用 SQL 不变。
- 名称 trim 后 1–64 个 UTF-16 代码单元；同账号同父节点下精确同名拒绝并显示重名，异父同名允许，不做大小写归一。顶层也必须执行同名约束，不因 parentId 为空漏掉。列表按名称/ID 稳定排序，暂不做自定义顺序。
- 更名/移动携带节点 expectedRevision，成功递增节点 revision；旧版本返回 409 并保留输入，不自动覆盖。删除携带 expectedRevision 与显式 confirm；取消不发请求。确认文案指明所选分类及全部子分类会删除、所有记录保留；删除范围为执行事务时的整棵子树，不受当前关键词或展开状态限制。旧节点版本返回 409，不强行删除；不引入整棵树快照令牌或新的分类回收站。
- 所有操作从认证上下文取得 owner。移动在同一事务检查父节点归属、禁止自指与移入后代；更名/移动重名为 409，目标不存在或不归属本人为 404。删除和节点/记录关联检查在同一受控事务内完成，失败回滚；不在前端独自维护树约束。
- 分类读写均由独立 Cordis 存储、业务、API 插件提供；UI 模型/面板独立注册。消费记录查询/归属服务契约，允许复用已有纯 SQL 查询辅助函数；不导入具体记录/标签服务提供者，不抽象出通用“组织系统”。普通记录与标签不依赖分类插件，停用撤回对应能力并保留分类数据；重新启用读回。
- 使用外键/事务维护关联，清空回收站时即使分类插件停用也不留悬空关联。记录侧不为分类新增专用清理调用，不做任意插件清理总线。
- 公共契约需覆盖分类列表/创建/更名移动/删除、记录分类查询/添加/解除、分类记录筛选。可用 listCategories/createCategory/updateCategory/deleteCategory/getRecordCategories/addRecordCategory/removeRecordCategory/listCategoryRecords 等名称，实际路由与结构由唯一实现者统一落地并记录。不先单开接口 PR；沿用 HTTP/REST、OpenAPI、JSON schema、响应校验与固定 Web/Electron 传输、身份/CSRF 规则。
- 生产清单目前为 identity v1、records v2、tags v1。新空库初始化包含 categories；旧库通过现有维护 CLI inspect → 确认 digest → 恢复点 → upgrade，不能普通启动自动升级、删库重建或改旧 SQL。无需重做 B002 恢复机制。

### 文件负责人和必读材料

实现者独占本项所需 `backend/src/`、`backend/migrations/`、`backend/test/`、`shared/contracts/`、`shared/client/`、`desktop/`、相关 smoke 脚本、各工程 README 及本页交付区；包括本项公共 API 与迁移清单。根依赖/锁文件、CI、AGENTS、全局状态/决策/索引由规划整合者负责；新依赖先说明实际必要性，本批预计可复用已有依赖。

开工读 AGENTS、[导航](../../README.md)、[技术状态](../../current/technical-status.md)、[目录规则](../../current/development/repository-layout.md)，再读 [backend](../../../backend/README.md)、[shared](../../../shared/README.md)、[desktop](../../../desktop/README.md) 中记录/标签/传输相关部分。沿用 [编辑契约](../../current/interfaces/record-editing.md) 与 [迁移恢复契约](../../current/storage/migration-recovery-contract.md)，不遍历历史讨论。共享 Vue 不依赖 Electron SDK；Web/Android 保留现有构建和公共契约检查，新增界面不要求三端独立验收。

### 必要验证与交付

- 实际桌面流程：创建父/子分类 → 记录加入多个节点 → 包含后代筛选及去重分页 → 更名/移动 → 重启读回 → 回收只读/恢复保留 → 确认删除分类但记录保留 → 清空回收站且分类保留。验证一个已有编辑草稿的取消分支。
- 定向后端/客户端测试覆盖 owner 隔离、树环/重名、过期节点版本、整棵子树删除但保留所有记录的语义与事务、关联幂等/回收站限制、去重 total/分页、分类插件撤回恢复后基础记录/标签仍可用。真实 B003 旧库样本经 CLI 升级后正常记录、回收站、标签及原 revision 不变。
- 稳定后一次构建/类型、受影响测试与扩展现有 Windows Electron smoke；Windows/Linux 完整检查交既有 CI。仅检查相关文档，执行 `pnpm check:docs --base <本项基线>` 和 `git diff --check`。无新变更/失败/具体疑点不重复本机全套 B002 故障测试或 B003 手工验收。
- 使用独立样本库/端口/userData，不改真实 `.recorder/`、其他工作树或未提交内容。交付 Conventional Commits 提交和 main 目标 PR；实现者不合并、不推 main、不强推。提供分支、完整 HEAD、工作树、PR、实际验证与未验证平台，不自行开始附件批次。

## 交付与整合记录

T01 状态：**待整合**。实现日期：2026 年 10 月 29 日。全局状态和本页上方计划状态由整合者验收后更新，本实现只填写交付区。

- 工作树：`C:\Users\30828\.codex\worktrees\b74a\Recorder`；分支：`feat/b004-t01-record-categories`。fetch 后从包含 PR #16 及 B004 定稿计划的最新 `origin/main` 建立，完整实际基线为 `1af94fc46b56e3bc607f4e31b02bdb62fd9dd79b`。原 B003 分支成果已提交/推送，初始未跟踪 `.codex/` 保留；不修改其他工作树或 main。
- 交付 categories revision 1（依赖 records revision 2）的 Kit SQL/元数据和生产清单，identity/records/tags 四份已应用 SQL 原字节不变。独立 category-store/categories/categories-api、客户端 record-categories/categories-panel 插件覆盖树管理、多分类关联及包含全部后代的去重查询；八个操作使用统一 HTTP/OpenAPI、schema、响应校验、Web 编码和 Electron 窄 IPC。
- 更名/移动原子检查 owner、版本、同父重名和树环，顶层 partial 唯一索引保护 NULL 父节点。删除核对根 expectedRevision/confirm 后，事务删除执行时全部子树及关联，失败回滚；正常/回收站记录、标签、树外归属保留。分类关联幂等且不改正文 revision/updatedAt；清空记录靠外键清理关联，停用分类提供者仍有效。旧库只经显式摘要确认、恢复点先行的既有 CLI 升级。
- 桌面界面提供完整路径、明确整树删除确认、分类版本冲突保留名称/父节点/基线、手动重载、失败和加载状态；草稿取消零写入、回收只读、恢复保留、空末页回退和会话迟到数据隔离。分类插件撤回/恢复不影响基础记录与标签；未新增通用组织/状态框架。

本机 Windows 实际结果（隔离库、动态端口和独立 Electron userData；没有操作真实 `.recorder/`）：

| 检查 | 实际结果与证据 |
| --- | --- |
| `pnpm build`、`pnpm typecheck` | 通过，包含 Web/Android 构建与公共契约；日志 `artifacts/b004-t01-build.log`、`b004-t01-typecheck.log`。smoke 等待修正后另构建 desktop 通过 |
| 后端分类/标签/回收站定向测试 | `node --import tsx --test backend/test/record-categories.test.ts backend/test/record-tags.test.ts backend/test/record-trash.test.ts`，9/9 通过；`artifacts/b004-t01-storage-tests.log`。覆盖 owner/CSRF/输入、树环/重名、过期版本、删除回滚及记录保留、关联/去重分页、插件撤回恢复、真实 B003 升级原数据及旧 SQL/revision 保留 |
| 客户端分类/传输/编辑/标签定向测试 | 四个对应 test 文件，20/20 通过；`artifacts/b004-t01-client-tests.log`。覆盖固定编码、Web Cookie/CSRF、守卫、冲突基线、空末页、读取失败、卸载/会话迟到回包 |
| `pnpm test:records:desktop` | Windows 真实 Electron 十阶段全部通过；`artifacts/b004-t01-electron.log`，分类树截图 `artifacts/records-desktop-categories.png` 已目视核对。新增两阶段覆盖任务要求完整链路，并验证真实 409、取消/503/成功删除、所有记录/标签/树外关系保留。调试时修正首次登录列表加载及筛选清空当前记录后的 smoke 等待条件，最终完整运行通过 |
| `pnpm check:docs --base 1af94fc46b56e3bc607f4e31b02bdb62fd9dd79b`、`git diff --check` | 通过；相关文档 8 份、内部链接 202 个、错误 0，日志 `artifacts/b004-t01-docs.log` |
| Windows/Linux CI | 实现提交 `1e3447d160bce6bf740735b4239933a9976988bc` 的 [CI #40878153949](https://github.com/ISQIShI/Recorder/actions/runs/40878153949) 全部通过：两平台各 `pnpm check`（build/typecheck、93/93 测试、相关文档），PR 标题、标题与文档脚本回归各 6/6。日志 `artifacts/b004-t01-ci.log`；本条是后续仅文档补充，最终 HEAD 的检查以 PR checks 为准 |

已正常推送并创建 main 目标 [PR #18](https://github.com/ISQIShI/Recorder/pull/18)，待整合者审查；完整最终 HEAD 随交付提供。未自行合并或推送 main。

未执行：Linux 图形 Electron、Web/Android 分类流程独立验收、Android 真机、真实用户资料升级及真实断电；不重复本机全套 B002 故障或 B003 手工验收。没有新增依赖、锁文件/CI 变更或待决定的产品/数据分歧。证据样本在忽略的 artifacts 中不提交，原 `.codex/` 保留。

整合者需汇总的事实：分类完整后端到桌面流程及上述验证已交付；生产版本新增 categories revision 1；已有 B003 库需先确认 CLI 升级再启动；查询含全部后代并去重、删除分类保留全部记录/标签/树外归属。建议验收后更新全局技术状态、当前业务说明、工作台账及 AGENTS 的阶段描述。实现者等待审查，不自行开始附件或下一批。
