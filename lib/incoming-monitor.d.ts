import type { EmailRuntime } from './runtime.js';
import type { EmailReadResult } from './types.js';
import type { ActivityLog } from './activity-log.js';
type ActivityInput = Parameters<ActivityLog['record']>[0];
/** Provider-neutral boundary; snapshots must contain ALL current message IDs, including read mail. */
export interface IncomingMailbox {
    key: string;
    account?: string;
    folder?: string;
    snapshot(signal: AbortSignal): Promise<{
        uidValidity: number;
        uids: number[];
    }>;
    read(uid: number, signal: AbortSignal): Promise<EmailReadResult>;
}
export interface IncomingProgress {
    uidValidity: number;
    uid: number;
    pending?: {
        uid: number;
        requestId: string;
        sessionId?: string;
    };
}
export interface IncomingProgressStore {
    load(key: string): Promise<IncomingProgress | undefined>;
    save(key: string, progress: IncomingProgress): Promise<void>;
}
export interface IncomingSessions {
    create(cwd: string): Promise<string>;
    rename(sessionId: string, title: string): Promise<void>;
    prompt(sessionId: string, requestId: string, text: string, signal: AbortSignal): Promise<void>;
    checkpoint(sessionId: string): Promise<void>;
}
export declare function incomingSummaryPrompt(mail: EmailReadResult | undefined, uid: number): string;
/** Serial, crash-retryable core. A failed admission is retried with the same persisted requestId. */
export declare function createIncomingMonitorCore(options: {
    mailbox: IncomingMailbox;
    store: IncomingProgressStore;
    sessions: IncomingSessions;
    cwd: string;
    status?: (message: string) => void;
    activity?: (entry: ActivityInput) => Promise<void>;
}): {
    poll(signal: AbortSignal): Promise<void>;
};
/** Reuse the upstream service and its connection queue; never instantiate a second IMAP client. */
export declare function incomingMailbox(runtime: EmailRuntime, accountName: string, folder: string): IncomingMailbox;
export declare function installIncomingMonitor(ctx: any, runtime: EmailRuntime, config: any, activity?: ActivityLog): void;
export {};
