import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { getFileLastModifiedInfo } from './lastModifiedService';
import { SFUtils } from '../../utils/sfutils';
import { FormattedLastModifiedInfo } from './lastModifiedTypes';
import { ConfigUtils } from '../../utils/config';
import { getStoredLastModifiedInfo, storeLastModifiedInfo } from './lastModifiedStorage';
import { isRegularFileEditor } from '../../utils/fileUtils';

// Status bar item to show last modified info
let lastModifiedStatusBar: vscode.StatusBarItem;

// Auto-refresh timer
let autoRefreshTimer: NodeJS.Timeout | undefined;

// CodeLens provider instance - made global so it can be accessed from commands
let codeLensProvider: LastModifiedCodeLensProvider;

// Debounce tracking for refresh operations
let lastRefreshTime = 0;
let pendingRefresh: NodeJS.Timeout | undefined;
const DEBOUNCE_DELAY = 1000; // 1 second debounce

/**
 * Register all commands related to the Last Modified Details feature
 * @param context The extension context to register commands with
 */
export function registerLastModifiedCommands(context: vscode.ExtensionContext): void {
    // Create status bar item
    lastModifiedStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    lastModifiedStatusBar.command = 'salesforce-multitools-3.refreshLastModifiedInfo';
    context.subscriptions.push(lastModifiedStatusBar);

    // Register the single unified command to refresh last modified info
    const refreshLastModifiedInfoCmd = vscode.commands.registerCommand(
        'salesforce-multitools-3.refreshLastModifiedInfo',
        (forceRefresh = false) => {
            // When command is directly invoked, force a refresh bypassing debounce
            refreshLastModifiedInfo(forceRefresh);
        },
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

    // Register event for active editor change to update status bar and fetch new data
    const activeEditorChangeEvent = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (isValidEditor(editor)) {
            refreshLastModifiedInfo();
        } else {
            lastModifiedStatusBar.hide();
        }
    });

    // Register event for document save to trigger refresh
    const documentSaveEvent = vscode.workspace.onDidSaveTextDocument((document) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document && isValidEditor(editor)) {
            // Always force refresh after save
            refreshLastModifiedInfo(true);
        }
    });

    // Register event for configuration changes
    const configChangeEvent = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('salesforceMultitool.lastModifiedAutoRefreshInterval')) {
            // Restart the auto-refresh timer with the new interval
            startAutoRefreshTimer();
        }
    });

    // Update status bar on startup if editor is already open
    const editor = vscode.window.activeTextEditor;
    if (isValidEditor(editor)) {
        refreshLastModifiedInfo();
    }

    // Start the auto-refresh timer
    startAutoRefreshTimer();

    context.subscriptions.push(
        refreshLastModifiedInfoCmd,
        codeLensRegistration,
        activeEditorChangeEvent,
        documentSaveEvent,
        configChangeEvent,
        {
            dispose: () => {
                // Clear the auto-refresh timer when the extension is deactivated
                if (autoRefreshTimer) {
                    clearInterval(autoRefreshTimer);
                    autoRefreshTimer = undefined;
                }

                // Clear any pending refresh
                if (pendingRefresh) {
                    clearTimeout(pendingRefresh);
                    pendingRefresh = undefined;
                }
            },
        },
    );

    Logger.debug(
        'Last Modified Details commands registered',
        'LastModifiedDetailsCommands.registerLastModifiedCommands',
    );
}

/**
 * Checks if the editor is valid for last modified details
 * @param editor The editor to check
 * @returns True if the editor is valid, false otherwise
 */
function isValidEditor(editor?: vscode.TextEditor): boolean {
    if (!isRegularFileEditor(editor)) {
        return false;
    }

    // Check if it's a Salesforce file by extracting metadata info
    const metadataInfo = getMetadataInfoFromFilePath(editor!.document.uri.fsPath);
    return !!metadataInfo;
}

/**
 * Update statusbar display with org context
 * @param info The last modified info
 * @param connection The Salesforce connection
 */
