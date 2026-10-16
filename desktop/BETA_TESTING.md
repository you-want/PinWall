# 0.1.4-beta.3 内测操作单

日期：2026-10-16。`beta.1` 因临时应用被清理、`beta.2` 因 lipo 参数顺序错误而未完成发布；本版修复这两处发布流程，旧标签保留。此文档面向项目维护者，按顺序执行即可。当前只生成草稿预发布；实机验收通过后才考虑分享测试包。完整发布门禁见 `RELEASE_QA.md`。

## 1. 检查提交和 CI（约 5 分钟）

1. 打开 https://github.com/you-want/PinWall/compare/main...werther-71 。如果已有该分支 PR，进入现有 PR；否则点击 **Create pull request**。
2. 标题填写 `Prepare PinWall 0.1.4-beta.3 internal beta`。描述可使用仓库 `desktop/releases/v0.1.4-beta.3.md`，并说明真实 macOS 验收仍未完成。PR 不加 AI 或其他人的协作者署名。
3. 等 **Desktop CI / Test and build desktop** 全绿。红灯时打开失败 step，把错误上下文反馈，不跳过门禁。
4. 暂不点击 Merge。合并前完成下方内测；合并时可使用 **Squash and merge**，最终提交作者保持你本人，不添加其他协作者 trailer。已有 Git 历史不改写。

## 2. 取得内测包

1. 打开 https://github.com/you-want/PinWall/actions ，找到标签 `v0.1.4-beta.3` 对应的 **Release** 运行。
2. 按顺序确认 **Verify beta source and tests → Build universal macOS beta → Prepare draft prerelease** 全绿。
3. 在该运行底部 **Artifacts** 下载 `macos-beta`，解压后取得 `.dmg` 和 `SHA256SUMS.txt`。需要登录有仓库访问权限的 GitHub 账号，artifact 保留 14 天。
4. 或以维护者身份打开 https://github.com/you-want/PinWall/releases ，进入 `0.1.4-beta.3` 的 **Draft** 下载附件。草稿只有仓库有权限的维护者可见，不要误以为测试者能打开草稿链接。
5. 打开终端，在解压后的文件夹执行 `shasum -a 256 -c SHA256SUMS.txt`，应显示 `OK`。Finder 选中文件夹后可右键进入该文件夹的终端；不要修改文件名再校验。

若没有标签对应运行：先确认本轮代码已推送，执行 `git ls-remote origin refs/tags/v0.1.4-beta.3` 查看是否已有标签。没有标签时，在确认的提交上执行 `git tag v0.1.4-beta.3` 和 `git push origin v0.1.4-beta.3`。已有标签不覆盖、不移动；失败构建在 Actions 页面使用 **Re-run failed jobs**。若代码需要修正，递增 beta 编号并使用新标签发布修正版本。

本机也可构建 `cd desktop` 后执行 `pnpm tauri:build:app`，产物为 `src-tauri/target/release/bundle/macos/PinWall.app`。本机包仅包含当前架构；它不能替代 CI universal 包和两台架构的实测。

## 3. 安装前备份（约 3 分钟）

1. 从旧版本设置页导出便签。若旧版没有导出入口，先退出应用再执行下一步完整目录备份。
2. 从托盘真正 **退出 PinWall**，不要只关闭设置窗口。
3. Finder 按 `Cmd+Shift+G`，输入 `~/Library/Application Support/com.rain9.pinwall`，复制整个目录到自己保管的备份位置；目录不存在时表示该账户尚无该应用数据。
4. 该目录和历史副本可能含正文、旧密钥，不上传到 issue 或聊天。Keychain 是独立存储，复制此目录不能备份迁移后的密钥。
5. 建议第一次在独立 macOS 测试账户执行，避免拿主要便签做故障/锁钥匙串测试。若要测试旧数据升级，将原版本测试数据留在该账户即可。

## 4. 安装和首次启动（约 2 分钟）

