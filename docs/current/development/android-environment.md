# Windows 上配置 Recorder Android 开发环境

状态：配置指引；用户确认尚未安装 Android Studio / SDK，APK 和真机验证待执行。更新日期：2026 年 10 月 25 日。

阅读时机：准备首次构建 APK、连接手机或修改原生能力时。只运行后端、Web 或 Electron 不需要先配置 Android。工程入口见 [android README](../../../android/README.md)，已完成验证见 [工程基线](engineering-baseline.md)。

## 安装与配置

1. 从 [Android Studio 官方下载页](https://developer.android.com/studio) 安装稳定版本。Capacitor 8 官方要求至少 Android Studio 2025.2.1；安装时包含 Android SDK。无需此刻加入 Firebase 或创建发布签名。
2. 在 SDK Manager 安装 **Android SDK Platform 36**、SDK Platform-Tools 和 Gradle 同步所需的 SDK Build-Tools。需要命令行管理时再安装 Command-line Tools；先用真机可以暂不下载模拟器镜像。记下 SDK Manager 显示的实际 SDK 路径。
3. 在 Android Studio 的 Gradle JDK 设置选择 **JDK 21**。优先使用 Studio 已附带的兼容 JDK；如果附带版本不同，再选择或下载 21，不随意修改其他项目的全局 Java 配置。当前 Capacitor 原生库源码使用 Java 21，不能只按 AGP 最低 Java 要求配置。
4. 让 Android Studio 在 `android/native/local.properties` 写入本机 `sdk.dir`。该文件已忽略，不提交用户路径。命令行需要时将 `ANDROID_HOME` 设为该实际 SDK 路径，并将其 `platform-tools` 加入用户 PATH；若已有 `ANDROID_SDK_ROOT`，保持与其一致。

当前生成工程使用 Capacitor 8.5.3、AGP 8.13.0、Gradle Wrapper 8.14.3、compile/target SDK 36、min SDK 24。Wrapper 已在仓库，不需要另装全局 Gradle。升级工具链另做验证，不接受 IDE 建议后直接把所有版本一起升级。应用 ID `dev.recorder.foundation` 仅用于基础验证，正式发布身份与签名以后确定。

依据：[Capacitor 8 环境说明](https://capacitorjs.com/docs/getting-started/environment-setup)（2026 年 10 月 25 日核对）及本工程实际生成的 Gradle 配置、已安装 Capacitor 原生源码。文档核对不等同于本机已经完成环境安装。

## 构建步骤

在仓库根目录，先完成 [工程基线](engineering-baseline.md) 的 Node/pnpm 安装，再运行：

```powershell
pnpm build
pnpm --filter @recorder/android native:sync
pnpm --filter @recorder/android exec cap open android
```

Android Studio 打开的 Gradle 项目应是 **`android/native`**，不是根目录 `android`。等待 Gradle Sync 下载依赖，并按提示安装缺少的 SDK 组件。Web 资源改动后再次 build + native:sync；原生文件是需要版本管理的源码，不要删除重建来覆盖人工修改。

在 Studio 选择 app 配置和设备后 Run。若希望在 PowerShell 构建，先让当前终端的 `JAVA_HOME` 指向所选 JDK 21，再执行：

```powershell
java --version
.\android\native\gradlew.bat -p android/native --version
.\android\native\gradlew.bat -p android/native assembleDebug
```

预期调试 APK 路径为 `android/native/app/build/outputs/apk/debug/app-debug.apk`。这些 Gradle 命令目前**尚未执行成功验证**；只有文件实际生成并可安装后才更新验证状态。失败时保留错误文本和实际 JDK/SDK 版本，先检查 SDK 路径、网络下载和 JDK，避免靠反复升级依赖解决。

## 手机验证

在手机开发者选项开启 USB 调试，用数据线连接，允许该电脑的调试授权。可用 `adb devices` 检查设备是否为 `device`，然后从 Studio 运行。用户提供的荣耀设备和 Google Play 服务信息仍需在真机上核对系统版本、权限与通知表现。

当前 Android 只包含插件验证界面，网络提供者明确标为未配置。即使安装成功，也不代表能保存记录、接收分享、断网暂存或发送提醒。后续验证顺序为：可安装启动 → 受认证保护的真实后端连接 → 分享与持久待提交 → 重试/进程回收 → 提醒权限和断网触发。手机的 `127.0.0.1` 指向手机，不能用它直接访问 PC 后端；正式跨设备入口等认证和 HTTPS 设计落地后再设置。

返回 [当前文档索引](../README.md) 或 [总导航](../../README.md)。
