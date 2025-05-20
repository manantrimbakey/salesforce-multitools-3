import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WebviewUtils } from '../../../utils/webview';
import { Logger } from '../../../utils/logger';
import { configureWebviewForServer } from '../../../utils/webviewUtils';

/**
 * Interface for file system entries
 */
interface FileSystemEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    // Optional icon class from VS Code codicons
    icon?: string;
}

/**
 * FileSwitcher webview panel that uses React
 */
export class FileSwitcherPanel {
    public static readonly viewType = 'salesforceMultitools.fileSwitcher';

    private static instance: FileSwitcherPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri): FileSwitcherPanel {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it
        if (FileSwitcherPanel.instance) {
            FileSwitcherPanel.instance._panel.reveal(column);
            return FileSwitcherPanel.instance;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            FileSwitcherPanel.viewType,
            'Salesforce File Switcher',
            column || vscode.ViewColumn.One,
            {
                // Enable JavaScript in the webview
                enableScripts: true,

                // Restrict the webview to only load resources from the extension's directory
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],

                // Retain the webview panel when hidden
                retainContextWhenHidden: true,
            },
        );

        FileSwitcherPanel.instance = new FileSwitcherPanel(panel, extensionUri);
        return FileSwitcherPanel.instance;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): FileSwitcherPanel {
        FileSwitcherPanel.instance = new FileSwitcherPanel(panel, extensionUri);
        return FileSwitcherPanel.instance;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Configure webview to connect to Express server
        configureWebviewForServer(this._panel.webview);

        // Set the webview's initial HTML content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            (e) => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables,
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                    case 'openFile':
                        this._openFile(message.path);
                        return;
                    case 'browseDirectory':
                        this._listDirectoryContents(message.path);
                        return;
                    case 'ready':
                        // Webview is ready, send initial data
                        this._sendInitialData();
                        return;
                }
            },
            null,
            this._disposables,
        );
    }

    public dispose() {
        FileSwitcherPanel.instance = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;

        // Get HTML content for the webview
        this._panel.webview.html = WebviewUtils.getWebviewContent(webview, this._extensionUri.fsPath);
    }

    /**
     * Send initial data to the webview
     */
    private _sendInitialData() {
        Logger.debug('Sending initial data to file switcher webview');

        // Get the workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        // Send initial data
        this._sendMessage({
            command: 'init',
            data: {
                extensionPath: this._extensionUri.fsPath,
                workspaceFolder: workspaceFolder || '',
            },
        });

        // If we have a workspace folder, also list its contents
        if (workspaceFolder) {
            this._listDirectoryContents(workspaceFolder);
        }
    }

    /**
     * List the contents of a directory
     */
    private async _listDirectoryContents(directoryPath: string) {
        Logger.debug(`Listing directory contents: ${directoryPath}`);

        try {
            // Make sure the directory exists
            if (!fs.existsSync(directoryPath)) {
                Logger.warn(`Directory does not exist: ${directoryPath}`);
                this._sendMessage({
                    command: 'fileList',
                    currentDirectory: directoryPath,
                    files: [],
                    error: 'Directory not found',
                });
                return;
            }

            // Get files in the directory
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

            // Convert to FileSystemEntry objects
            const fileEntries: FileSystemEntry[] = entries
                .filter((entry) => {
                    // Skip hidden files starting with .
                    return !entry.name.startsWith('.');
                })
                .map((entry) => {
                    const entryPath = path.join(directoryPath, entry.name);
                    return {
                        name: entry.name,
                        path: entryPath,
                        isDirectory: entry.isDirectory(),
                    };
                });

            // Sort directories first, then files, both alphabetically
            fileEntries.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) {
                    return -1;
                }
                if (!a.isDirectory && b.isDirectory) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });

            // Send the file list to the webview
            this._sendMessage({
                command: 'fileList',
                currentDirectory: directoryPath,
                files: fileEntries,
            });

            Logger.debug(`Sent ${fileEntries.length} files to webview`);
        } catch (error) {
            Logger.error('Error listing directory contents:', error);
            this._sendMessage({
                command: 'fileList',
                currentDirectory: directoryPath,
                files: [],
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private _sendMessage(message: any) {
        // Send a message to the webview
        try {
            this._panel.webview.postMessage(message);
        } catch (error) {
            Logger.error('Error sending message to webview:', error);
        }
    }

    private _openFile(filePath: string) {
        // Open a file in VS Code
        Logger.debug(`Opening file: ${filePath}`);

        // Make sure the file exists
        if (!fs.existsSync(filePath)) {
            vscode.window.showErrorMessage(`File not found: ${filePath}`);
            return;
        }

        // Open the file
        vscode.workspace
            .openTextDocument(filePath)
            .then((doc) => {
                return vscode.window.showTextDocument(doc);
            })
            .then(undefined, (error) => {
                Logger.error('Error opening file:', error);
                vscode.window.showErrorMessage(
                    `Error opening file: ${error instanceof Error ? error.message : String(error)}`,
                );
            });
    }

    /**
     * Register a command to open the file switcher panel
     */
    public static registerCommand(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.commands.registerCommand('salesforce-multitools-3.openFileSwitcher', () => {
            FileSwitcherPanel.createOrShow(context.extensionUri);
        });
    }
}
