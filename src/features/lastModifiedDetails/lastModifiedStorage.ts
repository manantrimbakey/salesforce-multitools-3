import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { ensureFolderExists, writeJsonFile, readJsonFile } from '../../utils/fileUtils';
import { LastModifiedInfo } from './lastModifiedTypes';
import { SFUtils } from '../../utils/sfutils';

// Constants
const LAST_MODIFIED_SUBFOLDER = 'last-modified';
const MULTI_TOOL_FOLDER = '_multi-tool';

/**
 * Get sanitized org identifier for file paths
 * @param orgId The org identifier (usually the instance URL)
 * @returns A sanitized string usable in file paths
 */
function getSanitizedOrgId(orgId: string): string {
    if (!orgId) {
        return 'unknown-org';
    }
    
    // Remove protocol and special characters
    return orgId
        .replace(/^https?:\/\//, '')
        .replace(/[^a-zA-Z0-9.-]/g, '-')
        .toLowerCase();
}

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

        // Get org identifier for organization-specific storage
        const orgId = modifiedInfo.orgId ? getSanitizedOrgId(modifiedInfo.orgId) : 'unknown-org';
        const orgFolder = path.join(lastModifiedFolder, orgId);
        await ensureFolderExists(orgFolder);

        // Store by metadata type to keep files organized
        const metadataTypeFolder = path.join(orgFolder, metadataType);
        await ensureFolderExists(metadataTypeFolder);

        // Create or update the JSON file for this component
        const filePath = path.join(metadataTypeFolder, `${apiName}.json`);

        Logger.debug(`Storing last modified info to: ${filePath}`);
        await writeJsonFile(filePath, modifiedInfo);

        Logger.info(`Last modified info stored for ${metadataType}:${apiName} in org ${orgId}`);
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

        // Get current org info to find the right storage location
        const connection = await SFUtils.getConnection();
        const orgId = connection?.instanceUrl ? getSanitizedOrgId(connection.instanceUrl) : 'unknown-org';

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const filePath = path.join(
            rootPath,
            '.sfdx',
            MULTI_TOOL_FOLDER,
            LAST_MODIFIED_SUBFOLDER,
            orgId,
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
    // This is a best-effort since we don't have connection info here
    // The actual path used in storage/retrieval will include org ID
    return `.sfdx/${MULTI_TOOL_FOLDER}/${LAST_MODIFIED_SUBFOLDER}/<org-id>/${metadataType}/${apiName}.json`;
}
