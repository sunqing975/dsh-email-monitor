# dsh-email-monitor

[简体中文](README.md)

A DSH multi-provider email assistant based on [dsh-email](https://github.com/STARDUSTLC666/dsh-email), extended with background monitoring that opens AI conversations containing summaries, action items and suggested replies.

The product now has two flows: automatically create a DSH conversation for new mail, or select an existing message and click **Generate reply suggestion**. The UI contains Mail, Accounts/settings and Activity. Activity shows monitor health, check times, automatic/manual submissions and linked sessions; removed sessions produce a notice while retaining their records. Sending, drafts, scheduling, mailbox mutations, rules and mail-command tasks are no longer registered in the application. Their upstream source remains for compatibility and maintenance. Read tools and the shared `email_suggest_reply` action remain available.

## Provider support

Inherited mailbox access supports QQ, Tencent enterprise mail, 163, 126, Sina, Aliyun, Gmail, Outlook, iCloud and custom IMAP/SMTP servers, with POP3, OAuth and AgentMail options. Availability depends on account permissions, authentication policies and server protocols. This fork has not independently verified every provider.

**The new automatic monitoring feature currently accepts 163 IMAP only.** Other providers and simultaneous multi-account monitoring remain planned. IM notifications are not implemented; output appears in DSH conversations.

Monitoring polls every 60 seconds by default, skips existing mail on its initial successful scan and detects newly arrived mail regardless of read status. Progress is persisted, and the session is flushed before advancing the mailbox cursor. It produces suggested reply text without sending it or downloading attachments. DSH must remain running with network and model access. Mail content is processed by the model and stored in session history.

## Build and install

This is currently a source build, not an npm release:

```bash
git clone https://github.com/sunqing975/dsh-email-monitor.git
cd dsh-email-monitor
pnpm install --ignore-scripts
pnpm run build
```

Install the local package directory through DSH's plugin installation capability. The package name is `dsh-email-monitor`; upstream `tool-email` configuration, `email_*` tools and account storage identifiers are retained for compatibility. Use this as a replacement: **do not enable it alongside dsh-email**. Back up existing settings before migrating. Upstream update registration is disabled to prevent overwriting this extension.

Configure a 163 account with its full email address and IMAP authorization code in Accounts/settings, test the connection, then enable and save New-mail monitoring there. Select the account and an absolute conversation working directory; the default interval is 60 seconds. The controls persist the existing `tool-email` configuration fields: `incomingMonitorEnabled`, `incomingMonitorAccount`, `incomingMonitorFolder`, `incomingMonitorPollSeconds` and `incomingMonitorCwd`. See the [monitor setup and roadmap](docs/INCOMING-MONITOR.zh.md).

Requires DSH `>=0.2.1-rc.3` and Node.js `^22.19.0 || >=24.0.0`. Real 163 login and end-to-end delivery still require verification with a configured user account.

## Validation

Run `pnpm run build` and `pnpm test`. On macOS, use `TMPDIR=/private/tmp` if `/var` and `/private/var` temporary path canonicalization differs. Monitor fixtures cover baselines, seen messages, batches, restarts, retries, persistence failures and UIDVALIDITY changes. Manual suggestion fixtures cover retries, concurrent deduplication, account identity and session checkpoints.

## Attribution and license

Based on [STARDUSTLC666/dsh-email](https://github.com/STARDUSTLC666/dsh-email) v0.24.0, commit `1e5ee558bf799ab201a8b9e67a40fdd036bf1d66`. The upstream [MIT license and copyright notice](LICENSE) are retained. This fork adds incoming-mail monitoring, summary prompts and durable progress management.

Inherited functionality is documented in the [upstream reference](docs/REFERENCE.en.md). Those documents retain upstream context; use this README for installation and monitoring scope. Report issues at [sunqing975/dsh-email-monitor](https://github.com/sunqing975/dsh-email-monitor/issues).
