import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { SFUtils } from '../../utils/sfutils';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { FormattedLastModifiedInfo, LastModifiedInfo } from './lastModifiedTypes';
import { storeLastModifiedInfo, getStoredLastModifiedInfo } from './lastModifiedStorage';

/**
 * Get metadata information for a Salesforce file including last modified by and date
 * @param filePath The path to the Salesforce file
 * @returns Object containing last modified information or null if not a Salesforce file
 */
export async function getFileLastModifiedInfo(filePath: string): Promise<FormattedLastModifiedInfo | null> {
    try {
        // Extract the metadata type and API name from the file path
        const metadataInfo = getMetadataInfoFromFilePath(filePath);
        if (!metadataInfo) {
            Logger.warn(`Could not determine metadata type for file: ${filePath}`);
            return null;
        }

        // Always query Salesforce for the latest data
        Logger.debug(`Querying last modified info for ${metadataInfo.type}:${metadataInfo.apiName}`);

        await SFUtils.initialize();
        const connection = await SFUtils.getConnection();

        let result;
        let query = '';

        switch (metadataInfo.type) {
            case 'ApexClass':
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM ApexClass WHERE Name = '${metadataInfo.apiName}'`;
                break;
            case 'ApexTrigger':
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM ApexTrigger WHERE Name = '${metadataInfo.apiName}'`;
                break;
            case 'ApexPage':
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM ApexPage WHERE Name = '${metadataInfo.apiName}'`;
                break;
            case 'ApexComponent':
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM ApexComponent WHERE Name = '${metadataInfo.apiName}'`;
                break;
            case 'LightningComponentBundle':
                // Use exact DeveloperName match for LWC
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM LightningComponentBundle WHERE DeveloperName = '${metadataInfo.apiName}'`;
                Logger.debug(`LWC query: ${query}`);
                break;
            case 'AuraDefinitionBundle':
                // Use exact DeveloperName match for Aura
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM AuraDefinitionBundle WHERE DeveloperName = '${metadataInfo.apiName}'`;
                Logger.debug(`Aura query: ${query}`);
                break;
            case 'CustomObject':
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM CustomObject WHERE DeveloperName = '${metadataInfo.apiName}'`;
                break;
            default:
                Logger.warn(`Unsupported metadata type: ${metadataInfo.type}`);
                return null;
        }

        Logger.debug(`Executing query: ${query}`);
        result = await connection.tooling.query(query);
        Logger.debug(`Query result: ${JSON.stringify(result)}`);

        if (result.records && result.records.length > 0) {
            const record = result.records[0];
            Logger.debug(
                `Query returned ${result.records.length} records. Using first record: ${JSON.stringify(record)}`,
            );

            const formattedInfo = {
                lastModifiedBy: record.LastModifiedBy.Name,
                lastModifiedDate: new Date(record.LastModifiedDate).toLocaleString(),
                lastModifiedById: record.LastModifiedById,
            };

            // Check if the file has been modified by someone else
            await checkForExternalModifications(metadataInfo.type, metadataInfo.apiName, record);

            // Store the last modified info for future use (but don't use it as a source of truth)
            await storeLastModifiedInfo(metadataInfo.type, metadataInfo.apiName, {
                lastModifiedBy: record.LastModifiedBy.Name,
                lastModifiedDate: record.LastModifiedDate,
                lastModifiedById: record.LastModifiedById,
                retrievedAt: new Date().toISOString(),
            });

            return formattedInfo;
        } else {
            Logger.warn(`No metadata found for ${metadataInfo.type}:${metadataInfo.apiName}`);
            return null;
        }
    } catch (error) {
        Logger.error('Error getting file last modified info:', error);
        throw error;
    }
}

/**
 * Check if the file has been modified by someone else since our last check
 * @param metadataType The type of metadata
 * @param apiName The API name of the component
 * @param currentData The current data from Salesforce
 */
async function checkForExternalModifications(metadataType: string, apiName: string, currentData: any): Promise<void> {
    try {
        // Get the stored last modified info
        const storedInfo = await getStoredLastModifiedInfo(metadataType, apiName);

        // If we don't have stored info, there's nothing to compare
        if (!storedInfo) {
            return;
        }

        // Check if the modification date is different
        const storedDate = new Date(storedInfo.lastModifiedDate).getTime();
        const currentDate = new Date(currentData.LastModifiedDate).getTime();
        const storedId = storedInfo.lastModifiedById;
        const currentId = currentData.LastModifiedById;

        // If the date is newer and it's a different user, show a notification
        if (currentDate > storedDate && storedId !== currentId) {
            // Show notification that someone else has modified the file
            vscode.window.showInformationMessage(
                `This file was modified on Salesforce by ${currentData.LastModifiedBy.Name} since your last check.`,
                'OK',
            );

            Logger.info(
                `External modification detected for ${metadataType}:${apiName} by ${currentData.LastModifiedBy.Name}`,
            );
        }
    } catch (error) {
        // Don't let errors in the check interrupt the main flow
        Logger.error('Error checking for external modifications:', error);
    }
}
