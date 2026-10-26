# 可选原生插件：第一阶段

本轮属于 P2 实验能力，复用已有 Widget Hub、安装器和桌面卡片。首个插件是官方防休眠组件 `com.pinwall.keep-awake`，默认关闭、用户主动开始、不自动恢复运行。不新增独立服务进程，不扩大 Tauri capability，不改动便签/设置持久化 schema。

## 安装与资源

源码位于 `desktop/resources/widgets/widget-keep-awake/`，随应用打包至 `native-widgets/widget-keep-awake/`；其他官方组件沿用现有资源目录。安装后仍存入 AppData 下的 widgets 目录。

Manifest 新增可选字段 `defaultEnabled` 和权限 `power`。新安装组件按 `defaultEnabled ?? true` 初始化，兼容既有组件；同步已有安装时保留用户的启用选择。防休眠固定为 `false`，安装授权不会启动原生能力。

`type: official` 不能授予原生权限。Rust 在打开会话前校验固定 ID、安装目录及三个入口文件的精确字节，拒绝符号链接、路径逃逸和修改后的组件。更新应用后旧组件内容若不匹配，需要重新安装；UI 提供说明。这是内置可信源机制，不是第三方签名、市场审核或自动更新系统。

## iframe 与消息协议

Widget 入口由宿主读取 HTML，再通过 `srcDoc` 加载。iframe 只授予 `allow-scripts`，保持不透明 origin；宿主仅接受当前 iframe 窗口且 origin 为 `null` 的消息。宿主插入首条 CSP，禁止直接连接网络、外部脚本/样式、子 frame、表单和对象；图片仅允许 data/blob。原有依赖外部资源、同源 DOM、localStorage 或跨文件脚本的本地组件可能需要改为内联资源并使用 bridge。

请求形式：

```json
{"type":"request","version":1,"id":"req-1","module":"power","method":"start","args":[25]}
```

`version` 省略时兼容旧 envelope，未知版本拒绝。入口校验 ID、模块、方法、JSON 深度、参数数量和消息体积；模块再校验方法参数及 manifest 权限。每个 frame 每秒最多 60 个请求、最多 16 个并发，相同进行中 ID 不重复执行。卸载 frame 时中止网络请求、不再回传迟到结果；已经开始的其他 IO 不保证回滚。

原生电源会话 token 只存在宿主闭包中，不进入 iframe、ready payload、store 或日志。`power` 模块只有三个方法：

| 方法 | 参数 | 行为 |
| --- | --- | --- |
| `status` | 无 | 查询 supported / active / endsAt |
| `start` | 整数分钟 1–480 | 创建限时断言；运行中重复调用不延长计时 |
| `stop` | 无 | 释放当前断言 |

ready 事件包含当前语言和 `bridgeVersion: 1`。插件轮询状态仅用于显示，页面隐藏时停止轮询；断言到期不依赖前端计时器。错误返回稳定代码及可重试的中英文提示，不回传原生错误详情或路径。

## Rust 服务边界

- `open_widget_power_session`：仅 main，验证内置安装内容，生成 32 字节随机 token；替换会话前先释放旧断言。
- `widget_power_request`：仅 main，校验 token、枚举动作及分钟范围。
- `close_widget_power_session`：仅 main，旧 token 不能关闭替换后的会话。
- `revoke_widget_power`：仅 main/settings，只能撤销固定组件，不能开始运行。关闭开关必须等待撤销成功；失败保持启用并允许重试。

macOS 使用 IOKit `PreventUserIdleSystemSleep` 和系统 `TimeoutActionRelease`。Rust 持有断言，系统负责到期释放，不启动轮询线程。刷新/销毁主页面、覆盖安装和卸载释放会话；进程退出后由系统回收。释放失败保留状态供重试，系统超时仍有效。其他平台返回 unsupported。

该服务防止空闲系统睡眠，不改写系统电源设置、不执行 shell、不需要管理员权限，不承诺合盖保持运行或阻止用户主动睡眠。

## 扩展顺序与未完成范围

后续能力应按“单独 manifest 权限 → 类型化 bridge → 最小原生命令 → 可撤销生命周期 → 错误/离线状态 → 测试和原生 QA”逐个加入。图片处理、剪贴板、系统监控等能力需独立评估读写范围与资源预算，不能通过通用 shell 权限接入。

本轮不提供第三方原生插件执行、开放市场、更新回滚、插件存储迁移或完整网络代理安全方案。已有网络 bridge 的 DNS/重定向策略、AppData asset scope、原子安装等仍需后续审计。iframe 改造和单个可信电源服务不等同于整个 Widget 体系已完成安全化。

测试入口见 `src/services/widgetProtocol.test.ts`、`widgetPower.test.ts`、`widgetBridge.test.ts`、`src-tauri/src/power.rs` 和 `e2e/widget-power.spec.ts`。真实 Tauri 多窗口、退出和睡眠唤醒仍按 `RELEASE_QA.md` 验收。
