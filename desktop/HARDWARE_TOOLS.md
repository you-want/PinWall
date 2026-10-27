# 显示增强与受限硬件助手

这两项均为 P2 实验能力，默认关闭、不自动开始，不改变便签或设置 schema。普通安装包不附带特权助手，不注册系统服务。当前代码已实现，真实签名安装、HDR 屏幕及兼容 SMC 设备的结果必须按 `PLUGIN_ACCEPTANCE.md` 单独验收。

## EDR 显示增强

“显示增强”使用 macOS 14+ 的 ScreenCaptureKit 采集用户明确选择的一个显示器，排除自己的覆盖窗口，再用 CoreImage 曝光增益和 RGBA16Float / extended linear sRGB Metal 图层显示。它不是写系统亮度，也不保证固定物理 nits；系统、面板、环境光、供电和热状态仍决定实际 EDR 余量。SDR/无余量显示器拒绝开始。

打开只列举屏幕，不申请录屏权限；确认并点击开始后才请求采集。增益 1.05–2.0 且不超过屏幕潜在余量，15–300 秒，15fps、最多 400 万像素、单边最多 4096。采集队列深度 3、最多 2 个 drawable、同时一个 GPU 任务，丢弃积压帧。镜像会降低锐度并增加延迟，不用于色彩校准或高保真视频工作。不采集音频、不保存帧、不上传。

关闭面板、隐藏/送回桌面层、停用、卸载、刷新墙和退出均停止；锁屏、会话切换、睡眠、显示器变化、失去权限、严重热压力、余量不足和五秒无帧也停止。原生开始/停止未确认完成时保持繁忙门槛；停止错误显示 `display_cleanup` 并禁止重开，必须退出后再试。不会以清空句柄冒充系统资源已释放。

## 硬件支持与边界

“风扇与合盖”要求 macOS 14+、同 Team ID 的 Developer ID Application 签名宿主与 helper、系统批准、可读取温度及兼容硬件。普通 ad-hoc 包会显示签名缺失，不能注册助手或控制硬件。Apple Silicon/Intel 都编译 helper，但不代表所有机型可写 SMC：无风扇设备、不同 SMC 键/格式、无可读温度或系统拒绝的设备均不支持；不伪造读数或成功。

- 风扇只识别最多四个 `F0`–`F3` 的固定键；mode 必须为 `ui8`，target 必须为 `fpe2` 或 `flt`。不接收调用方指定键，不写全局 `FS!` 掩码。每次控制一个风扇，目标至少为 max(1000、系统最小、开始时当前转速)，最高不超过系统最大且 ≤12000 RPM，不覆盖已手动控制的风扇。运行中恢复自动模式，而不是强制旧转速。
- 合盖通过 IOKit root-domain 的 `kPMSetClamshellSleepState` 暂时禁用合盖睡眠，并附加带超时释放的普通电源断言。该内核状态属于 powerd 标记，**并非按客户端隔离**；开始前拒绝已禁用合盖睡眠的设备，但仍不能保证其他软件同时修改此标记的兼容性。不要与其他合盖控制软件同时使用；不写 `pmset disablesleep` 或持久系统偏好。
- 仅接电、起始温度在 0–60°C（不含端点）、系统热状态低于 serious 才允许，15–300 秒，面板每秒给拥有者续五秒租约。截止、五秒失联、连接断开、用户切换、主动睡眠/唤醒、温度不可读/≥75°C、断电、严重热压力均恢复。温度来自有限固定传感器，不能替代系统的完整热管理或保证设备安全；必须通风、有人看管，合盖时不能放进包中。

## 签名打包

只编译 universal helper 并执行全部 IO 替身自测（无需管理员权限，不注册服务、不改硬件）：

```bash
pnpm test:hardware
```

生产打包需要已安装的真实 Developer ID Application 身份：

```bash
PINWALL_HARDWARE_SIGNING_IDENTITY='Developer ID Application: Your Organization (TEAMID)' pnpm tauri:build:hardware
```

