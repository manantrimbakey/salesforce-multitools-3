import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { SFUtils } from '../utils/sfutils';
import { registerLastModifiedCommands } from '../features/lastModifiedDetails';
import { registerComponentFileSwitcherCommands } from '../features/componentFileSwitcher';
import { registerDebugLogCommands } from '../features/debugLogs/commands';
import { registerPermissionCompareCommands } from '../features/permissionCompare/commands';

/**
 * Handles registration and execution of commands
 */
export class CommandHandler {
    /**
     * Register all commands for the extension
     */
    public static register(context: vscode.ExtensionContext): void {
        // Refresh connection command
        const refreshConnectionCmd = vscode.commands.registerCommand(
            'salesforce-multitools-3.refreshConnection',
            this.handleRefreshConnection,
        );

        // Command to open sidebar (redirects to focus the view)
        const openSidebarCmd = vscode.commands.registerCommand(
            'salesforce-multitools-3.openFileSwitcher',
            this.handleOpenSidebar,
        );

        // Commands to switch to different components
        const showComponentFileSwitcherCmd = vscode.commands.registerCommand(
            'salesforce-multitools-3.showComponentFileSwitcher',
            () => this.handleSwitchComponent('componentFileSwitcher'),
        );

        // Register all commands from features
        registerLastModifiedCommands(context);
        registerComponentFileSwitcherCommands(context);
        registerDebugLogCommands(context);
        registerPermissionCompareCommands(context);

        context.subscriptions.push(refreshConnectionCmd, openSidebarCmd, showComponentFileSwitcherCmd);

        Logger.debug('All commands registered', 'CommandHandler.register');
    }

    /**
     * Handle refreshing the Salesforce connection
     */
    private static async handleRefreshConnection(): Promise<void> {
        try {
            // Drop the cached connection so the next request resolves the org again
            SFUtils.refresh();
            vscode.window.showInformationMessage('Salesforce connection refreshed');
        } catch (error) {
            Logger.error('Error refreshing connection:', 'CommandHandler.handleRefreshConnection()', error);
            vscode.window.showErrorMessage(`Failed to refresh connection: ${error}`);
        }
    }

    /**
     * Handle opening the sidebar
     */
    private static async handleOpenSidebar(): Promise<void> {
        await vscode.commands.executeCommand('salesforceMultitools.sidebar.focus');
    }

    /**
     * Handle switching to a different component in the sidebar
     */
    private static async handleSwitchComponent(componentName: string): Promise<void> {
        await vscode.commands.executeCommand('salesforceMultitools.sidebar.focus');
        await vscode.commands.executeCommand('salesforceMultitools.sidebar.setComponent', componentName);
    }
}
