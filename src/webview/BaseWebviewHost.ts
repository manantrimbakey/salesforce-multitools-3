import * as vscode from 'vscode';
import { WebviewMessenger } from './WebviewMessenger';
import { getWebviewContent } from './html';
import { Logger } from '../utils/logger';

export abstract class BaseWebviewHost {
    protected messenger: WebviewMessenger;
    protected _extensionUri: vscode.Uri;
    protected _activeComponent: string;
    private disposables: vscode.Disposable[] = [];

    constructor(
        protected webview: vscode.Webview,
        extensionUri: vscode.Uri,
        defaultComponent: string
    ) {
        this._extensionUri = extensionUri;
        this._activeComponent = defaultComponent;
        
        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
        };

        this.messenger = new WebviewMessenger(webview);
        webview.html = getWebviewContent(webview, extensionUri.fsPath);

        this.disposables.push(
            webview.onDidReceiveMessage(message => {
                // Let the messenger handle requests
                if (message && message.type !== 'request' && message.command) {
                    this.handleEvent(message);
                }
            })
        );

        this.disposables.push(
            vscode.window.onDidChangeActiveColorTheme((theme) => {
                this.messenger.post('refreshTheme', { 
                    theme: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light' 
                });
            })
        );
    }

    protected async handleEvent(message: any) {
        switch (message.command) {
            case 'ready':
                this.sendInitialData();
                break;
            case 'alert':
                vscode.window.showInformationMessage(message.text);
                break;
            case 'refreshTheme':
                this.messenger.post('refreshTheme', { 
                    theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light' 
                });
                break;
            default:
                await this.onMessage(message);
        }
    }

    protected sendInitialData() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.messenger.post('init', {
            extensionPath: this._extensionUri.fsPath,
            workspaceFolder: workspaceFolder || '',
            activeComponent: this._activeComponent,
        });
        this.messenger.post('setActiveComponent', null, this._activeComponent);
    }

    public setActiveComponent(componentName: string): void {
        this._activeComponent = componentName;
        this.messenger.post('setActiveComponent', null, componentName);
        Logger.debug(`Set active component to: ${componentName}`, 'BaseWebviewHost');
    }

    protected async onMessage(message: any): Promise<void> {
        // To be overridden by subclasses
    }

    public dispose() {
        this.messenger.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
