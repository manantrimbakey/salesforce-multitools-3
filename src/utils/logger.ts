import * as vscode from 'vscode';

/**
 * Log level enum for message severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}

/**
 * Logger service for consistent logging throughout the extension
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel;
    private static logLevel: LogLevel = LogLevel.INFO;
    private static prefix: string = 'Salesforce Multitool';

    /**
     * Initialize the logger
     */
    public static initialize(level?: LogLevel) {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel(this.prefix);
        }
        
        if (level !== undefined) {
            this.logLevel = level;
        }
    }

    /**
     * Set the log level
     */
    public static setLevel(level: LogLevel) {
        this.logLevel = level;
    }

    /**
     * Log a debug message
     */
    public static debug(message: string, ...args: any[]) {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    /**
     * Log an info message
     */
    public static info(message: string, ...args: any[]) {
        this.log(LogLevel.INFO, message, ...args);
    }

    /**
     * Log a warning message
     */
    public static warn(message: string, ...args: any[]) {
        this.log(LogLevel.WARN, message, ...args);
    }

    /**
     * Log an error message
     */
    public static error(message: string | Error, ...args: any[]) {
        if (message instanceof Error) {
            this.log(LogLevel.ERROR, message.message, ...args);
            if (message.stack) {
                this.log(LogLevel.ERROR, message.stack);
            }
        } else {
            this.log(LogLevel.ERROR, message, ...args);
        }
    }

    /**
     * Show the output channel
     */
    public static show() {
        this.outputChannel?.show(true);
    }

    /**
     * Log a message with the specified level
     */
    private static log(level: LogLevel, message: string, ...args: any[]) {
        if (!this.outputChannel) {
            this.initialize();
        }

        if (level < this.logLevel) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message);
        
        // Add to output channel
        this.outputChannel.appendLine(formattedMessage);
        
        // Format any additional arguments
        if (args && args.length > 0) {
            for (const arg of args) {
                if (typeof arg === 'object') {
                    this.outputChannel.appendLine(JSON.stringify(arg, null, 2));
                } else {
                    this.outputChannel.appendLine(String(arg));
                }
            }
        }

        // Also log to console
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(formattedMessage, ...args);
                break;
            case LogLevel.INFO:
                console.info(formattedMessage, ...args);
                break;
            case LogLevel.WARN:
                console.warn(formattedMessage, ...args);
                break;
            case LogLevel.ERROR:
                console.error(formattedMessage, ...args);
                break;
        }
    }

    /**
     * Format a log message with timestamp and level
     */
    private static formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level].padEnd(5);
        return `[${timestamp}] [${levelStr}] ${message}`;
    }

    /**
     * Dispose the logger resources
     */
    public static dispose() {
        this.outputChannel?.dispose();
    }
} 