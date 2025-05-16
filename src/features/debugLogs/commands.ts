import * as vscode from 'vscode';
import { DebugLogProvider } from './debugLogProvider';
import { Logger } from '../../utils/logger';
import { DebugLogWebviewPanel } from './webviewPanel';

/**
 * Register the debug logs commands
 */
export function registerDebugLogCommands(context: vscode.ExtensionContext): void {
    // Register the command for opening the debug logs in a tab
    const openDebugLogsTabCmdDisposable = vscode.commands.registerCommand(
        'salesforce-multitools-3.openDebugLogs',
        () => handleOpenDebugLogsTab(context.extensionUri)
    );

    context.subscriptions.push(openDebugLogsTabCmdDisposable);
    
    Logger.debug('Debug log commands registered');
}

/**
 * Handle opening the debug logs in a tab
 */
async function handleOpenDebugLogsTab(extensionUri: vscode.Uri): Promise<void> {
    // Open the debug logs in a tab
    DebugLogWebviewPanel.createOrShow(extensionUri);
}

/**
 * Update the SidebarProvider with a message handler for debug logs
 * This function is called from the SidebarProvider when the webview is ready
 */
export async function handleDebugLogWebviewCommand(
    message: any,
    sendResponseFunction: (message: any) => void
): Promise<boolean> {
    try {
        switch (message.command) {
            case 'fetchDebugLogs': {
                const logs = await DebugLogProvider.fetchDebugLogs();
                
                sendResponseFunction({
                    command: 'debugLogsLoaded',
                    data: { logs }
                });
                return true;
            }
            
            case 'viewDebugLog': {
                if (message.data?.logId) {
                    await DebugLogProvider.viewDebugLog(message.data.logId);
                }
                return true;
            }
            
            case 'deleteDebugLog': {
                if (message.data?.logId) {
                    await DebugLogProvider.deleteDebugLog(message.data.logId);
                    
                    sendResponseFunction({
                        command: 'debugLogDeleted',
                        data: { logId: message.data.logId }
                    });
                }
                return true;
            }
            
            case 'downloadDebugLog': {
                if (message.data?.logId) {
                    const filePath = await DebugLogProvider.downloadDebugLog(message.data.logId);
                    
                    sendResponseFunction({
                        command: 'debugLogDownloaded',
                        data: { logId: message.data.logId, filePath }
                    });
                    
                    // Show a notification
                    vscode.window.showInformationMessage(
                        `Debug log downloaded to ${filePath}`, 
                        'Open'
                    ).then((selection) => {
                        if (selection === 'Open') {
                            vscode.workspace.openTextDocument(filePath).then(doc => {
                                vscode.window.showTextDocument(doc);
                            });
                        }
                    });
                }
                return true;
            }
        }
        
        return false; // Command not handled
    } catch (error) {
        Logger.error('Error handling debug log command:', error);
        
        // Send error back to webview
        sendResponseFunction({
            command: 'debugLogsError',
            data: { 
                error: error instanceof Error ? error.message : String(error),
                originalCommand: message.command
            }
        });
        
        // Show error message
        vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        
        return true; // Command was handled, but with an error
    }
} 