import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { getFileLastModifiedInfo } from './lastModifiedService';
import { getLastModifiedStoragePath } from './lastModifiedStorage';
import { ConfigUtils } from '../../utils/config';

// Status bar item to show last modified info
let lastModifiedStatusBar: vscode.StatusBarItem;

// Auto-refresh timer
let autoRefreshTimer: NodeJS.Timeout | undefined;

/**
 * Register all commands related to the Last Modified Details feature
 * @param context The extension context to register commands with
 */
export function registerLastModifiedCommands(context: vscode.ExtensionContext): void {
    // Create status bar item
    lastModifiedStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    lastModifiedStatusBar.command = 'salesforce-multitool.refreshLastModifiedInfo';
    context.subscriptions.push(lastModifiedStatusBar);
    
    // Register the command to get last modified info
    const getLastModifiedInfoCmd = vscode.commands.registerCommand(
        'salesforce-multitool.getLastModifiedInfo',
        handleGetLastModifiedInfo
    );
    
    // Register the command to refresh last modified info
    const refreshLastModifiedInfoCmd = vscode.commands.registerCommand(
        'salesforce-multitool.refreshLastModifiedInfo',
        handleGetLastModifiedInfo
    );
    
    // Register the code lens provider
    const codeLensProvider = new LastModifiedCodeLensProvider();
    const codeLensRegistration = vscode.languages.registerCodeLensProvider(
        [
            { scheme: 'file', pattern: '**/*.cls' },
            { scheme: 'file', pattern: '**/*.trigger' },
            { scheme: 'file', pattern: '**/*.page' },
            { scheme: 'file', pattern: '**/*.component' },
            { scheme: 'file', pattern: '**/*.lwc/**/*.js' },
            { scheme: 'file', pattern: '**/*.lwc/**/*.html' },
            { scheme: 'file', pattern: '**/*.aura/**/*.js' },
            { scheme: 'file', pattern: '**/*.aura/**/*.cmp' },
            { scheme: 'file', pattern: '**/*.object' },
            { scheme: 'file', pattern: '**/*.object-meta.xml' }
        ],
        codeLensProvider
    );
    
    // Register event for active editor change to update status bar
    const activeEditorChangeEvent = vscode.window.onDidChangeActiveTextEditor(editor => {
        updateStatusBarBasedOnEditor(editor);
        startAutoRefreshTimer();
    });
    
    // Register event for configuration changes
    const configChangeEvent = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('salesforceMultitool.lastModifiedAutoRefreshInterval')) {
            // Restart the auto-refresh timer with the new interval
            startAutoRefreshTimer();
        }
    });
    
    // Update status bar on startup if editor is already open
    updateStatusBarBasedOnEditor(vscode.window.activeTextEditor);
    
    // Start the auto-refresh timer
    startAutoRefreshTimer();
    
    context.subscriptions.push(
        getLastModifiedInfoCmd,
        refreshLastModifiedInfoCmd,
        codeLensRegistration,
        activeEditorChangeEvent,
        configChangeEvent,
        { dispose: () => {
            // Clear the auto-refresh timer when the extension is deactivated
            if (autoRefreshTimer) {
                clearInterval(autoRefreshTimer);
                autoRefreshTimer = undefined;
            }
        }}
    );
    
    Logger.debug('Last Modified Details commands registered');
}

/**
 * Update status bar based on current active editor
 */
async function updateStatusBarBasedOnEditor(editor?: vscode.TextEditor): Promise<void> {
    if (!editor) {
        lastModifiedStatusBar.hide();
        return;
    }
    
    const filePath = editor.document.uri.fsPath;
    const metadataInfo = getMetadataInfoFromFilePath(filePath);
    
    if (metadataInfo) {
        lastModifiedStatusBar.text = "$(history) Loading Salesforce metadata...";
        lastModifiedStatusBar.show();
        
        try {
            // Always fetch from Salesforce
            const info = await getFileLastModifiedInfo(filePath);
            if (info) {
                lastModifiedStatusBar.text = `$(history) Modified: ${info.lastModifiedDate} by ${info.lastModifiedBy}`;
                lastModifiedStatusBar.tooltip = `Last modified on ${info.lastModifiedDate} by ${info.lastModifiedBy}\nClick to refresh`;
                lastModifiedStatusBar.show();
            } else {
                lastModifiedStatusBar.text = `$(history) Not a recognized Salesforce file`;
                lastModifiedStatusBar.tooltip = `Could not retrieve last modified information from Salesforce`;
                lastModifiedStatusBar.show();
            }
        } catch (error) {
            Logger.error('Error updating status bar with last modified info:', error);
            lastModifiedStatusBar.text = `$(history) Click to get last modified info`;
            lastModifiedStatusBar.tooltip = `Error fetching last modified info. Click to try again.`;
            lastModifiedStatusBar.show();
        }
    } else {
        lastModifiedStatusBar.hide();
    }
}

