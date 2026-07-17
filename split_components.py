import os
import json

base_dir = "client/src/components/debugLogFetcher"
os.makedirs(f"{base_dir}/components", exist_ok=True)
os.makedirs(f"{base_dir}/hooks", exist_ok=True)
os.makedirs(f"{base_dir}/utils", exist_ok=True)

promisePool_content = """
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
"""
with open(f"{base_dir}/utils/promisePool.ts", "w") as f: f.write(promisePool_content)

# We will just write a consolidated debugLogFetcher for now but properly componentized.
# It's better to just do it via normal write_to_file for React components, actually python script is fine.
