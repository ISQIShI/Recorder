# Recorder Vue 3 与 React 比较

状态：已完成选型的历史比较。原分析与归档日期：2026 年 10 月 24 日。用户后续已确认 Vue 3 + TypeScript + Vite，当前依据见 [已确认前端技术](../../current/architecture/frontend-stack.md)。

阅读时机：追溯 Vue 的选择理由、查阅 UI 扩展研究证据或重新评估框架时。下文的“当前推荐”“若选 Vue”等保留原分析语境，不覆盖后续决定。已确认约束见 [技术状态](../../current/technical-status.md) 和 [后端技术](../../current/architecture/backend-stack.md)，进程与通信提案见 [Cordis 与 Electron 协作](../../design/architecture/backend-electron-boundaries.md)。原研究未安装依赖、编写应用代码或进行性能测试。

## 1. 当前推荐与适用前提

继续轻微倾向 **Vue 3 + TypeScript + Vite**，React + TypeScript + Vite 同样是可行选择。这个倾向来自 Recorder 独立建设界面、以列表、详情、表单和资料管理为主、初期插件主要自用的条件：统一 Vue SFC 与 Composition API，以及官方路由和推荐状态管理路径，便于形成较少分歧的代码约定。

这不是“Vue 更快”“AI 更擅长 Vue”或“React 不适合插件”的结论。若后续明确要复用 Harness 的 React 前端模块、依赖只能在 React 中使用的关键组件，或把 React Native 作为主要移动路线，应提高 React 的优先级。

Android 外壳尚未选定。以下三端 DOM 界面复用的讨论以 **Capacitor 是候选路线** 为前提；选择 UI 框架不自动确认 Capacitor、组件库、路由库版本或其他依赖。

## 2. 核心比较

| 维度 | Vue 3 | React | 对 Recorder 的判断 |
| --- | --- | --- | --- |
| Electron 与 Web | 同一套 DOM 组件和样式可在渲染进程、浏览器中使用 | 同样可行，采用 React DOM | 能力接近，区别主要在代码组织 |
| Android + Capacitor | Web UI 在原生容器中运行，通过适配调用设备能力 | 同一路线，不要求 React Native | 没有因 Android 而必须选 React 的条件 |
| 组件组织 | SFC 组织模板、逻辑、样式，推荐统一 Composition API | TSX/JSX、组件与 Hooks，适合用代码组合视图 | 两者都需明确项目约定，不能混用多套风格 |
| 路由与共享状态 | Vue Router 与官方推荐 Pinia 有较明确的组合路径 | 可选 React Router 等配套，需统一路由与状态方案 | Vue 少一些初始组合决策；React 选定约定后也能保持一致 |
| 复杂 UI 扩展 | 可注册 Vue 组件，按贡献点挂载 | 可注册 React 组件，按贡献点挂载 | 都支持，需要 Recorder 定义贡献契约 |
| 按需加载 | defineAsyncComponent 等 | lazy、Suspense 等 | 都有手段，不等于插件安装、升级与热卸载 |
| 动态路由与清理 | Router 有 addRoute/removeRoute，响应式资源可用 effectScope 管理 | 可用路由发现或固定扩展页，Effect cleanup 处理组件资源 | Vue 有具体 API 便利；两者都需完整清理协议 |
| 复用 Harness 前端 | 参考其设计可行，直接复用 React 组件需要改写或额外适配 | 减少渲染层改写，但仍需适配产品模型与加载协议 | 只有明确复用这些模块时才构成明显差异 |
| 快捷唤起与持续响应 | 取决于首屏、常驻策略、组件与数据量 | 同样取决于实际实现 | 没有本项目实测，不排名性能 |

