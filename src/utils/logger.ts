import * as vscode from 'vscode';

/**
 * Log level enum for message severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
}

/**
 * Logger service for consistent logging throughout the extension
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel;
    private static logLevel: LogLevel = LogLevel.INFO;
    private static readonly prefix: string = 'Salesforce Multitool';
    private static isDevelopmentMode: boolean = false;

    /**
     * Initialize the logger
     */
    public static initialize(level?: LogLevel, isDev: boolean = false) {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel(this.prefix);
        }

        if (level !== undefined) {
            this.logLevel = level;
        }

        this.isDevelopmentMode = isDev;
    }

    /**
     * Set the log level
     */
    public static setLevel(level: LogLevel) {
        this.logLevel = level;
    }

    /**
     * Set development mode flag
     */
    public static setDevelopmentMode(isDev: boolean) {
        this.isDevelopmentMode = isDev;
    }

    /**
     * Log a debug message
     * @param message The message to log
     * @param methodName Optional method name for development mode
     * @param args Additional arguments to log
     */
    public static debug(message: string, methodName?: string, ...args: any[]) {
        this.log(LogLevel.DEBUG, message, methodName, ...args);
    }

    /**
     * Log an info message
     * @param message The message to log
     * @param methodName Optional method name for development mode
     * @param args Additional arguments to log
     */
    public static info(message: string, methodName?: string, ...args: any[]) {
        this.log(LogLevel.INFO, message, methodName, ...args);
    }

    /**
     * Log a warning message
     * @param message The message to log
     * @param methodName Optional method name for development mode
     * @param args Additional arguments to log
     */
    public static warn(message: string, methodName?: string, ...args: any[]) {
        this.log(LogLevel.WARN, message, methodName, ...args);
    }

    /**
     * Log an error message
     * @param message The message or error to log
     * @param methodNameOrArg Optional method name or first argument
     * @param args Additional arguments to log
     */
    public static error(message: string | Error, methodNameOrArg?: string | any, ...args: any[]) {
        // Handle the case where methodNameOrArg might be the first argument rather than a method name
        let methodName: string | undefined;
        let actualArgs: any[] = args;

        if (typeof methodNameOrArg === 'string' && !methodNameOrArg.startsWith('[object ')) {
            methodName = methodNameOrArg;
        } else if (methodNameOrArg !== undefined) {
            actualArgs = [methodNameOrArg, ...args];
        }

        if (message instanceof Error) {
            this.log(LogLevel.ERROR, message.message, methodName, ...actualArgs);
            if (message.stack) {
                this.log(LogLevel.ERROR, message.stack);
            }
        } else {
            this.log(LogLevel.ERROR, message, methodName, ...actualArgs);
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
     * @param level The log level
     * @param message The message to log
     * @param methodName Optional method name
     * @param args Additional arguments to log
     */
    private static log(level: LogLevel, message: string, methodName?: string, ...args: any[]) {
        if (!this.outputChannel) {
            this.initialize();
        }

        if (level < this.logLevel) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, methodName);

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

        // Only include method name in console logs if in development mode
        const consoleMessage = this.isDevelopmentMode ? formattedMessage : this.formatMessage(level, message);

        // Also log to console
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(consoleMessage, ...args);
                break;
            case LogLevel.INFO:
                console.info(consoleMessage, ...args);
                break;
            case LogLevel.WARN:
                console.warn(consoleMessage, ...args);
                break;
            case LogLevel.ERROR:
                console.error(consoleMessage, ...args);
                break;
        }
    }

    /**
     * Format a log message with timestamp, level and method name (if provided and in development mode)
     */
    private static formatMessage(level: LogLevel, message: string, methodName?: string): string {
        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level].padEnd(5);

        // Include method name only in development mode and if provided
        if (this.isDevelopmentMode && methodName) {
            return `[${timestamp}] [${levelStr}] [${methodName}] ${message}`;
        }

        return `[${timestamp}] [${levelStr}] ${message}`;
    }

    /**
     * Dispose the logger resources
     */
    public static dispose() {
        this.outputChannel?.dispose();
    }
}
