import * as fs from 'fs';
import { Logger } from './logger';
import * as vscode from 'vscode';

/**
 * Ensure a folder exists, creating it if necessary
 * @param folderPath The path to the folder to ensure exists
 */
export async function ensureFolderExists(folderPath: string): Promise<void> {
    try {
        await fs.promises.access(folderPath);
    } catch (error) {
        // Folder doesn't exist, create it
        Logger.debug(`Creating folder: ${folderPath}`, 'FileUtils.ensureFolderExists');
        await fs.promises.mkdir(folderPath, { recursive: true });
    }
}

/**
 * Write data to a JSON file (minified format)
 * @param filePath The path to the file
 * @param data The data to write
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
    try {
        await fs.promises.writeFile(filePath, JSON.stringify(data), 'utf-8');
        Logger.debug(`Wrote minified JSON data to: ${filePath}`, 'FileUtils.writeJsonFile');
    } catch (error) {
        Logger.error(`Error writing JSON file: ${filePath}`, 'FileUtils.writeJsonFile', error);
        throw error;
    }
}

/**
 * Read data from a JSON file
 * @param filePath The path to the file
 * @returns The parsed JSON data or null if the file doesn't exist
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
        // Check if file exists
        try {
            await fs.promises.access(filePath);
        } catch (error) {
            return null; // File doesn't exist
        }

        // Read and parse the JSON file
        const data = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(data) as T;
    } catch (error) {
        Logger.error(`Error reading JSON file: ${filePath}`, 'FileUtils.readJsonFile', error);
        return null;
    }
}

/**
 * Check if a file path is a valid regular file (not an extension output, temp file, etc.)
 * @param filePath The path to check
 * @returns True if the path is a regular file path, false otherwise
 */
export function isRegularFilePath(filePath: string): boolean {
    if (!filePath) {
        return false;
    }

    // Skip extension output, temporary files, and other special files
    if (
        filePath.includes('extension-output') ||
        filePath.includes('output-channel') ||
        filePath.includes('vscode-remote') ||
        filePath.startsWith('extension-') ||
        filePath.includes('untitled:')
    ) {
        return false;
    }

    return true;
}

/**
 * Check if an editor contains a valid regular file (not an extension output, temp file, etc.)
 * @param editor The editor to check
 * @returns True if the editor contains a regular file, false otherwise
 */
export function isRegularFileEditor(editor?: vscode.TextEditor): boolean {
    if (!editor) {
        return false;
    }

    // Skip non-file documents
    if (editor.document.uri.scheme !== 'file') {
        return false;
    }

    return isRegularFilePath(editor.document.uri.fsPath);
}
