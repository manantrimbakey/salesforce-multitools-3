import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { SFUtils } from '../../utils/sfutils';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { FormattedLastModifiedInfo } from './lastModifiedTypes';
import { storeLastModifiedInfo } from './lastModifiedStorage';

/**
 * Get metadata information for a Salesforce file including last modified by and date
 * @param filePath The path to the Salesforce file
 * @returns Object containing last modified information or null if not a Salesforce file
 */
export async function getFileLastModifiedInfo(filePath: string): Promise<FormattedLastModifiedInfo | null> {
    try {
        Logger.debug(`Getting last modified info for file: ${filePath}`, 'LastModifiedService.getFileLastModifiedInfo');
        // Extract the metadata type and API name from the file path
        const metadataInfo = getMetadataInfoFromFilePath(filePath);
        if (!metadataInfo) {
            Logger.warn(
                `Could not determine metadata type for file: ${filePath}`,
                'LastModifiedService.getFileLastModifiedInfo',
            );
            return null;
        }

        // Always query Salesforce for the latest data
        Logger.debug(
            `Querying last modified info for ${metadataInfo.type}:${metadataInfo.apiName}`,
            'LastModifiedService.getFileLastModifiedInfo',
        );

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

                Logger.debug(`LWC query: ${query}`, 'LastModifiedService.getFileLastModifiedInfo');
                break;
            case 'AuraDefinitionBundle':
                // Use exact DeveloperName match for Aura
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM AuraDefinitionBundle WHERE DeveloperName = '${metadataInfo.apiName}'`;

                Logger.debug(`Aura query: ${query}`, 'LastModifiedService.getFileLastModifiedInfo');
                break;
            case 'CustomObject':
                query = `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM CustomObject WHERE DeveloperName = '${metadataInfo.apiName}'`;
                break;
            default:
                Logger.warn(
                    `Unsupported metadata type: ${metadataInfo.type}`,
                    'LastModifiedService.getFileLastModifiedInfo',
                );
                return null;
        }

        Logger.debug(`Executing query: ${query}`, 'LastModifiedService.getFileLastModifiedInfo');
        result = await connection.tooling.query(query);
        Logger.debug(`Query result: ${JSON.stringify(result)}`, 'LastModifiedService.getFileLastModifiedInfo');

        if (result.records && result.records.length > 0) {
            const record = result.records[0];
            Logger.debug(
                `Query returned ${result.records.length} records. Using first record: ${JSON.stringify(record)}`,
                'LastModifiedService.getFileLastModifiedInfo',
            );

            const formattedInfo = {
                lastModifiedBy: record.LastModifiedBy.Name,
                lastModifiedDate: new Date(record.LastModifiedDate).toLocaleString(),
                lastModifiedById: record.LastModifiedById,
            };

            // Note: The comparison with stored data and notifications are now handled in the commands.ts file
            // The storage is also handled in the commands.ts file

            return formattedInfo;
        } else {
            Logger.warn(
                `No metadata found for ${metadataInfo.type}:${metadataInfo.apiName}`,
                'LastModifiedService.getFileLastModifiedInfo',
            );
            return null;
        }
    } catch (error) {
        Logger.error('Error getting file last modified info:', 'LastModifiedService.getFileLastModifiedInfo', error);
        throw error;
    }
}
