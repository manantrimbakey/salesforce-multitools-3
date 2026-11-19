import type {
    CompareContextResponse,
    CompareItemsResponse,
    CompareResponse,
    CompareSide,
    CompareSource,
    DebugLevelsResponse,
    DiffEntry,
    PermissionItemType,
    DeleteLogsResponse,
    LogsQuery,
    LogsResponse,
    MethodNameResponse,
    TraceFlagResponse,
    UsersResponse,
} from './types';

export * from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
}

/**
 * Single typed entry point to `window.callServerApi`.
 * Rejects with `Error(message)` on transport failure, malformed bodies or `{ success: false }` responses.
 * `T` is the shape of a successful response (see ./types).
 */
async function request<T extends { success: true }>(
    endpoint: string,
    method = 'GET',
    data: unknown = null,
): Promise<T> {
    if (typeof window.callServerApi !== 'function') {
        throw new Error('Extension server API is not available');
    }
    let body: unknown;
    try {
        body = await window.callServerApi(endpoint, method, data);
    } catch (error) {
        throw new Error(errorMessage(error));
    }
    if (!isRecord(body)) {
        throw new Error('Malformed response from extension');
    }
    if (body.success !== true) {
        throw new Error(typeof body.error === 'string' && body.error ? body.error : 'Request failed');
    }
    return body as T;
}

export const api = {
    getLogs({ user, size, sizeDirection }: LogsQuery) {
        const params = new URLSearchParams();
        if (user !== 'all') params.set('user', user);
        if (size) params.set('size', size);
        if (sizeDirection) params.set('sizeDirection', sizeDirection);
        const query = params.toString();
        return request<LogsResponse>(`/api/debugLogs${query ? `?${query}` : ''}`);
    },
    getUsers(search = '') {
        return request<UsersResponse>(`/api/users${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    },
    getMethodName(logId: string) {
        return request<MethodNameResponse>(`/api/debugLogs/${encodeURIComponent(logId)}/methodName`);
    },
    downloadLog(logId: string) {
        return request<{ success: true }>(`/api/debugLogs/${encodeURIComponent(logId)}/download`);
    },
    /** `userName: null` deletes every log. */
    deleteLogs(userName: string | null) {
        return request<DeleteLogsResponse>('/api/debugLogs/delete', 'POST', { userName });
    },
    getDebugLevels() {
        return request<DebugLevelsResponse>('/api/debugLevels');
    },
    /** Without `debugLevelId` the extension's default debug level is used. */
    startTraceFlag(userId: string, debugLevelId?: string) {
        return request<TraceFlagResponse>('/api/traceFlags/start', 'POST', { userId, debugLevelId });
    },
    getCompareContext() {
        return request<CompareContextResponse>('/api/compare/context');
    },
    getCompareItems(source: CompareSource, type: PermissionItemType) {
        return request<CompareItemsResponse>('/api/compare/items', 'POST', { source, type });
    },
    compare(left: CompareSide, right: CompareSide) {
        return request<CompareResponse>('/api/compare/run', 'POST', { left, right });
    },
    /** Opens a save dialog in VS Code and writes the entries there. `saved: false` = the user cancelled. */
    exportCompare(format: 'markdown' | 'csv', leftLabel: string, rightLabel: string, entries: DiffEntry[]) {
        return request<{ success: true; saved: boolean; path?: string }>('/api/compare/export', 'POST', {
            format,
            leftLabel,
            rightLabel,
            entries,
        });
    },
    stopTraceFlag(userId: string, traceFlagId: string) {
        return request<TraceFlagResponse>('/api/traceFlags/stop', 'POST', { userId, traceFlagId });
    },
};

export { errorMessage };
