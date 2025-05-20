import * as path from 'path';
import { Logger } from './logger';

/**
 * Metadata information about a Salesforce component
 */
export interface MetadataInfo {
    type: string;
    apiName: string;
}

/**
 * Extract metadata type and API name from file path
 * @param filePath The path to the Salesforce file
 * @returns Object containing metadata type and API name or null if not recognized
 */
export function getMetadataInfoFromFilePath(filePath: string): MetadataInfo | null {
    const fileName = path.basename(filePath);
    const fileDir = path.dirname(filePath);

    Logger.debug(`Extracting metadata info from: ${filePath}`);

    // Match Apex class: classes/MyClass.cls
    if (fileName.endsWith('.cls')) {
        return {
            type: 'ApexClass',
            apiName: path.basename(fileName, '.cls'),
        };
    }

    // Match Apex trigger: triggers/MyTrigger.trigger
    if (fileName.endsWith('.trigger')) {
        return {
            type: 'ApexTrigger',
            apiName: path.basename(fileName, '.trigger'),
        };
    }

    // Match Visualforce page: pages/MyPage.page
    if (fileName.endsWith('.page')) {
        return {
            type: 'ApexPage',
            apiName: path.basename(fileName, '.page'),
        };
    }

    // Match Visualforce component: components/MyComponent.component
    if (fileName.endsWith('.component')) {
        return {
            type: 'ApexComponent',
            apiName: path.basename(fileName, '.component'),
        };
    }

    // Match Lightning Web Component: lwc/myComponent/*
    // Use the folder name as the component name regardless of the file name
    // More permissive regex to match any file within an LWC folder
    const lwcMatch = filePath.match(/(?:\/|\\)lwc(?:\/|\\)([^\/\\]+)(?:\/|\\)/);
    if (lwcMatch) {
        Logger.debug(`Matched LWC component: ${lwcMatch[1]}`);
        return {
            type: 'LightningComponentBundle',
            apiName: lwcMatch[1],
        };
    }

    // Match Aura Component: aura/myComponent/*
    // Use the folder name as the component name regardless of the file name
    // More permissive regex to match any file within an Aura folder
    const auraMatch = filePath.match(/(?:\/|\\)aura(?:\/|\\)([^\/\\]+)(?:\/|\\)/);

    // Also handle Aura meta files that might be directly under the aura component folder
    // Pattern: aura/MyComponent/MyComponent.cmp-meta.xml
    const auraMetaMatch = filePath.match(
        /(?:\/|\\)aura(?:\/|\\)([^\/\\]+)(?:\/|\\)[^\/\\]*\.(cmp|app|intf|evt|design)-meta\.xml$/,
    );

    if (auraMatch) {
        Logger.debug(`Matched Aura component: ${auraMatch[1]}`);
        return {
            type: 'AuraDefinitionBundle',
            apiName: auraMatch[1],
        };
    } else if (auraMetaMatch) {
        // Handle the case of meta files specifically
        Logger.debug(`Matched Aura meta file for component: ${auraMetaMatch[1]}`);
        return {
            type: 'AuraDefinitionBundle',
            apiName: auraMetaMatch[1],
        };
    }

    // Match Custom Object: objects/MyObject__c/MyObject__c.object-meta.xml
    const objectMatch = filePath.match(/objects[\\/]([^\/\\]+)[\\/]/);
    if (objectMatch && fileName.endsWith('.object-meta.xml')) {
        return {
            type: 'CustomObject',
            apiName: objectMatch[1].replace('__c.object-meta.xml', ''),
        };
    }

    Logger.debug(`No metadata type matched for ${filePath}`);
    return null;
}

/**
 * Get the path to store metadata information for a component
 * @param rootPath The workspace root path
 * @param metadataType The type of metadata
 * @param apiName The API name of the component
 * @param subFolder Optional subfolder within _multi-tool
 * @returns Full path to the file
 */
export function getMetadataStoragePath(
    rootPath: string,
    metadataType: string,
    apiName: string,
    subFolder: string = 'metadata',
): string {
    return path.join(rootPath, '.sfdx', '_multi-tool', subFolder, metadataType, `${apiName}.json`);
}
