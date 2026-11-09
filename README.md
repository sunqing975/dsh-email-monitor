# dsh-email-monitor

[English](README.en.md)

基于 [dsh-email](https://github.com/STARDUSTLC666/dsh-email) 的 DSH 多邮箱助手，新增后台邮件监控：新邮件自动创建 AI 会话，生成中文摘要、待办事项和回复建议。

## 邮箱支持范围

产品聚焦两条流程：**新邮件自动触发 DSH 对话**，以及**选择已有邮件生成回复建议**。界面提供“邮件”“邮箱设置”和“处理记录”；不再注册发送、草稿、定时发送、邮件任务、规则或邮箱修改工具。上游相关源码仍保留以便兼容与维护，不作为本插件的使用入口。**邮箱接入与自动监控的支持范围不同。**

| 能力 | 当前支持范围 |
| --- | --- |
| 邮箱接入、列表、搜索和阅读（继承上游） | QQ、腾讯企业邮、163、126、新浪、阿里云、Gmail、Outlook、iCloud，以及自定义 IMAP/SMTP 企业邮箱；另有 POP3、OAuth 和 AgentMail 接入 |
| 后台自动监控 → 新会话摘要、待办、建议回复（本项目新增） | 首期开放 163 IMAP；其他邮箱适配和真实收件验证待完成 |
| IM 通知 | 暂未实现；结果显示在 DSH 会话中 |

上述接入能力继承自上游，具体可用性取决于服务器协议、账户权限和认证策略；本项目未逐一完成所有品牌的实机验证。Google OAuth 需自行配置客户端；Outlook 默认客户端及授权边界见[上游参考说明](docs/REFERENCE.zh.md)。

## 自动监控

- 默认每 60 秒检查指定账户的收件箱；首次成功检查仅建立基线，跳过历史邮件。
- 每封新邮件创建一个 DSH 会话，生成摘要、待办与建议回复文本，已读状态不影响检测。
- 保存监控进度并在失败后重试；先确认会话持久化，再推进邮件游标。
- “处理记录”显示监听状态、检查时间、自动/手动提交结果及关联会话；删除会话后记录仍保留并显示提示。
- 不自动发送回复，不自动解析或下载附件；IM 暂未接入。
- 需要 DSH 主进程持续运行、网络可用以及已配置的模型；邮件正文会交给模型并保存在会话记录中。

完整配置、限制和待办见 [163 监控使用说明](docs/INCOMING-MONITOR.zh.md)。QQ、企业邮箱、OAuth、多账户同时监控和可选 IM 通知均在后续计划中。

## 安装与配置

当前版本为源码构建版本，尚未发布到 npm。克隆本仓库后安装依赖并构建：

```bash
git clone https://github.com/sunqing975/dsh-email-monitor.git
cd dsh-email-monitor
pnpm install --ignore-scripts
pnpm run build
```

然后通过 DSH 插件安装能力安装本地包目录。包名为 `dsh-email-monitor`。本扩展保留上游 `tool-email` 配置条目、`email_*` 工具和账户存储标识，作为上游插件的替代版本使用；**不要与原版 dsh-email 同时启用**。已有账户迁移前请备份配置。上游自动更新注册已关闭，防止更新覆盖监控扩展。

1. 在网易邮箱网页开启 IMAP 服务，取得授权码。
2. 在 DSH 邮件设置中添加 `163` 账户，填写完整邮箱地址和 IMAP 授权码，测试连接。不要把授权码发到聊天或提交到仓库。
3. 在“邮箱设置”的“新邮件监听”中选择账户，填写会话工作目录，开启监听并保存。默认每 60 秒检查 `INBOX`；首次检查跳过历史邮件。
4. 在“邮件”中选择任意已有邮件，点击“生成回复建议”，自动打开 DSH 对话；可继续对话调整回复语气和内容。

高级配置仍使用 `tool-email` 的 `incomingMonitorEnabled`、`incomingMonitorAccount`、`incomingMonitorFolder`、`incomingMonitorPollSeconds` 和 `incomingMonitorCwd`，与页面控件同步。手动建议同时提供 `email_suggest_reply` 工具；保留的阅读工具为 `email_list`、`email_read`、`email_search`、`email_folders`、`email_health`。

要求：DSH `>=0.2.1-rc.3`；Node.js `^22.19.0 || >=24.0.0`。真实 163 登录和端到端收件仍需要配置用户授权码后验证。

## 开发验证

```bash
pnpm run build
pnpm test
```

macOS 如果系统临时目录的 `/var` 与 `/private/var` 真实路径不同，可设置 `TMPDIR=/private/tmp` 运行测试。监控测试覆盖首次基线、已读新邮件、批量收件、重启恢复、失败重试、持久化失败和 UIDVALIDITY 变化；手动建议测试覆盖请求重试、会话持久化、账号绑定和并发去重。

## 上游与许可证

本项目基于 [STARDUSTLC666/dsh-email](https://github.com/STARDUSTLC666/dsh-email) v0.24.0（提交 `1e5ee558bf799ab201a8b9e67a40fdd036bf1d66`）修改，感谢上游作者与贡献者。保留其 [MIT 许可证和版权声明](LICENSE)。本项目新增后台监控、会话摘要提示及持久化进度管理，包名调整为 `dsh-email-monitor`。

继承功能的详细说明见 [中文参考](docs/REFERENCE.zh.md)、[邮件操作](docs/MAILBOX.md)和[发送与草稿流程](docs/OUTGOING-AUTOMATION.md)。这些文档保留上游语境；安装名称和监控范围以本 README 为准。

问题反馈：[Issues](https://github.com/sunqing975/dsh-email-monitor/issues)。