脚本先编译 arm64+x86_64 helper，执行合成自测，使用 hardened runtime 签名并核对 Team ID；通过临时 Tauri override 把 helper 与固定 plist 放入 app 的 `Contents/Library/HelperTools/`、`Contents/Library/LaunchDaemons/`，使用同一身份签宿主，校验严格签名、标识、Team ID 和 helper 各架构签名代码摘要。脚本不运行 root 入口、不注册 daemon。普通 `pnpm tauri:build:app` 不打入 helper。正式分发另按 `RELEASE_PROCESS.md` 公证，不能把 ad-hoc 验证当作生产签名验证。

固定身份：宿主 `com.rain9.pinwall`，helper/Mach service `com.rain9.pinwall.hardware-helper`。更换产品签名身份必须同时修改客户端、helper、plist、打包器并重新审核，不能只替换环境变量绕过校验。尚未提供真实签名身份，因此真实签名打包/注册尚未执行。

## 安装、使用和移除

1. 将真实签名且完整的 app 放到最终安装位置。安装官方组件，审阅高风险权限并启用；这一步不注册服务。
2. 打开面板，单独勾选注册同意并点击注册；通过 macOS 的系统设置批准后台 daemon，回到面板刷新，直到状态已启用，再刷新硬件读数。
3. 只在专用测试设备上，核对电源、温度和风扇模式，选择时长、转速或合盖，勾选本次同意后开始。恢复按钮可提前结束；关闭面板也断开连接恢复，正常确认应在五秒租约内完成。注册/系统批准不可省略。
4. 停用或卸载组件会断开控制，但**助手注册属于单独系统安装状态**，不静默移除。停止后在面板点击“停止控制并移除助手注册”；助手先恢复并进入 retire 状态，再注销。等待系统批准时也可撤销注册。若注销失败，保持停止，重新显式注册可 resume 后重试。
5. 最终移除 PinWall app 前先移除助手注册。恢复失败时禁止注销，不手动删除恢复文件。重新安装组件可再次打开面板进行恢复/注销。

## 特权边界与恢复

XPC v1 仅接受有界 JSON 和固定 service/status/register/unregister/fan/lid/stop 动作；内部 retire/resume 仅用于注销流程。不存在 shell、任意命令、路径或 SMC 键接口。双向 peer requirement 校验固定 code identifier、Apple 签名链、Developer ID Application 证书类型与同一 Team ID（开发证书也拒绝）；还要求当前控制台非 root 用户，逐请求及活动 watchdog 复核会话。客户端四秒 IPC 超时断开连接；撤销 epoch 拒绝迟到注册/注销及排队操作。

root helper 的恢复日志为 `/var/db/com.rain9.pinwall.hardware/state.json`，schemaVersion 1，只有本次拥有的 fan index / lid 标记，无输入、路径或私密内容。目录 root:0700、文件 root:0600，拒绝符号链接、非普通文件、多硬链接、超大文件、未知版本或损坏 JSON；写临时文件、fsync、rename，再实际修改硬件。它与 AppData 分离，仅已批准的 root helper 写入，不授予 Web 插件文件访问权。

恢复失败保留所有权和日志，禁止新控制并每秒重试。KeepAlive 让异常终止后的 helper 重启读取日志并恢复，**不会自动重开控制**；它不是强杀后即时恢复的保证。没有活动控制/恢复时不定时采样，仅在主动状态请求时读取硬件；电源事件监听保留。正常 SIGINT/SIGTERM 先恢复再退出，显式系统睡眠不被 veto。

若提示 recovery：保持通风、接电，重试恢复，保留助手注册及日志供恢复；必要时先重启设备并由发行方核对系统自动控制，再排查 root 日志。日志损坏/未来版本时 helper 拒绝启动，不能自动猜测键或覆盖文件；需要维护者结合原日志备份、设备状态和签名版本处理。不要直接删除日志来解除阻断。

## 验证范围

自动化覆盖输入/范围、精确资源身份、DTO、确认/错误/关闭流程、EDR 纯几何预算；helper 以全部机器 IO 替身覆盖策略、类型、journal-before-write、恢复失败重试、租约到期、会话撤销、睡眠和 retire/resume。没有录制真实屏幕、运行 root helper、写 SMC、修改合盖或安装系统服务。真实签名、TCC、EDR 效果、恢复时序、设备和双架构兼容仍按统一清单执行。
