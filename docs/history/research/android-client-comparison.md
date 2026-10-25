# Recorder Android：Capacitor 与 Kotlin Compose

状态：已完成外壳选型的历史比较。原分析与归档日期：2026 年 10 月 24 日。用户后续已确认 Capacitor + Vue、必要时用 Kotlin 补充原生能力，当前依据见 [Android 技术](../../current/architecture/android-stack.md)。

阅读时机：追溯 Android 外壳的选择理由或重新评估时。下文的“建议”“待确认”保留原分析语境；后续已确认收集暂存与自动重试、尽量准点且短时离线仍触发已有提醒的目标。工作依据见 [技术状态](../../current/technical-status.md)，活跃方案见 [Android 与 Cordis 协作](../../design/architecture/backend-android-boundaries.md)。原研究没有创建应用、安装依赖或执行真机测试。

## 1. 推荐与适用条件

当前优先建议 **Capacitor + 已选 Vue 3 界面 + 必要的 Kotlin 原生接入**。理由是 Recorder 已确定 Electron/Web 使用 Vue，业务又集中在后端；Android 主要需要共享管理界面和可靠的设备入口。沿用组件、表单和 UI 扩展可减少重复实现，同时把分享接收、传输和系统通知交给 Android 侧处理。

这不等于纯 TypeScript 即可完成全部移动功能。Capacitor 仍有 Android 原生工程，复杂设备接入需要 Kotlin/Java、Manifest、Gradle 和生命周期知识。它减少的是重复界面维护，不会消除移动平台维护。

