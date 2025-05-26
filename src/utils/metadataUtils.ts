import * as path from 'path';
import { Logger } from './logger';
import { isRegularFilePath } from './fileUtils';

/**
 * Metadata information about a Salesforce component
 */
export interface MetadataInfo {
    type: string;
    apiName: string;
}

// Cache for metadata info to prevent repeated extraction
const metadataInfoCache = new Map<string, MetadataInfo | null>();
let lastExtractedPath: string | null = null;
let lastExtractedTime: number = 0;

/**
 * Clear the metadata info cache
 */
export function clearMetadataInfoCache(): void {
    metadataInfoCache.clear();
    lastExtractedPath = null;
    lastExtractedTime = 0;
    Logger.debug('Metadata info cache cleared', 'MetadataUtils.clearMetadataInfoCache');
}

/**
 * Extract metadata type and API name from file path
 * @param filePath The path to the Salesforce file
 * @returns Object containing metadata type and API name or null if not recognized
 */
export function getMetadataInfoFromFilePath(filePath: string): MetadataInfo | null {
    // Quick reject for non-Salesforce file patterns
    if (!isRegularFilePath(filePath)) {
        return null;
    }

    // Use cached result if available
    if (metadataInfoCache.has(filePath)) {
        return metadataInfoCache.get(filePath) || null;
    }

    // Debounce extraction for the same file
    const now = Date.now();
    if (lastExtractedPath === filePath && now - lastExtractedTime < 1000) {
        // If we've checked this exact file in the last second, use the last result
        return metadataInfoCache.get(filePath) || null;
    }

    lastExtractedPath = filePath;
    lastExtractedTime = now;

    Logger.debug(`Extracting metadata info from: ${filePath}`, 'MetadataUtils.getMetadataInfoFromFilePath');

    const fileName = path.basename(filePath);

    // Match Apex class: classes/MyClass.cls
    if (fileName.endsWith('.cls')) {
        const result = {
            type: 'ApexClass',
            apiName: path.basename(fileName, '.cls'),
        };
        metadataInfoCache.set(filePath, result);
        return result;
    }

    // Match Apex trigger: triggers/MyTrigger.trigger
    if (fileName.endsWith('.trigger')) {
        const result = {
            type: 'ApexTrigger',
            apiName: path.basename(fileName, '.trigger'),
        };
        metadataInfoCache.set(filePath, result);
        return result;
    }

    // Match Visualforce page: pages/MyPage.page
    if (fileName.endsWith('.page')) {
        const result = {
            type: 'ApexPage',
            apiName: path.basename(fileName, '.page'),
        };
        metadataInfoCache.set(filePath, result);
        return result;
    }

    // Match Visualforce component: components/MyComponent.component
    if (fileName.endsWith('.component')) {
        const result = {
            type: 'ApexComponent',
            apiName: path.basename(fileName, '.component'),
        };
        metadataInfoCache.set(filePath, result);
        return result;
    }

    // Match Lightning Web Component: lwc/myComponent/*
    // Use the folder name as the component name regardless of the file name
    // More permissive regex to match any file within an LWC folder
    const lwcMatch = filePath.match(/(?:\/|\\)lwc(?:\/|\\)([^\/\\]+)(?:\/|\\)/);
    if (lwcMatch) {
        Logger.debug(`Matched LWC component: ${lwcMatch[1]}`, 'MetadataUtils.getMetadataInfoFromFilePath');
        const result = {
            type: 'LightningComponentBundle',
            apiName: lwcMatch[1],
        };
        metadataInfoCache.set(filePath, result);
        return result;
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
        Logger.debug(`Matched Aura component: ${auraMatch[1]}`, 'MetadataUtils.getMetadataInfoFromFilePath');
        const result = {
            type: 'AuraDefinitionBundle',
            apiName: auraMatch[1],
        };
        metadataInfoCache.set(filePath, result);
        return result;
    } else if (auraMetaMatch) {
        // Handle the case of meta files specifically
        Logger.debug(
            `Matched Aura meta file for component: ${auraMetaMatch[1]}`,
            'MetadataUtils.getMetadataInfoFromFilePath',
        );
        const result = {
            type: 'AuraDefinitionBundle',
            apiName: auraMetaMatch[1],
        };
        metadataInfoCache.set(filePath, result);
        return result;
    }

    // Match Custom Object: objects/MyObject__c/MyObject__c.object-meta.xml
    const objectMatch = filePath.match(/objects[\\/]([^\/\\]+)[\\/]/);
    if (objectMatch && fileName.endsWith('.object-meta.xml')) {
        const result = {
            type: 'CustomObject',
            apiName: objectMatch[1].replace('__c.object-meta.xml', ''),
        };
        metadataInfoCache.set(filePath, result);
        return result;
    }

    Logger.debug(`No metadata type matched for ${filePath}`, 'MetadataUtils.getMetadataInfoFromFilePath');
    metadataInfoCache.set(filePath, null);
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
