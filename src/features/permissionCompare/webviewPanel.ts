import * as vscode from 'vscode';
import { attachRpc } from '../../rpc/attachRpc';
import { Logger } from '../../utils/logger';
import { WebviewUtils } from '../../utils/webview';

/** Editor tab hosting the permission set / profile compare UI. */
export class PermissionCompareWebviewPanel {
    public static readonly viewType = 'salesforceMultitools.permissionCompare';
    private static panel: vscode.WebviewPanel | undefined;

    public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            this.viewType,
            'Compare Permissions',
            column ?? vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
            },
        );
        this.panel = panel;

        const disposables: vscode.Disposable[] = [];
        panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.panel = undefined;
            }
            vscode.Disposable.from(...disposables).dispose();
        });

        // Listen before the HTML loads so no early message is lost
        attachRpc(panel.webview, disposables);
        disposables.push(
            panel.webview.onDidReceiveMessage((message: { command?: string }) => {
                if (message.command === 'ready') {
                    void panel.webview.postMessage({ command: 'setActiveComponent', component: 'permissionCompare' });
                } else if (message.command === 'refreshTheme') {
                    void panel.webview.postMessage(WebviewUtils.getThemeMessage());
                }
            }),
            vscode.window.onDidChangeActiveColorTheme(() => {
                void panel.webview.postMessage(WebviewUtils.getThemeMessage());
            }),
        );

        const html = await WebviewUtils.getWebviewContent(panel.webview, extensionUri.fsPath);
        if (this.panel === panel) {
            panel.webview.html = html;
        }
        Logger.debug('Permission compare panel opened', 'PermissionCompareWebviewPanel.createOrShow');
    }
}
