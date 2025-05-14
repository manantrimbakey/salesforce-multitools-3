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
    const lwcMatch = filePath.match(/lwc[\\/]([^\/\\]+)[\\/]/);
    if (lwcMatch) {
        return {
            type: 'LightningComponentBundle',
            apiName: lwcMatch[1],
        };
    }

    // Match Aura Component: aura/myComponent/*
    // Use the folder name as the component name regardless of the file name
    const auraMatch = filePath.match(/aura[\\/]([^\/\\]+)[\\/]/);
    if (auraMatch) {
        return {
            type: 'AuraDefinitionBundle',
            apiName: auraMatch[1],
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

    // Add more metadata types as needed

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
