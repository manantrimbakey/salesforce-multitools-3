import * as vscode from 'vscode';
import { LogLevel } from './logger';

/**
 * Configuration utilities for the extension
 */
export class ConfigUtils {
    private static readonly CONFIG_NAMESPACE = 'salesforceMultitools-3';

    /**
     * Get the log level from configuration
     */
    public static getLogLevel(): LogLevel | undefined {
        const config = vscode.workspace.getConfiguration(this.CONFIG_NAMESPACE);
        const configLevel = config.get<string>('logLevel');

        if (!configLevel) {
            return undefined;
        }

        switch (configLevel.toLowerCase()) {
            case 'debug':
                return LogLevel.DEBUG;
            case 'info':
                return LogLevel.INFO;
            case 'warn':
                return LogLevel.WARN;
            case 'error':
                return LogLevel.ERROR;
            case 'none':
                return LogLevel.NONE;
            default:
                return undefined;
        }
    }

    /**
     * Get the auto-refresh interval for last modified details in milliseconds
     * @returns The refresh interval in milliseconds, or 0 if auto-refresh is disabled
     */
    public static getLastModifiedAutoRefreshInterval(): number {
        const config = vscode.workspace.getConfiguration(this.CONFIG_NAMESPACE);
        // Get seconds from config, with 15 seconds as the default
        const seconds = config.get<number>('lastModifiedAutoRefreshInterval', 15);

        // 0 means disabled
        if (seconds <= 0) {
            return 0;
        }

        // Ensure minimum of 5 seconds
        const safeSeconds = Math.max(5, seconds);

        // Convert to milliseconds
        return safeSeconds * 1000;
    }

    /**
     * Check if the extension is running in development mode
     */
    public static isDevMode(context: vscode.ExtensionContext): boolean {
        return context.extensionMode === vscode.ExtensionMode.Development;
    }
}
