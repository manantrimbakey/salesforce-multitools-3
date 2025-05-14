// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SFUtils } from './utils/sfutils';
import { Logger, LogLevel } from './utils/logger';
import { ConfigUtils } from './utils/config';
import { CommandHandler } from './commands/commandHandler';
import { ConfigWatcher } from './configWatcher';
import { SidebarProvider } from './features/sidePanel/SidebarProvider';

/**
 * This method is called when your extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
    // Initialize logger with proper log level
    initializeLogger(context);

    // Register configuration watchers
    ConfigWatcher.register(context);

    // Register commands
    CommandHandler.register(context);

    // Register the sidebar view
    const sidebarRegistrations = SidebarProvider.register(context);
    context.subscriptions.push(...sidebarRegistrations);

    // Initialize Salesforce connection in the background
    setTimeout(() => {
        CommandHandler.initializeSalesforceConnection().catch((error) => {
            Logger.error('Error during initialization:', error);
        });
    }, 1000);

    // Register cleanup for deactivation
    registerCleanup(context);

    Logger.info('Salesforce Multitool extension activated successfully');
}

/**
 * Initialize the logger with the appropriate log level
 */
function initializeLogger(context: vscode.ExtensionContext): void {
    const isDevelopment = ConfigUtils.isDevMode(context);
    const configLogLevel = ConfigUtils.getLogLevel();

    // Use config level if set, otherwise use development mode to determine level
    const logLevel = configLogLevel !== undefined ? configLogLevel : isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;

    Logger.initialize(logLevel);
    Logger.info(`Salesforce Multitool extension is now active (${isDevelopment ? 'development' : 'production'} mode)`);

    if (isDevelopment) {
        Logger.debug('DEBUG logging enabled for development');
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
export function deactivate() {}
