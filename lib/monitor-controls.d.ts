import type { EmailRuntime } from './runtime.js';
import type { EmailConfig } from './config.js';
/** Shared settings operation, preserving unrelated account and credential fields. */
export declare function monitorControls(ctx: any, runtime: EmailRuntime, config: EmailConfig): (body: Record<string, unknown>) => Promise<unknown>;
