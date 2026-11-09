import { installIncomingMonitor } from './incoming-monitor.js';
import { installSendApproval } from './approval.js';
import { createEmailRuntime } from './runtime.js';
import { buildEmailTools } from './tools.js';
import { EmailSettingsBackend, installEmailSettingsWeb } from './web.js';
import { liveConfig, Config as ConfigSchema } from './host-config.js';
import { installLegacySettingsImport } from './legacy-settings.js';
import { EmailSettingsSchema, SETTINGS_NAMESPACE } from './settings.js';
import { EmailDraftBackend, installEmailDrafts } from './draft-web.js';
import { EmailMailboxBackend, installEmailMailbox } from './mailbox-web.js';
import { EmailService } from './mail-service.js';
import { installScheduleApproval } from './schedule-tool.js';
import { disposeOAuthFlows } from './oauth2.js';
import { MailTaskBackend, installMailTasks } from './mail-tasks.js';
export const Config = ConfigSchema;
export const meta = {
    title: { en: 'Email monitor', 'zh-CN': '邮箱与新邮件监控' },
    description: { en: 'Mailbox access and opt-in incoming-mail summary conversations.', 'zh-CN': '邮箱接入，以及可选的新邮件自动摘要与回复建议会话。' },
};
// Original simple envelope mark, released under this package’s MIT license.
export const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="6" width="26" height="20" rx="4" fill="#526a82"/><path d="m5 9 11 9L27 9" fill="none" stroke="white" stroke-width="2"/></svg>');
export const name = 'tool-email';
export const inject = ['settings', 'tools'];
/** Compose settings/pool lifecycle, tools, browser routes and the outgoing-mail gate. */
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
    const drafts = new EmailDraftBackend(runtime, backend);
    ctx.inject?.(['appReady'], (host) => { if (typeof host.appReady?.onReady === 'function')
        host.appReady.onReady(() => drafts.startScheduler()); });
    ctx.on?.('dispose', () => drafts.stopScheduler());
    ctx.on?.('dispose', disposeOAuthFlows);
    installEmailDrafts(ctx, drafts);
    installEmailMailbox(ctx, new EmailMailboxBackend(runtime, drafts));
    installMailTasks(ctx, new MailTaskBackend(runtime));
    installIncomingMonitor(ctx, runtime, config);
    for (const definition of buildEmailTools(runtime, drafts))
        ctx.tools.register(definition);
    installSendApproval(ctx, runtime);
    installScheduleApproval(ctx, drafts);
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
