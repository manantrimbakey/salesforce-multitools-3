import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { PermissionCompareWebviewPanel } from './webviewPanel';

export function registerPermissionCompareCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('salesforce-multitools-3.openPermissionCompare', () =>
            PermissionCompareWebviewPanel.createOrShow(context.extensionUri),
        ),
    );
    Logger.debug('Permission compare commands registered', 'PermissionCompareCommands.register');
}
