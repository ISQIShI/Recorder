# Recorder Windows 客户端选型比较

状态：历史选型依据；用户已确认 Windows 使用 Electron。更新日期：2026 年 10 月 24 日。阅读时机：解释选择理由，或约束变化需要重新评估时；日常工作无需重读比较。

本比较面向 Electron 与 Tauri 2，依据 Recorder 的集中后端、主动收集和未来桌面临时中转需求。用户已明确：即时唤起与响应性能、可维护性、可扩展性处于同一优先级，资源占用低一个优先级。本轮核对官方资料与相关源码，没有编写应用代码或执行性能测试。

## 当前选择

用户已确认 **Windows 使用 Electron**，Tauri 2 保留为需求变化时的比较资料。理由是 Electron 对文件剪贴板、富文本和原生文件拖出的直接支持，以及与后端、共享 Web UI 一致的 TypeScript 维护路径。这个选择不代表已经测得 Electron 比 Tauri 更快，也不锁定 Electron 的具体版本。当前依据见 [技术状态](../../current/technical-status.md)，模块与通信见 [协作提案](../../design/architecture/backend-electron-boundaries.md)。

两者都能支持托盘和快捷唤起，普通文本、截图收集也不是决定性差距。Tauri 的主要价值是使用精简的 Rust 宿主和系统 WebView；当资源预算成为硬约束，或已有成熟 Rust 适配能力时，可以提高其优先级。

后端 Cordis 独立运行，无论桌面选择哪个框架，都可以连接本机或远程后端。桌面 Electron 自带 Node 不等于业务后端必须放在 Electron 主进程中；Tauri 也不需要因为后端用 Node 就额外嵌入同一后端。

## 五项差异概览

| 维度 | Electron | Tauri 2 | 对 Recorder 的影响 |
| --- | --- | --- | --- |
| 常驻资源 | Node 主进程与 Chromium 相关进程，运行时随应用分发 | Rust 宿主与 WebView2 相关进程，通常使用系统运行时 | Tauri 有控制宿主与分发负担的空间；内存和 CPU 需要按相同页面与生命周期实测 |
| 快捷唤起 | 主进程全局快捷键、托盘和窗口接口 | Rust handler、托盘和窗口接口 | 基本能力都满足；热唤起策略比框架名称更重要 |
| 剪贴板 | 当前 API 覆盖文本、HTML、图片、现有文件列表及原始格式 | 官方插件支持文本、图片读写和 HTML 写入；部分格式要扩展 | 基础主动收集均可；内容类型扩大时 Electron 集成工作较少 |
| 拖入拖出 | 文件拖入与官方原生文件拖出接口 | 官方拖入事件；拖出可用额外插件或原生适配 | 临时中转中的文件取用更偏向 Electron；Tauri 需要额外验收组合行为 |
| 插件与维护 | 可用 TS/JS 组织更多设备接入逻辑；原生模块仍有构建成本 | TS UI 配 Rust 宿主，原生能力可通过插件扩展 | 后端 Cordis 能力不受影响；差别主要在客户端接入层与工具链 |

## 常驻资源与运行时

