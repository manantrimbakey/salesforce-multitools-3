import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isInsideWorkspace } from '../utils/validation';

export type DirectoryEntry = { name: string; path: string; isDirectory: boolean };

export class WorkspaceFileError extends Error {
    constructor(
        public readonly kind: 'forbidden' | 'not-found',
        message: string,
    ) {
        super(message);
        this.name = 'WorkspaceFileError';
    }
}

async function assertInsideWorkspace(target: string): Promise<void> {
    if (!(await isInsideWorkspace(target))) {
        throw new WorkspaceFileError('forbidden', 'Path is outside the workspace');
    }
}

/** File browsing helpers restricted to the open workspace folders. */
export class WorkspaceFileService {
    /** Visible entries of a directory, directories first then alphabetical. */
    public static async listDirectory(dirPath: string): Promise<DirectoryEntry[]> {
        await assertInsideWorkspace(dirPath);

        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new WorkspaceFileError('not-found', 'Directory not found');
            }
            throw error;
        }

        return entries
            .filter((entry) => !entry.name.startsWith('.'))
            .map((entry) => ({
                name: entry.name,
                path: path.join(dirPath, entry.name),
                isDirectory: entry.isDirectory(),
            }))
            .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
    }

    public static async openFile(filePath: string): Promise<void> {
        await assertInsideWorkspace(filePath);

        try {
            await fs.promises.access(filePath);
        } catch {
            throw new WorkspaceFileError('not-found', 'File not found');
        }
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    }
}
