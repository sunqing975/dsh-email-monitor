/** Harness 0.1.7 keeps editable fields in the profile and supplies live references. */
import z from '@deepseek-ai/schemastery'
import type { EmailConfig } from './config.js'

const endpoint = () => z.object({
  host: z.string(), port: z.number().min(1).max(65535), secure: z.boolean(),
  connectionTimeoutMs: z.number(), socketTimeoutMs: z.number(),
})
export const Config: z = z.object({
  provider: z.string().volatile(), user: z.string().volatile(),
  password: z.string().role('secret').volatile(),
  proxy: z.string().role('secret').volatile(),
  apiKey: z.string().role('secret').volatile(),
  senderName: z.string().volatile(), authUser: z.string().volatile(),
  authPassword: z.string().role('secret').volatile(),
  clientId: z.string().volatile(), authKind: z.union(['password', 'oauth2']).volatile(),
  clientSecret: z.string().role('secret').volatile(), oauthProvider: z.union(['google', 'microsoft']).volatile(),
  receiveProtocol: z.union(['imap', 'pop3']).volatile(), pop3: endpoint().volatile(),
  imap: endpoint().volatile(), smtp: endpoint().volatile(),
  inboxFolder: z.string().volatile(), sendApproval: z.boolean().volatile(),
  allowTrustedReply: z.boolean().volatile(),
  replyLocale: z.string().volatile(), replyTimeZone: z.string().volatile(),
  newMailPopup: z.boolean().volatile(),
  maxBodyChars: z.number().volatile(), downloadDir: z.string().volatile(),
  accounts: z.dict(z.any()).role('secret').volatile(), defaultAccount: z.string().volatile(),
  accountsYaml: z.string().role('secret').volatile(), serverPresets: z.string().volatile(),
  trustedRecipientsYaml: z.string().volatile(),
  maxAttachmentBytes: z.number().volatile(), bodySearchFallback: z.boolean().volatile(),
  bodySearchLimit: z.number().volatile(), idleTimeoutMs: z.number().volatile(),
  incomingMonitorEnabled: z.boolean().default(false).description('开启后台新邮件监控：为新邮件创建摘要和回复建议会话').volatile(),
  incomingMonitorPollSeconds: z.number().min(30).max(3600).default(60).description('检查间隔（秒）').volatile(),
  incomingMonitorAccount: z.string().description('监控账户名称；留空使用默认账户').volatile(),
  incomingMonitorFolder: z.string().default('INBOX').description('监控文件夹').volatile(),
  incomingMonitorCwd: z.string().description('新邮件会话的工作目录').volatile(),
  legacySettingsImported: z.boolean().volatile(),
})

/** A live view also accepts ordinary values from older hosts and direct callers. */
export function liveConfig(config: object): EmailConfig {
  return new Proxy(config, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
    },
  }) as EmailConfig
}
