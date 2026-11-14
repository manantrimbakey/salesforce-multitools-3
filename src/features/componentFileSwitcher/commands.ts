import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import {
    getComponentFiles,
    formatComponentFilesForQuickPick,
    isLightningComponentFile,
    getComponentDetails,
    getComponentFolder,
    ComponentFile,
    ComponentType,
} from './componentFileSwitcherUtils';
import { isRegularFileEditor, isRegularFilePath } from '../../utils/fileUtils';

const REFRESH_DEBOUNCE_MS = 300;

let refreshTimer: NodeJS.Timeout | undefined;

/**
 * Register the component file switcher commands
 */
export function registerComponentFileSwitcherCommands(context: vscode.ExtensionContext): void {
    Logger.debug('Registering component file switcher commands', 'ComponentFileSwitcher.registerCommands');

    // Register the Alt+O/Option+O keyboard shortcut
    const switchComponentFileCmd = vscode.commands.registerCommand(
        'salesforce-multitools-3.switchComponentFile',
        handleSwitchComponentFile,
    );

    // Register command to send component data to the UI
    const refreshComponentDataCmd = vscode.commands.registerCommand(
        'salesforce-multitools-3.refreshComponentData',
        scheduleRefresh,
    );

    context.subscriptions.push(switchComponentFileCmd, refreshComponentDataCmd, ...createComponentChangeListeners(), {
        dispose: () => {
            clearTimeout(refreshTimer);
            refreshTimer = undefined;
        },
    });

    // Set the isLightningComponent context for the editor that is already open
    scheduleRefresh();
}

/**
 * Coalesce bursts of events (retrieves, typing, editor switches) into a single refresh
 */
function scheduleRefresh(): void {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refreshComponentData();
    }, REFRESH_DEBOUNCE_MS);
}

/**
 * True when the path is inside the bundle folder of the component open in the active editor
 */
function isInActiveComponent(filePath: string): boolean {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const activeFolder = activePath && getComponentFolder(activePath);
    return !!activeFolder && filePath.startsWith(activeFolder + path.sep);
}

/**
 * Listeners that keep the sidebar component list up to date
 */
function createComponentChangeListeners(): vscode.Disposable[] {
    // Only files being added/removed change the list; content edits do not
    const watchers = ['**/lwc/**/*', '**/aura/**/*'].map((glob) => {
        const watcher = vscode.workspace.createFileSystemWatcher(glob, false, true, false);
        const onFileSetChange = (uri: vscode.Uri) => {
            if (isInActiveComponent(uri.fsPath)) {
                scheduleRefresh();
            }
        };
        return vscode.Disposable.from(
            watcher,
            watcher.onDidCreate(onFileSetChange),
            watcher.onDidDelete(onFileSetChange),
        );
    });

    // The list shows unsaved indicators: refresh only when a document's dirty state flips (not on each keystroke)
    const dirtyState = new Map<string, boolean>();
    const textDocumentChange = vscode.workspace.onDidChangeTextDocument((event) => {
        const { document } = event;
        if (document.uri.scheme !== 'file' || !isRegularFilePath(document.uri.fsPath)) {
            return;
        }
        const key = document.uri.toString();
        if (dirtyState.get(key) === document.isDirty) {
            return;
        }
        dirtyState.set(key, document.isDirty);
        if (isInActiveComponent(document.uri.fsPath)) {
            scheduleRefresh();
        }
    });
    const documentClose = vscode.workspace.onDidCloseTextDocument((document) => {
        dirtyState.delete(document.uri.toString());
    });

    const activeEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (isRegularFileEditor(editor)) {
            scheduleRefresh();
        }
    });

    return [...watchers, textDocumentChange, documentClose, activeEditorChange];
}

/**
 * Handle the Alt+O/Option+O keyboard shortcut to switch component files
 */
async function handleSwitchComponentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        Logger.debug('No active editor', 'ComponentFileSwitcher.handleSwitchComponentFile');
        vscode.window.showInformationMessage('No active file to switch from');
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const currentFileName = path.basename(filePath);

    // Check if this is a Lightning component file
    if (!isLightningComponentFile(filePath)) {
        Logger.debug(
            `${filePath} is not a Lightning component file`,
            'ComponentFileSwitcher.handleSwitchComponentFile',
        );
        vscode.window.showInformationMessage('This file is not part of an LWC or Aura component');
        return;
    }

    try {
        // Get all files for this component
        const componentFiles = await getComponentFiles(filePath);

        if (componentFiles.length === 0) {
            Logger.warn(`No component files found for ${filePath}`, 'ComponentFileSwitcher.handleSwitchComponentFile');
            vscode.window.showInformationMessage('No component files found');
            return;
        }

        // Filter out the current file
        const otherFiles = componentFiles.filter((file) => file.name !== currentFileName);

        if (otherFiles.length === 0) {
            Logger.info('No other files to switch to', 'ComponentFileSwitcher.handleSwitchComponentFile');
            vscode.window.showInformationMessage('No other files to switch to');
            return;
        }

        // Format files for quick pick
        const quickPickItems = formatComponentFilesForQuickPick(otherFiles);

        // Show quick pick
        const selection = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a component file to open',
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (!selection) {
            return; // User cancelled
        }

        // Open the selected file
        const document = await vscode.workspace.openTextDocument(selection.file.path);
        await vscode.window.showTextDocument(document);

        // Refresh component data in UI
        scheduleRefresh();
    } catch (error) {
        Logger.error(
            `Error handling component file switch: ${error}`,
            'ComponentFileSwitcher.handleSwitchComponentFile',
        );
        vscode.window.showErrorMessage(`Error switching component file: ${error}`);
    }
}

/**
 * Send component data to the UI
 */
export async function refreshComponentData(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        // No active editor, clear component data
        sendComponentDataMessage({
            componentName: null,
            componentType: ComponentType.UNKNOWN,
            fileName: '',
            files: [],
        });
        return;
    }

    // Skip non-regular file editors
    if (!isRegularFileEditor(editor)) {
        // Non-file document, clear component data
        sendComponentDataMessage({
            componentName: null,
            componentType: ComponentType.UNKNOWN,
            fileName: '',
            files: [],
        });
        return;
    }

    const filePath = editor.document.uri.fsPath;

    // Check if this is a Lightning component file
    if (!isLightningComponentFile(filePath)) {
        // Not a component file, clear component data
        sendComponentDataMessage({
            componentName: null,
            componentType: ComponentType.UNKNOWN,
            fileName: path.basename(filePath),
            files: [],
        });
        return;
    }

    try {
        // Get component details
        const details = getComponentDetails(filePath);

        // Get all files for this component
        const componentFiles = await getComponentFiles(filePath);

        // Send data to webview
        sendComponentDataMessage({
            componentName: details.componentName,
            componentType: details.componentType,
            fileName: details.fileName,
            files: componentFiles,
        });
    } catch (error) {
        Logger.error(`Error refreshing component data: ${error}`, 'ComponentFileSwitcher.refreshComponentData');
    }
}

/**
 * Send component data to the webview
 */
function sendComponentDataMessage(data: {
    componentName: string | null;
    componentType: ComponentType;
    fileName: string;
    files: ComponentFile[];
}): void {
    void vscode.commands.executeCommand(
        'setContext',
        'salesforceMultitools.isLightningComponent',
        data.componentType !== ComponentType.UNKNOWN,
    );

    // Post message to the sidebar webview (once, regardless of how many editors are visible)
    void vscode.commands.executeCommand('salesforceMultitools.sidebar.sendMessage', {
        command: 'componentFileSwitcherRefresh',
        data,
    });
}
