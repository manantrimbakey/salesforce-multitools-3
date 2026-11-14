import * as assert from 'assert';
import { apiRouter } from '../rpc/routes';
import { RpcError } from '../rpc/router';

suite('rpc routes: trace flag start validation', () => {
    const userId = '005000000000001AAA';

    async function rejectsBadRequest(body: unknown, message: string): Promise<void> {
        await assert.rejects(
            apiRouter.dispatch('POST', '/api/traceFlags/start', body),
            (error: unknown) => error instanceof RpcError && error.code === 'BAD_REQUEST',
            message,
        );
    }

    test('requires a valid user id', async () => {
        await rejectsBadRequest({}, 'missing user');
        await rejectsBadRequest({ userId: "x' OR 1=1" }, 'malformed user');
    });

    test('rejects a malformed debug level id before reaching Salesforce', async () => {
        await rejectsBadRequest({ userId, debugLevelId: "7dl' OR Id != '" }, 'injection attempt');
        await rejectsBadRequest({ userId, debugLevelId: 42 }, 'non-string level');
        await rejectsBadRequest({ userId, debugLevelId: '../Account' }, 'path-like level');
    });
});
