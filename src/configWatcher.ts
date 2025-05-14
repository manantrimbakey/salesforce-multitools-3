import * as vscode from 'vscode';
import { Logger, LogLevel } from './utils/logger';
import { ConfigUtils } from './utils/config';

/**
 * Watches for configuration changes and reacts accordingly
 */
export class ConfigWatcher {
    /**
     * Register configuration change event handlers
     */
    public static register(context: vscode.ExtensionContext): void {
        // Watch for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                this.handleConfigChange(e);
            })
        );
        
        Logger.debug('Configuration watcher registered');
    }
    
    /**
     * Handle configuration change events
     */
    private static handleConfigChange(event: vscode.ConfigurationChangeEvent): void {
        if (event.affectsConfiguration('salesforceMultitool.logLevel')) {
            this.updateLogLevel();
        }
    }
    
    /**
     * Update the log level based on configuration
     */
    private static updateLogLevel(): void {
        const newLogLevel = ConfigUtils.getLogLevel();
        if (newLogLevel !== undefined) {
            Logger.setLevel(newLogLevel);
            Logger.info(`Log level changed to: ${LogLevel[newLogLevel]}`);
        }
    }
} 