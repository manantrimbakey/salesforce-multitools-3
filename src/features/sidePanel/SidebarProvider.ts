import * as vscode from 'vscode';
import { WebviewUtils } from '../../utils/webview';
import { Logger } from '../../utils/logger';
import { handleDebugLogWebviewCommand } from '../debugLogs/commands';
import { attachRpc } from '../../rpc/attachRpc';

/**
 * Provider for the Salesforce Multitools sidebar
 */
export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'salesforceMultitools.sidebar';

    private _view?: vscode.WebviewView;
    /** Listeners tied to the currently resolved view; disposed with it */
    private _viewDisposables: vscode.Disposable[] = [];
    private _extensionUri: vscode.Uri;
    private _activeComponent: string = 'componentFileSwitcher'; // Default component

    constructor(context: vscode.ExtensionContext) {
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
            vscode.commands.registerCommand('salesforceMultitools.sidebar.sendMessage', (message: Message) => {
                provider._sendMessage(message);
            }),

            // Register command to set the active component
            vscode.commands.registerCommand('salesforceMultitools.sidebar.setComponent', (componentName: string) => {
                provider.setActiveComponent(componentName);
            }),
        ];

        registrations.push(
            vscode.window.onDidChangeActiveColorTheme(() => provider._sendMessage(WebviewUtils.getThemeMessage())),
            provider,
        );

        return registrations;
    }

    /**
     * Set the active component
     */
    public setActiveComponent(componentName: string): void {
        this._activeComponent = componentName;
        this._sendMessage({
            command: 'setActiveComponent',
            component: componentName,
        });
        Logger.debug(`Set active component to: ${componentName}`, 'SidebarProvider.setActiveComponent');
    }

    /**
     * Called when the view is resolved by VS Code
     */
    public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        // A view can be resolved again (e.g. after being moved); drop the previous view's listeners
        this._disposeView();
        this._view = webviewView;

        const disposables: vscode.Disposable[] = [];
        this._viewDisposables = disposables;
        let disposed = false;
        disposables.push(
            webviewView.onDidDispose(() => {
                disposed = true;
                if (this._view === webviewView) {
                    this._disposeView();
                }
            }),
        );

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')],
        };

        // Listen before the HTML loads so no early message is lost
        attachRpc(webviewView.webview, disposables);
        this._setWebviewMessageListener(webviewView.webview, disposables);

        const html = await WebviewUtils.getWebviewContent(webviewView.webview, this._extensionUri.fsPath);
        if (!disposed) {
            webviewView.webview.html = html;
        }
    }

    public dispose(): void {
        this._disposeView();
    }

    private _disposeView(): void {
        vscode.Disposable.from(...this._viewDisposables).dispose();
        this._viewDisposables = [];
        this._view = undefined;
    }

    /**
     * Set up the message listener for the webview
     */
    private _setWebviewMessageListener(webview: vscode.Webview, disposables: vscode.Disposable[]) {
        disposables.push(
            webview.onDidReceiveMessage(async (message) => {
                // Try to handle debug log commands first
                if (this._activeComponent === 'debugLogFetcher') {
                    const handled = await handleDebugLogWebviewCommand(message, (response) => {
                        this._sendMessage(response);
                    });

                    if (handled) {
                        return;
                    }
                }

                switch (message.command) {
                    case 'alert': {
                        vscode.window.showInformationMessage(message.text);
                        return;
                    }
                    case 'ready': {
                        // Webview is ready, send initial data
                        this._sendInitialData();

                        // Send the active component
                        this._sendMessage({
                            command: 'setActiveComponent',
                            component: this._activeComponent,
                        });

                        // Refresh component data for current file if we're using the component file switcher
                        if (this._activeComponent === 'componentFileSwitcher') {
                            vscode.commands.executeCommand('salesforce-multitools-3.refreshComponentData');
                        }
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
                        this._sendMessage(WebviewUtils.getThemeMessage());
                        return;
                    }
                    case 'openFile': {
                        // Handle opening files from the component file switcher
                        if (message.filePath) {
                            try {
                                const document = await vscode.workspace.openTextDocument(message.filePath);
                                await vscode.window.showTextDocument(document);
                                Logger.debug(
                                    `Opened file: ${message.filePath}`,
                                    'SidebarProvider._setWebviewMessageListener',
                                );
                            } catch (error) {
                                Logger.error(
                                    `Error opening file: ${message.filePath}`,
                                    'SidebarProvider._setWebviewMessageListener',
                                    error,
                                );
                                vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                            }
                        }
                        return;
                    }
                    case 'exampleRequest': {
                        // Handle example component requests
                        if (message.data && message.data.text) {
                            Logger.debug(
                                `Received message from example component: ${message.data.text}`,
                                'SidebarProvider._setWebviewMessageListener',
                            );

                            // Echo back the message with some processing
                            this._sendMessage({
                                command: 'exampleResponse',
                                data: {
                                    message: `Extension received: "${message.data.text}" (processed at ${new Date().toLocaleTimeString()})`,
                                },
                            });
                        }
                        return;
                    }
                }
            }),
        );
    }

    /**
     * Send initial data to the webview
     */
    private _sendInitialData() {
        Logger.debug('Sending initial data to sidebar webview', 'SidebarProvider._sendInitialData');

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
                activeComponent: this._activeComponent,
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
                Logger.error('Error sending message to webview:', 'SidebarProvider._sendMessage', error);
            }
        }
    }
}

export interface Message {
    command: string;
    data?: unknown;
    component?: string;
}
