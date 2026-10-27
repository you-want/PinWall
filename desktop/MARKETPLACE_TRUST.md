# 第三方插件可信发行

第三方市场是 P2 手动能力，默认关闭、无默认 URL/公钥、不自动联网。官方内置目录仍离线可用。设置 → 实验 → 第三方插件市场：从独立可信渠道核对审核者根公钥，输入公开 HTTPS 目录地址，勾选确认并保存；手动刷新，下载审阅权限，再确认安装。更新复用相同步骤，安装后默认关闭，现有“上一版本回滚”保留。

## 信任协议 v1

目录和包均使用 `{"payload":"BASE64_EXACT_JSON_BYTES","signature":"BASE64_ED25519_SIGNATURE"}`，Ed25519 公钥为 raw32 Base64。先验签再解析，无 JSON 规范化假设。目录根公钥由用户独立配置，不能由服务器自行指定；目录内的发布者公钥只用于验证该目录审核过的包。根签名绑定精确包 SHA256、发布者、ID、版本、名称、描述及有序权限列表。

目录包含 `schemaVersion:1, revision, issuedAt, expiresAt, publishers:[{id,key}], entries:[{id,version,name,description,publisher,permissions,packageUrl,sha256}]`；最多 100 发布者/条目，目录 1 MiB，最长 30 天，允许时钟提前 5 分钟。同一根公钥的最高 revision 和 payload 摘要持久化；拒绝更低版本和同版本内容替换。关闭或换源不会清除水位，最多 32 个信任根。轮换公钥需要重新独立核对；删除本地状态会丢失防回退历史。

包 payload 为 `schemaVersion:1,id,version,files:[{path,data:BASE64}]`。最多 8 MiB 编码包、6 MiB 总解码、128 文件、单文件 2 MiB、manifest 64 KiB、8 层路径；限制资源扩展名，拒绝重复/大小写冲突/文件目录冲突、路径逃逸和可执行原生文件。manifest 必须 community、`defaultEnabled:false`、非 `com.pinwall.*`，且与目录完全一致。只允许 storage/theme/notify/cards/events/app/network/i18n；第三方签名不能获得官方原生工具身份。当前 iframe 仅加载内联单文件入口，多文件可打包供审核，但外部 JS/CSS/图片不会加载，需先打成内联资源。

下载仅公开 HTTPS/443，无 URL 凭据，无代理/重定向；DNS 全部答案必须公开并固定到连接。每次请求有 20 秒超时和流式容量限制，单并发。准备和确认安装都重新获取并验证目录；删除条目/发布者或变更包即撤销后续安装。预览只存内存、两分钟有效，取消/关闭/重载/退出丢弃，迟到下载不能提交。实际安装期间的进程间存储锁与包锁阻止跨进程配置/水位变化越过提交。已原子提交的安装不因迟到取消而撤销。

临时解包在 AppData/native-tools/market-staging 的私有目录进行，正常清除，下次安装清除已退出进程的遗留；不跟随链接。设置和水位位于独立版本化 `native-tools/marketplace.json`，损坏保护/未来版本拒绝复用仓库规则。没有核心卡片 schema 迁移，没有新增 capability。

## 发布与人工审核

工具只用 Node 内置 crypto/fs/http。下面的路径均由操作者明确选择；密钥不能放入托管目录或 Git。`keygen` 不覆盖目录，所有文件输出拒绝覆盖。

```bash
node scripts/marketplace/cli.mjs keygen /chosen/private/publisher
node scripts/marketplace/cli.mjs keygen /chosen/private/reviewer
node scripts/marketplace/cli.mjs package /chosen/widget /chosen/private/publisher/private.pem /chosen/package.pwx
node scripts/marketplace/cli.mjs inspect /chosen/package.pwx /chosen/private/publisher/public.txt /chosen/review-source
# 人工检查解出的全部 HTML/JS、数据处理、权限、网络端点、版权、资源消耗；记录问题并修复后重打包。
# 核对 SHA256，随后才能明确批准这个精确包；签名不能替代代码审查。
node scripts/marketplace/cli.mjs review /chosen/package.pwx example-publisher /chosen/private/publisher/public.txt https://YOUR_DOMAIN/packages/PACKAGE_SHA256.pwx /chosen/approval.json --approve REVIEWER_NAME
node scripts/marketplace/cli.mjs catalog /chosen/private/reviewer/private.pem 1 86400 /chosen/new-catalog.json /chosen/approval.json
```

审核凭据是离线文件，只有审核者持有根私钥。没有互联网写接口或自动批准；投稿通过操作者已有渠道传递待审包和独立核对的发布者公钥。`inspect` 只解出受限普通文件，不运行插件。`review --approve` 必须是人工审阅后的动作，不得批量盲签。

将包放入只含公开文件的 `HOST/packages/<sha256>.pwx`，将新的根签名目录**原子替换**到 `HOST/catalog.json`。每次修改/撤销都生成更大的 revision，重新签名后替换目录；撤销目录仅列出剩余批准条目，空目录用 `catalog ... NEW_CATALOG -`。服务器不保留私钥或审核文件。

```bash
node scripts/marketplace/server.mjs /chosen/public/HOST 8932
```

只读服务绑定 127.0.0.1，供受运维控制的 HTTPS 反向代理使用；只暴露 `/catalog.json` 和 `/packages/<sha256>.pwx`，拒绝写入、任意路径、密钥和符号链接，限制连接/请求/文件大小，禁缓存。客户端不会放行 HTTP/localhost 测试后门。公网域名/TLS、托管账号、根私钥保管、独立公钥分发和真实审核团队均需发行者配置，仓库不编造这些身份。

## 验证与边界

`pnpm test:run` 包含 Node 签名/审核/源站测试（需要本机临时端口）；`cargo test --offline` 覆盖篡改、错钥、权限变化、过期/防回退、路径/容量/撤销，并用 Node 生成的公开测试向量验证 Rust 兼容性，不包含任何私钥。浏览器测试验证显式信任→签名错误→权限审阅→条目变更拒绝→默认关闭安装，仅模拟 IPC。

当前版本没有进程级 Web 插件 CPU/内存硬隔离；opaque iframe/CSP/桥接限制解决权限和来源边界，不能保证恶意无限循环不影响渲染。仅接收经过人工源代码与资源审查的发布者，保持默认关闭，不将此功能描述成允许任意匿名第三方代码的公开执行环境。公网运行、实际 WKWebView 与系统资源预算仍按统一验收清单执行。过期/撤销仅影响新安装，不自动删除已安装离线插件。
