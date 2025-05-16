import * as vscode from 'vscode';
import { WebviewUtils } from '../../utils/webview';
import { Logger } from '../../utils/logger';
import { handleDebugLogWebviewCommand } from './commands';

/**
 * Provider for the Debug Logs webview panel
 */
export class DebugLogWebviewPanel {
    public static readonly viewType = 'salesforceMultitools.debugLogs';
    private static _panel: vscode.WebviewPanel | undefined;
    private static _extensionUri: vscode.Uri;

    /**
     * Create or show the debug logs webview panel
     */
    public static createOrShow(extensionUri: vscode.Uri): void {
        this._extensionUri = extensionUri;

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        this._panel = vscode.window.createWebviewPanel(
            DebugLogWebviewPanel.viewType,
            'Salesforce Debug Logs',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
            }
        );

        // Set the webview's initial html content
        this._panel.webview.html = WebviewUtils.getWebviewContent(this._panel.webview, extensionUri.fsPath);

        // Setup message handling
        this._setWebviewMessageListener(this._panel.webview);

        // Reset when the panel is closed
        this._panel.onDidDispose(() => {
            this._panel = undefined;
        }, null, []);
        
        // Handle theme changes
        vscode.window.onDidChangeActiveColorTheme((theme) => {
            if (this._panel) {
                this._panel.webview.postMessage({
                    command: 'refreshTheme',
                    data: { theme: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light' },
                });
            }
        });
    }

    /**
     * Close the webview panel if it exists
     */
    public static close(): void {
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
    }

    /**
     * Set up the message listener for the webview
     */
    private static _setWebviewMessageListener(webview: vscode.Webview): void {
        webview.onDidReceiveMessage(async (message) => {
            // Try debug log commands first
            if (message.command === 'ready') {
                // Send initial data
                this._sendInitialData(webview);
                
                // Set to use the debug log fetcher component
                webview.postMessage({
                    command: 'setActiveComponent',
                    component: 'debugLogFetcher'
                });
                
                return;
            }
            
            // Handle debug log commands
            const handled = await handleDebugLogWebviewCommand(message, (response) => {
                this._sendMessage(webview, response);
            });
            
            if (!handled) {
                // Handle other commands if needed
                switch (message.command) {
                    case 'alert': {
                        vscode.window.showInformationMessage(message.text);
                        return;
                    }
                    case 'refreshTheme': {
                        this._sendMessage(webview, {
                            command: 'refreshTheme',
                            data: { 
                                theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark 
                                    ? 'dark' 
                                    : 'light' 
                            },
                        });
                        return;
                    }
                }
            }
        });
    }

    /**
     * Send initial data to the webview
     */
    private static _sendInitialData(webview: vscode.Webview): void {
        Logger.debug('Sending initial data to debug logs webview panel');

        // Get the workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        // Send initial data
        this._sendMessage(webview, {
            command: 'init',
            data: {
                extensionPath: this._extensionUri.fsPath,
                workspaceFolder: workspaceFolder || '',
                activeComponent: 'debugLogFetcher'
            },
        });
    }

    /**
     * Send a message to the webview
     */
    private static _sendMessage(webview: vscode.Webview, message: any): void {
        try {
            webview.postMessage(message);
        } catch (error) {
            Logger.error('Error sending message to debug logs webview panel:', error);
        }
    }
} 