import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { incomingSummaryPrompt } from './incoming-monitor.js';
function selector(value, field, fallback) {
    if (value === undefined || value === '') {
        if (fallback !== undefined)
            return fallback;
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new Error(`Invalid reply suggestion ${field}`);
    }
    return value;
}
/**
 * Shared manual action for tools and HTTP/UI callers. Uses only the existing mail pool.
 *
 * Idempotency is local to this action instance (keep one instance per plugin lifetime).
 * Retained IDs are never evicted: at capacity NEW requests fail before side effects,
 * while existing IDs can still finish/retry. Recreate the instance only on plugin reload.
 * The host prompt adapter must pass requestId unchanged to sessionController.prompt
 * with mode='queue', and checkpoint must use sessions.get + sessions.flush, rejecting
 * an absent session or a false flush result, as the incoming-monitor adapter does.
 * create has no native idempotency key: a controller that creates and then throws
 * before returning an identity can leave an empty orphan, as with the monitor.
 */
export function createReplySuggestion(runtime, sessions, getCwd, options = {}) {
    const maxRequests = options.maxRequests ?? 512;
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 10000)
        throw new Error('Invalid reply suggestion request capacity');
    const requests = new Map();
    const select = (request) => {
        const settings = runtime.getEffectiveSettings();
        const account = selector(request.account, 'account', settings.defaultAccount);
        const resolved = settings.accounts.get(account);
        if (!resolved)
            throw new Error('Unknown reply suggestion account');
        const folder = selector(request.folder, 'folder', resolved.inboxFolder || 'INBOX');
        const uid = request.uid;
        if (resolved.transport) {
            if (typeof uid !== 'string' || !uid.trim() || uid.length > 4096 || /[\u0000-\u001f\u007f]/u.test(uid))
                throw new Error('Invalid reply suggestion message ID');
            if (resolved.transport === 'pop3' && !uid.startsWith('pop3:'))
                throw new Error('Invalid reply suggestion POP3 message ID');
            if (resolved.transport === 'pop3' && folder !== 'INBOX')
                throw new Error('POP3 reply suggestions require INBOX');
        }
        else if (typeof uid !== 'number' || !Number.isSafeInteger(uid) || uid <= 0) {
            throw new Error('Reply suggestion IMAP UID must be a positive safe integer');
        }
        // Hash the entire resolved account: no credentials are retained in the request table.
        // Credential/endpoint/user edits conservatively require restoring the old config or a new ID.
        const identity = createHash('sha256').update(JSON.stringify(resolved)).digest('hex');
        return { account, folder, uid, identity };
    };
    const same = (a, b) => a.account === b.account && a.folder === b.folder && a.uid === b.uid && a.identity === b.identity;
    return async (request, signal) => {
        signal.throwIfAborted();
        if (!request || typeof request !== 'object' || Array.isArray(request))
            throw new Error('Invalid reply suggestion request');
        const requestId = selector(request.requestId, 'requestId');
        if (requestId.length > 256 || requestId !== requestId.trim())
            throw new Error('Invalid reply suggestion requestId');
        const selection = select(request);
        let pending = requests.get(requestId);
        if (pending && !same(pending, selection))
            throw new Error('Reply suggestion requestId is already bound to another message or account configuration');
        if (!pending) {
            if (requests.size >= maxRequests)
                throw new Error('Reply suggestion request capacity reached; reload the plugin before starting new requests');
            pending = { ...selection };
            requests.set(requestId, pending);
        }
        if (pending.complete)
            return { sessionId: pending.sessionId };
        if (pending.running)
            return pending.running;
        const state = pending;
        // Resolve defaults once; a later default-account edit cannot silently retarget this action.
        const bound = { ...selection, requestId };
        const check = () => {
            signal.throwIfAborted();
            if (!same(state, select(bound)))
                throw new Error('Reply suggestion account configuration changed during processing');
        };
        const record = (status, message) => options.activity?.record({ id: 'manual:' + requestId, source: 'manual', status, message, account: state.account, folder: state.folder, uid: state.uid, sessionId: state.sessionId });
        const run = async () => {
            await record('processing', '正在为所选邮件创建回复建议会话');
            check();
            if (!state.text && !state.admitted) {
                const mail = await runtime.getPool().read(state.account, state.uid, state.folder, signal);
                check();
                if (mail.account !== state.account || mail.folder !== state.folder || mail.uid !== state.uid)
                    throw new Error('Reply suggestion mailbox identity changed while reading');
                // The shared prompt only JSON-serializes uid; its historical type is IMAP-only.
                // Preserve opaque POP3/AgentMail IDs verbatim at runtime as well.
                state.text = incomingSummaryPrompt(mail, state.uid);
            }
            if (!state.sessionId) {
                const cwd = getCwd();
                if (typeof cwd !== 'string' || !isAbsolute(cwd) || cwd.includes('\u0000'))
                    throw new Error('Reply suggestion requires an absolute session working directory');
                state.sessionId = await sessions.create(cwd);
                if (!state.sessionId)
                    throw new Error('Session creation returned no identity');
            }
            await record('processing', '已创建会话，正在提交邮件分析请求');
            check();
            if (!state.createdCheckpoint) {
                await sessions.checkpoint(state.sessionId);
                state.createdCheckpoint = true;
            }
            check();
            if (!state.renamed) {
                await sessions.rename(state.sessionId, '邮件回复建议');
                state.renamed = true;
            }
            check();
            if (!state.admitted) {
                await sessions.prompt(state.sessionId, requestId, state.text, signal);
                state.admitted = true;
                delete state.text;
            }
            // Admission is memory-only. Even after caller cancellation finish the durability barrier;
            // if it fails, a retry checkpoints the same admitted session without prompting again.
            await sessions.checkpoint(state.sessionId);
            await record('submitted', '已提交到 DSH 会话；摘要和回复建议请在会话中查看');
            state.complete = true;
            return { sessionId: state.sessionId };
        };
        const running = Promise.resolve().then(run);
        state.running = running;
        try {
            return await running;
        }
        catch (error) {
            await record('failed', '手动提交未完成，可重试；请检查邮箱连接和 DSH 会话服务');
            throw error;
        }
        finally {
            if (state.running === running)
                delete state.running;
        }
    };
}
