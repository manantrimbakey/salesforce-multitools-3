import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/logger';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { isRegularFilePath } from '../../utils/fileUtils';

/**
 * File types for LWC and Aura components
 */
export enum ComponentFileType {
    JS = 'JavaScript',
    HTML = 'HTML/Markup',
    CSS = 'CSS',
    XML = 'XML Metadata',
    SVG = 'SVG',
    CONTROLLER = 'Controller',
    HELPER = 'Helper',
    RENDERER = 'Renderer',
    DESIGN = 'Design',
    DOCUMENTATION = 'Documentation',
    OTHER = 'Other',
}

/**
 * Interface for a component file
 */
export interface ComponentFile {
    path: string;
    name: string;
    type: ComponentFileType;
    priority: number; // Used for sorting in QuickPick
    isBaseFile: boolean; // Is this the main file of the component?
    isUnsaved: boolean; // Is the file unsaved?
}

/**
 * Component Type
 */
export enum ComponentType {
    LWC = 'LWC',
    AURA = 'AURA',
    UNKNOWN = 'UNKNOWN',
}

/**
 * Get the component type from a file path
 */
export function getComponentType(filePath: string): ComponentType {
    Logger.debug(`Getting component type for ${filePath}`, 'ComponentFileSwitcher.getComponentType');
    const metadataInfo = getMetadataInfoFromFilePath(filePath);

    if (!metadataInfo) {
        return ComponentType.UNKNOWN;
    }

    if (metadataInfo.type === 'LightningComponentBundle') {
        return ComponentType.LWC;
    }

    if (metadataInfo.type === 'AuraDefinitionBundle') {
        return ComponentType.AURA;
    }

    return ComponentType.UNKNOWN;
}

/**
 * Get the component folder from a file path
 */
export function getComponentFolder(filePath: string): string | null {
    Logger.debug(`Getting component folder for ${filePath}`, 'ComponentFileSwitcher.getComponentFolder');
    const metadataInfo = getMetadataInfoFromFilePath(filePath);

    if (!metadataInfo) {
        return null;
    }

    // The metadata info already confirms it's a valid component.
    // We just need the parent directory of the file.
    return path.dirname(filePath);
}

/**
 * Get the component name from a file path
 */
export function getComponentName(filePath: string): string | null {
    Logger.debug(`Getting component name for ${filePath}`, 'ComponentFileSwitcher.getComponentName');
    const metadataInfo = getMetadataInfoFromFilePath(filePath);

    if (!metadataInfo) {
        return null;
    }

    return metadataInfo.apiName;
}

/**
 * Get all related files for a component
 */
export async function getComponentFiles(filePath: string): Promise<ComponentFile[]> {
    Logger.debug(`getComponentFiles called for ${filePath}`, 'ComponentFileSwitcher.getComponentFiles');
    const componentFolder = getComponentFolder(filePath);
    const componentName = getComponentName(filePath);

    if (!componentFolder || !componentName) {
        Logger.warn(
            `Could not determine component folder or name for ${filePath}`,
            'ComponentFileSwitcher.getComponentFiles',
        );
        return [];
    }

    const componentType = getComponentType(filePath);

    try {
        const files = await fs.promises.readdir(componentFolder);

        // Get open document URIs to check for unsaved files
        const openDocuments = vscode.workspace.textDocuments;
        const openDocumentPaths = new Set(openDocuments.map((doc) => doc.uri.fsPath));
        const unsavedDocuments = new Set(openDocuments.filter((doc) => doc.isDirty).map((doc) => doc.uri.fsPath));

        const componentFiles: ComponentFile[] = [];

        for (const file of files) {
            const filePath = path.join(componentFolder, file);
            const isUnsaved = unsavedDocuments.has(filePath);

            // Create component file
            const compFile = createComponentFile(componentName, componentType, filePath, file, isUnsaved);
            if (compFile) {
                componentFiles.push(compFile);
            }
        }

        // Sort by priority
        return componentFiles.sort((a, b) => a.priority - b.priority);
    } catch (error) {
        Logger.error(`Error getting component files: ${error}`, 'ComponentFileSwitcher.getComponentFiles');
        return [];
    }
}

/**
 * Create a component file object for LWC or Aura
 */
