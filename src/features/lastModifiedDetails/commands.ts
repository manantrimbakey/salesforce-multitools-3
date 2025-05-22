import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { getFileLastModifiedInfo } from './lastModifiedService';
import { getLastModifiedStoragePath } from './lastModifiedStorage';
import { ConfigUtils } from '../../utils/config';
import { FormattedLastModifiedInfo } from './lastModifiedTypes';
import { SFUtils } from '../../utils/sfutils';

// Status bar item to show last modified info
let lastModifiedStatusBar: vscode.StatusBarItem;

// Auto-refresh timer
let autoRefreshTimer: NodeJS.Timeout | undefined;

// CodeLens provider instance - made global so it can be accessed from commands
let codeLensProvider: LastModifiedCodeLensProvider;

/**
 * Register all commands related to the Last Modified Details feature
 * @param context The extension context to register commands with
 */
export function registerLastModifiedCommands(context: vscode.ExtensionContext): void {
    // Create status bar item
    lastModifiedStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    lastModifiedStatusBar.command = 'salesforce-multitools-3.refreshLastModifiedInfo';
    context.subscriptions.push(lastModifiedStatusBar);

    // Register the command to get last modified info
    const getLastModifiedInfoCmd = vscode.commands.registerCommand(
        'salesforce-multitools-3.getLastModifiedInfo',
        handleGetLastModifiedInfo,
    );

    // Register the command to refresh last modified info
    const refreshLastModifiedInfoCmd = vscode.commands.registerCommand(
        'salesforce-multitools-3.refreshLastModifiedInfo',
        handleGetLastModifiedInfo,
    );

    // Register the code lens provider
    codeLensProvider = new LastModifiedCodeLensProvider();

    // Use a more permissive pattern for LWC and Aura file detection
    const codeLensRegistration = vscode.languages.registerCodeLensProvider(
        [
            { scheme: 'file', pattern: '**/*.cls' },
            { scheme: 'file', pattern: '**/*.trigger' },
            { scheme: 'file', pattern: '**/*.page' },
            { scheme: 'file', pattern: '**/*.component' },
            // More specific LWC patterns to ensure all file types are covered
            { scheme: 'file', pattern: '**/lwc/**/*.js' },
            { scheme: 'file', pattern: '**/lwc/**/*.js-meta.xml' },
            { scheme: 'file', pattern: '**/lwc/**/*.css' },
            { scheme: 'file', pattern: '**/lwc/**/*.html' },
            { scheme: 'file', pattern: '**/lwc/**/*.xml' },
            // More specific Aura patterns
            { scheme: 'file', pattern: '**/aura/**/*.js' },
            { scheme: 'file', pattern: '**/aura/**/*.cmp' },
            { scheme: 'file', pattern: '**/aura/**/*.css' },
            { scheme: 'file', pattern: '**/aura/**/*.auradoc' },
            { scheme: 'file', pattern: '**/aura/**/*.design' },
            { scheme: 'file', pattern: '**/aura/**/*.svg' },
            { scheme: 'file', pattern: '**/aura/**/*.tokens' },
            // Aura meta files
            { scheme: 'file', pattern: '**/aura/**/*.cmp-meta.xml' },
            { scheme: 'file', pattern: '**/aura/**/*.app-meta.xml' },
            { scheme: 'file', pattern: '**/aura/**/*.intf-meta.xml' },
            { scheme: 'file', pattern: '**/aura/**/*.evt-meta.xml' },
            { scheme: 'file', pattern: '**/aura/**/*.design-meta.xml' },
            // Object patterns
            { scheme: 'file', pattern: '**/*.object' },
            { scheme: 'file', pattern: '**/*.object-meta.xml' },
        ],
        codeLensProvider,
    );

    // Register event for active editor change to update status bar
    const activeEditorChangeEvent = vscode.window.onDidChangeActiveTextEditor((editor) => {
        updateStatusBarBasedOnEditor(editor);
        startAutoRefreshTimer();
    });

    // Register event for configuration changes
    const configChangeEvent = vscode.workspace.onDidChangeConfiguration((event) => {
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
        {
            dispose: () => {
                // Clear the auto-refresh timer when the extension is deactivated
                if (autoRefreshTimer) {
                    clearInterval(autoRefreshTimer);
                    autoRefreshTimer = undefined;
                }
            },
        },
    );

    Logger.debug('Last Modified Details commands registered');
}

// Update statusbar display with org context
function updateStatusBarText(info: FormattedLastModifiedInfo, connection: any): void {
    const orgUsername = connection?.username || 'Unknown org';
    lastModifiedStatusBar.text = `$(history) Modified: ${info.lastModifiedDate} by ${info.lastModifiedBy}`;
    lastModifiedStatusBar.tooltip = `Last modified on ${info.lastModifiedDate} by ${info.lastModifiedBy}\nOrg: ${orgUsername}\nClick to refresh`;
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

    Logger.debug(`Updating status bar based on editor: ${filePath}`);
    const metadataInfo = getMetadataInfoFromFilePath(filePath);

    if (metadataInfo) {
        lastModifiedStatusBar.text = '$(history) Loading Salesforce metadata...';
        lastModifiedStatusBar.show();

        try {
            // Always fetch from Salesforce
            const info = await getFileLastModifiedInfo(filePath);
            const connection = await SFUtils.getConnection();

            if (info) {
                updateStatusBarText(info, connection);
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

    Logger.debug(`Starting auto-refresh for last modified details with interval: ${interval / 1000} seconds`);

    // Create a new timer that will refresh the last modified info
    autoRefreshTimer = setInterval(async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filePath = editor.document.uri.fsPath;

            Logger.debug(`Auto-refreshing last modified details for ${filePath}`);
            const metadataInfo = getMetadataInfoFromFilePath(filePath);

            if (metadataInfo) {
                Logger.debug(`Auto-refreshing last modified details for ${filePath}`);

                // Always query the server directly for fresh data
                try {
                    // Get fresh data from Salesforce
                    const info = await getFileLastModifiedInfo(filePath);
                    const connection = await SFUtils.getConnection();

                    if (info) {
                        // Update status bar
                        updateStatusBarText(info, connection);
                        lastModifiedStatusBar.show();

                        // Trigger CodeLens refresh with fresh server data
                        codeLensProvider.refreshWithLatestInfo(editor.document.uri, info);
                        Logger.debug('Auto-refresh completed successfully with fresh data from server');
                    }
                } catch (error) {
                    Logger.error('Error during auto-refresh:', error);
                }
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

    lastModifiedStatusBar.text = '$(sync~spin) Querying Salesforce metadata...';
    lastModifiedStatusBar.show();

    try {
        const info = await getFileLastModifiedInfo(filePath);
        const connection = await SFUtils.getConnection();

        if (info) {
            Logger.info(`Last modified info retrieved: ${JSON.stringify(info)}`);
            updateStatusBarText(info, connection);
            lastModifiedStatusBar.show();

            // Refresh the CodeLens with latest info from server
            codeLensProvider.refreshWithLatestInfo(editor.document.uri, info);
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
    // Event emitter for CodeLens changes
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    // Store the current document URI that needs to be refreshed
    private _pendingRefresh: Map<string, FormattedLastModifiedInfo> = new Map();

    /**
     * Refresh CodeLens with latest info from server
     * @param documentUri The document URI
     * @param info The latest info from server
     */
    public refreshWithLatestInfo(documentUri: vscode.Uri, info: FormattedLastModifiedInfo): void {
        const uriString = documentUri.toString();

        // Store only temporarily to display the CodeLens until next server query
        this._pendingRefresh.set(uriString, info);

        // Trigger a refresh
        this._onDidChangeCodeLenses.fire();
        Logger.debug(`Triggered CodeLens refresh for ${uriString}`);
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
    ): Promise<vscode.CodeLens[]> {
        Logger.debug(`Providing CodeLenses for ${document.uri}`);

        const filePath = document.uri.fsPath;

        // Check if it's an LWC or Aura file
        const isLwc = filePath.includes('/lwc/');
        const isAura = filePath.includes('/aura/');

        Logger.debug(`File path: ${filePath}, isLwc: ${isLwc}, isAura: ${isAura}`);
        const metadataInfo = getMetadataInfoFromFilePath(filePath);

        if (!metadataInfo) {
            Logger.debug(`No metadata info found for ${filePath}`);
            return [];
        }

        Logger.debug(`Metadata type: ${metadataInfo.type}, API name: ${metadataInfo.apiName}`);

        try {
            // Check if we have pending refresh info
            const uriString = document.uri.toString();
            const pendingInfo = this._pendingRefresh.get(uriString);

            // Always try to query Salesforce first
            let info: FormattedLastModifiedInfo | null;

            try {
                Logger.debug(`Fetching last modified info from Salesforce for ${filePath}`);
                info = await getFileLastModifiedInfo(filePath);

                if (info) {
                    Logger.debug(`Got info from Salesforce: ${JSON.stringify(info)}`);
                    // Update pending refresh with latest server data
                    this._pendingRefresh.set(uriString, info);
                } else {
                    Logger.debug(`No info returned from Salesforce for ${filePath}`);
                    // If server returns no data but we have pending refresh info, use that temporarily
                    info = pendingInfo || null;
                }
            } catch (error) {
                Logger.warn(`Error fetching from Salesforce: ${error}`);
                // On error, use pending refresh info if available, otherwise show error
                info = pendingInfo || null;
                if (!info) {
                    throw error; // Re-throw to show error CodeLens
                }
            }

            if (!info) {
                Logger.debug(`No info available for ${filePath}, not showing CodeLens`);
                return [];
            }

            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);

            // Get org username to display in CodeLens
            const connection = await SFUtils.getConnection();
            const orgUsername = connection?.getUsername() || '';

            // Keep org info in tooltip but not in CodeLens title
            const codeLens = new vscode.CodeLens(range, {
                title: `$(history) Last modified: ${info.lastModifiedDate} by ${info.lastModifiedBy}`,
                tooltip: `Last modified on ${info.lastModifiedDate} by ${info.lastModifiedBy}${orgUsername ? ` in org ${orgUsername}` : ''}\nClick to refresh`,
                command: 'salesforce-multitools-3.refreshLastModifiedInfo',
            });

            Logger.debug(`Returning CodeLens for ${document.uri}`);
            return [codeLens];
        } catch (error) {
            Logger.error('Error getting code lens for last modified info:', error);

            // Return a CodeLens that indicates an error
            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);

            const codeLens = new vscode.CodeLens(range, {
                title: `$(error) Error retrieving last modified details`,
                tooltip: 'Click to try again',
                command: 'salesforce-multitools-3.refreshLastModifiedInfo',
            });

            return [codeLens];
        }
    }
}
