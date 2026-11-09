import { type IncomingSessions } from './incoming-monitor.js';
import type { EmailRuntime } from './runtime.js';
import type { ActivityLog } from './activity-log.js';
export interface ReplySuggestionRequest {
    account?: string;
    folder?: string;
    uid: number | string;
    /** Caller-generated, stable across retries. Generate a new ID for a new suggestion. */
    requestId: string;
}
export interface ReplySuggestionResult {
    sessionId: string;
}
export type ReplySuggestionAction = (request: ReplySuggestionRequest, signal: AbortSignal) => Promise<ReplySuggestionResult>;
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
export declare function createReplySuggestion(runtime: Pick<EmailRuntime, 'getEffectiveSettings' | 'getPool'>, sessions: IncomingSessions, getCwd: () => string, options?: {
    maxRequests?: number;
    activity?: ActivityLog;
}): ReplySuggestionAction;
