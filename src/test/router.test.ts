import * as assert from 'assert';
import { Router, RpcError } from '../rpc/router';

suite('rpc router', () => {
    const validId = '00l000000000001AAA';
    const router = new Router({ id: (value) => /^[a-zA-Z0-9]{15,18}$/.test(value) })
        .get('/api/logs/:id/body', ({ params, query }) => ({ id: params.id, query }))
        .delete('/api/logs/:id', ({ params }) => ({ deleted: params.id }))
        .post('/api/logs/delete', ({ body }) => ({ body }));

    test('matches path params and parses the query string', async () => {
        const result = await router.dispatch('GET', `/api/logs/${validId}/body?size=5&user=a%20b`, null);
        assert.deepStrictEqual(result, { id: validId, query: { size: '5', user: 'a b' } });
    });

    test('distinguishes routes by method', async () => {
        assert.deepStrictEqual(await router.dispatch('DELETE', `/api/logs/${validId}`, null), { deleted: validId });
        assert.deepStrictEqual(await router.dispatch('POST', '/api/logs/delete', { a: 1 }), { body: { a: 1 } });
    });

    test('rejects invalid ids before the handler runs', async () => {
        await assert.rejects(
            router.dispatch('DELETE', '/api/logs/not-an-id', null),
            (error: unknown) => error instanceof RpcError && error.code === 'BAD_REQUEST',
        );
    });

    test('unknown endpoints are NOT_FOUND', async () => {
        await assert.rejects(
            router.dispatch('GET', '/api/nope', null),
            (error: unknown) => error instanceof RpcError && error.code === 'NOT_FOUND',
        );
    });
});
