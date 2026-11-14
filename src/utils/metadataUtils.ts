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

const MAX_CACHE_ENTRIES = 500;

// Bounded (LRU) cache for metadata info to prevent repeated extraction
const metadataInfoCache = new Map<string, MetadataInfo | null>();

/** Single-file metadata types identified by file extension (file name is the API name). */
const EXTENSION_TYPES: ReadonlyArray<{ extension: string; type: string }> = [
    { extension: '.cls', type: 'ApexClass' },
    { extension: '.trigger', type: 'ApexTrigger' },
    { extension: '.page', type: 'ApexPage' },
    { extension: '.component', type: 'ApexComponent' },
];

/** Bundle metadata types identified by the folder containing the component (folder name is the API name). */
const BUNDLE_TYPES: ReadonlyArray<{ folder: string; type: string }> = [
    { folder: 'lwc', type: 'LightningComponentBundle' },
    { folder: 'aura', type: 'AuraDefinitionBundle' },
];

/** Custom object suffixes; the CustomObject `DeveloperName` is the name without suffix and namespace. */
const CUSTOM_OBJECT_NAME = /^(?:[A-Za-z0-9]+__)?(.+?)__(?:c|mdt|e|b)$/;

function remember(filePath: string, info: MetadataInfo | null): MetadataInfo | null {
    if (metadataInfoCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = metadataInfoCache.keys().next().value;
        if (oldest !== undefined) {
            metadataInfoCache.delete(oldest);
        }
    }
    metadataInfoCache.set(filePath, info);
    return info;
}

function extractMetadataInfo(filePath: string): MetadataInfo | null {
    const fileName = path.basename(filePath);

    // Single-file types: classes/MyClass.cls, triggers/MyTrigger.trigger, ...
    for (const { extension, type } of EXTENSION_TYPES) {
        if (fileName.endsWith(extension)) {
            return { type, apiName: path.basename(fileName, extension) };
        }
    }

    // Bundles: lwc/myComponent/*, aura/myComponent/* (any file inside the component folder)
    for (const { folder, type } of BUNDLE_TYPES) {
        const match = filePath.match(new RegExp(`[/\\\\]${folder}[/\\\\]([^/\\\\]+)[/\\\\]`));
        if (match) {
            Logger.debug(`Matched ${type}: ${match[1]}`, 'MetadataUtils.getMetadataInfoFromFilePath');
            return { type, apiName: match[1] };
        }
    }

    // Custom object: objects/MyObject__c/MyObject__c.object-meta.xml (standard objects are not CustomObject records)
    const objectMatch = filePath.match(/objects[/\\]([^/\\]+)[/\\]/);
    if (objectMatch && fileName.endsWith('.object-meta.xml')) {
        const developerName = objectMatch[1].match(CUSTOM_OBJECT_NAME)?.[1];
        if (developerName) {
            return { type: 'CustomObject', apiName: developerName };
        }
    }

    return null;
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

    const cached = metadataInfoCache.get(filePath);
    if (cached !== undefined) {
        return cached;
    }

    return remember(filePath, extractMetadataInfo(filePath));
}
