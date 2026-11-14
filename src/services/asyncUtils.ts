/** Small Map-based LRU cache: the least recently used entry is evicted first. */
export class LruCache<K, V> {
    private readonly entries = new Map<K, V>();

    constructor(private readonly maxEntries: number) {}

    public get(key: K): V | undefined {
        const value = this.entries.get(key);
        if (value !== undefined) {
            // Re-insert to mark as most recently used
            this.entries.delete(key);
            this.entries.set(key, value);
        }
        return value;
    }

    public set(key: K, value: V): void {
        this.entries.delete(key);
        this.entries.set(key, value);
        if (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (!oldest.done) {
                this.entries.delete(oldest.value);
            }
        }
    }

    public delete(key: K): void {
        this.entries.delete(key);
    }

    public get size(): number {
        return this.entries.size;
    }
}

/** Runs at most `limit` async tasks at the same time; the rest wait in FIFO order. */
export class ConcurrencyLimiter {
    private active = 0;
    private readonly waiting: Array<() => void> = [];

    constructor(private readonly limit: number) {}

    public async run<T>(task: () => Promise<T>): Promise<T> {
        if (this.active >= this.limit) {
            // The slot is handed over directly by release(), so `active` stays accurate
            await new Promise<void>((resolve) => this.waiting.push(resolve));
        } else {
            this.active++;
        }
        try {
            return await task();
        } finally {
            this.release();
        }
    }

    private release(): void {
        const next = this.waiting.shift();
        if (next) {
            next();
        } else {
            this.active--;
        }
    }
}
