# Recorder 前期全栈比较

状态：历史比较，保留前期分析。原分析与归档日期：2026 年 10 月 24 日。阅读时机：追溯全栈思路，或开始 Web/Android 的细化研究。

当前有效状态看 [技术状态](../../current/technical-status.md)、[后端技术](../../current/architecture/backend-stack.md)、[前端技术](../../current/architecture/frontend-stack.md) 与 [Android 方向](../../current/architecture/android-stack.md)；研究背景看 [后端比较](backend-technology-selection.md)、[Vue 与 React 比较](ui-framework-comparison.md)、[Android 比较](android-client-comparison.md)，活跃方案看 [Android 协作提案](../../design/architecture/backend-android-boundaries.md)。下文的“当前建议”“本轮”均指原分析时点，不用于覆盖后续决定。新研究已补充底层包的公开发布与依赖范围证据；独立运行仍未验证。

本分析以集中后端为前提：核心业务运行在 PC 或远程服务器，Windows、Web、Android 客户端负责界面与设备接入，数据保存在后端。Android 独立离线业务、客户端数据库同步均不作为当前选型要求。需求见 [当前需求](../../current/product/requirements.md)，职责见 [架构概览](../../current/architecture/overview.md)。

## 推荐组合与判断依据

当前组合如下，Windows 是已确认项，其余列为优先候选：

| 层次 | 优先建议 | 推荐理由 |
| --- | --- | --- |
| 后端 | TypeScript、受支持的 Node.js LTS、Cordis 与配套 Loader | 顺着现有插件体系开发，PC 与服务器共用后端实现 |
| HTTP 接入 | Fastify 作为固定 API 门面的主要候选；另比较 Hono 或现有 Cordis HTTP 适配 | 业务组合由 Cordis 管理，网络层承担请求校验、传输和接口暴露 |
| 数据与文件 | SQLite，加后端资料库目录 | 适合个人实例，简化 PC 部署；数据与文件均在后端 |
| 开放协议 | REST 与 OpenAPI，在线状态更新采用 SSE | 各种语言客户端都容易接入，后续自动化和 AI 也可复用 |
| Web | Vue 3、TypeScript、Vite；React 是同等级备选 | 用单页应用承载记录、表单、列表和管理界面，便于复用到外壳 |
| Windows | **Electron，已确认** | 用户将即时唤起、响应性能、维护与扩展置于资源占用之前；Electron 的桌面接口与 TS 维护路径更契合当前取舍 |
| Android | Capacitor 加共享 Web UI；Kotlin Compose 为原生备选 | 当前不需要手机业务后端，复用界面更有价值 |

这是依据项目目标作出的工程判断，没有进行依赖安装、包体积或性能测量。主要由 AI 开发并不使某种框架天然更可靠；减少需要同时维护的语言、运行时和界面实现，是当前建议的重要依据。

## Cordis 后端的两个发行方向

Cordis 负责服务依赖、插件启停、事件和受管理资源的回收。HTTP、数据库、文件、提醒与 AI 仍需要相应实现。Recorder 可将这些能力组织为 Cordis 服务与插件；不要把 Cordis 等同于完整的 Web 后端框架。[Cordis 入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)

| 方向 | 优点 | 代价与边界 |
| --- | --- | --- |
| 上游 `cordis` 与 `@cordisjs/plugin-loader` | 独立产品直接沿用原项目，依赖关系较直观 | 上游提示 API 仍可能变化；不能假定与 Harness 使用的版本行为完全相同 |
| Harness 维护的 `@deepseek-ai/cordis` 及配套 Loader | 更贴近 Harness 的实际实现，包含其维护的生命周期及 Loader 修补 | 版本与该分支发布节奏关联，需成套核对依赖；不自动兼容所有 Harness 业务插件 |

