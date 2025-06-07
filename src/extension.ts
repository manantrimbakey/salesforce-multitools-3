// Import SF Core config first to configure environment variables
import './utils/sfcoreConfig';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SFUtils } from './utils/sfutils';
import { Logger, LogLevel } from './utils/logger';
import { ConfigUtils } from './utils/config';
import { CommandHandler } from './commands/commandHandler';
import { ConfigWatcher } from './configWatcher';
import { SidebarProvider } from './features/sidePanel/SidebarProvider';
import { ExpressServer, disposeExpressServer } from './utils/expressServer';

/**
 * This method is called when your extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
    // Early return if .sfdx/sfdx-config.json does not exist in the workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        Logger.warn('No workspace folder found. Extension will not activate.', 'if');
        return;
    }
    const sfdxConfigPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.sfdx', 'sfdx-config.json');

    vscode.workspace.fs.stat(sfdxConfigPath).then(
        () => {
            // File exists, continue activation
            continueActivation(context);
        },
        () => {
            // File does not exist, log and return
            Logger.warn('.sfdx/sfdx-config.json not found in workspace root. Extension will not activate.', 'if');
        },
    );
}

// Move the rest of the activation logic to a new function
async function continueActivation(context: vscode.ExtensionContext) {
    // Initialize logger with proper log level
    initializeLogger(context);

    // Start the Express server first before any other initialization
    try {
        const expressServer = ExpressServer.getInstance();
        await expressServer.start();
        // Logger.info(`Express server started successfully`, 'continueActivation');
    } catch (error) {
        Logger.error(`Failed to activate core module : Salesforce Multitool ${error}`, 'catch');
        // Continue activation even if server fails to start
    }

    // Register configuration watchers
    ConfigWatcher.register(context);

    // Register commands
    CommandHandler.register(context);

    // Register the sidebar view
    const sidebarRegistrations = SidebarProvider.register(context);
    context.subscriptions.push(...sidebarRegistrations);

    // Initialize Salesforce connection in the background
    setTimeout(() => {
        // Initialize SFUtils directly rather than using CommandHandler
        SFUtils.initialize(true).catch((error: Error) => {
            Logger.error('Error during initialization:', 'catch', error);
        });
    }, 1000);

    // Register cleanup for deactivation
    registerCleanup(context);

    Logger.info('Salesforce Multitool extension activated successfully', 'catch');
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
        'if',
    );

    if (isDevelopment) {
        Logger.debug('DEBUG logging enabled for development', 'if');
    }
}

/**
 * Register cleanup functions when extension is deactivated
 */
function registerCleanup(context: vscode.ExtensionContext): void {
    context.subscriptions.push({
        dispose: () => {
            // Clean up the Express server first
            disposeExpressServer();
            // Then clean up other resources
            SFUtils.dispose();
            Logger.dispose();
        },
    });
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {}
