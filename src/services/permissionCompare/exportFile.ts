import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { formatExport } from './exportFormat';
import type { ExportFormat, ExportInput } from './exportFormat';

const EXTENSIONS: Record<ExportFormat, { ext: string; filter: string }> = {
    markdown: { ext: 'md', filter: 'Markdown' },
    csv: { ext: 'csv', filter: 'CSV' },
};

/** A file name that is safe on every OS: letters, digits, `.`, `_`, `-`; never empty. */
export function safeBaseName(name: string): string {
    const cleaned = name
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/^[._]+|[._]+$/g, '')
        .slice(0, 80);
    return cleaned || 'permission-compare';
}

/**
 * Ask where to save (native dialog, so the user picks the location) and write the export there.
 * @returns the saved path, or `undefined` when the user cancelled
 */
export async function saveExport(
    format: ExportFormat,
    input: ExportInput,
    baseName: string,
): Promise<string | undefined> {
    const { ext, filter } = EXTENSIONS[format];
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(folder, `${safeBaseName(baseName)}.${ext}`)),
        filters: { [filter]: [ext] },
        title: 'Export permission comparison',
    });
    if (!target) {
        return undefined;
    }
    try {
        await fs.promises.writeFile(target.fsPath, formatExport(format, input), 'utf-8');
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not save the export to ${target.fsPath}: ${reason}`);
    }
    return target.fsPath;
}
