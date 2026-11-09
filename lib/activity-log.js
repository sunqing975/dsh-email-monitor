// Deliberately project the metadata contract: no message bodies, credentials, or error objects.
// Callers must supply a user-safe status message rather than interpolating upstream errors.
function metadata(input) {
    return {
        id: input.id, source: input.source, status: input.status, message: input.message,
        ...(input.account !== undefined ? { account: input.account } : {}),
        ...(input.folder !== undefined ? { folder: input.folder } : {}),
        ...(input.uid !== undefined ? { uid: input.uid } : {}),
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    };
}
/** Plugin-owned journal; the owning plugin should keep one instance and await close on disposal. */
export class ActivityLog {
    ctx;
    monitor = { state: 'waiting' };
    unit;
    entries;
    queue = Promise.resolve();
    closing;
    constructor(ctx) {
        this.ctx = ctx;
    }
    enqueue(operation) {
        if (this.closing)
            return Promise.reject(new Error('Activity log is closed'));
        const result = this.queue.then(operation);
        // A failed write rejects its own caller without poisoning subsequent operations.
        this.queue = result.then(() => { }, () => { });
        return result;
    }
    async load() {
        if (!this.unit) {
            const storage = typeof this.ctx.get === 'function' ? this.ctx.get('storage') : this.ctx.storage;
            const registry = storage?.backend;
            const name = registry?.names()[0];
            if (!name)
                throw new Error('Activity log storage unavailable');
            const backend = registry.get(name);
            if (!backend.kv)
                throw new Error('Activity log KV storage unavailable');
            this.unit = await backend.kv.open({
                name: 'dsh_email_activity', version: 1, tables: ['records'], hasGlobal: false, layout: 'single',
            });
        }
        if (!this.entries) {
            const state = (await this.unit.loadAll()).tables.records?.state;
            if (state !== undefined && !Array.isArray(state?.entries))
                throw new Error('Invalid activity log state');
            this.entries = (state?.entries ?? []).map(entry => ({
                ...metadata(entry), createdAt: entry.createdAt, updatedAt: entry.updatedAt,
            })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 500);
        }
        return this.entries;
    }
    async record(input) {
        // Snapshot the caller's metadata before waiting for other writes.
        const value = metadata(input);
        return this.enqueue(async () => {
            const entries = await this.load();
            const existing = entries.find(entry => entry.id === value.id);
            const now = new Date().toISOString();
            const entry = { ...value, createdAt: existing?.createdAt ?? now, updatedAt: now };
            // Put the latest operation first, including operations with equal millisecond timestamps.
            const next = [entry, ...entries.filter(item => item.id !== value.id)].slice(0, 500);
            await this.unit.putRecord('records', 'state', { entries: next.map(item => ({ ...item })) });
            this.entries = next;
        });
    }
    async list() {
        return this.enqueue(async () => (await this.load()).map(entry => JSON.parse(JSON.stringify(entry))));
    }
    async close() {
        if (!this.closing)
            this.closing = this.queue.then(async () => { await this.unit?.close(); });
        return this.closing;
    }
}
