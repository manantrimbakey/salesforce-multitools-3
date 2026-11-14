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
 * A Lightning component (LWC or Aura bundle) resolved from a file path inside it
 */
interface ResolvedComponent {
    type: ComponentType;
    name: string;
    /** Root folder of the bundle (lwc/<name> or aura/<name>), even for files in subfolders */
    folder: string;
}

const BUNDLE_FOLDERS: Record<string, { type: ComponentType; segment: string }> = {
    LightningComponentBundle: { type: ComponentType.LWC, segment: 'lwc' },
    AuraDefinitionBundle: { type: ComponentType.AURA, segment: 'aura' },
};

/**
 * Resolve the Lightning component a file belongs to (single metadata lookup per call)
 */
function resolveComponent(filePath: string): ResolvedComponent | null {
    const metadataInfo = getMetadataInfoFromFilePath(filePath);
    const bundle = metadataInfo && BUNDLE_FOLDERS[metadataInfo.type];
    if (!metadataInfo || !bundle) {
        return null;
    }

    // Leftmost <segment>/<name> folder, matching how the metadata API name is derived
    const folderMatch = filePath.match(new RegExp(`^(.*?[/\\\\]${bundle.segment}[/\\\\][^/\\\\]+)[/\\\\]`));
    if (!folderMatch) {
        return null;
    }

    return { type: bundle.type, name: metadataInfo.apiName, folder: folderMatch[1] };
}

/**
 * Get the component type from a file path
 */
export function getComponentType(filePath: string): ComponentType {
    return resolveComponent(filePath)?.type ?? ComponentType.UNKNOWN;
}

/**
 * Get the component folder from a file path (the bundle root, also for files in subfolders)
 */
export function getComponentFolder(filePath: string): string | null {
    return resolveComponent(filePath)?.folder ?? null;
}

/**
 * Get the component name from a file path
 */
export function getComponentName(filePath: string): string | null {
    return resolveComponent(filePath)?.name ?? null;
}

/**
 * Get all related files for a component
 */
export async function getComponentFiles(filePath: string): Promise<ComponentFile[]> {
    const component = resolveComponent(filePath);

    if (!component) {
        Logger.warn(
            `Could not determine component folder or name for ${filePath}`,
            'ComponentFileSwitcher.getComponentFiles',
        );
        return [];
    }

    try {
        const entries = await fs.promises.readdir(component.folder, { withFileTypes: true });

        // Get open document URIs to check for unsaved files
        const unsavedDocuments = new Set(
            vscode.workspace.textDocuments.filter((doc) => doc.isDirty).map((doc) => doc.uri.fsPath),
        );

        const createFile = component.type === ComponentType.LWC ? createLwcComponentFile : createAuraComponentFile;
        const componentFiles: ComponentFile[] = [];

        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }
            const entryPath = path.join(component.folder, entry.name);
            const componentFile = createFile(component.name, entryPath, entry.name, unsavedDocuments.has(entryPath));
            if (componentFile) {
                componentFiles.push(componentFile);
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
 * Create a component file object for an LWC file
 */
function createLwcComponentFile(
    componentName: string,
    filePath: string,
    fileName: string,
    isUnsaved: boolean,
): ComponentFile {
    let type: ComponentFileType;
    let priority: number;
    let isBaseFile = false;

    // JavaScript file with same name as component has highest priority
    if (fileName === `${componentName}.js`) {
        type = ComponentFileType.JS;
        priority = 1;
        isBaseFile = true;
    }
    // HTML file with same name is second priority
    else if (fileName === `${componentName}.html`) {
        type = ComponentFileType.HTML;
        priority = 2;
        isBaseFile = false;
    }
    // CSS file with same name is third priority
    else if (fileName === `${componentName}.css`) {
        type = ComponentFileType.CSS;
        priority = 3;
        isBaseFile = false;
    }
    // Other JS files
    else if (fileName.endsWith('.js')) {
        type = ComponentFileType.JS;
        priority = 4;
        isBaseFile = false;
    }
    // Other files (not meta XML)
    else if (fileName.endsWith('.html')) {
        type = ComponentFileType.HTML;
        priority = 5;
    } else if (fileName.endsWith('.css')) {
        type = ComponentFileType.CSS;
        priority = 6;
    } else if (fileName.endsWith('.svg')) {
        type = ComponentFileType.SVG;
        priority = 7;
    }
    // Meta XML has lowest priority
    else if (fileName.endsWith('-meta.xml')) {
        type = ComponentFileType.XML;
        priority = 10;
    } else {
        type = ComponentFileType.OTHER;
        priority = 9;
    }

    return {
        path: filePath,
        name: fileName,
        type,
        priority,
        isBaseFile,
        isUnsaved,
    };
}

/**
 * Create a component file object for an Aura file
 */
function createAuraComponentFile(
    componentName: string,
    filePath: string,
    fileName: string,
    isUnsaved: boolean,
): ComponentFile {
    let type: ComponentFileType;
    let priority: number;
    let isBaseFile = false;

    // Controller.js has highest priority
    if (fileName === `${componentName}Controller.js`) {
        type = ComponentFileType.CONTROLLER;
        priority = 1;
        isBaseFile = true;
    }
    // Main component file is second
    else if (
        fileName === `${componentName}.cmp` ||
        fileName === `${componentName}.app` ||
        fileName === `${componentName}.intf` ||
        fileName === `${componentName}.evt`
    ) {
        type = ComponentFileType.HTML;
        priority = 2;
        isBaseFile = true;
    }
    // CSS is third
    else if (fileName === `${componentName}.css`) {
        type = ComponentFileType.CSS;
        priority = 3;
    }
    // Helper.js is fourth
    else if (fileName === `${componentName}Helper.js`) {
        type = ComponentFileType.HELPER;
        priority = 4;
    }
    // Renderer.js is fifth
    else if (fileName === `${componentName}Renderer.js`) {
        type = ComponentFileType.RENDERER;
        priority = 5;
    }
    // Other files
    else if (fileName.endsWith('.svg')) {
        type = ComponentFileType.SVG;
        priority = 6;
    } else if (fileName.endsWith('.design')) {
        type = ComponentFileType.DESIGN;
        priority = 7;
    } else if (fileName.endsWith('.auradoc')) {
        type = ComponentFileType.DOCUMENTATION;
        priority = 8;
    }
    // Meta XML has lowest priority
    else if (
        fileName.endsWith('.cmp-meta.xml') ||
        fileName.endsWith('.app-meta.xml') ||
        fileName.endsWith('.intf-meta.xml') ||
        fileName.endsWith('.evt-meta.xml')
    ) {
        type = ComponentFileType.XML;
        priority = 10;
    } else {
        type = ComponentFileType.OTHER;
        priority = 9;
    }

    return {
        path: filePath,
        name: fileName,
        type,
        priority,
        isBaseFile,
        isUnsaved,
    };
}

/**
 * Format component files for display in the QuickPick
 */
export function formatComponentFilesForQuickPick(
    files: ComponentFile[],
): Array<vscode.QuickPickItem & { file: ComponentFile }> {
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
            file,
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

    return resolveComponent(filePath) !== null;
}

/**
 * Get file details for UI display
 */
export function getComponentDetails(filePath: string): {
    componentName: string | null;
    componentType: ComponentType;
    fileName: string;
} {
    const component = resolveComponent(filePath);

    return {
        componentName: component?.name ?? null,
        componentType: component?.type ?? ComponentType.UNKNOWN,
        fileName: path.basename(filePath),
    };
}