function updateStatusBarText(info: FormattedLastModifiedInfo, connection: any): void {
    const orgUsername = connection?.username || 'Unknown org';
    lastModifiedStatusBar.text = `$(history) Modified: ${info.lastModifiedDate} by ${info.lastModifiedBy}`;
    lastModifiedStatusBar.tooltip = `Last modified on ${info.lastModifiedDate} by ${info.lastModifiedBy}\nOrg: ${orgUsername}\nClick to refresh`;
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
        Logger.debug(
            'Auto-refresh for last modified details is disabled',
            'LastModifiedDetailsCommands.startAutoRefreshTimer',
        );
        return;
    }

    Logger.debug(
        `Starting auto-refresh for last modified details with interval: ${interval / 1000} seconds`,
        'LastModifiedDetailsCommands.startAutoRefreshTimer',
    );

    // Create a new timer that will refresh the last modified info
    autoRefreshTimer = setInterval(() => {
        const editor = vscode.window.activeTextEditor;

        // Only refresh if we have a valid editor and enough time has passed since last refresh
        const currentTime = Date.now();
        if (!isValidEditor(editor) || currentTime - lastRefreshTime < 2000) {
            // 2 seconds minimum between auto-refreshes
            return;
        }

        refreshLastModifiedInfo();
    }, interval);
}

/**
 * Single unified command to fetch last modified info from Salesforce
 * This command will:
 * 1. Fetch the latest data from Salesforce
 * 2. Compare with stored data and show notification if changed
 * 3. Update the UI (CodeLens and status bar)
 * 4. Store the data locally
 *
 * @param forceRefresh If true, bypass debouncing and always refresh
 */
export async function refreshLastModifiedInfo(forceRefresh: boolean = false): Promise<void> {
    // Clear any pending refresh
    if (pendingRefresh) {
        clearTimeout(pendingRefresh);
        pendingRefresh = undefined;
    }

    const editor = vscode.window.activeTextEditor;
    if (!isValidEditor(editor) || !editor) {
        return;
    }

    const filePath = editor.document.uri.fsPath;

    // Implement debouncing unless this is a forced refresh
    if (!forceRefresh) {
        const now = Date.now();
        if (now - lastRefreshTime < DEBOUNCE_DELAY) {
            pendingRefresh = setTimeout(() => {
                pendingRefresh = undefined;
                refreshLastModifiedInfo();
            }, DEBOUNCE_DELAY);
            return;
        }
    }

    // Update last refresh time
    lastRefreshTime = Date.now();

    Logger.info(`Getting last modified info for: ${filePath}`, 'LastModifiedDetailsCommands.refreshLastModifiedInfo');
    lastModifiedStatusBar.text = '$(sync~spin) Querying Salesforce metadata...';
    lastModifiedStatusBar.show();

    try {
        // Get metadata info for the current file
        const metadataInfo = getMetadataInfoFromFilePath(filePath);
        if (!metadataInfo) {
            lastModifiedStatusBar.text = `$(history) Not a recognized Salesforce file`;
            lastModifiedStatusBar.tooltip = `Could not retrieve last modified information`;
            lastModifiedStatusBar.show();
            return;
        }

        // Step 1: Fetch fresh data from Salesforce
        const info = await getFileLastModifiedInfo(filePath);
        const connection = await SFUtils.getConnection();

        if (!info) {
            lastModifiedStatusBar.text = `$(history) No metadata found for this file`;
            lastModifiedStatusBar.tooltip = `Could not retrieve last modified information`;
            lastModifiedStatusBar.show();
            return;
        }

        // Step 2: Check if it was modified by someone else
        await checkForExternalModifications(metadataInfo.type, metadataInfo.apiName, {
            LastModifiedBy: { Name: info.lastModifiedBy },
            LastModifiedDate: new Date(info.lastModifiedDate).toISOString(),
            LastModifiedById: info.lastModifiedById,
        });

        // Step 3: Update the UI
        updateStatusBarText(info, connection);
        lastModifiedStatusBar.show();
        codeLensProvider.refreshWithLatestInfo(editor.document.uri, info);

        // Step 4: Store the data locally
        await storeLastModifiedInfo(metadataInfo.type, metadataInfo.apiName, {
            lastModifiedBy: info.lastModifiedBy,
            lastModifiedDate: new Date(info.lastModifiedDate).toISOString(),
            lastModifiedById: info.lastModifiedById,
            retrievedAt: new Date().toISOString(),
            orgId: connection.instanceUrl || '',
            orgUsername: (await SFUtils.getDefaultUsername()) || '',
        });
    } catch (error) {
        Logger.error(
            'Error getting file last modified info:',
            'LastModifiedDetailsCommands.refreshLastModifiedInfo',
            error,
        );
        lastModifiedStatusBar.text = `$(history) Error querying metadata`;
        lastModifiedStatusBar.tooltip = `Error: ${error instanceof Error ? error.message : String(error)}\nClick to try again`;
        lastModifiedStatusBar.show();
    }
}

