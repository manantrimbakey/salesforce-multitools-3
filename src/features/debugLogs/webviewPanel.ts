import * as vscode from 'vscode';
import { WebviewUtils } from '../../utils/webview';
import { Logger } from '../../utils/logger';
import { handleDebugLogWebviewCommand } from './commands';
import { attachRpc } from '../../rpc/attachRpc';

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
    public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
        this._extensionUri = extensionUri;

        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it
        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DebugLogWebviewPanel.viewType,
            'Salesforce Debug Logs',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
            },
        );
        this._panel = panel;

        // Everything registered here is released when the panel goes away
        const disposables: vscode.Disposable[] = [];
        panel.onDidDispose(() => {
            if (this._panel === panel) {
                this._panel = undefined;
            }
            vscode.Disposable.from(...disposables).dispose();
        });

        // Listen before the HTML loads so no early message is lost
        attachRpc(panel.webview, disposables);
        this._setWebviewMessageListener(panel.webview, disposables);

        disposables.push(
            vscode.window.onDidChangeActiveColorTheme(() => {
                this._sendMessage(panel.webview, WebviewUtils.getThemeMessage());
            }),
        );

        const html = await WebviewUtils.getWebviewContent(panel.webview, extensionUri.fsPath);
        // The panel may have been closed while the HTML was loading
        if (this._panel === panel) {
            panel.webview.html = html;
        }
    }

    /**
     * Close the webview panel if it exists
     */
    public static close(): void {
        // onDidDispose clears the reference and the listeners
        this._panel?.dispose();
    }

    /**
     * Set up the message listener for the webview
     */
    private static _setWebviewMessageListener(webview: vscode.Webview, disposables: vscode.Disposable[]): void {
        disposables.push(
            webview.onDidReceiveMessage(async (message) => {
                if (message.command === 'ready') {
                    // Send initial data
                    this._sendInitialData(webview);

                    // Set to use the debug log fetcher component
                    webview.postMessage({
                        command: 'setActiveComponent',
                        component: 'debugLogFetcher',
                    });

                    return;
                }

                // Handle debug log commands
                const handled = await handleDebugLogWebviewCommand(message, (response) => {
                    this._sendMessage(webview, response);
                });

                if (!handled) {
                    switch (message.command) {
                        case 'alert': {
                            vscode.window.showInformationMessage(message.text);
                            return;
                        }
                        case 'refreshTheme': {
                            this._sendMessage(webview, WebviewUtils.getThemeMessage());
                            return;
                        }
                    }
                }
            }),
        );
    }

    /**
     * Send initial data to the webview
     */
    private static _sendInitialData(webview: vscode.Webview): void {
        Logger.debug('Sending initial data to debug logs webview panel', 'DebugLogWebviewPanel._sendInitialData');

        // Get the workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        // Send initial data
        this._sendMessage(webview, {
            command: 'init',
            data: {
                extensionPath: this._extensionUri.fsPath,
                workspaceFolder: workspaceFolder || '',
                activeComponent: 'debugLogFetcher',
            },
        });
    }

    /**
     * Send a message to the webview
     */
    private static _sendMessage(webview: vscode.Webview, message: object): void {
        try {
            webview.postMessage(message);
        } catch (error) {
            Logger.error(
                'Error sending message to debug logs webview panel:',
                'DebugLogWebviewPanel._sendMessage',
                error,
            );
        }
    }
}