1. 打开已校验的 DMG，把 PinWall 拖入 Applications，确认替换时旧进程已经退出。
2. 启动 Applications 中的 PinWall。本版为 ad-hoc 签名、未公证，macOS 可能阻止启动。
3. 仅当文件来源及哈希确认无误时，在“系统设置 → 隐私与安全性”中使用系统提供的 **仍要打开**。如果系统只报告“已损坏”或没有该入口，记录完整提示并反馈；不要关闭 Gatekeeper 或执行全局安全绕过命令。
4. 打开设置，确认显示 `0.1.4-beta.3`，更新区显示手动下载说明。

## 5. 核心验收（约 15–20 分钟）

每项记录“通过/失败”，失败附复现步骤，不提交真实便签正文、完整个人路径和密钥。

- [ ] 创建两张不同标题的便签；编辑正文和颜色，拖到不同位置。托盘退出后重开，内容和位置都保留；排列仅在主动点击后发生。
- [ ] 新建一张 1 分钟后的提醒，等待通知，点击“知道了”。再等 1 分钟，确认同一提醒不重复；编辑提醒时间到未来后再次触发。便签正文编辑不应重新触发已完成提醒。
- [ ] 把提醒设到 2 分钟后，合上电脑或使用菜单睡眠，过 3 分钟唤醒；确认补检结果、是否重复、通知内容是否正确。
- [ ] 在同一时刻安排两张提醒，记录是否逐条可见；当前通知仍为单槽显示，若覆盖/漏显，作为后续排队修复问题记录，不能勾选为完整队列验收通过。
- [ ] 从设置导出备份，再恢复同一份，确认新增数为 0；使用测试备份中的新 ID 恢复时，打开的便签墙及时显示新卡片，导入提醒默认关闭。
- [ ] 通过托盘和 `Cmd+Shift+Space` 唤出/放回便签墙，空白处穿透正常；卡片、编辑弹窗和重试按钮可点击。
- [ ] 在独立测试账户添加假的 AI / 额度 API key；允许系统钥匙串访问。退出重开后设置仍可读，AppData 的 `pinwall-settings.json` 不含假密钥，只含 `credentialsRef`。测试旧明文迁移时先用旧版建立测试数据，再升级；不要手工改真实主账户 JSON。
- [ ] 系统出现钥匙串授权提示时选择拒绝：设置应提示解锁/允许后重试，便签仍可编辑。随后允许访问并重新加载设置。若系统未弹提示，记为“未测”，不要为了模拟拒绝去删除真实密钥。
- [ ] 两个架构分别完成安装/启动检查：Apple Silicon（arm64）与 Intel（x86_64）。只有一台机器时，另一个架构标为未测。

不要为了模拟写入失败去修改真实 AppData 权限或破坏文件；自动化已覆盖这些错误路径，原生故障注入应单独在隔离环境进行。

## 6. 反馈格式

```text
版本：0.1.4-beta.3
macOS 版本：
芯片：Apple Silicon / Intel
安装来源：CI artifact / Release 草稿 / 本机包
通过项：
失败项：
复现步骤：1. … 2. … 3. …
预期 / 实际：
截图：请隐藏正文、密钥和个人路径
```

发现便签丢失、迁移失败、崩溃或提醒漏显时，停止公开分享，保存脱敏现象并反馈。回退前退出新版本；使用升级前完整目录备份配合原版应用恢复，不让旧版直接覆盖 schema version 2 的设置。

## 7. 合并与后续分发

1. CI 和核心实机验收完成后，在 PR 页面合并。推荐 squash，核对最终提交作者是你的 GitHub 身份；不添加其他作者信息，不改写既有历史。
2. 若只供自己测试，Release 保持 Draft 即可。要让少量测试者下载，可以发布 **Pre-release**，保留预发布标记，不设为 Latest；这会让公共仓库的附件公开可下载，应在确认内测结果后操作。
3. 正式稳定发布仍需 Developer ID Application 证书、Apple 公证、最终 DMG 验证以及真实 updater 公钥/签名产物。这些配置与当前内测分开处理；此时不必购买/上传证书，也不要把密码或私钥发到聊天。
