# Recorder 已确认前端技术

状态：当前工作依据，已建立共享插件界面与三端入口。更新日期：2026 年 10 月 25 日。

阅读时机：设计或实现 Web、Electron 界面、共享组件、UI 扩展以及 Android 接入时。整体边界见 [架构概览](overview.md)，其他选型见 [当前技术状态](../technical-status.md)。

## 已确认的选择

| 层次 | 当前决定 | 确认范围 |
| --- | --- | --- |
| 共享 Web 界面 | Vue 3 | 用于浏览器、Electron 渲染界面与 Capacitor Android；布局和设备接入按平台适配 |
| 界面开发语言 | TypeScript | 类型与接口需要对应实际后端契约；不把类型检查当作服务端校验 |
| Web 构建工具 | Vite | 构建共享 Web 界面；不因此确定 Electron 打包或 Android 构建工具 |
| Windows 外壳 | Electron | 本机设备接入与界面进程分工继续细化，后端仍保持独立职责 |
| Android 外壳 | Capacitor + Vue，按需 Kotlin | 共享 Vue 界面，并补充 Android 原生采集、传输与通知能力 |

这是用户明确确认的技术方向，当前起步依赖已锁定，具体版本及验证见 [工程基线](../development/engineering-baseline.md)。选择 Vue 不要求沿用 Harness 的 React 前端，也不改变已确认的 Cordis 后端技术。界面宿主、UI 贡献、传输和设备适配统一遵守 [全面插件化](plugin-everything.md)。

## 使用这项决定时的边界

- 业务规则、最终校验、保存、分类、统计和提醒规则仍由集中后端承担。Vue 负责显示、交互及调用接口。
- Windows 与 Web 以共享组件和界面逻辑为方向；手机需要独立考虑窄屏导航、触摸、键盘和返回行为，不承诺所有页面布局完全一致。
- Electron 本机能力由设备适配提供。Android 已采用 Capacitor 方向，通过原生桥接接入设备，必要时编写 Kotlin；当前不另建整套 Compose 界面。
- UI 扩展使用什么贡献点、怎样安装和卸载、如何适配不同客户端，仍需制定契约。Vite 的开发热更新不是产品插件的热安装机制。

共享业务客户端接口、平台设备适配、组件贡献描述等具体建议，见 [后端与 Electron 协作提案](../../design/architecture/backend-electron-boundaries.md)。不因本页确认框架而冻结该提案。

## 仍待确定

起步采用 TypeScript 定义 Vue 组件和少量 CSS；正式 Vue 代码约定、路由、状态管理、请求缓存、组件库、样式体系、Electron 分发打包工具与 UI 扩展分发方式尚待按需确定。Vue Router、Pinia、Ionic 等即使出现在分析中，也不视作已选依赖。

Android 外壳已确认，收集暂存和提醒目标见 [Android 当前方向](android-stack.md)。原生模块、后台传输和提醒渠道的具体实现见 [Android 协作提案](../../design/architecture/backend-android-boundaries.md)，尚未冻结接口。

## 依据与验证状态

共享界面于 2026 年 10 月 24 日由用户确认，记为 D016；后续 Android 确认记为 D017。选择理由与 React 对比保存在 [历史研究](../../history/research/ui-framework-comparison.md)，仅在追溯或重新评估时阅读。工程归属见 [目录规划](../development/repository-layout.md)。

已完成共享 UI 与三端 Web 资源构建，并在 Windows Electron 实际进程验证 UI 插件启停和诊断调用。Android APK、独立浏览器端到端流程、性能与完整设备兼容性尚未验证，范围以工程基线为准。

返回 [当前文档索引](../README.md) 或 [总导航](../../README.md)。
