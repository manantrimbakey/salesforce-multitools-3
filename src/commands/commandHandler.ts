import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { SFUtils } from '../utils/sfutils';
import { registerLastModifiedCommands } from '../features/lastModifiedDetails';

/**
 * Handles registration and execution of commands
 */
export class CommandHandler {
    /**
     * Register all commands for the extension
     */
    public static register(context: vscode.ExtensionContext): void {
        // Hello World command
        const helloWorldCmd = vscode.commands.registerCommand('salesforce-multitool.helloWorld', this.handleHelloWorld);

        // Refresh connection command
        const refreshConnectionCmd = vscode.commands.registerCommand(
            'salesforce-multitool.refreshConnection',
            this.handleRefreshConnection,
        );

        // Register all commands from features
        registerLastModifiedCommands(context);

        context.subscriptions.push(helloWorldCmd, refreshConnectionCmd);

        Logger.debug('All commands registered');
    }

    /**
     * Handle hello world command
     */
    private static handleHelloWorld(): void {
        vscode.window.showInformationMessage('Hello from Salesforce Multitool!');
        Logger.info('Hello World command executed');
    }

    /**
     * Handle refresh connection command
     */
    private static async handleRefreshConnection(): Promise<void> {
        Logger.info('Refreshing Salesforce connection');
        await this.initializeSalesforceConnection(true);
        vscode.window.showInformationMessage('Salesforce connection refreshed');
    }

    /**
     * Initialize the Salesforce connection
     */
    public static async initializeSalesforceConnection(forceRefresh = false): Promise<void> {
        // Show status bar item during initialization
        const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusItem.text = '$(sync~spin) Connecting to Salesforce...';
        statusItem.show();

        try {
            Logger.info('Initializing Salesforce connection' + (forceRefresh ? ' (force refresh)' : ''));

            if (forceRefresh) {
                // Force re-initialization of SFUtils static members
                await SFUtils.initialize(true);
            }

            const username = await SFUtils.getDefaultUsername();
            const connection = await SFUtils.getConnection();

            if (username) {
                Logger.info(`Connected to Salesforce as: ${username}`);
                statusItem.text = `$(check) Connected to Salesforce: ${username}`;
                statusItem.tooltip = `Connected to Salesforce organization`;

                // Hide status after 5 seconds
                setTimeout(() => {
                    statusItem.hide();
                    statusItem.dispose();
                }, 5000);
            } else {
                Logger.warn('No default Salesforce username found');
                statusItem.text = `$(warning) No Salesforce org found`;
                statusItem.tooltip = `No default Salesforce username found`;

                // Keep visible so user knows there's an issue
                setTimeout(() => {
                    statusItem.hide();
                    statusItem.dispose();
                }, 10000);

                vscode.window.showWarningMessage(
                    'No default Salesforce username found. Please authorize an org first.',
                );
            }
        } catch (error) {
            Logger.error('Failed to initialize Salesforce connection:', error);

            statusItem.text = `$(error) Salesforce connection failed`;
            statusItem.tooltip = `Error: ${error instanceof Error ? error.message : String(error)}`;

            // Keep visible so user knows there's an issue
            setTimeout(() => {
                statusItem.hide();
                statusItem.dispose();
            }, 10000);

            vscode.window.showErrorMessage(
                `Failed to connect to Salesforce: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
