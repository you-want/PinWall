# 插件源码安全复核记录

日期：2026-10-27。范围为 `desktop/` 的插件加载/Bridge、原生服务、安装存储、网络代理、可信市场、EDR 与特权 helper 接线；属于实现阶段的源码复核和自动化验证，不是独立第三方渗透审计，也未宣称通过真实 TCC/生产签名/设备验证。历史可行性报告保留当时结论，当前范围以 `PLUGIN_ROADMAP.md` 为准。

## 威胁与信任边界

插件 HTML 不可信；manifest 的 `official`、插件提交的 ID、网络内容和本地包路径均不能直接授予原生权限。受信边界是经签名分发的 PinWall 宿主及其随包固定资源。macOS 授权属于宿主，宿主在 opaque iframe 与原生服务之间代为校验。本机同 UID 恶意软件、被攻陷的 Apple 签名链/开发者身份、被篡改的宿主本身不由 iframe 权限解决。

第三方市场只接受经人工代码/资源审查的单文件 Web 插件，不支持匿名任意原生代码。根签名表示审核者批准精确版本，不代表算法无漏洞或具备恶意 CPU/内存硬隔离。受审插件仍可申请明确列出的 cards/network 权限，用户应按实际数据用途决定是否安装；签名不是隐私授权的替代。

## 已复核的链路

| 边界 | 实现与验证依据 | 限制 |
| --- | --- | --- |
| iframe → 宿主 | `WidgetFrame` 仅 allow-scripts、opaque origin；精确 contentWindow + null origin；首条 CSP；版本/ID/JSON 深度/1MiB/参数/权限校验；60 请求/秒、16 并发、进行中 ID 去重；取消不回迟到响应；WidgetFrame/Protocol/Bridge 测试与旧时钟实际浏览器运行 | structured clone/执行插件 JS 本身不受这些请求预算保护；无进程级 CPU/内存上限 |
| 原生权限 | main 标签限制；固定工具 ID + manifest/HTML/icon 三文件逐字节校验、拒绝链接；工具只可打开宿主 UI，路径、OCR/历史正文、屏幕图像及操作 token 不返回 iframe；settings 仅撤销 | 启用状态在宿主 store 和生命周期协调；不把 defaultEnabled 当原生凭据。修改宿主自身不在此模型 |
| 文件/安装/恢复 | manifest 和入口限制、canonical 边界、拒绝符号链接、包大小/深度预算、私有暂存/原子切换/previous 恢复；AppData 独立工具数据版本、损坏备份、未来版本拒写；导出由原生选择、拒绝 AppData/原输入 | 不承诺抵御同 UID 恶意进程在验证和操作间主动替换整个父目录；不把 advisory lock 当文件系统沙箱 |
| 数据并发 | macOS 包锁和每文件 nofollow/flock；原子事务、失败不覆盖；市场授权快照持有数据锁但释放全局 STORAGE mutex，避免安装/卸载锁反转；并发/损坏/链接测试 | 其他平台没有同等 flock 实现，当前产品主线为 macOS |
| 网络 | Rust public DNS 全量验证并固定连接地址；拒绝私网/环回/隧道/凭据 URL、非80/443、代理/重定向；敏感 header allowlist、JSON/流式预算、超时/取消；本地合成服务器测试 | 通用 JSON 代理允许公开 HTTP；可信市场单独要求 HTTPS443。不承诺替代系统防火墙或消除浏览器引擎漏洞 |
| 第三方分发 | Ed25519 验精确 payload 后解析；root 与发布者分离；目录精确绑定 manifest、权限、hash；revision/摘要水位；安装两次重新读取审核目录、防撤销/预览过期、下载/文件预算/原子安装；Node→Rust 兼容向量及篡改测试 | 需真实根密钥、审查人员、HTTPS托管和密钥轮换运维；不自动发布/联网/升级，不分发第三方可执行文件 |
| 原生资源与撤销 | 每服务单操作槽、取消 epoch；无法强制取消的系统任务保留预算直到回调；主页面重载、隐藏/退出与停用接线；音频、Dock、图像、视频、输入、维护各自 DTO/边界/清理测试 | 真实音频、TCC、全局输入和设备资源只能实机验收；开始的文件移动/软件包脚本/信号不承诺撤销 |
| EDR | 单显示器、排除自身覆盖、15fps/4M像素/4096边长/单GPU任务；开始与停止均持有未完成预算；会话/锁屏/睡眠/权限/热/无帧停；纯几何合成测试 | 仍需真实 HDR 显示器，镜像存在延迟和清晰度限制；系统停止失败会阻止重开，要求退出 |
| root helper | 固定双向 TeamID/identifier/Apple链/DeveloperID Application证书类型 XPC requirement、控制台 UID逐请求复核、v1有界消息、无任意命令/路径/键；确认/时长/电源/温度/风扇类型和转速限制；5秒租约、恢复日志优先、恢复失败重试、异常重启恢复 | 没有真实签名/注册/SMC/lid实测。SMC覆盖有限；合盖powerd标记非per-client，不支持与其他控制工具共存保证 |

## 本轮审查修复

- XPC requirement 设置失败、拒绝非控制台 peer 时，先配置空 handler、resume 再 cancel，避免释放 suspended connection 导致进程 trap。
- journal 写入失败后的恢复若再次失败，保持所有权并启动 watchdog；不留下无重试的恢复状态。
- 超期 status 先恢复，不允许通过迟到 heartbeat 续租；会话切换断开控制，系统主动睡眠/唤醒执行恢复且不 veto 睡眠。
- 注销先 retire，恢复未确认时不注销；原生提交前 compare-exchange epoch，撤销后排队的注销不能重新生效。等待批准也可取消注册。
- 风扇控件只将固定 mode/target 数据类型匹配的设备标为可控；不覆盖其他工具的 manual 模式。
- EDR 计时使用单调 uptime；系统停止失败保留预算并给可见错误。截图临时隐藏墙也执行显示/硬件撤销，不依赖只在关闭窗口触发的事件。

上述 helper 变更由 universal `-Wall -Wextra -Werror` 编译及 56 项全机器 IO 替身自测验证，包含恢复失败、日志先于修改、续租到期、会话撤销、睡眠与 retire/resume。没有启动 root 入口或真实硬件操作。打包器还校验宿主与 helper 的固定标识、相同 Team ID、严格签名和嵌入 helper 各架构的签名代码摘要；生产签名路径尚待有身份时执行。

## 发行前仍需的证据

按 `PLUGIN_ACCEPTANCE.md` 和 `RELEASE_QA.md` 执行真实 WKWebView、授权拒绝/撤销、多显示器、资源释放、两种架构和设备测试；按 `HARDWARE_TOOLS.md` 提供 Developer ID/公证并验证注册/恢复/移除；按 `MARKETPLACE_TRUST.md` 配置真实审核根与 HTTPS。生产原生 CPU/RSS/唤醒/能耗和资源销毁记录见 `PLUGIN_PERFORMANCE.md` 的待填表。当前不具备将这些待执行项标为通过的证据。