Vue 的 SFC、Vite、路由与 Pinia 路径有官方支持；React 官方也提供 Vite 创建客户端应用的路线，并说明路由、请求与缓存需要配套选择。Recorder 已有集中业务后端，因此不因采用 React 就必须增加 Next.js 服务，也不因采用 Vue 就必须使用 Nuxt。[Vue 工具链](https://vuejs.org/guide/scaling-up/tooling.html) · [Vue 状态管理](https://vuejs.org/guide/scaling-up/state-management.html) · [React 客户端应用](https://react.dev/learn/build-a-react-app-from-scratch)

## 3. 三端究竟共享什么

| 层次 | 可共享内容 | 仍需区分的部分 |
| --- | --- | --- |
| 接口与基础逻辑 | 请求/响应类型、错误语义、数据格式化、声明式 UI 描述 | 业务规则和最终校验仍在后端；不把服务器实现打包进客户端 |
| 视图组件 | 记录列表、详情、编辑表单、预览、设置等 | 手机与桌面可采用不同布局，未必复用完整页面结构 |
| UI 壳 | 导航、主题、贡献点、加载和错误状态 | 桌面多窗口、浏览器 URL、Android 返回键和深链 |
| 业务通信接口 | 相同调用语义与状态模型 | Electron IPC 到主进程，Web HTTP，Android 依外壳适配 |
| 设备能力接口 | 选择文件、复制、通知等操作的共同描述 | Electron preload、浏览器权限 API、Capacitor 原生桥分别实现 |

共享组件应调用业务客户端与设备能力接口，避免到处直接引用 Electron 或 Capacitor API。组件也应检查能力是否可用：例如文件拖出是桌面入口，在手机上可替换为分享或下载入口，而不是显示一个不能使用的按钮。

同一份源代码可按目标构建，不承诺三个平台使用完全相同的发布产物。Electron 可以预热轻量输入窗口，Web 需处理浏览器访问与部署，Android 需打包原生工程；多窗口或多设备也不会因为共享状态库而自动共享同一块内存。

界面状态库保存选中项、面板状态和可刷新缓存，不成为业务权威。记录保存以后端确认为准，窗口之间或重连后通过约定事件与查询更新数据。

### Android 路线的实际影响

Capacitor 官方支持 Vue 与 React，并明确包装 Web 页面本身不足以形成良好移动体验。两者都需要处理触摸目标、窄屏导航、软键盘、系统栏、文件和系统分享等适配；不能简单缩小桌面界面。[Capacitor UI 指南](https://capacitorjs.com/docs/getting-started/ui) · [构建工作流](https://capacitorjs.com/docs/basics/workflow)

应用前后台、返回键、深链与系统回收由 Android/Capacitor 生命周期处理，Vue 或 React 的组件卸载不能替代它。恢复时重新查询后端状态；插件结果恢复也不等于自动保存所有未提交表单或提供离线业务库。[Capacitor App API](https://capacitorjs.com/docs/apis/app)

React Native 是另一条路线，主要使用原生 View、Text 等组件；现有 DOM、CSS 和依赖浏览器的编辑器不会自动变成原生控件。React Native Web 将兼容的原生组件模型映射到 Web，也不是任意 DOM 组件转原生的工具。[React Native 组件](https://reactnative.dev/docs/intro-react-native-components) · [React Native Web](https://necolas.github.io/react-native-web/docs/)

React Native 可以嵌入 WebView；Expo 也提供 DOM components，但其 Web 内容仍运行在 WebView 中，跨边界有桥接限制。因此 React 可以减少未来采用 React Native 时的编程模型切换，并共享不依赖 DOM 的逻辑，不能承诺全部现有 Web UI 无缝复用为原生 Android 界面。[Expo DOM components](https://docs.expo.dev/guides/dom-components/)

Ionic Vue/React 都是可选的移动组件方案，Capacitor 不强制使用它们；本轮不把 Ionic 增加为已选依赖。若后续改为 Kotlin Compose，则两种 Web 框架都需要另一套移动界面。[Ionic Vue](https://ionicframework.com/docs/vue/overview) · [Ionic React](https://ionicframework.com/docs/react/overview)

## 4. UI 插件的共同契约比框架名字更重要

建议将贡献描述与组件实现分开。前者可以跨框架，后者通常依赖选定的渲染框架。

| 扩展形态 | 内容 | Vue/React 差异与交付方式 |
| --- | --- | --- |
| 声明式贡献 | 菜单、字段、列表列、操作标识、权限与能力要求 | 两者都能解释同一描述，旧客户端可用已有组件显示新业务的基础入口 |
| 可信组件随 UI 发布 | 复杂编辑器、日历、图表、特殊预览 | 分别编译为 Vue 或 React 组件，在约定贡献点挂载，可按需加载 |
| 发布后独立安装 UI 包 | 第三方组件或不随客户端升级的扩展 | 两者都需另定包来源、兼容版本、依赖解析、缓存、回退与卸载；框架本身不提供完整产品机制 |

当前建议先支持声明式贡献和可信组件模块；是否必须独立热安装仍是开放问题。描述中传递可序列化的数据，不把组件实例、闭包、Vue VNode、React element 或 Cordis Context 当成跨网络契约。复杂组件仍应统一主框架，不为预想中的任意插件一开始同时维护 Vue 与 React 两套宿主。

声明式配置也不应混入任意可执行模板或脚本。未来若确实需要框架混用，可评估 Web Components 或隔离的嵌入视图，但需要额外处理样式、状态、事件和设备接口，不能将它们视为零成本兼容层。

贡献注册表用于组织页面、菜单与操作，不重复实现 Cordis 的依赖注入或后端插件加载。若以后希望前端也使用 Cordis 管理作用域，应核对现有浏览器侧组件的依赖与契约；这个选择仍与 Vue/React 渲染框架分开评估。

### 加载、版本与运行时身份

Vue 异步组件和 React.lazy 解决按需加载组件；Vite HMR 解决开发时更新。Vite 的 import.meta.glob 在构建时生成模块集合，不能直接作为发布后任意插件目录的扫描机制。[Vue 异步组件](https://vuejs.org/guide/components/async.html) · [React lazy](https://react.dev/reference/react/lazy) · [Vite glob](https://vite.dev/guide/features.html#glob-import)

同一宿主组件树中的扩展应使用宿主提供的兼容框架、共享 SDK 与设计系统。组件包按约定 externalize 相关依赖，不能每个包私带一套互不兼容的运行时。Vite library mode 也将 Vue/React 作为应考虑 externalize 的例子。[Vite 库模式](https://vite.dev/guide/build.html#library-mode)

React 官方明确指出重复 React 模块可能导致 Hook 调用错误，重复的 Context 对象也会破坏共享。Vue 同样应保证运行时与注入契约一致，不能由 React 有明确诊断反推 Vue 可以任意混用版本。[React 模块身份](https://react.dev/warnings/invalid-hook-call-warning) · [Context 身份](https://react.dev/reference/react/useContext)

建议记录 UI 契约版本、框架兼容范围、贡献点、所需后端能力与设备能力。不兼容时隐藏或降级对应入口并说明原因；后端安装插件不自动让旧客户端拥有新的组件或原生接口。

### 页面注册与完整卸载

Vue Router 的 addRoute/removeRoute 可用于动态页面；新增路由并不会自动重新匹配当前地址。React Router 也有运行期路由发现能力，不能说 React 只能静态注册。Recorder 还可以使用固定扩展页面入口，再按注册表挂载组件，减少对路由器热修改的依赖。[Vue 动态路由](https://router.vuejs.org/guide/advanced/dynamic-routing.html) · [React Router 路由发现](https://reactrouter.com/api/data-routers/createBrowserRouter#optspatchroutesonnavigation)

Vue 的 app.use 是应用安装入口，没有对应通用 app.unuse；app.onUnmount 对应整个应用。Vue effectScope 可以收集并停止作用域内响应式 effects，但外部 IPC、定时器、上传等仍要清理。React Effect cleanup 和 root.unmount 也不自动清除模块顶层创建的全部资源。[Vue Application API](https://vuejs.org/api/application.html) · [effectScope](https://vuejs.org/api/reactivity-advanced.html#effectscope) · [React Effect](https://react.dev/reference/react/useEffect) · [React root](https://react.dev/reference/react-dom/client/createRoot)

因此扩展停用需要共同流程：停止新的入口调用，处理正在编辑的页面与未提交输入，卸载组件，撤回菜单/路由，取消订阅和其他注册资源。后端 Cordis 的清理函数不会自动跨网络完成客户端清理，也不会删除已保存数据。

同一 renderer 中的 UI 插件共享其执行环境；pluginId、CSS scoped、Error Boundary 或 Electron context isolation 都不自动形成每个 UI 插件的权限隔离。未来引入不可信第三方 UI 时再设计对应隔离与能力协议，两种框架都需要这一步。[Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

## 5. Harness 前端的真实复用价值

Harness 的 Cordis 核心清单没有 Vue/React 依赖，其 Web ui-renderer 则使用 React root 与 slots，并衔接 session/workspace、observable 数据和共享模块身份。选定维护版 Core/Loader 不要求选 React；若明确复用该前端实现，React 才能减少渲染层改写。[Core 清单](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/package.json) · [ui-renderer](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-renderer/README.md) · [Web 客户端架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md)

它的 ui-slots 所称 React-free runtime 不意味着组件类型完全无关，源码仍使用 ReactNode 类型。不能宣称 Vue 组件可以原样注册，也不能宣称选 React 就自动兼容所有 Harness UI 插件。[ui-slots 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/src/index.ts)

当前目标是独立的资料与事务管理产品，没有确认复用 Harness 的会话界面、前端数据模型或客户端加载协议。因此本轮不以“同一后端来源”作为选择 React 的充分理由；未来可先列出实际要复用的模块，再比较适配成本。

## 6. 维护与响应性能

若选 Vue，建议统一 SFC、Composition API、TypeScript，以及一套路由和状态约定。若选 React，建议统一函数组件、TypeScript、路由和请求/状态工具，不随每个功能换一套库。Vue 的初始约定较集中是当前轻微倾向的原因，React 的组合方式也能在约定后保持清晰。

无论哪种框架，都应把后端查询缓存与界面状态分开，不把全部资料塞入一个不可控的全局 store。组件内部的展示计算与表单提示可以在客户端，分类、统计规则和最终权限校验仍在后端。

快捷唤起首先涉及 Electron 宿主与轻量窗口策略。两种 UI 都应按需加载较重编辑器、媒体预览和插件视图，避免输入窗口依赖全部管理页面。选型尚无性能测量，不能从模板语法、包体大小或 React/Vue 名称推导启动和持续响应优劣。

后续若验证，应使用同等生产界面、相同数据与窗口策略，分别观察可输入耗时、列表滚动、输入响应、插件加载及重复启停后的资源清理。Android 使用实际设备检验软键盘、返回、恢复和内存压力；本轮不建立双框架应用或执行这些测试。

## 7. 推荐如何落地与何时改变倾向

| 实际方向 | 建议 |
| --- | --- |
| 独立 Recorder UI，以三端 Web 组件复用、个人维护为主 | Vue 3 + TypeScript + Vite 轻微优先；在确认后统一代码约定 |
| 明确大量复用 Harness 的 React renderer 与配套组件 | 提高 React 优先级，先列具体复用模块与契约差异 |
| 已确认某个不可替代的 React 编辑器、画布或 UI 扩展 | 围绕该具体依赖评估 React，不以笼统生态规模代替核对 |
| 明确采用 React Native 作为主要 Android UI | React 更值得评估，同时计入原生视图重做与适配成本 |
| Android 继续考虑 Capacitor | 两者都能复用 Web UI，移动平台不是决定因素 |

归档说明：用户已选择 Vue 3 + TypeScript + Vite，后续又确认 Android 使用 Capacitor + Vue、按需 Kotlin，有效规则已提炼到 [前端技术](../../current/architecture/frontend-stack.md) 和 [Android 方向](../../current/architecture/android-stack.md)。组件库和 UI 包独立安装机制仍未确认；Android 选型理由见 [历史比较](android-client-comparison.md)。这些确认不扩大应用实现范围。

返回 [历史索引](../README.md) 或 [当前技术状态](../../current/technical-status.md)。