/**
 * Check if the file has been modified by someone else since our last check
 * @param metadataType The type of metadata
 * @param apiName The API name of the component
 * @param currentData The current data from Salesforce
 */
async function checkForExternalModifications(metadataType: string, apiName: string, currentData: any): Promise<void> {
    try {
        // Get the stored last modified info
        const storedInfo = await getStoredLastModifiedInfo(metadataType, apiName);
        if (!storedInfo) {
            return;
        }

        // Check if the modification date is different and by a different user
        const storedDate = new Date(storedInfo.lastModifiedDate).getTime();
        const currentDate = new Date(currentData.LastModifiedDate).getTime();
        const storedId = storedInfo.lastModifiedById;
        const currentId = currentData.LastModifiedById;

        if (currentDate > storedDate && storedId !== currentId) {
            vscode.window.showInformationMessage(
                `This file was modified on Salesforce by ${currentData.LastModifiedBy.Name} since your last check.`,
                'OK',
            );
            Logger.info(
                `External modification detected for ${metadataType}:${apiName} by ${currentData.LastModifiedBy.Name}`,
                'LastModifiedDetailsCommands.checkForExternalModifications',
            );
        }
    } catch (error) {
        // Don't let errors in the check interrupt the main flow
        Logger.error(
            'Error checking for external modifications:',
            'LastModifiedDetailsCommands.checkForExternalModifications',
            error,
        );
    }
}

/**
 * CodeLens provider for displaying last modified information
 */
class LastModifiedCodeLensProvider implements vscode.CodeLensProvider {
    // Event emitter for CodeLens changes
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    // Store the last modified info for each document
    private _pendingRefresh: Map<string, FormattedLastModifiedInfo> = new Map();

    /**
     * Refresh CodeLens with latest info from server
     * @param documentUri The document URI
     * @param info The latest info from server
     */
    public refreshWithLatestInfo(documentUri: vscode.Uri, info: FormattedLastModifiedInfo): void {
        const uriString = documentUri.toString();
        this._pendingRefresh.set(uriString, info);
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
    ): Promise<vscode.CodeLens[]> {
        // Skip non-file documents
        if (document.uri.scheme !== 'file') {
            return [];
        }

        const filePath = document.uri.fsPath;
        if (!getMetadataInfoFromFilePath(filePath)) {
            return [];
        }

        try {
            // Get cached info for this document
            const uriString = document.uri.toString();
            const pendingInfo = this._pendingRefresh.get(uriString);
            if (!pendingInfo) {
                return [];
            }

            // Create CodeLens at the top of the document
            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);

            // Get org username for tooltip
            const connection = await SFUtils.getConnection();
            const orgUsername = connection?.getUsername() || '';

            return [
                new vscode.CodeLens(range, {
                    title: `$(history) Last modified: ${pendingInfo.lastModifiedDate} by ${pendingInfo.lastModifiedBy}`,
                    tooltip: `Last modified on ${pendingInfo.lastModifiedDate} by ${pendingInfo.lastModifiedBy}${
                        orgUsername ? ` in org ${orgUsername}` : ''
                    }\nClick to refresh`,
                    command: 'salesforce-multitools-3.refreshLastModifiedInfo',
                }),
            ];
        } catch (error) {
            Logger.error('Error providing CodeLens:', 'LastModifiedDetailsCommands.provideCodeLenses', error);

            // Return error CodeLens
            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);
            return [
                new vscode.CodeLens(range, {
                    title: `$(error) Error retrieving last modified details`,
                    tooltip: 'Click to try again',
                    command: 'salesforce-multitools-3.refreshLastModifiedInfo',
                }),
            ];
        }
    }
}