Harness 将 Cordis 源码纳入自身仓库，使用自己的包名并记录本地修改；上游与维护版不能当作任意可互换的同一个发行包。[上游 Cordis](https://github.com/cordiverse/cordis) · [Harness 版本来源与修改](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md)

考虑到用户希望沿用 Harness 已采用的机制，建议优先评估 Harness 维护的成套 Cordis 包，同时保留上游组合。最终选择应核实独立安装、Loader 配合和升级方式，并固定经过验证的一组版本。本轮只核对了官方资料，没有验证具体 npm 版本的独立安装。

独立 Recorder 使用这些底层包，不需要因此引入 Harness 的 agent、会话等全部产品服务。Harness 的 profiles、bundles、patches 是它的产品组合机制，不能认定只安装 Cordis 核心包便拥有全部机制。[Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)

Node.js 与 TypeScript 是当前主线。具体 Node 版本应以选定的 Cordis、Loader 和原生依赖要求为准。音视频转码等耗时处理可在需要时交给后台 worker 或外部工具，不应阻塞 API 请求处理。Bun、Deno 或用另一种语言重写插件核心，当前没有足够收益抵消新增兼容验证成本。

## HTTP 层如何配合 Cordis

| 方向 | 优点 | 代价与适用条件 |
| --- | --- | --- |
| Fastify | Schema 校验和序列化等能力明确，适合稳定的 REST 接口 | 自身也有插件生命周期；业务插件应继续由 Cordis 管理。启动后不能任意追加路由 |
| Hono | 接口简洁，使用 Fetch 风格 API，有 Node 适配器 | 校验与 OpenAPI 等需要配套组合；默认路由器也不能假定支持运行后任意新增路径 |
| Koa | Node 中间件模型直接，便于作为小型 HTTP 适配层 | 路由、校验和接口文档需要更多组装，维护约定更多 |
| 现有 Cordis 兼容 HTTP 服务或 Node HTTP 适配 | 可贴近 Cordis 的生命周期与资源回收方式 | 应核对可复用组件及其依赖，避免自行补齐过多通用 HTTP 功能 |

Fastify 的校验能力与路由注册约束有官方文档和源码依据；Hono 默认 RegExpRouter 在 matcher 构建后也限制继续注册。它们均不会自动把 Cordis 的插件卸载转换为路由注销。[Fastify 校验](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) · [Fastify 路由实现](https://github.com/fastify/fastify/blob/main/lib/route.js) · [Hono 路由实现](https://github.com/honojs/hono/blob/main/src/router/reg-exp-router/router.ts) · [Hono Node 适配](https://hono.dev/docs/getting-started/nodejs) · [Koa](https://koajs.com/)

建议先将固定 HTTP 入口与 Cordis 业务服务分开设计。若以后要求插件在服务运行中新增或移除任意 HTTP 路径，再选择支持回收的路由适配或明确重启生效方式。这是集成与生命周期问题，不能仅凭某个框架名称宣称已经解决。

Harness 自身的 Web 服务使用 Node HTTP/HTTPS 与可注册路由服务，可作为已有设计参考。是否复用其包需要核对依赖边界，不默认搬入完整 Web 应用。[Harness Web 服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md)

## 数据存储和对外接口

| 选择 | 优点 | 代价与建议 |
| --- | --- | --- |
| SQLite 加资料库目录 | 无需另装数据库服务，PC 部署方便；也可放在单台服务器后端 | 并发写入和多实例部署能力需按实际负载评估；附件和数据库需要一致的备份方案 |
| PostgreSQL 加资料库目录或后续对象存储 | 更适合明确的多用户、并发写入和多后端实例需求 | 增加数据库服务、配置及维护；当前不因部署到云服务器就必须选择它 |

多台客户端通过同一个 HTTP 后端访问 SQLite，与客户端直接跨网络打开数据库文件是不同形态。当前推荐前者。未来切换 PostgreSQL 仍需要数据迁移与验证，不能假设使用 ORM 就没有迁移成本。[SQLite 适用场景](https://www.sqlite.org/whentouse.html) · [PostgreSQL 并发控制](https://www.postgresql.org/docs/current/mvcc-intro.html)

托管文件放在后端资料库，数据库保存文件标识与元数据。默认复制来自客户端的文件需要上传；只关联原文件时必须确认后端能访问该文件。音视频上传、后端已保存、处理完成应是不同状态。文本检索可先比较 SQLite FTS5，并用实际中文资料选择分词或子串策略。[FTS5](https://www.sqlite.org/fts5.html)

对外接口建议采用 REST 与 OpenAPI；在线客户端的列表变化、后台任务进度、AI 处理进度可用 SSE。需要持续双向交互时再比较 WebSocket。OpenAPI 有利于生成不同语言客户端，也便于未来向自动化工具开放接口。[OpenAPI](https://spec.openapis.org/oas/latest.html) · [SSE 标准](https://html.spec.whatwg.org/multipage/server-sent-events.html)

SSE 重连并不自动保证断线期间的事件已经持久化或补齐，业务状态需要能够重新查询。桌面和手机均通过后端鉴权；Web 是否同源部署、桌面如何保存连接配置和凭据，需要在接口设计时明确。

## Web 前端

| 方向 | 优点 | 代价与推荐条件 |
| --- | --- | --- |
| Vue 3、TypeScript、Vite | 单文件组件将模板、逻辑、样式组织在一起；官方路由和状态管理路径明确 | 团队仍需约定组件、数据请求和状态边界；若关键 UI 扩展仅有 React 实现，需要另作适配 |
| React、TypeScript、Vite | 用组件与 TypeScript 组织界面；路由、数据请求和组件方案选择灵活 | 需要主动统一库选择与组件约定，避免不同功能采用多套状态和数据请求方式 |
| Next.js、Nuxt 等应用框架 | 可提供更多路由、渲染与构建约定；Next.js 也支持静态导出 | 当前没有明确的服务端渲染或公开内容搜索需求，其额外能力未必值得引入；业务仍应留在 Cordis 后端 |

Vue 的单文件组件与官方工具链、React 的 Vite 构建与路由/数据请求选择均有官方说明。Next.js 能静态导出，不应将其误解为只能部署第二个动态业务服务器。[Vue 介绍](https://vuejs.org/guide/introduction.html) · [Vue 工具链](https://vuejs.org/guide/scaling-up/tooling.html) · [React 应用构建](https://react.dev/learn/build-a-react-app-from-scratch) · [Next.js 静态导出](https://nextjs.org/docs/app/guides/static-exports)

当前轻微倾向 Vue 3：Recorder 主要界面预计是记录列表、详情、表单和管理视图，统一的组件组织方式便于长期维护。这是项目判断，不代表 React 不能实现同样效果，也不代表 AI 使用 Vue 必然更可靠。若后续关键编辑器或 UI 扩展明确围绕 React，选择 React 同样合理。

建议用同一套响应式 Web UI 服务浏览器和支持 Web 的客户端外壳，同时针对桌面和手机设计不同布局。代码共享不要求把桌面界面直接缩小后放进手机。

Web UI 可由后端提供静态资源，也可独立托管；前后端分离指代码与职责边界，并不要求必须使用不同域名或两个动态服务器。PWA 可以增加安装入口，是否缓存资源与是否提供离线业务是两件事。

## Windows 前端

Windows 已确认采用 Electron。下表保留其他方向的比较依据；五项能力详见 [Windows 客户端选型比较](windows-client-comparison.md)，模块边界与协议建议见 [Cordis 与 Electron 协作设计](../../design/architecture/backend-electron-boundaries.md)。

| 方向 | 优点 | 代价与推荐条件 |
| --- | --- | --- |
| Electron 加共享 Web UI，框架已选 | 使用 TypeScript 为主，渲染运行时随应用分发；托盘、快捷键、剪贴板、窗口和原生文件拖出都有官方 API | 自带 Chromium 和 Node，需接受相应分发与资源成本；特殊剪贴板格式仍要适配 |
| Tauri 2 加共享 Web UI，保留比较 | Rust 宿主配系统 WebView，Windows 使用 WebView2；纯客户端无需携带 Cordis 或 Node | 增加 Rust 工具链；目标 WebView2 环境及拖出文件等适配需要验证 |
| C# 与 WinUI 3 或 WPF，保留比较 | 直接对接 Windows 平台，适合深入 Shell、拖放和原生窗口交互 | 增加 C# 与 XAML，难以复用 Web UI，其他平台仍另选 |

Electron 官方提供 `webContents.startDrag` 将文件从 Web 界面拖给操作系统，并提供托盘、全局快捷键和剪贴板接口。这些能力与临时中转目标直接相关。[Electron 文件拖出](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop) · [托盘](https://www.electronjs.org/docs/latest/api/tray) · [全局快捷键](https://www.electronjs.org/docs/latest/api/global-shortcut) · [剪贴板](https://www.electronjs.org/docs/latest/api/clipboard)

Tauri 的窗口与平台能力同样可支持桌面工具；它的拖入事件不等于内置了完全相同的文件拖出 API。原生文件拖出可评估额外插件，例如 CrabNebula 维护的插件，并验证目标应用兼容性。[Tauri 架构](https://v2.tauri.app/concept/architecture/) · [Windows 前置条件](https://v2.tauri.app/start/prerequisites/#webview2) · [Tauri 拖入事件](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/#ondragdropevent) · [文件拖出插件](https://github.com/crabnebula-dev/drag-rs#tauri-plugin)

WinUI 3 和 WPF 的价值在 Windows 原生集成。若未来该部分成为主要体验，可以提高其优先级；当前跨端界面复用目标更支持 Electron 或 Tauri。[Windows 开发路径](https://learn.microsoft.com/en-us/windows/apps/get-started/) · [WPF 拖放](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/drag-and-drop-overview)

用户于 2026 年 10 月 24 日明确：即时唤起与响应性能、可维护性、可扩展性同级，资源占用低一个优先级，随后确认 Windows 使用 Electron。主要依据桌面中转接口和以 TypeScript 为主的维护路径；并非已证明 Electron 比 Tauri 更快。Tauri 保留为资源要求变化或实际性能验证出现问题时的比较方向，当前不并行建设两个 Windows 客户端。

两者均可连接本机或远程后端。桌面一键启动本机后端是部署便利；后端应保持独立职责，避免关闭一个窗口就意外使其他客户端失去服务。后端生命周期策略尚未确定。

## Android 前端

| 方向 | 优点 | 代价与推荐条件 |
| --- | --- | --- |
| Capacitor 加共享 Vue 或 React UI | 复用 Web 界面和 API 客户端，通过插件接入设备能力，必要时补 Kotlin 适配 | 需要手机布局；接收分享、后台传输等能力需逐项确认 |
| Kotlin 与 Jetpack Compose | 直接使用 Android 分享、文件访问、生命周期及通知能力 | 单独维护移动 UI 和构建链，不能直接复用 Web 页面 |
| Flutter | Dart UI 可覆盖多个平台，通过平台通道调用系统能力 | 若其他端继续使用 Web UI，仅 Android 采用 Flutter 的共享收益有限，并增加 Dart |
| Tauri 2 Android | 可共享 Web UI，并沿用 Tauri 工具链 | 需要核对移动插件支持，桌面能力不能默认移植；通常仍有 Kotlin 适配 |
| 响应式 Web 或 PWA | 接入直接，复用程度高，可作为轻量手机入口 | 安装、分享目标、通知等能力依赖浏览器和平台，不宜直接承诺完整 APK 体验 |

当前优先建议 Capacitor；集中后端已移除了手机业务运行时的负担，界面复用收益更加明确。若 Android 逐步成为高频核心入口，且系统接入需求很深，再提高 Kotlin Compose 的优先级。[Capacitor](https://capacitorjs.com/docs) · [Android 原生适配](https://capacitorjs.com/docs/android/custom-code) · [Jetpack Compose](https://developer.android.com/compose)

Flutter 的跨端收益通常需要连同 Web 和桌面 UI 一起评估；在 Windows 已选 Electron 的前提下，仅 Android 使用 Flutter 会增加单独的界面实现。移动端也无需与桌面使用同名外壳，Electron 与 Capacitor 或原生 Android 均可组合。[Flutter 平台集成](https://docs.flutter.dev/platform-integration) · [Tauri 移动插件](https://v2.tauri.app/develop/plugins/develop-mobile/)

接收其他应用分享至 Recorder，需要 Android 分享目标适配。Capacitor 官方 Share 插件主要用于向其他应用分享，不能据此承诺已经支持接收分享。部分已安装 PWA 在支持环境下也可以注册分享目标，仍需目标设备验证。[Capacitor Share](https://capacitorjs.com/docs/apis/share) · [Android 接收分享](https://developer.android.com/develop/ui/compose/sharing/receive) · [Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)

Android 文件选择得到的 URI 并不是远程服务器可直接访问的路径，需要客户端读取并上传。文件选择、传输、后台继续传输、断点续传是不同能力，应分别确认。[Android 文件访问](https://developer.android.com/training/data-storage/shared/documents-files) · [Capacitor 文件传输](https://capacitorjs.com/docs/apis/file-transfer)

## 提醒和临时中转对选型的实际影响

提醒业务在后端，但用户手机收到提醒需要投递和系统展示。SSE 或 WebSocket 适合在线 UI 更新，不保证应用进入后台后的及时送达。Android Doze 会限制后台活动，原生 Kotlin 也不自动免除限制。[Android 后台限制](https://developer.android.com/training/monitoring-device-state/doze-standby)

Capacitor 官方 Android 推送采用 FCM，FCM 依赖 Google Play services。若目标设备无法使用这些服务，需要另外评估可用推送渠道；不能仅按用户所在地区推断手机环境。推送选型独立于 UI 框架，后续应根据实际设备确定。[Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications) · [Firebase 依赖说明](https://firebase.google.com/docs/android/android-play-services)

桌面临时中转需要分别验证文本、图像、文件列表和视频文件。支持图像剪贴板不等于支持资源管理器复制文件；Windows Shell 有不同的数据格式。[Windows Shell 剪贴板格式](https://learn.microsoft.com/en-us/windows/win32/shell/clipboard)

常规文件拖出接口使用本地文件路径。远程附件通常需要先下载到受管理缓存后才能拖出；高级虚拟文件方案另行评估。这样的临时传输缓存不等于客户端独立业务资料库，也不构成已选择离线同步。远程后端的上传与下载耗时不会因更换外壳自动消失。

## 插件体系与前端扩展

| 扩展类别 | 承担什么 | 与 Cordis 的关系 |
| --- | --- | --- |
| 后端业务插件 | 分类、检索、统计、提醒、AI、文件处理 | 使用 Cordis 依赖与生命周期机制 |
| 前端 UI 扩展 | 页面、菜单、视图和配置表单 | 需要明确界面扩展协议；不是后端插件自动生成任意界面 |
| 客户端原生适配 | 剪贴板、文件拖放、系统分享、通知 | 由 Electron、Tauri、Capacitor 或原生平台接口提供，新增原生能力可能需要客户端更新 |

Tauri、Capacitor 的“原生插件”与 Recorder 的“Cordis 业务插件”是不同层次。后端安装业务插件可以增加服务，但不会自动使所有已安装客户端获得新的原生能力。[Tauri 插件开发](https://v2.tauri.app/develop/plugins/) · [Capacitor Android 适配](https://capacitorjs.com/docs/android/custom-code)

Cordis 回收的是它所管理的运行时注册和资源，业务数据保留需要独立契约。Cordis 的依赖和作用域机制也不能自动替代不可信第三方代码的安全隔离；第三方插件执行边界在需要开放时另行设计。[生命周期教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/02-lifecycle-and-effects.md)

具体扩展契约、Windows IPC、统一后端接口及协作流程见 [Cordis 与 Electron 协作设计](../../design/architecture/backend-electron-boundaries.md)。这些接口建议尚未冻结，不因 Windows 框架确认而自动成为全部已决事项。

## Electron 确定后的组合方向

| 组合 | 后端与 Web | Windows | Android | 推荐条件 |
| --- | --- | --- | --- | --- |
| 以复用和桌面能力为主 | Node、TypeScript、Cordis；Vue 或 React | Electron，已确认 | Capacitor | 当前优先建议，集中主要语言和界面实现 |
| 更重视 Android 原生交互 | 同上 | Electron，已确认 | Kotlin Compose | 手机系统接入成为主要价值，接受单独维护移动界面 |

后续选型重点包括 Cordis 成套依赖、共享 UI 框架、实际 Android 设备与提醒渠道，以及扩展操作的网络契约。Windows 继续按 Electron 梳理和验收，其他候选仍待选择。本阶段不创建应用代码或锁定开发排期。