如果后续把 Android 作为首要产品，强调独立的原生采集面板、大量系统入口、复杂媒体交互，并愿意长期维护两套界面，**Kotlin + Jetpack Compose** 会更合适。Compose 是 Android 原生 UI 工具包；分享、传输和推送则由 Android 系统 API 与 SDK 提供，不能将这些能力全部归功于 Compose。[Compose 官方介绍](https://developer.android.com/compose)

用户提供的设备信息为“荣耀 Magic9 超能版，能正常使用 Google Play 服务”。这里按用户描述记录，不据此推断 Android/MagicOS 版本或推送实测结果。FCM 可列为优先验证渠道；提醒时效仍待用户明确。

## 2. 针对 Recorder 的比较

| 维度 | Capacitor + Vue | Kotlin + Compose | 当前判断 |
| --- | --- | --- | --- |
| 界面复用 | 可共享 Vue 组件、样式、表单和 TypeScript 客户端，手机布局仍需适配 | Android 页面另写；可共享 API 契约、设计规范和声明式描述，不能直接执行 Vue 组件 | Capacitor 明显更符合现有界面方向 |
| 快速收集 | 快捷入口可唤起轻量 Vue 收集页；系统入口需原生适配，冷启动涉及 WebView 与 JS 初始化 | 可以直接进入原生收集页，入口、状态与生命周期在一套 Android 实现中 | Compose 路径更直接；实际可输入速度需同场景实测 |
| 接收系统分享 | 原生接收 Intent、取得文本/文件，再桥接到 Vue 确认界面；不能只安装官方 Share 插件 | 同样声明分享目标并解析 Intent，直接更新原生界面状态 | 两者都能做，Capacitor 多一层桥接与就绪协调 |
| 文件后台上传 | 重要传输需原生任务承接，不依赖 Vue 页面持续运行 | 直接使用 Android 任务和传输 API | 系统约束相同；Compose 少一次跨语言状态协调 |
| 提醒通知 | 官方推送/本地通知插件可覆盖基础能力，复杂处理可补原生服务 | 直接接入 FCM、通知 API 和 AlarmManager | 可靠性主要取决于投递设计、权限、网络及系统状态 |
| UI 插件 | 可复用兼容的 Vue 贡献组件；设备能力依赖须检测 | 需 Compose 组件或专门的声明式渲染器；Vue 插件不能直接显示 | 初期以自用插件为主时，Capacitor 维护成本更低 |
| 长期维护 | Web 主体一套，另维护有限的 Android 适配及桥接协议 | Web UI 与 Android UI 两套；Android 内部组织更统一 | 取决于未来有多少页面与入口必须原生化 |

这些是架构成本判断，不是性能测试结果。尚无本项目的冷启动、输入延迟、内存、上传成功率或通知到达率数据。

## 3. 界面复用与插件边界

Capacitor 可以承载已有 Web UI，不强制使用 Ionic。建议共享记录列表、详情、表单、设置和兼容的扩展视图；手机另做导航、触摸目标、软键盘、安全区和返回行为。把桌面页面缩小并不能自动获得良好移动体验。[Capacitor UI 指南](https://capacitorjs.com/docs/getting-started/ui)

Compose 路线仍然连接同一个 Cordis 后端。可以按 API 契约分别实现 TypeScript 与 Kotlin 客户端，也可以让后端提供框架无关的字段、菜单与操作描述；原生渲染器需要另外实现。把 Vue 放进 Compose 的 WebView 虽然可行，但仍是在维护 WebView 和桥接，不能当作 Vue 自动变为原生控件。

建议继续区分三种扩展：

| 扩展层 | 示例 | 在 Android 上的含义 |
| --- | --- | --- |
| Cordis 业务插件 | 订阅管理、分类整理、提醒规则 | 在后端运行，两种客户端通过同一接口使用 |
| UI 扩展 | 订阅列表、记录详情附加面板 | Capacitor 可共享 Vue 实现；Compose 需原生视图或已支持的声明式描述 |
| 设备能力 | 分享接收、快捷入口、通知、传输 | Android 代码随客户端构建发布，不是后端安装插件即可获得 |

后端新增功能后，旧客户端只能使用自己已有的视图与设备能力。UI 包独立热安装、兼容协商和第三方隔离尚未设计完成；本轮不承诺所有插件无须升级客户端便能生效。Capacitor 原生插件可向 JS 提供方法和事件，但桥接本身不代替 Recorder 的业务插件契约。[Capacitor Android 插件](https://capacitorjs.com/docs/plugins/android)

## 4. 快速收集：先选入口，再评估启动路径

建议优先讨论以下入口，并不将它们全部加入已确认功能：

| 入口 | 用户体验 | 两种路线的实现差异 |
| --- | --- | --- |
| 系统分享菜单 | 在浏览器、相册或文件应用选择“分享到 Recorder” | 原生接收层相同；随后进入 Vue 或 Compose 收集界面 |
| 桌面快捷方式／长按图标 | 直接新建文本或进入收集页 | 两者都配置 Android shortcuts；Capacitor 另将目标映射到 Vue 路由 |
| 快速设置磁贴 | 从下拉面板进入收集入口 | 两者都需 TileService；由用户添加，不能假定安装后已出现 |
| 应用内粘贴与选文件 | 打开即输入、粘贴或选取附件 | Vue 用设备适配，Compose 直接接入 Android API |

[Android 快捷方式](https://developer.android.com/develop/ui/compose/system/shortcuts) · [快速设置磁贴](https://developer.android.com/develop/ui/views/quicksettings-tiles)

Android 10 起，一般应用只有处于焦点或作为默认输入法时才能读取剪贴板。两条路线都不能承诺像桌面工具一样持续后台采集。磁贴可以打开收集界面，再由用户粘贴；不应将磁贴后台服务本身当作绕过限制的手段。[Android 剪贴板限制](https://developer.android.com/about/versions/10/privacy/changes)

Capacitor 建议将收集页与完整资料管理页拆开加载，使用随安装包提供的界面资源，使入口呈现不必先等远程页面加载。真正保存仍需要后端确认。若实际测量发现 WebView 冷启动妨碍高频采集，可以只增加一个小型原生收集 Activity，保留其余 Vue 页面；这会增加一块原生 UI，收益需先验证，不自动引入第二套完整客户端。

Compose 省去了这一入口的 WebView/JS 初始化，但自身启动、依赖和界面组织也会影响速度。目前不能给出“必然快多少”的结论，也不应把桌面常驻策略照搬成 Android 永久常驻进程。

## 5. 接收分享与文件传输

Capacitor 官方 Share API 用于**向其他应用分享**。要接收其他应用发来的内容，需要原生接收适配，或另行核验可维护的接收插件。本轮未选择任何社区插件。[Share API](https://capacitorjs.com/docs/apis/share)

Android 侧需声明相应 MIME 类型与 ACTION_SEND / ACTION_SEND_MULTIPLE，解析文本、单附件和多附件，并处理冷启动及已有 Activity 收到新 Intent 的情况。Compose 同样需要这些接入工作；选用 Compose 不会自动注册分享目标。[Android 接收分享](https://developer.android.com/develop/ui/compose/sharing/receive)

建议流程为：**接收内容 → 显示简洁确认页 → 上传附件并调用后端 → 收到后端确认后显示已保存**。分类、业务创建和长期保存仍在后端。Capacitor 的原生侧需在 Vue 尚未就绪时保留待交付事件，避免仅广播一次导致内容丢失；重复投递或重试还需配合后端幂等处理。这些属于待设计契约。

分享文件通常是 content URI，需要客户端使用授权读取后上传；远程后端无法打开这段 URI。部分授权只在有限生命周期内有效。如果要跨退出、重启继续上传，需在授权有效时取得合适的可持久授权，或按明确策略复制为应用私有暂存文件；不能假定所有分享 URI 都支持持久授权。保留时长、空间限制和失败后处理仍待确定。[临时文件授权](https://developer.android.com/training/secure-file-sharing/request-file) · [文档持久授权](https://developer.android.com/training/data-storage/shared/documents-files)

大视频不宜整体编码成字符串经 JS 桥接。候选设计是原生层读文件并传输，Vue 接收文件描述、进度和结果。若需要离开页面后继续上传，应评估 WorkManager 等 Android 任务机制及适合用户主动大文件传输的方案；普通页面请求或原生网络调用都不能单独保证进程回收后继续。WorkManager 可持久调度，但受系统约束，不是无限后台服务或准点计时器。[Android 后台任务](https://developer.android.com/develop/background-work/background-tasks/persistent)

上述设备暂存和传输队列不会使手机成为业务数据库。是否承诺“断网也先收下、稍后提交”，仍是用户待确认的体验选择。

## 6. 提醒：分开决定规则、投递与展示

规则、重复安排和业务状态继续由 Cordis 后端管理。手机只负责已授权的投递与展示；提醒方式不由 Vue 或 Compose 单独决定。

| 路径 | 适用情况 | Capacitor 与 Compose | 实际限制 |
| --- | --- | --- | --- |
| 在线事件 → 界面更新 | 用户正在使用客户端 | 两者都能连接后端 | SSE/WebSocket 不作为后台可靠提醒的唯一渠道 |
| 后端到期 → 推送服务 → 系统通知 | 后端运行、设备有可用推送连接 | Capacitor 官方 Push Notifications 在 Android 使用 FCM；Compose 可直接接入 FCM SDK | 网络、设备状态、权限影响到达，不能承诺精确到点 |
| 后端预先下发触发时刻 → 手机本地定时通知 | 希望已知提醒在短时断网或后端暂时关闭时仍能触发 | Capacitor Local Notifications 或原生 AlarmManager | 需提前成功登记、处理更新/取消与权限；尚未确认是否采用 |

用户已说明 Google Play 服务可用，因此优先验证 FCM 有依据。需要实际确认 token 注册、后端发送、常用网络和锁屏待机到达；能够使用 Play 服务不等于这些环节已通过。若以后面向无 GMS 设备，再评估厂商或其他渠道；改成 Compose 本身不会解决推送渠道缺失。[FCM 接入条件](https://firebase.google.com/docs/cloud-messaging/android/get-started) · [Capacitor 推送](https://capacitorjs.com/docs/apis/push-notifications)

不能把后台提醒依赖于 Vue 的 JS 计时器或回调。Capacitor 文档明确，应用进程被终止时，data-only 推送不会触发其 pushNotificationReceived JS 回调；需要自定义处理时应由原生服务接收。普通后台通知显示与点击后打开记录，应按消息类型和应用状态分别设计。FCM 的及时投递仍依赖系统和网络条件。[Capacitor 后台推送说明](https://capacitorjs.com/docs/apis/push-notifications) · [FCM 投递优先级](https://firebase.google.com/docs/cloud-messaging/android-message-priority)

Android 13 及以上一般通知涉及运行时授权；通知权限、通知渠道设置和精确定时权限是不同事项。两条路线均需处理关闭通知后的状态，不能以更换 UI 技术绕开。[Android 通知授权](https://developer.android.com/develop/ui/compose/notifications/notification-permission)

### 需要准点提醒时的额外选择

推送适合传递新发生的变化，但不提供准点保证。若用户要求日程尽量到点提醒，可评估由后端计算下一批触发时刻、手机交给系统定时通知。Capacitor 有对应插件，Compose 可直接使用原生 API；两者都需面对精确闹钟授权及系统限制。普通非精确闹钟可能延迟明显，不能承诺始终在几分钟内到达。[本地通知插件](https://capacitorjs.com/docs/apis/local-notifications) · [Android 闹钟机制](https://developer.android.com/develop/background-work/services/alarms)

这种方案只缓存后端算好的投递任务，不在手机重新计算续费、重复日程或业务状态。仍需设计提醒标识、版本、时区、修改撤销、设备重启后恢复及与推送的去重。手机离线时无法及时获知已取消的提醒，这是预先登记的取舍。

如果 PC 后端关机，到期时它无法发出新的推送；仅已预先登记到手机的本地提醒可能继续工作。远程后端持续运行则不受本地 PC 关机影响。无论哪种客户端，都不能将通知被关闭、设备关机或用户强行停止应用等情况承诺为一定送达。

## 7. 推荐如何继续选择

| 后续侧重点 | 推荐方向 |
| --- | --- |
| 共享资料管理界面、系统分享到 Recorder、常规通知为主 | 优先 Capacitor + Vue，并明确保留 Android 原生适配层 |
| 只有收集入口需要更轻更快 | 先验证独立轻量 Vue 页面；必要时增加局部原生采集 Activity |
| 大量主要页面都需要原生交互，Android 变成首要产品 | 提高 Kotlin Compose 优先级，接受第二套界面与 UI 扩展实现 |
| 主要担忧后台提醒 | 先确定精度、投递渠道和设备条件；这一项不能单独决定选 Compose |

归档说明：后续已确认外壳、收集暂存和提醒体验目标，已提炼进 current。FCM、定时通知的具体机制、暂存实现和接口仍在协作提案中细化；不提前确定 MVP 或排期。

若进入验证阶段，应在用户实际设备上检查：分享文本/单图/多文件/视频、冷启动和已运行时接收、退出与重试、软键盘与返回；通知覆盖锁屏待机、权限变化、应用进程回收、重启、网络不可达和 PC 后端关机。比较速度以进入可输入/可确认状态为准，不用模拟器打开首页代替真机收集体验。本轮只核对官方资料，以上验证尚未执行。

返回 [历史索引](../README.md) 或 [文档总导航](../../README.md)。
