import * as assert from 'assert';
import { ConcurrencyLimiter, LruCache } from '../services/asyncUtils';

suite('asyncUtils', () => {
    test('LruCache evicts the least recently used entry', () => {
        const cache = new LruCache<string, number>(2);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.get('a');
        cache.set('c', 3);
        assert.strictEqual(cache.get('b'), undefined);
        assert.strictEqual(cache.get('a'), 1);
        assert.strictEqual(cache.get('c'), 3);
        assert.strictEqual(cache.size, 2);
    });

    test('ConcurrencyLimiter never exceeds the limit and runs every task', async () => {
        const limiter = new ConcurrencyLimiter(2);
        let running = 0;
        let peak = 0;
        const task = async (value: number) => {
            running++;
            peak = Math.max(peak, running);
            await new Promise((resolve) => setTimeout(resolve, 5));
            running--;
            return value;
        };

        const results = await Promise.all([1, 2, 3, 4, 5].map((n) => limiter.run(() => task(n))));
        assert.deepStrictEqual(results, [1, 2, 3, 4, 5]);
        assert.strictEqual(peak, 2);
    });

    test('ConcurrencyLimiter releases the slot when a task throws', async () => {
        const limiter = new ConcurrencyLimiter(1);
        await assert.rejects(limiter.run(() => Promise.reject(new Error('boom'))));
        assert.strictEqual(await limiter.run(async () => 'ok'), 'ok');
    });
});
