/**
 * Message contract between the extension host and the webview.
 * Host -> webview messages arrive via `window.postMessage`; webview -> host via `vscode.postMessage`.
 */

export interface ComponentFile {
    path: string;
    name: string;
    type: string;
    priority: number;
    isBaseFile: boolean;
    isUnsaved: boolean;
}

export type ComponentType = 'LWC' | 'AURA' | 'UNKNOWN';

export interface ComponentData {
    componentName: string | null;
    componentType: ComponentType;
    fileName: string;
    files: ComponentFile[];
}

/** `theme` is either 'light'/'dark' or a numeric vscode.ColorThemeKind (1 light, 2 dark, 3 HC, 4 HC light). */
export type HostMessage =
    | { command: 'refreshTheme'; data: { theme: string | number } }
    | { command: 'setActiveComponent'; component: string }
    | { command: 'componentFileSwitcherRefresh'; data: ComponentData };

export type HostCommand = HostMessage['command'];

export type ClientMessage =
    | { command: 'ready' }
    | { command: 'refreshTheme' }
    | { command: 'openFile'; filePath: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isHostMessage(value: unknown): value is HostMessage {
    if (!isRecord(value)) return false;
    switch (value.command) {
        case 'refreshTheme':
            return isRecord(value.data) && (typeof value.data.theme === 'string' || typeof value.data.theme === 'number');
        case 'setActiveComponent':
            return typeof value.component === 'string';
        case 'componentFileSwitcherRefresh':
            return isRecord(value.data) && Array.isArray(value.data.files);
        default:
            return false;
    }
}
