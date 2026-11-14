import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { isSalesforceId } from '../utils/validation';

/** Directories that were already created, so mkdir is not repeated for every log. */
const ensuredDirectories = new Map<string, Promise<void>>();

function ensureDirectory(directory: string): Promise<void> {
    let ensured = ensuredDirectories.get(directory);
    if (!ensured) {
        ensured = fs.promises.mkdir(directory, { recursive: true }).then(() => undefined);
        // Do not memoize failures (e.g. folder removed or permissions fixed later)
        ensured.catch(() => ensuredDirectories.delete(directory));
        ensuredDirectories.set(directory, ensured);
    }
    return ensured;
}

/** Folder name derived from the org instance URL, safe to use as a path segment. */
function orgFolderName(instanceUrl: string | undefined): string {
    if (!instanceUrl) {
        return 'unknown-org';
    }
    return (
        instanceUrl
            .replace(/^https?:\/\//, '')
            .replace(/[^a-zA-Z0-9.-]/g, '-')
            .toLowerCase() || 'unknown-org'
    );
}

/**
 * On-disk cache of downloaded Apex logs: `<workspace>/.sfdx/_multi-tool/debug-logs/<org>/<logId>.log`.
 */
export class LogStorage {
    /** Absolute path of the stored log; also makes sure its directory exists. */
    public static async getLogPath(instanceUrl: string | undefined, logId: string): Promise<string> {
        if (!isSalesforceId(logId)) {
            throw new Error('Invalid log id');
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found to store logs');
        }

        const directory = path.join(
            workspaceFolder.uri.fsPath,
            '.sfdx',
            '_multi-tool',
            'debug-logs',
            orgFolderName(instanceUrl),
        );
        await ensureDirectory(directory);
        return path.join(directory, `${logId}.log`);
    }

    public static async exists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Atomically store a log: stream into a temp file in the same directory, then rename it over
     * the final path so readers never observe a partial file.
     */
    public static async write(filePath: string, source: Readable): Promise<void> {
        const tempPath = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
        try {
            await pipeline(source, fs.createWriteStream(tempPath));
            await fs.promises.rename(tempPath, filePath);
        } catch (error) {
            await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
            throw error;
        }
        Logger.debug(`Saved log to ${filePath}`, 'LogStorage.write');
    }

    /** Read at most `maxBytes` from the start of a stored log; `truncated` when the file may be longer. */
    public static async readHead(filePath: string, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
        const handle = await fs.promises.open(filePath, 'r');
        try {
            const buffer = Buffer.alloc(maxBytes);
            const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
            return { text: buffer.toString('utf8', 0, bytesRead), truncated: bytesRead === maxBytes };
        } finally {
            await handle.close();
        }
    }

    public static async remove(filePath: string): Promise<void> {
        await fs.promises.rm(filePath, { force: true });
    }
}
