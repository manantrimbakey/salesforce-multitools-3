import { Logger } from '../../utils/logger';
import { SFUtils } from '../../utils/sfutils';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { FormattedLastModifiedInfo } from './lastModifiedTypes';
import { soqlEscape } from '../../utils/validation';

/** Tooling API object and the field holding the component's API name, per metadata type */
const QUERY_TARGETS: Record<string, { sobject: string; nameField: string }> = {
    ApexClass: { sobject: 'ApexClass', nameField: 'Name' },
    ApexTrigger: { sobject: 'ApexTrigger', nameField: 'Name' },
    ApexPage: { sobject: 'ApexPage', nameField: 'Name' },
    ApexComponent: { sobject: 'ApexComponent', nameField: 'Name' },
    LightningComponentBundle: { sobject: 'LightningComponentBundle', nameField: 'DeveloperName' },
    AuraDefinitionBundle: { sobject: 'AuraDefinitionBundle', nameField: 'DeveloperName' },
    CustomObject: { sobject: 'CustomObject', nameField: 'DeveloperName' },
};

interface LastModifiedRecord {
    LastModifiedBy: { Name: string };
    LastModifiedDate: string;
    LastModifiedById: string;
}

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
            Logger.warn(
                `Could not determine metadata type for file: ${filePath}`,
                'LastModifiedService.getFileLastModifiedInfo',
            );
            return null;
        }

        const target = QUERY_TARGETS[metadataInfo.type];
        if (!target) {
            Logger.warn(
                `Unsupported metadata type: ${metadataInfo.type}`,
                'LastModifiedService.getFileLastModifiedInfo',
            );
            return null;
        }

        // Always query Salesforce for the latest data
        const connection = await SFUtils.getConnection();
        const query =
            `SELECT LastModifiedBy.Name, LastModifiedDate, LastModifiedById FROM ${target.sobject} ` +
            `WHERE ${target.nameField} = '${soqlEscape(metadataInfo.apiName)}'`;

        Logger.debug(`Executing query: ${query}`, 'LastModifiedService.getFileLastModifiedInfo');
        const result = await connection.tooling.query<LastModifiedRecord>(query);

        const record = result.records?.[0];
        if (!record) {
            Logger.warn(
                `No metadata found for ${metadataInfo.type}:${metadataInfo.apiName}`,
                'LastModifiedService.getFileLastModifiedInfo',
            );
            return null;
        }

        return {
            lastModifiedBy: record.LastModifiedBy.Name,
            lastModifiedDate: record.LastModifiedDate, // Keep the ISO date string for storage and comparison
            lastModifiedById: record.LastModifiedById,
            formattedDate: new Date(record.LastModifiedDate).toLocaleString(), // Human-readable, local format
        };
    } catch (error) {
        Logger.error('Error getting file last modified info:', 'LastModifiedService.getFileLastModifiedInfo', error);
        throw error;
    }
}
