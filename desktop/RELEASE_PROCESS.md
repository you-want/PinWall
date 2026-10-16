# PinWall Desktop Release Process

当前候选版本为 `0.1.4-beta.2`，仅进行 macOS 内测；详细人工步骤见 [BETA_TESTING.md](./BETA_TESTING.md)。旧版本发布说明保留在 `releases/`。

## 自动化边界

- 推送分支或创建 PR 会触发 Desktop CI（Node 22、单测、前端构建、浏览器回归、Rust 测试），不会公开发布安装包。
- Release workflow 只接受 `vX.Y.Z-beta.N` 标签。稳定标签不触发发布，手动 dispatch 也拒绝稳定版本。
- 自动化在标签代码上校验 package.json、Tauri 配置、Cargo.toml、Cargo.lock 版本和 release notes；全部测试通过后，将同一个已验证 SHA 交给构建和草稿任务。
- Tauri 使用 `--target universal-apple-darwin` 合并两个架构后签名，使用 `--bundles app,dmg` 保留应用和生成 universal DMG（只指定 dmg 会在结束时清理临时 .app），校验签名和 arm64/x86_64，并附 SHA256SUMS.txt。不会拆开已签名 DMG 再拼二进制。
- 最终仅创建 **Draft + Pre-release**，不会自动公开，不设为 Latest。重复运行只更新同名草稿，拒绝改动已经公开的 Release。
- 当前使用 ad-hoc 签名，没有公证。应用内 updater 插件未注册、前端入口改为手动下载，公钥占位和无效 endpoint 已移除。恢复 updater 前必须完整验证签名发布链。

## 准备下一版 beta

在新代码提交中同步这些文件，然后再打标签：

- `desktop/package.json`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/Cargo.toml`
- `desktop/src-tauri/Cargo.lock` 中 desktop package 的版本
- `desktop/releases/vX.Y.Z-beta.N.md`

从 `desktop/` 执行：

```bash
node --test scripts/release-preflight.test.mjs
node scripts/release-preflight.mjs v0.1.4-beta.2
pnpm test:run
pnpm build
pnpm test:e2e
cd src-tauri
cargo test --locked
```

本机 `.app` 验证从 `desktop/` 执行 `pnpm tauri:build:app`。这只证明当前本机架构可以打包，不能代替 CI universal 构建或另一个架构实测。

## 推送和草稿

确认版本、代码和说明已经提交到期望 SHA 后，在仓库根目录：

```bash
git push origin werther-71
git tag v0.1.4-beta.2
git push origin v0.1.4-beta.2
```

如果标签已存在，不重建、不移动、不 force push；用新版本 beta.N。GitHub Actions 中可对同一标签 Re-run failed jobs；手动 dispatch 必须输入已存在的 beta 标签，工作流检出该标签，避免用默认分支源码给其他标签打包。

工作流创建的草稿仅维护者可见。CI artifact `macos-beta` 保留 14 天，包含 DMG 与 SHA256SUMS.txt。实机验收完成前不发布草稿。需要分享时，保留 Pre-release、不设 Latest，再有意识地公开附件。

## 正式发布前仍需完成

1. 完成 `RELEASE_QA.md` 中原生窗口、退出重启、升级迁移、Keychain、睡眠唤醒和两种架构验收。
2. 使用真实 Developer ID Application 证书、Team ID、公证凭据；对最终 `.app`、DMG 做签名验证、Gatekeeper 评估、公证和 staple 检查。
3. 建立 updater 签名密钥、公钥、真实更新 feed 和客户端渠道策略，并测试从旧版本升级。密钥仅保存在安全存储/GitHub Secrets，不提交仓库或发送聊天。
4. 完成上述步骤后，另行开放稳定版 workflow，默认先生成草稿供最终审查。

## 回退

保留已经分发版本的标签和安装包。先退出应用；如果跨越设置 schema 迁移，使用升级前备份与原版应用恢复，不直接让旧版覆盖新格式。后续修复使用更高版本标签，不替换已经公开下载的附件。
