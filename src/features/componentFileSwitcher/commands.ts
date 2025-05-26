import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import {
    getComponentFiles,
    formatComponentFilesForQuickPick,
    isLightningComponentFile,
    getComponentDetails,
    ComponentType,
} from './componentFileSwitcherUtils';
import { isRegularFileEditor, isRegularFilePath } from '../../utils/fileUtils';

// Reference to the webview to refresh as needed
let fileWatcherDisposable: vscode.Disposable | undefined;
let fileChangeListenerDisposable: vscode.Disposable | undefined;

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
        () => {
            Logger.debug('refreshComponentDataCmd called', 'ComponentFileSwitcher.registerCommands');
            refreshComponentData();
        },
    );

    // Set up file watcher for component directories
    setupFileWatcher();

    // Set up active editor change listener to update UI
    setupActiveEditorChangeListener();

    // Register disposables
    context.subscriptions.push(switchComponentFileCmd, refreshComponentDataCmd, {
        dispose: () => {
            if (fileWatcherDisposable) {
                fileWatcherDisposable.dispose();
            }
            if (fileChangeListenerDisposable) {
                fileChangeListenerDisposable.dispose();
            }
        },
    });
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

        // Find the selected file
        const selectedFile = otherFiles.find(
            (file) => selection.label.endsWith(file.name) && selection.description === file.type,
        );

        if (!selectedFile) {
            Logger.error(
                'Selected file not found in component files',
                'ComponentFileSwitcher.handleSwitchComponentFile',
            );
            return;
        }

        // Open the selected file
        const document = await vscode.workspace.openTextDocument(selectedFile.path);
        await vscode.window.showTextDocument(document);

        // Refresh component data in UI
        Logger.debug('handleSwitchComponentFile called', 'ComponentFileSwitcher.handleSwitchComponentFile');
        refreshComponentData();
    } catch (error) {
        Logger.error(
            `Error handling component file switch: ${error}`,
            'ComponentFileSwitcher.handleSwitchComponentFile',
        );
        vscode.window.showErrorMessage(`Error switching component file: ${error}`);
    }
}

/**
 * Set up file watcher for component directories
 */
function setupFileWatcher(): void {
    if (fileWatcherDisposable) {
        fileWatcherDisposable.dispose();
    }

    // Watch for file changes in lwc and aura directories
    const lwcWatcher = vscode.workspace.createFileSystemWatcher('**/lwc/**/*');
    const auraWatcher = vscode.workspace.createFileSystemWatcher('**/aura/**/*');

    // File created, deleted, or changed in component directory
    const fileChangeHandler = () => {
        Logger.debug('fileChangeHandler called', 'ComponentFileSwitcher.setupFileWatcher');
        refreshComponentData();
    };

    lwcWatcher.onDidCreate(fileChangeHandler);
    lwcWatcher.onDidDelete(fileChangeHandler);
    lwcWatcher.onDidChange(fileChangeHandler);

    auraWatcher.onDidCreate(fileChangeHandler);
    auraWatcher.onDidDelete(fileChangeHandler);
    auraWatcher.onDidChange(fileChangeHandler);

    fileWatcherDisposable = {
        dispose: () => {
            lwcWatcher.dispose();
            auraWatcher.dispose();
        },
    };
}

/**
 * Set up listener for active editor changes to update UI
 */
function setupActiveEditorChangeListener(): void {
    if (fileChangeListenerDisposable) {
        fileChangeListenerDisposable.dispose();
    }

    // Text document change (for unsaved indicators)
    const textDocumentChangeEvent = vscode.workspace.onDidChangeTextDocument((event) => {
        // Skip non-regular files
        if (event.document.uri.scheme !== 'file' || !isRegularFilePath(event.document.uri.fsPath)) {
            return;
        }

        Logger.debug(
            'textDocumentChangeEvent called for file: ' + event.document.uri.fsPath,
            'ComponentFileSwitcher.setupActiveEditorChangeListener',
        );
        refreshComponentData();
    });

    // Active editor change
    const activeEditorChangeEvent = vscode.window.onDidChangeActiveTextEditor((editor) => {
        // Skip non-regular file editors
        if (!isRegularFileEditor(editor)) {
            return;
        }

        // We know editor is defined at this point since isRegularFileEditor checks for null/undefined
        Logger.debug(
            'activeEditorChangeEvent called for file: ' + editor!.document.uri.fsPath,
            'ComponentFileSwitcher.setupActiveEditorChangeListener',
        );
        refreshComponentData();
    });

    fileChangeListenerDisposable = {
        dispose: () => {
            textDocumentChangeEvent.dispose();
            activeEditorChangeEvent.dispose();
        },
    };
}

/**
 * Send component data to the UI
 */
export async function refreshComponentData(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    Logger.debug('refreshComponentData called', 'ComponentFileSwitcher.refreshComponentData');

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
    files: any[];
}): void {
    vscode.commands.executeCommand(
        'setContext',
        'salesforceMultitools.isLightningComponent',
        data.componentType !== ComponentType.UNKNOWN,
    );

    // Post message to webview
    vscode.window.visibleTextEditors.forEach((editor) => {
        if (editor.document.uri.scheme === 'file') {
            vscode.commands.executeCommand('salesforceMultitools.sidebar.sendMessage', {
                command: 'componentFileSwitcherRefresh',
                data,
            });
        }
    });
}
