import { installIncomingMonitor } from './incoming-monitor.js';
import { createReplySuggestion } from './reply-suggestion.js';
import { monitorControls } from './monitor-controls.js';
import { ActivityLog } from './activity-log.js';
import { randomUUID } from 'node:crypto';
import { createEmailRuntime } from './runtime.js';
import { buildEmailTools } from './tools.js';
import { EmailSettingsBackend, installEmailSettingsWeb } from './web.js';
import { liveConfig, Config as ConfigSchema } from './host-config.js';
import { installLegacySettingsImport } from './legacy-settings.js';
import { EmailSettingsSchema, SETTINGS_NAMESPACE } from './settings.js';
import { EmailMailboxBackend, installEmailMailbox } from './mailbox-web.js';
import { EmailService } from './mail-service.js';
import { disposeOAuthFlows } from './oauth2.js';
export const Config = ConfigSchema;
export const meta = {
    title: { en: 'Email monitor', 'zh-CN': '邮箱与新邮件监控' },
    description: { en: 'Mailbox access and opt-in incoming-mail summary conversations.', 'zh-CN': '邮箱接入，以及可选的新邮件自动摘要与回复建议会话。' },
};
// Original simple envelope mark, released under this package’s MIT license.
export const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="6" width="26" height="20" rx="4" fill="#526a82"/><path d="m5 9 11 9L27 9" fill="none" stroke="white" stroke-width="2"/></svg>');
export const name = 'tool-email';
export const inject = ['settings', 'tools'];
/** Compose mailbox reading, monitor settings and reply-suggestion conversations. */
export function apply(ctx, config = {}) {
    installEmailApplication(ctx, config);
}
/** Shared application assembly; transports can be supplied by embedders and protocol fixtures. */
export function installEmailApplication(ctx, config = {}, dependencies = {}) {
    config = liveConfig(config);
    installLegacySettingsImport(ctx, config, SETTINGS_NAMESPACE, 'tool-email', Object.keys(EmailSettingsSchema.dict));
    if (typeof ctx.settings.configure === 'function' && typeof ctx.inject === 'function') {
        ctx.inject(['settings'], (settingsCtx) => {
            settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
        });
    }
    const runtime = createEmailRuntime(ctx, config, settings => new EmailService(settings, { ...dependencies, replyLocale: dependencies.replyLocale ?? (() => {
            try {
                const locale = ctx.settings.describe?.().find((row) => row.ns === 'locale');
                return locale?.user?.preference || locale?.base?.preference;
            }
            catch {
                return undefined;
            }
        }) }));
    const backend = new EmailSettingsBackend(ctx, runtime.settingsScope, config, dependencies.fetch);
    backend.watchImpl = runtime.watch;
    installEmailSettingsWeb(ctx, backend);
    ctx.on?.('dispose', disposeOAuthFlows);
    const mailbox = new EmailMailboxBackend(runtime);
    mailbox.assistantOnly = true;
    installEmailMailbox(ctx, mailbox);
    const activity = new ActivityLog(ctx);
    ctx.effect(() => () => activity.close());
    installIncomingMonitor(ctx, runtime, config, activity);
    const readTools = new Set(['email_list', 'email_read', 'email_search', 'email_folders', 'email_health']);
    for (const definition of buildEmailTools(runtime))
        if (readTools.has(definition.name)) {
            if (definition.name === 'email_health') {
                const execute = definition.execute;
                ctx.tools.register({ ...definition, execute: async (args, exec) => ({ ...await execute(args, exec), incomingMonitor: JSON.parse(JSON.stringify({ enabled: config.incomingMonitorEnabled === true, ...activity.monitor })) }) });
            }
            else
                ctx.tools.register(definition);
        }
    ctx.inject?.(['sessionController', 'sessions', 'configEditor'], (host) => {
        if (!host.sessionController || !host.sessions || !host.configEditor || !host.tools)
            return;
        const controls = monitorControls(host, runtime, config);
        const suggest = createReplySuggestion(runtime, {
            create: async (cwd) => (await host.sessionController.create({ cwd })).sessionId,
            rename: (sessionId, title) => host.sessionController.rename({ sessionId, title }),
            prompt: (sessionId, requestId, text, signal) => host.sessionController.prompt({ sessionId, requestId, mode: 'queue', content: [{ type: 'text', text }] }, signal),
            checkpoint: async (sessionId) => {
                const session = host.sessions.get(sessionId);
                if (!session || !await host.sessions.flush(session))
                    throw new Error('Session persistence checkpoint unavailable');
            },
        }, () => config.incomingMonitorCwd || process.cwd(), { activity });
        const activityList = async (limit = 100) => ({ entries: (await activity.list()).slice(0, limit), monitor: JSON.parse(JSON.stringify(activity.monitor)) });
        mailbox.assistantAction = async (body, signal) => {
            if (body.action === 'suggest')
                return suggest(body, signal);
            if (body.action === 'activityList')
                return activityList();
            if (body.action === 'activitySession') {
                const entry = (await activity.list()).find(row => row.id === body.id);
                if (!entry?.sessionId)
                    return { available: false, message: '这条记录尚未关联会话' };
                try {
                    const projection = await host.sessionController.projections({ sessionId: entry.sessionId }, signal);
                    return projection ? { available: true, sessionId: entry.sessionId } : { available: false, message: '关联会话已被移除，处理记录仍然保留' };
                }
                catch {
                    return { available: false, message: '暂时无法检查关联会话，请稍后重试' };
                }
            }
            return controls(body);
        };
        host.effect?.(() => () => { mailbox.assistantAction = undefined; });
        host.tools.register({
            name: 'email_activity',
            description: '查看邮箱自动监听状态及自动、手动提交到 DSH 的近期处理记录。已提交表示请求被接收，生成结果请查看关联会话。',
            parameters: { type: 'object', properties: { limit: { type: 'integer', description: '最多返回的记录数，1–100，默认20' } }, additionalProperties: false },
            output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
            timeoutMs: 30000,
            execute: (args) => activityList(Number.isInteger(args?.limit) ? Math.max(1, Math.min(100, args.limit)) : 20),
        });
        host.tools.register({
            name: 'email_suggest_reply',
            description: '为选定的已有邮件创建 DSH 对话，生成摘要、行动项和回复示例，返回会话编号。',
            parameters: { type: 'object', properties: { account: { type: 'string', description: '账户名称；省略使用默认账户' }, folder: { type: 'string', description: '邮件文件夹；省略使用账户收件箱' }, uid: { oneOf: [{ type: 'integer' }, { type: 'string' }], description: 'email_list 或 email_search 返回的邮件标识' }, requestId: { type: 'string', description: '可选重试标识；相同请求重试复用同一会话' } }, required: ['uid'], additionalProperties: false },
            output: { schema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] }, render: (_args, value) => [{ type: 'text', text: '回复建议已提交至 DSH 会话：' + value.sessionId }] },
            timeoutMs: 120000,
            execute: (args, exec) => suggest({ ...args, requestId: args.requestId || randomUUID() }, exec?.signal ?? new AbortController().signal),
        });
    });
}
export { clampInt, defaultDownloadDir, EMAIL_PASSWORD_ENV, isOAuth2Account, OUTLOOK_OAUTH2_CLIENT_ID, OUTLOOK_PROVIDER, parseAccountsYaml, parseServerPresets, presetNamesIn, providerNames, PROVIDER_NAMES, resolveEmailConfig, resolveEmailSettings, serializeAccountsYaml } from './config.js';
export { ACCESS_TOKEN_MARGIN_MS, classifyOAuthFailure, clearTokenFor, clientIdOf, DEVICE_CODE_URL, getFreshAccessToken, mapAadstsMessage, NO_CLIENT_ID_MESSAGE, NOT_LOGGED_IN_MESSAGE, oauth2StateOf, oauth2TokenFile, OAUTH2_SCOPES, OAuth2Error, pollDeviceFlow, readTokenStore, startDeviceFlow, TOKEN_URL, writeTokenStore, } from './oauth2.js';
export { buildReplyMessage, EmailPool, extractMessageIds, imapAuthOf, looksLikeAuthFailure, MailError, messageMatchesQuery, messageOf, OAUTH2_RELOGIN_MESSAGE, redactCredentials, selectAttachmentPart, smtpAuthOf, validateAttachmentPaths } from './mail-client.js';
export { flattenAddresses, parseRawMessage, sanitizeFilename, stripHtml, truncateText } from './parse.js';
export { EmailSettingsSchema, SETTINGS_NAMESPACE, toEmailConfig, toSettingsBase, validateSettingsValue } from './settings.js';
export { parseEmailDay } from './tool-contract.js';
export { EmailSettingsBackend, installEmailSettingsWeb, SETTINGS_ROUTE } from './web.js';
export { EmailDraftBackend, installEmailDrafts, EMAIL_DRAFT_ROUTE } from './draft-web.js';
export { DraftStore, DraftError } from './draft-store.js';
export { AgentMailClient } from './agentmail.js';
export { Pop3Client } from './pop3.js';
export { EmailService } from './mail-service.js';
export { EmailMailboxBackend, installEmailMailbox, MAILBOX_ROUTE } from './mailbox-web.js';
export { prepareMailBody, sanitizeOutgoingHtml } from './outgoing-body.js';
export { replyLanguage, replyDate } from './reply-locale.js';
