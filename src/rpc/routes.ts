import * as vscode from 'vscode';
import { getComponentFiles } from '../features/componentFileSwitcher/componentFileSwitcherUtils';
import { DebugLogProvider } from '../features/debugLogs/debugLogProvider';
import { DebugLogService, LogFilter } from '../services/debugLogService';
import { WorkspaceFileError, WorkspaceFileService } from '../services/workspaceFileService';
import { isSalesforceId, parseOptionalSize } from '../utils/validation';
import { Router, RpcError, RpcRequest, bodyObject } from './router';

const startedAt = Date.now();

function requireString(value: unknown, message: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new RpcError('BAD_REQUEST', message);
    }
    return value;
}

function parseLogFilter(query: Record<string, string>): LogFilter {
    let bytes: number | undefined;
    try {
        bytes = parseOptionalSize(query.size);
    } catch {
        throw new RpcError('BAD_REQUEST', 'Invalid size');
    }

    const filter: LogFilter = { userName: query.user };
    if (bytes !== undefined) {
        if (query.sizeDirection !== 'above' && query.sizeDirection !== 'below') {
            throw new RpcError('BAD_REQUEST', 'sizeDirection must be "above" or "below"');
        }
        filter.size = { direction: query.sizeDirection, bytes };
    }
    return filter;
}

/** Translate expected workspace file errors into RPC errors. */
async function withFileErrors<T>(action: () => Promise<T>): Promise<T> {
    try {
        return await action();
    } catch (error) {
        if (error instanceof WorkspaceFileError) {
            throw new RpcError(error.kind === 'forbidden' ? 'FORBIDDEN' : 'NOT_FOUND', error.message);
        }
        throw error;
    }
}

function createApiRouter(): Router {
    // Reject malformed ids before they reach file paths or Salesforce URLs
    const router = new Router({ id: isSalesforceId });

    router.get('/api/ping', () => ({ message: 'pong', timestamp: new Date().toISOString() }));

    router.get('/api/status', () => ({
        status: 'running',
        uptime: (Date.now() - startedAt) / 1000,
        timestamp: new Date().toISOString(),
    }));

    // ---- Debug logs ----
    router.get('/api/debugLogs', async ({ query }: RpcRequest) => ({
        success: true,
        logs: await DebugLogService.listLogs(parseLogFilter(query)),
    }));

    router.get('/api/users', async ({ query }: RpcRequest) => ({
        success: true,
        ...(await DebugLogService.searchUsers(query.search)),
    }));

    router.get('/api/debugLogs/:id/download', async ({ params }: RpcRequest) => {
        const filePath = await DebugLogService.ensureLogStored(params.id);
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
        return { success: true, message: 'Log opened in VS Code editor', path: filePath };
    });

    router.get('/api/debugLogs/:id/methodName', async ({ params }: RpcRequest) => ({
        success: true,
        methodName: await DebugLogService.getMethodName(params.id),
        logId: params.id,
    }));

    router.get('/api/debugLogs/:id/exists', async ({ params }: RpcRequest) => ({
        success: true,
        exists: await DebugLogService.isLogStored(params.id),
        logId: params.id,
    }));

    router.delete('/api/debugLogs/:id', async ({ params }: RpcRequest) => {
        await DebugLogProvider.deleteDebugLog(params.id);
        return { success: true, message: 'Debug log deleted' };
    });

    router.post('/api/debugLogs/delete', async ({ body }: RpcRequest) => {
        const { userName } = bodyObject(body);
        if (userName !== undefined && userName !== null && typeof userName !== 'string') {
            throw new RpcError('BAD_REQUEST', 'userName must be a string');
        }
        return { success: true, ...(await DebugLogService.deleteLogs(userName ?? undefined)) };
    });

    // ---- Trace flags ----
    router.get('/api/debugLevels', async () => ({
        success: true,
        debugLevels: await DebugLogService.listDebugLevels(),
    }));

    router.post('/api/traceFlags/start', async ({ body }: RpcRequest) => {
        const { userId, debugLevelId } = bodyObject(body);
        if (!isSalesforceId(userId)) {
            throw new RpcError('BAD_REQUEST', 'A valid User ID is required');
        }
        // Absent / null / '' means "use the default level"
        const requestedLevel =
            debugLevelId === undefined || debugLevelId === null || debugLevelId === '' ? undefined : debugLevelId;
        if (requestedLevel !== undefined && !isSalesforceId(requestedLevel)) {
            throw new RpcError('BAD_REQUEST', 'Invalid debug level ID');
        }
        const traceFlagId = await DebugLogService.createTraceFlag(userId, requestedLevel);
        return { success: true, traceFlagId, message: 'Trace flag created successfully' };
    });

    router.post('/api/traceFlags/stop', async ({ body }: RpcRequest) => {
        const { traceFlagId } = bodyObject(body);
        if (!isSalesforceId(traceFlagId)) {
            throw new RpcError('BAD_REQUEST', 'A valid Trace Flag ID is required');
        }
        await DebugLogService.deleteTraceFlag(traceFlagId);
        return { success: true, message: 'Trace flag deleted successfully' };
    });

    // ---- Workspace files / components ----
    router.get('/api/files', async ({ query }: RpcRequest) => {
        const dirPath = requireString(query.path, 'Missing path parameter');
        return { success: true, files: await withFileErrors(() => WorkspaceFileService.listDirectory(dirPath)) };
    });

    router.post('/api/files/open', async ({ body }: RpcRequest) => {
        const filePath = requireString(bodyObject(body).path, 'Missing path parameter');
        await withFileErrors(() => WorkspaceFileService.openFile(filePath));
        return { success: true };
    });

    router.get('/api/components', async () => {
        const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!currentFile) {
            throw new RpcError('BAD_REQUEST', 'No active file');
        }
        return { success: true, components: await getComponentFiles(currentFile) };
    });

    return router;
}

export const apiRouter = createApiRouter();
