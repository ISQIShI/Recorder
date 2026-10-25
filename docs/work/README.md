# 工作批次与任务台账

状态：协作材料入口；B001 规划已建立，实现待开始。更新日期：2026 年 10 月 25 日。

阅读时机：规划者拆任务、实现者领取任务、整合者接收成果时。日常技术依据仍在 [current](../current/README.md)，未确认方案在 [design](../design/README.md)，决策来源在 [history](../history/README.md)。本目录保存执行计划和证据，不替代架构文档。

## 模板

| 文档 | 内容 | 何时阅读 |
| --- | --- | --- |
| [批次计划模板](templates/batch-plan.md) | 决策依据、依赖、文件归属、验收与整合报告 | 创建一批明确授权的工作时 |
| [任务卡与提示词模板](templates/task-brief.md) | 单任务边界、提示词、交付报告 | 向实现 AI 派工及交付成果时 |

使用规则见 [AI 协作](../current/development/ai-collaboration.md)，分支和合并规则见 [Git 工作流](../current/development/git-workflow.md)。模板中的占位符必须在实际派工前填写，不是已确定的任务或排期。

## 活动批次

| 批次 | 状态 | 何时阅读 |
| --- | --- | --- |
| [B001 记录编辑与自动检查](b001-record-editing/README.md) | 待开始；T01/T02 可并行，T03 等 T01 合并 | 启动本批实现、核对依赖、接收交付与整合时；[可复制提示词](b001-record-editing/prompts.md) |

收到下一项具体需求并明确决定后，在本目录创建下一个递增编号的批次目录，含 `README.md`（批次计划与索引）及任务卡。批次 README 必须列出每张任务卡的用途和阅读时机，本页登记批次路径与状态；仅创建计划不代表已经实现或启动其他 AI。

## 已结束批次

尚无按此流程交付的功能批次。此前工程与业务验证记录见 [工程基线](../current/development/engineering-baseline.md) 和 [账号与第一条记录流程](../current/development/first-record-flow.md)，不补造过去不存在的任务卡或验收记录。

批次完成后在这里登记结果和链接，保留原路径；有长期价值的决定同步到 current 与决策日志。仅在追溯对应工作、排查回归或复评时读取已结束批次。

返回 [文档总导航](../README.md)。