/**
 * Start the auto-refresh timer based on configuration setting
 */
function startAutoRefreshTimer(): void {
    // Clear any existing timer
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = undefined;
    }
    
    // Get the refresh interval from configuration
    const interval = ConfigUtils.getLastModifiedAutoRefreshInterval();
    
    // If interval is 0, auto-refresh is disabled
    if (interval <= 0) {
        Logger.debug('Auto-refresh for last modified details is disabled');
        return;
    }
    
    Logger.debug(`Starting auto-refresh for last modified details with interval: ${interval/1000} seconds`);
    
    // Create a new timer that will refresh the last modified info
    autoRefreshTimer = setInterval(async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filePath = editor.document.uri.fsPath;
            const metadataInfo = getMetadataInfoFromFilePath(filePath);
            
            if (metadataInfo) {
                Logger.debug(`Auto-refreshing last modified details for ${filePath}`);
                await handleGetLastModifiedInfo();
            }
        }
    }, interval);
}

/**
 * Handle get last modified info command for the currently active Salesforce file
 */
async function handleGetLastModifiedInfo(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    
    const filePath = editor.document.uri.fsPath;
    Logger.info(`Getting last modified info for: ${filePath}`);
    
    lastModifiedStatusBar.text = "$(sync~spin) Querying Salesforce metadata...";
    lastModifiedStatusBar.show();
    
    try {
        const info = await getFileLastModifiedInfo(filePath);
        
        if (info) {
            Logger.info(`Last modified info retrieved: ${JSON.stringify(info)}`);
            lastModifiedStatusBar.text = `$(history) Modified: ${info.lastModifiedDate} by ${info.lastModifiedBy}`;
            lastModifiedStatusBar.tooltip = `Last modified on ${info.lastModifiedDate} by ${info.lastModifiedBy}\nClick to refresh`;
            lastModifiedStatusBar.show();
            
            // Refresh the CodeLens
            vscode.commands.executeCommand('editor.action.showReferences', editor.document.uri, editor.selection.active, []);
            vscode.commands.executeCommand('editor.action.triggerEditorAction', 'editor.action.showReferences', editor.document.uri, editor.selection.active, []);
        } else {
            Logger.warn(`No Salesforce metadata found for file: ${filePath}`);
            lastModifiedStatusBar.text = `$(history) Not a recognized Salesforce file`;
            lastModifiedStatusBar.tooltip = `Could not retrieve last modified information`;
            lastModifiedStatusBar.show();
        }
    } catch (error) {
        Logger.error('Error getting file last modified info:', error);
        lastModifiedStatusBar.text = `$(history) Error querying metadata`;
        lastModifiedStatusBar.tooltip = `Error: ${error instanceof Error ? error.message : String(error)}\nClick to try again`;
        lastModifiedStatusBar.show();
    }
}

/**
 * CodeLens provider for displaying last modified information
 */
class LastModifiedCodeLensProvider implements vscode.CodeLensProvider {
    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const filePath = document.uri.fsPath;
        const metadataInfo = getMetadataInfoFromFilePath(filePath);
        
        if (!metadataInfo) {
            return [];
        }
        
        try {
            // Always fetch data from Salesforce
            const info = await getFileLastModifiedInfo(filePath);
            if (!info) {
                return [];
            }
            
            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);
            
            const codeLens = new vscode.CodeLens(range, {
                title: `$(history) Last modified: ${info.lastModifiedDate} by ${info.lastModifiedBy}`,
                tooltip: 'Click to refresh last modified information',
                command: 'salesforce-multitool.refreshLastModifiedInfo'
            });
            
            return [codeLens];
        } catch (error) {
            Logger.error('Error getting code lens for last modified info:', error);
            
            // Return a CodeLens that indicates an error
            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);
            
            const codeLens = new vscode.CodeLens(range, {
                title: `$(error) Error retrieving last modified details`,
                tooltip: 'Click to try again',
                command: 'salesforce-multitool.refreshLastModifiedInfo'
            });
            
            return [codeLens];
        }
    }
} 