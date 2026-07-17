import * as vscode from 'vscode';
import { DebugLogProvider } from './debugLogProvider';
import { Logger } from '../../utils/logger';
import { DebugLogWebviewPanel } from './webviewPanel';

/**
 * Register the debug logs commands
 */
export function registerDebugLogCommands(context: vscode.ExtensionContext): void {
    // Register the command for opening the debug logs in a tab
    const openDebugLogsTabCmdDisposable = vscode.commands.registerCommand('salesforce-multitools-3.openDebugLogs', () =>
        handleOpenDebugLogsTab(context.extensionUri),
    );

    context.subscriptions.push(openDebugLogsTabCmdDisposable);

    Logger.debug('Debug log commands registered', 'DebugLogCommands.registerDebugLogCommands');
}

/**
 * Handle opening the debug logs in a tab
 */
async function handleOpenDebugLogsTab(extensionUri: vscode.Uri): Promise<void> {
    // Open the debug logs in a tab
    DebugLogWebviewPanel.createOrShow(extensionUri);
}


