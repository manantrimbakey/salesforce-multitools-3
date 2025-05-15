import * as vscode from 'vscode';
import { WebviewUtils } from '../../utils/webview';
import { Logger } from '../../utils/logger';

/**
 * Provider for the Salesforce Multitools sidebar
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'salesforceMultitools.sidebar';

    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;

    constructor(private context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
    }

    /**
     * Register the sidebar view
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
        const provider = new SidebarProvider(context);

        const registrations = [
            // Register the webview view provider
            vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider, {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
            }),
            
            // Register command to send messages to the sidebar
            vscode.commands.registerCommand('salesforceMultitools.sidebar.sendMessage', (message: any) => {
                provider._sendMessage(message);
            }),
        ];

        vscode.window.onDidChangeActiveColorTheme((theme) => {
            if (theme.kind === vscode.ColorThemeKind.Dark) {
                provider._sendMessage({
                    command: 'refreshTheme',
                    data: { theme: 'dark' },
                });
            } else {
                provider._sendMessage({
                    command: 'refreshTheme',
                    data: { theme: 'light' },
                });
            }
        });

        return registrations;
    }

    /**
     * Called when the view is resolved by VS Code
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken,
    ): void | Thenable<void> {
        this._view = webviewView;

        // Set the webview's options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')],
        };

        // Set initial HTML content
        webviewView.webview.html = WebviewUtils.getWebviewContent(webviewView.webview, this._extensionUri.fsPath);

        // Handle webview messages
        this._setWebviewMessageListener(webviewView.webview);
    }

    /**
     * Set up the message listener for the webview
     */
    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'alert': {
                    vscode.window.showInformationMessage(message.text);
                    return;
                }
                case 'ready': {
                    // Webview is ready, send initial data
                    this._sendInitialData();
                    // Refresh component data for current file
                    vscode.commands.executeCommand('salesforce-multitools-3.refreshComponentData');
                    return;
                }
                case 'requestData': {
                    // Basic data response
                    this._sendMessage({
                        command: 'responseData',
                        data: { message: 'Hello from VS Code extension' },
                    });
                    return;
                }
                case 'refreshTheme': {
                    this._sendMessage({
                        command: 'refreshTheme',
                        data: { theme: vscode.window.activeColorTheme.kind },
                    });
                    return;
                }
                case 'openFile': {
                    // Handle opening files from the component file switcher
                    if (message.filePath) {
                        try {
                            const document = await vscode.workspace.openTextDocument(message.filePath);
                            await vscode.window.showTextDocument(document);
                            Logger.debug(`Opened file: ${message.filePath}`);
                        } catch (error) {
                            Logger.error(`Error opening file: ${message.filePath}`, error);
                            vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                        }
                    }
                    return;
                }
            }
        });
    }

    /**
     * Send initial data to the webview
     */
    private _sendInitialData() {
        Logger.debug('Sending initial data to sidebar webview');

        if (!this._view) {
            return;
        }

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
    }

    /**
     * Send a message to the webview
     */
    private _sendMessage(message: Message) {
        if (this._view) {
            try {
                this._view.webview.postMessage(message);
            } catch (error) {
                Logger.error('Error sending message to webview:', error);
            }
        }
    }
}

export interface Message {
    command: string;
    data: any;
}
