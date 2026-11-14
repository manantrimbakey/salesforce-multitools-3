import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { apiRouter } from './routes';
import { RpcError } from './router';

interface ApiRequestMessage {
    type: 'api';
    id: number | string;
    endpoint: string;
    method?: string;
    data?: unknown;
}

function isApiRequest(message: unknown): message is ApiRequestMessage {
    if (typeof message !== 'object' || message === null) {
        return false;
    }
    const candidate = message as Partial<ApiRequestMessage>;
    return (
        candidate.type === 'api' &&
        (typeof candidate.id === 'number' || typeof candidate.id === 'string') &&
        typeof candidate.endpoint === 'string'
    );
}

/**
 * Serve the webview's `window.callServerApi` calls. Messages that are not `{type: 'api'}` are
 * ignored here so other `onDidReceiveMessage` listeners keep working unchanged.
 *
 * Protocol:
 *   webview -> host: `{ type: 'api', id, endpoint, method, data }`
 *   host -> webview: `{ type: 'apiResponse', id, ok: true, result }`
 *                 or `{ type: 'apiResponse', id, ok: false, error, code }`
 */
export function attachRpc(webview: vscode.Webview, disposables: vscode.Disposable[]): void {
    disposables.push(
        webview.onDidReceiveMessage(async (message: unknown) => {
            if (!isApiRequest(message)) {
                return;
            }

            let response: Record<string, unknown>;
            try {
                const result = await apiRouter.dispatch(message.method ?? 'GET', message.endpoint, message.data);
                response = { ok: true, result };
            } catch (error) {
                if (error instanceof RpcError) {
                    response = { ok: false, error: error.message, code: error.code };
                } else {
                    Logger.error(
                        `Unexpected error handling ${message.method ?? 'GET'} ${message.endpoint}`,
                        'attachRpc',
                        error,
                    );
                    response = { ok: false, error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' };
                }
            }

            try {
                await webview.postMessage({ type: 'apiResponse', id: message.id, ...response });
            } catch (error) {
                // The webview may have been disposed while the request was in flight.
                Logger.debug(`Could not deliver RPC response: ${String(error)}`, 'attachRpc');
            }
        }),
    );
}
