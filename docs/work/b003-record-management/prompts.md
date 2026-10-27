# B003 实现提示词

状态：B003 已完成；下列提示词仅保留历史，不再派发。更新日期：2026 年 10 月 28 日。

阅读时机：追溯已结束任务的原派工边界时。任务边界与验收统一见 [批次计划及任务卡](README.md)。一次只发一项，T01 合并后再发 T02；可以顺序复用原会话/工作树。不要同时启动两个修改记录公共代码的实现。

## 已完成留档：T01 回收站（不要再次派发）

```text
请完成 Recorder B003-T01：桌面记录回收站。
任务卡：docs/work/b003-record-management/README.md 的共用边界及 T01 章节。
先保留工作树现有内容，fetch origin，确认 origin/main 已包含 B003 计划；
从最新 origin/main 新建 feat/b003-t01-record-trash，记录完整基线 SHA。
读取 AGENTS、导航、技术状态及任务要求的相关工程 README，不遍历历史文档。
一次交付后端、正式迁移、共享契约/传输、Electron UI 和必要测试的完整流程。
复用 Cordis 插件和 B002 CLI；保留手动编辑/草稿守卫，不扩大维护、同步或备份设计。
本地定向验证与桌面流程，现有 CI 执行完整检查；只查相关文档，避免重复测试。
更新本任务交付区与相关工程说明，Conventional Commits 提交并开 main 目标 PR。
不合并、不推 main、不强推，不改其他工作树。关键产品/数据分歧再问用户。
交付分支、完整 HEAD、工作树、PR、验证和遗留；不自行开始 T02。
```

## 已完成留档：T02 标签与筛选（不要再次派发）

```text
请完成 Recorder B003-T02：桌面记录标签与筛选。
任务卡：docs/work/b003-record-management/README.md 的共用边界及 T02 章节。
保留现有修改，fetch origin，确认 PR #15 及整合交接已经合入 main，读取实际交付契约；
从最新 origin/main 新建 feat/b003-t02-record-tags，记录完整基线 SHA。
读取 AGENTS、导航、技术状态和相关工程 README；一次交付完整后端到桌面流程。
现有生产清单为 identity revision 1、records revision 2；新增标签命名空间依赖 records revision 2，不改已应用 SQL。
RecordData.deletedAt 已实现；getRecord 可返回归属自己的回收站记录，标签写入须检查正常状态。
标签独立插件，基础记录不依赖标签提供者；多标签关联、单标签加关键词筛选。
不新增分类、全局标签改名/删除、附件、AI 或通用插件数据清理框架。
验证标签与回收/恢复/清空配合，复用既有迁移、传输和桌面检查，避免重复全套测试。
仅更新任务授权文件及交付区，Conventional Commits 提交并开 main 目标 PR。
不自行合并、强推或修改其他工作树；关键产品/数据分歧再问用户。
交付分支、完整 HEAD、工作树、PR、实际验证和遗留；不开始下一批。
```

返回 [批次计划](README.md) 或 [工作台账](../README.md)。
