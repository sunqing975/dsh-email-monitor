export interface ActivityEntry {
    id: string;
    source: 'automatic' | 'manual' | 'monitor';
    status: string;
    message: string;
    account?: string;
    folder?: string;
    uid?: number | string;
    sessionId?: string;
    createdAt: string;
    updatedAt: string;
}
export type MonitorStatus = {
    state: string;
    lastCheckedAt?: string;
    nextCheckAt?: string;
    message?: string;
};
type ActivityInput = Omit<ActivityEntry, 'createdAt' | 'updatedAt'>;
/** Plugin-owned journal; the owning plugin should keep one instance and await close on disposal. */
export declare class ActivityLog {
    private readonly ctx;
    monitor: MonitorStatus;
    private unit?;
    private entries?;
    private queue;
    private closing?;
    constructor(ctx: any);
    private enqueue;
    private load;
    record(input: ActivityInput): Promise<void>;
    list(): Promise<ActivityEntry[]>;
    close(): Promise<void>;
}
export {};
