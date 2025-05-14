import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { ensureFolderExists, writeJsonFile, readJsonFile } from '../../utils/fileUtils';
import { LastModifiedInfo } from './lastModifiedTypes';

// Constants
const LAST_MODIFIED_SUBFOLDER = 'last-modified';
const MULTI_TOOL_FOLDER = '_multi-tool';

/**
 * Store last modified information for a Salesforce metadata component
 * @param metadataType The type of metadata (ApexClass, LightningComponentBundle, etc.)
 * @param apiName The API name of the component
 * @param modifiedInfo The modification information to store
 */
export async function storeLastModifiedInfo(
    metadataType: string,
    apiName: string,
    modifiedInfo: LastModifiedInfo,
): Promise<void> {
    try {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            Logger.warn('No workspace folder found to store last modified info');
            return;
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const sfdxFolder = path.join(rootPath, '.sfdx');
        const multiToolFolder = path.join(sfdxFolder, MULTI_TOOL_FOLDER);
        const lastModifiedFolder = path.join(multiToolFolder, LAST_MODIFIED_SUBFOLDER);

        // Create folders if they don't exist
        await ensureFolderExists(sfdxFolder);
        await ensureFolderExists(multiToolFolder);
        await ensureFolderExists(lastModifiedFolder);

        // Store by metadata type to keep files organized
        const metadataTypeFolder = path.join(lastModifiedFolder, metadataType);
        await ensureFolderExists(metadataTypeFolder);

        // Create or update the JSON file for this component
        const filePath = path.join(metadataTypeFolder, `${apiName}.json`);

        Logger.debug(`Storing last modified info to: ${filePath}`);
        await writeJsonFile(filePath, modifiedInfo);

        Logger.info(`Last modified info stored for ${metadataType}:${apiName}`);
    } catch (error) {
        Logger.error(`Error storing last modified info for ${metadataType}:${apiName}:`, error);
        // Don't throw - storing info is non-critical
    }
}

/**
 * Get stored last modified information for a Salesforce component
 * @param metadataType The type of metadata (ApexClass, LightningComponentBundle, etc.)
 * @param apiName The API name of the component
 * @returns The stored modification information or null if not found
 */
export async function getStoredLastModifiedInfo(
    metadataType: string,
    apiName: string,
): Promise<LastModifiedInfo | null> {
    try {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return null;
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const filePath = path.join(
            rootPath,
            '.sfdx',
            MULTI_TOOL_FOLDER,
            LAST_MODIFIED_SUBFOLDER,
            metadataType,
            `${apiName}.json`,
        );

        return await readJsonFile<LastModifiedInfo>(filePath);
    } catch (error) {
        Logger.error(`Error reading stored last modified info for ${metadataType}:${apiName}:`, error);
        return null;
    }
}

/**
 * Get the storage path for a component's last modified info
 * @param metadataType The type of metadata
 * @param apiName The API name of the component
 * @returns The storage path relative to the workspace root
 */
export function getLastModifiedStoragePath(metadataType: string, apiName: string): string {
    return `.sfdx/${MULTI_TOOL_FOLDER}/${LAST_MODIFIED_SUBFOLDER}/${metadataType}/${apiName}.json`;
}
