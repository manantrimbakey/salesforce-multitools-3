// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SFUtils } from './utils/sfutils';
import { Logger, LogLevel } from './utils/logger';
import { ConfigUtils } from './utils/config';
import { CommandHandler } from './commands/commandHandler';
import { ConfigWatcher } from './configWatcher';
import { SidebarProvider } from './features/sidePanel/SidebarProvider';
import { DebugLogWebviewPanel } from './features/debugLogs/webviewPanel';

/** Files whose presence in the workspace root marks a Salesforce project with a default org */
const ORG_CONFIG_FILES: ReadonlyArray<readonly string[]> = [
    ['.sfdx', 'sfdx-config.json'],
    ['.sf', 'config.json'],
];

async function hasOrgConfig(workspaceRoot: vscode.Uri): Promise<boolean> {
    const results = await Promise.all(
        ORG_CONFIG_FILES.map((segments) =>
            vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceRoot, ...segments)).then(
                () => true,
                () => false,
            ),
        ),
    );
    return results.some(Boolean);
}

/**
 * This method is called when your extension is activated
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Only activate in Salesforce projects (the logger is not initialized yet, so stay silent otherwise)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot || !(await hasOrgConfig(workspaceRoot))) {
        return;
    }

    try {
        continueActivation(context);
    } catch (error) {
        Logger.error('Failed to activate Salesforce Multitool extension', 'activate', error);
        throw error;
    }
}

function continueActivation(context: vscode.ExtensionContext) {
    // Initialize logger with proper log level
    initializeLogger(context);

    // Register configuration watchers
    ConfigWatcher.register(context);

    // Register commands
    CommandHandler.register(context);

    // Register the sidebar view
    const sidebarRegistrations = SidebarProvider.register(context);
    context.subscriptions.push(...sidebarRegistrations);

    // Drop cached org connections when the default org config changes
    SFUtils.startWatching(context);

    // Register cleanup for deactivation
    registerCleanup(context);

    Logger.info('Salesforce Multitool extension activated successfully', 'continueActivation');
}

/**
 * Initialize the logger with the appropriate log level
 */
function initializeLogger(context: vscode.ExtensionContext): void {
    const isDevelopment = ConfigUtils.isDevMode(context);
    const configLogLevel = ConfigUtils.getLogLevel();

    // Use config level if set, otherwise use development mode to determine level
    let logLevel: LogLevel;

    if (isDevelopment) {
        logLevel = LogLevel.DEBUG;
    } else if (configLogLevel !== undefined && configLogLevel !== null) {
        logLevel = configLogLevel;
    } else {
        logLevel = LogLevel.INFO;
    }

    // Initialize with the log level and development mode flag
    Logger.initialize(logLevel, isDevelopment);
    Logger.info(
        `Salesforce Multitool extension is now active (${isDevelopment ? 'development' : 'production'} mode)`,
        'initializeLogger',
    );

    if (isDevelopment) {
        Logger.debug('DEBUG logging enabled for development', 'initializeLogger');
    }
}

/**
 * Register cleanup functions when extension is deactivated
 */
function registerCleanup(context: vscode.ExtensionContext): void {
    context.subscriptions.push({
        dispose: () => {
            SFUtils.dispose();
            Logger.dispose();
        },
    });
}

/**
 * This method is called when your extension is deactivated
 */
export async function deactivate(): Promise<void> {
    // Webviews and listeners are disposed through context.subscriptions; nothing async is left
    DebugLogWebviewPanel.close();
}
