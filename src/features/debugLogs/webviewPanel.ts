import * as vscode from 'vscode';
import { BaseWebviewHost } from '../../webview/BaseWebviewHost';
import { registerDebugLogChannels } from './channels';

class DebugLogHost extends BaseWebviewHost {
    constructor(webview: vscode.Webview, extensionUri: vscode.Uri) {
        super(webview, extensionUri, 'debugLogFetcher');
        registerDebugLogChannels(this.messenger);
    }
}

export class DebugLogWebviewPanel {
    public static readonly viewType = 'salesforceMultitools.debugLogs';
    private static _panel: vscode.WebviewPanel | undefined;
    private static _host: DebugLogHost | undefined;

    public static createOrShow(extensionUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            DebugLogWebviewPanel.viewType,
            'Salesforce Debug Logs',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
            },
        );

        this._host = new DebugLogHost(this._panel.webview, extensionUri);

        this._panel.onDidDispose(
            () => {
                this._panel = undefined;
                if (this._host) {
                    this._host.dispose();
                    this._host = undefined;
                }
            },
            null,
            [],
        );
    }

    public static close(): void {
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
        if (this._host) {
            this._host.dispose();
            this._host = undefined;
        }
    }
}
