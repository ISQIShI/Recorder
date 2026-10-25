# Recorder 工程目录与依赖边界

状态：已实现的工程布局，后续按需要演进。更新日期：2026 年 10 月 25 日。

阅读时机：添加文件、拆分模块、配置构建和跨端复用时。用户已授权工程搭建；起步采用同一 Git 仓库、pnpm workspace 和根目录单份锁文件。

## 当前实际结构

```text
Recorder/
  AGENTS.md
  README.md
  package.json / pnpm-workspace.yaml / pnpm-lock.yaml
  backend/          # src/plugins、test、validation/migrations
  desktop/          # src/plugins、preload、renderer
  web/              # src、Vite 入口
  android/          # src、Capacitor 配置、native 原生工程
  shared/
    contracts/      # 框架无关的诊断协议与运行时校验
    client/         # Cordis 服务、Vue 宿主、UI/传输插件、test
  scripts/          # 文档检查、真实 Electron smoke
  docs/
    current/
    design/
    history/
```

| 入口 | 归属 | 何时阅读 |
| --- | --- | --- |
| [项目 README](../../../README.md) | 全项目工程与文档入口 | 首次进入或定位工程时 |
| [backend](../../../backend/README.md) | 独立后端入口、Cordis 服务与业务插件、HTTP、存储 | 后端工作前 |
| [desktop](../../../desktop/README.md) | Electron 主进程、preload、桌面 UI 入口与设备适配 | Windows／桌面工作前 |
| [web](../../../web/README.md) | 浏览器 UI 入口、浏览器适配与 Web 发布 | 浏览器工作前 |
| [android](../../../android/README.md) | Capacitor 壳、手机 UI 入口、Kotlin 和原生工程 | Android 工作前 |
| [shared](../../../shared/README.md) | 跨端契约、客户端接口和 Vue/Cordis UI 插件 | 跨端公共代码工作前 |

同一仓库中的工程目录便于各自构建和发布，并共享契约与组件；目录独立不要求拆成多个 Git 仓库，也不意味着复制三份 Vue 应用或增加多个业务后端。源码和生成的原生工程纳入 Git；dist、node_modules、下载缓存、运行数据与本机 SDK 配置忽略。

## 依赖方向

- backend 可依赖框架无关的共享契约；不依赖任何客户端工程或 Vue 组件。
- desktop、web、android 依赖适用的共享 UI 与客户端契约，通过后端 API 获取业务能力；不导入 backend 的数据库和运行时插件。
- shared 内不同包分别声明用途；数据契约不反向依赖 Vue，Vue 组件经注入接口使用设备能力，不直接引用平台 SDK。
- Android 原生代码遵循同一网络契约，具体类型生成方式未定；不要为了“共享”把 Kotlin 代码强行放入前端 TS 包。

依赖声明以实际 package.json 和 workspace 为准。统一脚本、起步版本及验证范围见 [工程基线](engineering-baseline.md)。发布和 CI 策略尚未实施；客户端不为调用诊断接口而打包整个 backend。

## 插件与运行数据放在哪里

所有能力遵守 [全面插件化](../architecture/plugin-everything.md)。后端插件属于 backend，共享 Vue 扩展属于 shared/client 或对应客户端，本机设备实现属于 desktop/android/web 适配。一个功能可由这些部分配合，不要求整个功能只占一个工程目录；成熟后是否形成独立分发包另定。

数据库、托管附件、Android 暂存、下载副本、凭据和签名材料是运行或构建环境数据，正式路径与管理规则另定。当前默认内存验证库；文件测试使用隔离临时目录；Electron smoke 输出到忽略的 artifacts。不得提交用户资料或凭据。

## 后续扩展

已有源码、依赖、Capacitor/Gradle 配置与检查脚本。后续按真实需要新增业务插件和包，不先创建空功能目录。保留 android/native 的人工修改，不把原生工程当成可随意丢弃的 Web 产物。文档里的未来业务模块仍不代表已实现。

每个工程 README 只保留入口和局部信息；有效架构继续维护在 docs/current，未冻结方案在 docs/design，历史比较在 docs/history，避免复制多套相互冲突的说明。

返回 [当前文档索引](../README.md) 或 [文档总导航](../../README.md)。
