export class PromisePool {
    private active = 0;
    private queue: (() => void)[] = [];

    constructor(private concurrency: number) {}

    async run<T>(task: () => Promise<T>): Promise<T> {
        if (this.active >= this.concurrency) {
            await new Promise<void>(resolve => this.queue.push(resolve));
        }
        this.active++;
        try {
            return await task();
        } finally {
            this.active--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                if (next) next();
            }
        }
    }
}

export const methodPool = new PromisePool(3);
