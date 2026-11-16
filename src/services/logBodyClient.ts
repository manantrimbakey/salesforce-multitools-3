import * as https from 'https';
import { IncomingMessage } from 'http';
import { StringDecoder } from 'string_decoder';
import type { Connection } from '@salesforce/core';
import { isSalesforceId } from '../utils/validation';

/** Socket idle timeout for log body requests. */
const REQUEST_TIMEOUT_MS = 30_000;

export class LogRequestError extends Error {
    constructor(public readonly statusCode: number | undefined) {
        super(`Salesforce returned status ${statusCode ?? 'unknown'} for the log request`);
        this.name = 'LogRequestError';
    }
}

/**
 * Start a streaming GET of an ApexLog body. `connection.request` buffers the whole body, which
 * is wasteful for large logs and impossible to cut short, so the body is streamed here using the
 * connection's own instance URL and token.
 */
function requestLogBody(connection: Connection, logId: string): Promise<IncomingMessage> {
    const { instanceUrl, accessToken } = connection;
    if (!accessToken) {
        return Promise.reject(new Error('No valid access token available'));
    }

    const url = new URL(`/services/data/v${connection.getApiVersion()}/sobjects/ApexLog/${logId}/Body`, instanceUrl);

    return new Promise<IncomingMessage>((resolve, reject) => {
        const request = https.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }, (response) => {
            if (response.statusCode !== 200) {
                response.resume(); // drain so the socket is released
                reject(new LogRequestError(response.statusCode));
                return;
            }
            resolve(response);
        });
        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('Log request timed out')));
        request.on('error', reject);
    });
}

/** Open the log body stream, refreshing an expired access token once. */
export async function openLogBody(connection: Connection, logId: string): Promise<IncomingMessage> {
    if (!isSalesforceId(logId)) {
        throw new Error('Invalid log id');
    }
    try {
        return await requestLogBody(connection, logId);
    } catch (error) {
        if (error instanceof LogRequestError && error.statusCode === 401) {
            await connection.refreshAuth();
            return requestLogBody(connection, logId);
        }
        throw error;
    }
}

/**
 * Read only the first `maxBytes` of the log. Bytes are decoded with a StringDecoder so a UTF-8
 * character split across chunks (or cut at the limit) is never corrupted.
 */
export async function readLogHead(
    connection: Connection,
    logId: string,
    maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
    const response = await openLogBody(connection, logId);
    const decoder = new StringDecoder('utf8');
    let text = '';
    let received = 0;

    // Returning early from the loop destroys the response and closes the connection
    for await (const chunk of response) {
        const buffer = chunk as Buffer;
        const remaining = maxBytes - received;
        if (buffer.length >= remaining) {
            text += decoder.write(buffer.subarray(0, remaining));
            return { text: text + decoder.end(), truncated: true };
        }
        received += buffer.length;
        text += decoder.write(buffer);
    }
    return { text: text + decoder.end(), truncated: false };
}
