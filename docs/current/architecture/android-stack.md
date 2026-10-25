# Recorder 已确认 Android 方向

状态：当前工作依据；基础工程已生成，业务和设备能力仍待实现。更新日期：2026 年 10 月 25 日。

阅读时机：Android 界面、采集、传输、设备存储和提醒相关工作前。共用界面依据见 [前端技术](frontend-stack.md)，职责依据见 [架构概览](overview.md)。

## 已确认事项

| 项目 | 当前依据 |
| --- | --- |
| Android 技术 | Capacitor + Vue，必要时用 Kotlin 补充原生能力；沿用已选 TypeScript + Vite 界面技术 |
| 业务归属 | 记录、分类、统计、重复安排和提醒规则集中在 Cordis 后端 |
| 后端暂时不可达时的收集 | 先暂存到手机，连通后自动重试，明确显示尚未保存到后端 |
| 提醒体验 | 尽量准点；短时断网或 PC 后端关机时，希望已有提醒继续触发 |
| 设备研究前提 | 用户提供“荣耀 Magic9 超能版”，说明 Google Play 服务可用；未核验系统版本或实际投递表现 |

本轮选择不要求用 Compose 重建整套界面，也不将 Kotlin 限定为完全不能使用 UI 的纯后台语言；确有需要的局部原生界面仍可单独讨论。Capacitor 起步版本与生成工程已锁定，见 [工程基线](../development/engineering-baseline.md)；正式桥接插件和签名分发尚未实现。

## 手机本地数据的边界

收集暂存是提交前的设备状态，应能在界面重建后继续被找到，并通过自动重试提交后端。它不等同于手机维护完整业务库，不恢复早期独立离线增删改查与多库同步方案。

暂存成功与后端保存成功必须分开显示。只有后端确认业务记录已落库并完成附件关联后，才显示后端已保存；网络超时或附件上传完成均不能替代这个确认。

用户确认的是 Android 快速收集与分享场景的暂存需求，不自动扩展为所有业务修改、删除、通知操作均可离线排队，也不自动确认 Windows/Web 的同类行为。暂存存储选型、保留期限、容量、取消与编辑语义继续设计。

## 提醒的架构方向

为满足已确认的体验目标，当前建议由后端计算未来触发时刻，Android 提前登记为系统定时通知；FCM 作为计划更新与补充投递的优先候选。详细方案见 [Android 与 Cordis 协作提案](../../design/architecture/backend-android-boundaries.md)。这些具体机制、插件与接口尚未冻结。

手机只执行后端下发的投递计划，不自行计算订阅续费周期或重复日程。离线触发限于已成功登记到该设备的提醒；未下发的新提醒、未收到的修改撤销无法凭空获知。权限、设备关机和系统限制仍会影响实际表现，“尽量准点”不是无条件送达保证。

## 工作入口与验证状态

- Android 工程归属见根目录 [android 指引](../../../android/README.md)，跨端目录见 [工程目录规划](../development/repository-layout.md)。原生工程位于 `android/native`，Web 构建与 Capacitor 同步已通过。
- 设计分享、原生桥接、队列、API 和通知时读 [协作提案](../../design/architecture/backend-android-boundaries.md)。
- 需要追溯 Capacitor 与 Compose 的选择理由时，才读 [历史比较](../../history/research/android-client-comparison.md)。本项对应 D017，暂存和提醒目标分别对应 D018、D019。

用户确认未安装 Android Studio/SDK，按 [环境配置指南](../development/android-environment.md) 后续准备。尚未构建 APK 或执行真机、断网恢复、上传与通知测试；当前连接提供者明确标为未配置。返回 [当前文档索引](../README.md)。