Electron 的主进程运行于 Node 环境，页面有 Chromium 渲染进程，另有相关辅助进程。Tauri Windows 使用 Rust 宿主与 WebView2，WebView2 本身也包含浏览器、渲染、GPU 等进程。[Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model) · [Tauri 进程模型](https://v2.tauri.app/concept/process-model/) · [WebView2 进程模型](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model)

Tauri 通常无需把整个 WebView2 运行时打入每个应用，但共享运行时安装不等于所有应用共用同一套进程或不消耗浏览器内存。微软将 WebView2 进程组与用户数据目录等因素关联。若设备缺少运行时，或采用固定版本分发，还要计算相应安装成本。[WebView2 分发模式](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)

因此应分别比较安装体积、常驻内存、空闲 CPU 和操作延迟。不能用安装包大小推导运行内存，也不能用 Rust 宿主语言推导 Web UI 必然比 Electron 快。两者的页面开销都会受到 DOM 数量、图片视频预览、定时任务和窗口数量影响。

| 常驻策略 | 收益 | 代价 |
| --- | --- | --- |
| 隐藏界面并保留页面 | 已加载的输入框和界面可快速恢复 | 页面资源继续存在，需要暂停不必要的后台工作 |
| 销毁页面，只保留托盘和快捷键宿主 | 可以释放页面资源 | 下次打开要重建页面，实际释放与恢复成本需测量 |
| 轻量收集界面预热，完整管理界面按需加载 | 兼顾高频收集与偶尔整理 | 多窗口本身也有开销，不能假定拆成两个 WebView 一定更省 |

隐藏窗口不等于销毁页面。Electron 在窗口销毁后会结束对应渲染进程；保留页面时应控制后台工作。WebView2 虽有挂起能力，也不能据此认定 Tauri 默认自动启用了它。[Electron 页面可见性](https://www.electronjs.org/docs/latest/api/browser-window#page-visibility) · [WebView2 挂起接口](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.trysuspendasync)

按用户最新偏好，建议优先考虑预热轻量收集界面，不为降低空闲占用而默认每次销毁并重建。具体是否独立窗口留待交互设计。

## 快捷唤起与响应速度

Electron 的全局快捷键由主进程注册；Tauri 的官方快捷键插件支持 Rust handler。两者都能让快捷键和托盘入口由常驻宿主处理，不依赖可能被隐藏、节流或销毁的页面脚本。[Electron 快捷键](https://www.electronjs.org/docs/latest/api/global-shortcut) · [Tauri 快捷键](https://v2.tauri.app/plugin/global-shortcut/) · [Tauri 托盘示例](https://v2.tauri.app/learn/system-tray/)

应把以下三种耗时分开：

- 按下快捷键到窗口出现并能输入。
- 窗口出现到列表或远程资料加载完成。
- 提交内容到后端确认保存成功。

第一项最接近即时唤起体验；后两项还包含后端和网络等待。建议先恢复可交互界面，再异步获取业务数据；若是快捷键收集当前剪贴板，可由设备宿主取得输入并提交后端，界面展示传输状态，保存成功仍以后端确认为准。

快速入口应避免加载完整管理页面的全部编辑器、统计和媒体预览。大文件上传、视频处理、索引和 AI 任务不应阻塞窗口与快捷键处理。这里的界面状态与输入适配不构成客户端独立业务后端。

快捷键占用和窗口前台焦点限制是 Windows 共同边界。两种框架都需要检查注册结果、允许改键，并验证托盘、最小化恢复、多屏和输入焦点行为。[Windows 热键](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey) · [前台窗口限制](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)

## 剪贴板能力

以下表格比较截至本次核对的官方接口覆盖，不是对任意旧版本的承诺。

| 输入或能力 | Electron 当前接口 | Tauri 2 官方 clipboard-manager |
| --- | --- | --- |
| 纯文本读写 | 支持 | 支持 |
| 截图像素与图片读写 | 支持 | 支持 readImage 与 writeImage |
| HTML 富文本读写 | 支持 | 支持 writeHtml；没有对应 readHtml 入口 |
| 从资源管理器复制的现有文件列表 | 支持原生文件列表映射 | 未提供对应文件列表 API，需要扩展 |
| 操作系统自定义格式 | 提供原始格式通道，解释具体格式仍需适配 | 官方插件没有通用原始格式入口 |
| 剪贴板变化监听 | 没有直接的 clipboard change 事件接口 | 官方插件没有 change/listen 接口 |

Electron 当前 ClipboardItem 的文件 URI 列表会映射到 Windows 的原生复制文件格式。已核对 v45.0.0 的对应源码，因此不应继续使用“Electron 读取复制文件必定需要第三方模块”的旧概括。最终实现仍需按选定版本确认 API。[Electron ClipboardItem](https://www.electronjs.org/docs/latest/api/clipboard-item) · [固定版本实现](https://github.com/electron/electron/blob/v45.0.0/shell/browser/api/electron_api_clipboard_item.cc)

Tauri 官方插件明确有图片读写，基础截图收集不需要因此淘汰 Tauri。HTML 读取、文件列表和其他格式可以通过额外插件或 Rust 与 Windows 接口扩展，代价是增加适配与维护工作。[Tauri 剪贴板 API](https://v2.tauri.app/reference/javascript/clipboard-manager/) · [官方插件源码](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/clipboard-manager/guest-js/index.ts)

“截图像素”“复制一个 PNG 文件”“复制含格式的网页内容”是不同输入，需要分别验证。已有文件列表也不同于邮件附件等虚拟文件对象，后者的格式支持另作评估。[Windows Shell 数据格式](https://learn.microsoft.com/en-us/windows/win32/shell/clipboard)

当前以主动放入为主，可在快捷键触发时读取一次，不必持续轮询剪贴板。若以后要求自动监听，两者都可增加 Windows 剪贴板更新通知等原生接入；监听方式需要单独设计。[Electron 剪贴板接口](https://www.electronjs.org/docs/latest/api/clipboard) · [Windows 剪贴板监听](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-addclipboardformatlistener)

## 文件拖入与拖出

| 场景 | Electron | Tauri 2 |
| --- | --- | --- |
| 从资源管理器拖入现有文件 | 可使用 DOM 文件拖放并通过宿主取得必要信息 | 官方原生拖放事件可提供文件路径和位置 |
| Web 界面内部 HTML5 拖放 | 按 Web 交互设计 | Windows 下需注意原生拖放配置与 HTML5 事件的关系 |
| 把现有文件拖出到资源管理器或其他应用 | 官方 webContents.startDrag | 可用社区维护的 tauri-plugin-drag，或自行做原生适配 |
| 从远程后端拖出附件 | 常规方案先准备客户端本地副本 | 常规方案同样需要客户端本地副本 |

Electron 的原生文件拖出是官方直接提供的能力。Tauri 可采用 CrabNebula 维护的 drag-rs/tauri-plugin-drag；这属于额外依赖，不表示 Tauri 无法实现拖出。[Electron 文件拖出](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop) · [Tauri 拖入事件](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/#ondragdropevent) · [drag-rs](https://github.com/crabnebula-dev/drag-rs)

Tauri 官方配置说明，在 Windows 上启用默认原生拖放处理会替换 WebView2 的拖放 handler；使用 HTML5 拖放需调整 dragDropEnabled。文件拖入、内部列表拖放和文件拖出应组合验证，不能只分别检查 API 是否存在。[Tauri 拖放配置](https://v2.tauri.app/reference/config/#dragdropenabled)

远程附件通常先下载到受管理缓存，再把客户端本地路径交给拖出接口。Windows 另有虚拟文件或延迟提供内容的方案，但需要额外原生适配与兼容验证。后端文件路径不能直接作为另一台客户端的本地文件路径。

临时中转体验还取决于目标软件对文件类型和拖放数据的支持。应按用户实际使用的软件验收，不承诺某个框架能让所有应用接受任意内容。具体临时中转功能仍属于后期插件方向。

## 插件扩展与维护

| 层次 | Electron 与 Tauri 的差异 |
| --- | --- |
| 后端 Cordis 业务插件 | 两者通过相同 API 调用，桌面外壳不决定后端可扩展性 |
| Web UI 扩展 | 两者都可承载共享 Web UI，但页面、菜单、配置表单的扩展协议需 Recorder 自己定义 |
| 已有原生能力的使用 | Electron 可用更多内建 API 直接组织 TS 逻辑；Tauri 通过命令、插件及 capability 暴露能力 |
| 新增原生能力 | Electron 可能需要原生 Node 模块；Tauri 通常增加 Rust/平台代码，两者都涉及构建与分发 |

Electron 可以使宿主、UI 和后端主要使用 TypeScript，减少跨语言维护。不过原生 Node 模块可能需要为 Electron 的 ABI 重建，不能将其视为所有扩展都能纯 JS 即插即用。[Electron 原生模块](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

Tauri 用 Rust 承载原生接入，权限与能力暴露有明确机制，适合把设备适配组织成较小模块。但增加原生插件通常要编译并更新客户端。运行时启用已编译的能力，与下载任意新 Rust 插件直接执行是不同问题。[Tauri 插件开发](https://v2.tauri.app/develop/plugins/) · [Capabilities](https://v2.tauri.app/security/capabilities/)

建议两者均提供有限、明确的设备接入接口，例如取得用户选择的输入、准备拖出文件和展示窗口。前端扩展使用这些接口；后端处理数据与业务。后端安装 Cordis 插件不会自动给旧客户端增加新的原生能力。

## 选择理由与重新评估条件

根据当前偏好，Electron 的直接桌面接口与 TS 维护路径比潜在的体积优势更符合 Recorder。建议采用以下设计方向作为后续评估依据，而非本轮实现承诺：

- 快捷键与托盘在常驻宿主处理，界面保留轻量可交互状态。
- 完整资料管理、媒体预览等较重界面按需加载。
- 主动读取剪贴板，暂不为默认体验加入持续轮询。
- 上传和保存状态由界面反馈，业务完成以后端确认为准。
- 后端进程独立管理，关闭桌面窗口不默认结束其他客户端需要的服务。

如果真实测量显示 Electron 的唤起或持续响应无法满足目标，且问题来自宿主或渲染运行时，而非页面、后端或网络，应重新比较 Tauri；如果后来资源预算成为硬约束，也应提高 Tauri 权重。不能在尚无测量时把 Tauri 的低占用潜力直接替代速度结论。

## 后续公平验证方式

本轮不编写验证程序，先记录评估口径：

1. 同一台 Windows、相同生产页面、数据量和窗口大小，关闭 DevTools 与开发服务器。
2. 分别比较首次启动、隐藏后的热唤起、销毁页面后的重建；不混用三种状态。
3. 记录按键到可输入、远程数据可用、后端保存确认三个时点，分别判断原因。
4. 同时统计宿主与关联的浏览器、渲染、GPU 等进程；固定内存口径，避免遗漏子进程或重复计算共享页。
5. 客户端与后端分别计量，再报告本机整体占用；不能让其中一组包含 Node 后端、另一组排除它。
6. 连续多次收集文本、截图和文件，拖入与拖出到实际目标应用，观察高分位延迟和长时间使用后的稳定性。

这些测量可用于后续验收和有必要时的重新评估；当前 Electron 选择已经确认，不要求先完成双框架实现。测量不替代用户对交互体验的验收。[WebView2 性能建议](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance)
