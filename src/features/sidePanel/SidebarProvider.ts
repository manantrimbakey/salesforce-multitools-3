import * as vscode from 'vscode';
import { BaseWebviewHost } from '../../webview/BaseWebviewHost';
import { Logger } from '../../utils/logger';

import { registerDebugLogChannels } from '../debugLogs/channels';
import { WebviewMessenger } from '../../webview/WebviewMessenger';

class SidebarHost extends BaseWebviewHost {
    constructor(
        webview: vscode.Webview,
        extensionUri: vscode.Uri,
        defaultComponent: string
    ) {
        super(webview, extensionUri, defaultComponent);
        registerDebugLogChannels(this.messenger);
        this.registerSidebarChannels();
    }

    private registerSidebarChannels() {
        this.messenger.registerHandler('files:open', async (payload: any) => {
            const { filePath } = payload;
            if (filePath) {
                try {
                    const document = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(document);
                    Logger.debug(`Opened file: ${filePath}`, 'SidebarHost');
                    return { success: true };
                } catch (error) {
                    Logger.error(`Error opening file: ${filePath}`, 'SidebarHost', error);
                    vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                    throw error;
                }
            }
            return { success: false, error: 'No filePath provided' };
        });

        // Add additional channels like components:get, file:lastModified here if they were previously handled
        // We will move them to messenger later.
    }

    protected async onMessage(message: any) {

        switch (message.command) {
            case 'requestData':
                this.messenger.post('responseData', { message: 'Hello from VS Code extension' });
                return;
            case 'openFile':
                // Handled as channel now, but keeping legacy just in case
                if (message.filePath) {
                    try {
                        const document = await vscode.workspace.openTextDocument(message.filePath);
                        await vscode.window.showTextDocument(document);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                    }
                }
                return;
            case 'exampleRequest':
                if (message.data && message.data.text) {
                    this.messenger.post('exampleResponse', {
                        message: `Extension received: "${message.data.text}" (processed at ${new Date().toLocaleTimeString()})`
                    });
                }
                return;
        }
    }
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'salesforceMultitools.sidebar';
    private host?: SidebarHost;

    constructor(private context: vscode.ExtensionContext) {}

    public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
        const provider = new SidebarProvider(context);

        const registrations = [
            vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider, {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
            }),
            vscode.commands.registerCommand('salesforceMultitools.sidebar.sendMessage', (message: any) => {
                if (provider.host) {
                    // @ts-ignore - access messenger
                    provider.host.messenger.post(message.command, message.data, message.component);
                }
            }),
            vscode.commands.registerCommand('salesforceMultitools.sidebar.setComponent', (componentName: string) => {
                provider.host?.setActiveComponent(componentName);
            }),
        ];

        return registrations;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken,
    ): void | Thenable<void> {
        if (this.host) {
            this.host.dispose();
        }
        
        this.host = new SidebarHost(
            webviewView.webview, 
            this.context.extensionUri, 
            'componentFileSwitcher'
        );
    }
}