function createComponentFile(
    componentName: string,
    componentType: ComponentType,
    filePath: string,
    fileName: string,
    isUnsaved: boolean,
): ComponentFile | null {
    let type = ComponentFileType.OTHER;
    let priority = 9;
    let isBaseFile = false;

    if (componentType === ComponentType.LWC) {
        if (fileName === `${componentName}.js`) { type = ComponentFileType.JS; priority = 1; isBaseFile = true; }
        else if (fileName === `${componentName}.html`) { type = ComponentFileType.HTML; priority = 2; }
        else if (fileName === `${componentName}.css`) { type = ComponentFileType.CSS; priority = 3; }
        else if (fileName.endsWith('.js') && !fileName.endsWith('-meta.xml')) { type = ComponentFileType.JS; priority = 4; }
        else if (fileName.endsWith('.html')) { type = ComponentFileType.HTML; priority = 5; }
        else if (fileName.endsWith('.css')) { type = ComponentFileType.CSS; priority = 6; }
        else if (fileName.endsWith('.svg')) { type = ComponentFileType.SVG; priority = 7; }
        else if (fileName.endsWith('-meta.xml')) { type = ComponentFileType.XML; priority = 10; }
    } else if (componentType === ComponentType.AURA) {
        if (fileName === `${componentName}Controller.js`) { type = ComponentFileType.CONTROLLER; priority = 1; isBaseFile = true; }
        else if (['.cmp', '.app', '.intf', '.evt'].some(ext => fileName === `${componentName}${ext}`)) { type = ComponentFileType.HTML; priority = 2; isBaseFile = true; }
        else if (fileName === `${componentName}.css`) { type = ComponentFileType.CSS; priority = 3; }
        else if (fileName === `${componentName}Helper.js`) { type = ComponentFileType.HELPER; priority = 4; }
        else if (fileName === `${componentName}Renderer.js`) { type = ComponentFileType.RENDERER; priority = 5; }
        else if (fileName.endsWith('.svg')) { type = ComponentFileType.SVG; priority = 6; }
        else if (fileName.endsWith('.design')) { type = ComponentFileType.DESIGN; priority = 7; }
        else if (fileName.endsWith('.auradoc')) { type = ComponentFileType.DOCUMENTATION; priority = 8; }
        else if (['.cmp-meta.xml', '.app-meta.xml', '.intf-meta.xml', '.evt-meta.xml'].some(ext => fileName.endsWith(ext))) { type = ComponentFileType.XML; priority = 10; }
    }

    return { path: filePath, name: fileName, type, priority, isBaseFile, isUnsaved };
}

/**
 * Format component files for display in the QuickPick
 */
export function formatComponentFilesForQuickPick(files: ComponentFile[]): vscode.QuickPickItem[] {
    return files.map((file) => {
        // Icons based on file type
        let icon = '';
        switch (file.type) {
            case ComponentFileType.JS:
            case ComponentFileType.CONTROLLER:
            case ComponentFileType.HELPER:
            case ComponentFileType.RENDERER:
                icon = '$(json) ';
                break;
            case ComponentFileType.HTML:
                icon = '$(file-code) ';
                break;
            case ComponentFileType.CSS:
                icon = '$(symbol-color) ';
                break;
            case ComponentFileType.XML:
                icon = '$(symbol-misc) ';
                break;
            case ComponentFileType.SVG:
                icon = '$(symbol-ruler) ';
                break;
            default:
                icon = '$(file) ';
        }

        // Add unsaved indicator
        const unsavedIndicator = file.isUnsaved ? '$(circle-filled) ' : '';

        return {
            label: `${icon}${unsavedIndicator}${file.name}`,
            description: file.type,
            detail: file.isBaseFile ? '(Main component file)' : undefined,
            alwaysShow: file.isBaseFile, // Always show the main files
            picked: file.isBaseFile, // Pre-select the main file
        };
    });
}

/**
 * Check if the current file is part of a Lightning component (LWC or Aura)
 */
export function isLightningComponentFile(filePath: string): boolean {
    // Skip non-regular files like extension output, temp files etc.
    if (!isRegularFilePath(filePath)) {
        return false;
    }

    Logger.debug(`isLightningComponentFile called for ${filePath}`, 'ComponentFileSwitcher.isLightningComponentFile');
    return getComponentType(filePath) !== ComponentType.UNKNOWN;
}

/**
 * Get file details for UI display
 */
export function getComponentDetails(filePath: string): {
    componentName: string | null;
    componentType: ComponentType;
    fileName: string;
} {
    Logger.debug(`getComponentDetails called for ${filePath}`, 'ComponentFileSwitcher.getComponentDetails');
    const componentName = getComponentName(filePath);
    const componentType = getComponentType(filePath);
    const fileName = path.basename(filePath);

    return {
        componentName,
        componentType,
        fileName,
    };
}
