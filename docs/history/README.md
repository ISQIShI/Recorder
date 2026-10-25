# 历史背景索引

状态：非默认必读资料。更新日期：2026 年 10 月 25 日。

日常工作从 [当前文档](../current/README.md) 开始。这里的决策来源、比较与创意用于解释方向，不覆盖当前有效说明；过时的技术事实若用于新工作应重新核对。

| 文档 | 保留原因 | 何时阅读 |
| --- | --- | --- |
| [决策与需求演进](decisions/decision-log.md) | 已确认选择、日期、需求演进及被替代方向 | 追溯依据、解决文档冲突、明确新决定替代了什么时 |
| [Windows 框架比较](research/windows-client-comparison.md) | Electron 与 Tauri 的选择理由及后续复评条件 | 解释 Electron 选择，或实际约束变化需要重新比较时 |
| [后端技术比较](research/backend-technology-selection.md) | 两套 Cordis 发行、Loader、HTTP、数据库及驱动的研究证据 | 追溯已确认后端的理由、核对旧证据或重新评估时 |
| [SQLite 数据访问比较](research/sqlite-access-comparison.md) | 原生 SQL、查询构建器和 ORM 的取舍，以及选择 Drizzle 与 Kit 的依据 | 追溯数据访问选型或重新评估时；日常读 current，迁移机制读 design |
| [备份工具比较](research/backup-tool-comparison.md) | restic、Kopia、Duplicati、Borg 与 rclone 的定位及选择 restic 的依据 | 追溯理由或重新评估工具时；工作读备份主线，具体适配读 restic 集成设计 |
| [Vue 与 React 比较](research/ui-framework-comparison.md) | Vue 3 的选型理由、跨端复用与 UI 扩展研究证据 | 追溯前端选择、查阅旧研究证据或重新评估时；当前规则看 current |
| [Android 框架比较](research/android-client-comparison.md) | Capacitor 与 Kotlin Compose 的选择理由、系统接入与通知研究证据 | 追溯 Android 选择或重新评估时；当前规则看 current，协作提案看 design |
| [前期全栈比较](research/initial-technology-options.md) | 早期后端、Web 与 Android 候选及取舍背景 | 追溯整体思路时；现行依据看 current，活跃协作提案看 design |
| [命名候选](research/naming-candidates.md) | 已结束的命名创意 | 用户主动重新讨论名称时；日常开发无需阅读 |

历史记录保留时间与当时语境，必要更正应明确标注。新增已确认决定时，先更新当前有效说明，再补充这里的来源记录。返回 [总导航](../README.md)。
