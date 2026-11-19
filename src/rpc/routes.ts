import * as vscode from 'vscode';
import { getComponentFiles } from '../features/componentFileSwitcher/componentFileSwitcherUtils';
import { DebugLogProvider } from '../features/debugLogs/debugLogProvider';
import { DebugLogService, LogFilter } from '../services/debugLogService';
import { saveExport } from '../services/permissionCompare/exportFile';
import type { ExportFormat } from '../services/permissionCompare/exportFormat';
import { PermissionCompareService } from '../services/permissionCompare/permissionCompareService';
import type { CompareSide } from '../services/permissionCompare/permissionCompareService';
import { PERMISSION_SECTIONS } from '../services/permissionCompare/types';
import type { DiffEntry, PermissionItemType, PermissionSource } from '../services/permissionCompare/types';
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

const MAX_REF_LENGTH = 255;
const MAX_ITEM_ID_LENGTH = 1024;

function parseItemType(value: unknown): PermissionItemType {
    if (value !== 'permissionset' && value !== 'profile' && value !== 'permissionsetgroup') {
        throw new RpcError('BAD_REQUEST', 'type must be "permissionset", "profile" or "permissionsetgroup"');
    }
    return value;
}

/** Shape-check a compare source. Org usernames and git refs are verified against allow-lists by the service. */
export function parseSource(value: unknown): PermissionSource {
    if (typeof value !== 'object' || value === null) {
        throw new RpcError('BAD_REQUEST', 'source is required');
    }
    const { kind, username, ref } = value as Record<string, unknown>;
    if (kind === 'org') {
        if (typeof username !== 'string' || username.length === 0 || username.length > 256) {
            throw new RpcError('BAD_REQUEST', 'A valid org username is required');
        }
        return { kind, username };
    }
    if (kind === 'branch') {
        if (typeof ref !== 'string' || ref.length === 0 || ref.length > MAX_REF_LENGTH || ref.includes('\0')) {
            throw new RpcError('BAD_REQUEST', 'A valid branch or tag is required');
        }
        return { kind, ref };
    }
    throw new RpcError('BAD_REQUEST', 'source.kind must be "org" or "branch"');
}

export function parseSide(value: unknown): CompareSide {
    if (typeof value !== 'object' || value === null) {
        throw new RpcError('BAD_REQUEST', 'Both sides are required');
    }
    const { source: rawSource, item: rawItem } = value as Record<string, unknown>;
    const source = parseSource(rawSource);
    if (typeof rawItem !== 'object' || rawItem === null) {
        throw new RpcError('BAD_REQUEST', 'item is required');
    }
    const { type, id } = rawItem as Record<string, unknown>;
    const itemType = parseItemType(type);
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ITEM_ID_LENGTH || id.includes('\0')) {
        throw new RpcError('BAD_REQUEST', 'A valid item id is required');
    }
    if (source.kind === 'org' && !isSalesforceId(id)) {
        throw new RpcError(
            'BAD_REQUEST',
            'The selected item does not belong to this org. Pick it again from the list.',
        );
    }
    return { source, item: { type: itemType, id } };
}

const MAX_EXPORT_ENTRIES = 200_000;
const MAX_LABEL_LENGTH = 500;
const DIFF_STATUSES = ['added', 'removed', 'changed'];

function parsePerms(value: unknown): Record<string, boolean | string> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new RpcError('BAD_REQUEST', 'Invalid permissions in export');
    }
    const perms: Record<string, boolean | string> = {};
    for (const [name, perm] of Object.entries(value)) {
        if (typeof perm !== 'boolean' && typeof perm !== 'string') {
            throw new RpcError('BAD_REQUEST', 'Invalid permission value in export');
        }
        perms[name] = perm;
    }
    return perms;
}

function parseSources(value: unknown): Record<string, string[]> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new RpcError('BAD_REQUEST', 'Invalid sources in export');
    }
    const sources: Record<string, string[]> = {};
    for (const [perm, names] of Object.entries(value)) {
        if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) {
            throw new RpcError('BAD_REQUEST', 'Invalid sources in export');
        }
        sources[perm] = names as string[];
    }
    return sources;
}

/** Shape-check the diff entries the webview wants exported (the formatter trusts the shape). */
export function parseExportEntries(value: unknown): DiffEntry[] {
    if (!Array.isArray(value) || value.length > MAX_EXPORT_ENTRIES) {
        throw new RpcError('BAD_REQUEST', 'entries must be a list');
    }
    return value.map((raw): DiffEntry => {
        const entry = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        const { section, key, status, changes } = entry;
        if (
            !PERMISSION_SECTIONS.includes(section as DiffEntry['section']) ||
            typeof key !== 'string' ||
            !DIFF_STATUSES.includes(status as string) ||
            !Array.isArray(changes)
        ) {
            throw new RpcError('BAD_REQUEST', 'Invalid entry in export');
        }
        return {
            section: section as DiffEntry['section'],
            key,
            status: status as DiffEntry['status'],
            left: parsePerms(entry.left),
            right: parsePerms(entry.right),
            leftGrantedBy: parseSources(entry.leftGrantedBy),
            rightGrantedBy: parseSources(entry.rightGrantedBy),
            changes: changes.map((change) => {
                const { perm, left, right } = (change ?? {}) as Record<string, unknown>;
                if (
                    typeof perm !== 'string' ||
                    !['boolean', 'string'].includes(typeof left) ||
                    !['boolean', 'string'].includes(typeof right)
                ) {
                    throw new RpcError('BAD_REQUEST', 'Invalid change in export');
                }
                return { perm, left: left as boolean | string, right: right as boolean | string };
            }),
        };
    });
}

function parseLabel(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length > MAX_LABEL_LENGTH) {
        throw new RpcError('BAD_REQUEST', `${name} is required`);
    }
    return value;
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

    // ---- Permission compare ----
    router.get('/api/compare/context', async () => ({
        success: true,
        ...(await PermissionCompareService.getContext()),
    }));

    router.post('/api/compare/items', async ({ body }: RpcRequest) => {
        const { source, type } = bodyObject(body);
        return {
            success: true,
            items: await PermissionCompareService.listItems(parseSource(source), parseItemType(type)),
        };
    });

    router.post('/api/compare/run', async ({ body }: RpcRequest) => {
        const { left, right } = bodyObject(body);
        return { success: true, ...(await PermissionCompareService.compare(parseSide(left), parseSide(right))) };
    });

    router.post('/api/compare/export', async ({ body }: RpcRequest) => {
        const { format, leftLabel, rightLabel, entries } = bodyObject(body);
        if (format !== 'markdown' && format !== 'csv') {
            throw new RpcError('BAD_REQUEST', 'format must be "markdown" or "csv"');
        }
        const input = {
            leftLabel: parseLabel(leftLabel, 'leftLabel'),
            rightLabel: parseLabel(rightLabel, 'rightLabel'),
            entries: parseExportEntries(entries),
        };
        const path = await saveExport(format as ExportFormat, input, `${input.leftLabel}_vs_${input.rightLabel}`);
        return path ? { success: true, saved: true, path } : { success: true, saved: false };
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
