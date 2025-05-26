import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import * as vscode from 'vscode';
import cors from 'cors';
import { Logger } from './logger';
import { SFUtils } from './sfutils';
/**
 * ExpressServer class for handling HTTP requests within the extension
 * Implemented as a singleton to ensure only one server instance
 */
export class ExpressServer {
    private static instance: ExpressServer;
    private app: express.Application;
    private server: Server | null = null;
    private port: number = 0; // Will be assigned dynamically
    private baseUrl: string = '';

    /**
     * Private constructor to enforce singleton pattern
     */
    private constructor() {
        // Create Express app
        this.app = express();

        // Setup middleware and routes
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Get the singleton instance of ExpressServer
     */
    public static getInstance(): ExpressServer {
        if (!ExpressServer.instance) {
            ExpressServer.instance = new ExpressServer();
        }
        return ExpressServer.instance;
    }

    /**
     * Start the Express server
     * @returns A promise that resolves with the server URL
     */
    public async start(): Promise<string> {
        if (this.server) {
            return this.baseUrl; // Already running
        }

        try {
            // Create a new server and start listening
            this.server = this.app.listen(0, '127.0.0.1', () => {
                const address = this.server?.address() as AddressInfo;
                this.port = address.port;
                this.baseUrl = `http://127.0.0.1:${this.port}`;
                Logger.info(`Express server started`, 'ExpressServer.start'); // Don't log the URL/port
            });

            // Wait for the server to start
            await new Promise<void>((resolve) => {
                this.server?.once('listening', () => resolve());
            });

            return this.baseUrl;
        } catch (error) {
            Logger.error('Failed to start Express server', 'ExpressServer.start', error);
            throw error;
        }
    }

    /**
     * Stop the Express server
     */
    public async stop(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.server) {
                resolve(); // Not running
                return;
            }

            this.server.close((err) => {
                if (err) {
                    Logger.error('Error stopping Express server:', 'ExpressServer.stop', err);
                    reject(err);
                    return;
                }

                this.server = null;
                this.port = 0;
                this.baseUrl = '';
                Logger.info('Express server stopped', 'ExpressServer.stop');
                resolve();
            });
        });
    }

    /**
     * Get the base URL of the server
     */
    public getBaseUrl(): string {
        return this.baseUrl;
    }

    /**
     * Get the port the server is running on
     */
    public getPort(): number {
        return this.port;
    }

    /**
     * Check if the server is running
     */
    public isRunning(): boolean {
        return this.server !== null;
    }

    /**
     * Setup middleware for the Express app
     */
    private setupMiddleware(): void {
        // Enable CORS for all routes
        this.app.use(cors());

        // Parse JSON request bodies
        this.app.use(express.json());

        // Secure routes - require specific headers/user agent
        this.app.use((req, res, next) => {
            const userAgent = req.headers['user-agent'] ?? '';
            const extensionToken = req.headers['x-vscode-extension-token'];

            // Only allow requests from Electron/VS Code or with our extension token
            const isElectron = userAgent.includes('Electron');
            const hasValidToken = extensionToken === this.getExtensionToken();

            // if (isElectron || hasValidToken) {
            if (isElectron && hasValidToken) {
                next();
            } else {
                // Deny access with a generic message
                res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }
        });

        // Add logging middleware
        this.app.use((req, res, next) => {
            Logger.debug(`Express request: ${req.method} ${req.url}`, 'ExpressServer.setupMiddleware');
            next();
        });
    }

    /**
     * Generate a simple token for extension requests
     * This is a basic implementation - can be improved with proper JWT or other token mechanism
     */
    private getExtensionToken(): string {
        // Simple implementation - can be replaced with more secure token generation
        // In a real implementation, this would be a proper secure token mechanism
        return 'vscode-salesforce-multitools-' + process.pid;
    }

    /**
     * Setup basic routes for the Express app
     */
    private setupRoutes(): void {
        // Test endpoint
        this.app.get('/api/ping', (req, res) => {
            res.json({ message: 'pong', timestamp: new Date().toISOString() });
        });

        // Add a diagnostics route
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                uptime: process.uptime(),
                port: this.port,
                timestamp: new Date().toISOString(),
            });
        });

        // Debug logs routes
        this.setupDebugLogRoutes();

        // File Switcher routes
        this.setupFileSwitcherRoutes();
    }

    /**
     * Setup routes for Debug Logs feature
     */
    private setupDebugLogRoutes(): void {
        // Get all debug logs
        this.app.get('/api/debugLogs', async (req, res) => {
            try {
                // Since SFUtils doesn't have fetchDebugLogs, we'll use VS Code command
                // and define a simple handler for this API endpoint
                Logger.debug('API request received for /api/debugLogs', 'ExpressServer.setupDebugLogRoutes');

                const sfconnection = await SFUtils.getConnection();

                // Get the user filter if provided
                const userFilter = req.query.user as string;
                const sizeParam = req.query.size as string;
                const sizeDirection = req.query.sizeDirection as string; // 'above' or 'below'
                const size = sizeParam ? parseInt(sizeParam, 10) : undefined;

                // Construct the query with optional user filter
                let query =
                    'SELECT Id, LogUser.Name, LogLength, Operation, Application, Status, StartTime, RequestIdentifier FROM ApexLog';

                // Add WHERE clause if user filter is provided and not 'all'
                if (userFilter && userFilter !== 'all' && userFilter !== 'All Users') {
                    query += ` WHERE LogUser.Name = '${userFilter}'`;
                }

                // Add ORDER BY and LIMIT
                query += ' ORDER BY StartTime DESC LIMIT 200';

                const logs = await sfconnection.query(query);

                Logger.debug(`Retrieved ${logs.totalSize} debug logs`, 'ExpressServer.setupDebugLogRoutes');

                let logRecords: any;

                if (logs.totalSize > 0) {
                    logRecords = logs;
                } else {
                    logRecords = {};
                }

                // Filter by log size if requested
                if (logRecords.records && size && (sizeDirection === 'above' || sizeDirection === 'below')) {
                    logRecords.records = logRecords.records.filter((log: any) =>
                        sizeDirection === 'above' ? log.LogLength > size : log.LogLength < size,
                    );
                    logRecords.totalSize = logRecords.records.length;
                }

                // Return an empty array for now - actual implementation would come from your DebugLogProvider
                res.json({
                    success: true,
                    logs: logRecords,
                });
            } catch (error: unknown) {
                Logger.error('Error fetching debug logs via API:', 'ExpressServer.setupDebugLogRoutes', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Get Salesforce users for autocomplete
        this.app.get('/api/users', async (req, res) => {
            try {
                const searchTerm = req.query.search as string;
                Logger.debug(
                    `API request received for Salesforce users with search: ${searchTerm || 'none'}`,
                    'ExpressServer.setupDebugLogRoutes',
                );

                const sfconnection = await SFUtils.getConnection();

                // Construct the query with search filter
                let query = 'SELECT Id, Name, Username FROM User WHERE IsActive = true';

                // Add search term if provided - use LIKE for case-insensitive partial match
                if (searchTerm && searchTerm.length > 0) {
                    // Escape any single quotes in the search term
                    const escapedSearchTerm = searchTerm.replace(/'/g, "\\'");
                    query += ` AND (Name LIKE '%${escapedSearchTerm}%' OR Username LIKE '%${escapedSearchTerm}%')`;
                }

                // Add sorting and limit - increase limit for better suggestions but not too many
                query += ' ORDER BY Name LIMIT 25';

                Logger.debug(`Executing user search query: ${query}`, 'ExpressServer.setupDebugLogRoutes');
                const users = await sfconnection.query(query);

                Logger.debug(
                    `Retrieved ${users.totalSize} Salesforce users matching search "${searchTerm || 'none'}"`,
                    'ExpressServer.setupDebugLogRoutes',
                );

                // Get the current user's info
                const currentUserInfo = await sfconnection.identity();

                res.json({
                    success: true,
                    users: users.records,
                    currentUser: currentUserInfo,
                });
            } catch (error: unknown) {
                Logger.error('Error fetching Salesforce users via API:', 'ExpressServer.setupDebugLogRoutes', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Get a specific debug log
        this.app.get('/api/debugLogs/:id/download', async (req, res) => {
            try {
                const logId = req.params.id;
                Logger.debug(`API request received for full debug log: ${logId}`, 'ExpressServer.setupDebugLogRoutes');

                try {
                    // Get the connection to Salesforce
                    const connection = await SFUtils.getConnection();

                    // Get the instance URL and access token from the connection
                    const instanceUrl = connection.instanceUrl;
                    const accessToken = connection.accessToken;

                    // Make sure we have a valid access token
                    if (!accessToken) {
                        throw new Error('No valid access token available');
                    }

                    // Check if the log file already exists in the _multi-tool folder
                    const storedLogPath = await this.getStoredLogPath(logId);
                    let logFilePath: string;

                    if (await this.fileExists(storedLogPath)) {
                        // If log exists, use it directly
                        Logger.debug(`Using existing log file: ${storedLogPath}`, 'ExpressServer.setupDebugLogRoutes');
                        logFilePath = storedLogPath;
                    } else {
                        // If log doesn't exist, download and save it
                        Logger.debug(`Downloading log ${logId} from Salesforce`, 'ExpressServer.setupDebugLogRoutes');
                        const logContent = await this.getLogBody(logId, instanceUrl, accessToken, false);
                        logFilePath = await this.saveLogFile(logId, logContent);
                    }

                    // Open the file in VS Code
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(logFilePath));

                    res.json({
                        success: true,
                        message: 'Log opened in VS Code editor',
                        path: logFilePath,
                    });
                } catch (sfError) {
                    Logger.error(`Error fetching log content from Salesforce:`, 'ExpressServer.getLogBody', sfError);

                    res.status(500).json({
                        success: false,
                        error: sfError instanceof Error ? sfError.message : String(sfError),
                    });
                }
            } catch (error: unknown) {
                Logger.error(`Error fetching debug log via API:`, 'ExpressServer.getLogBody', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Get method name from log
        this.app.get('/api/debugLogs/:id/methodName', async (req, res) => {
            try {
                const logId = req.params.id;
                Logger.debug(
                    `API request received for debug log method name: ${logId}`,
                    'ExpressServer.setupDebugLogRoutes',
                );

                try {
                    // Check if we already have the log file stored
                    const storedLogPath = await this.getStoredLogPath(logId);
                    let logBody: string;

                    if (await this.fileExists(storedLogPath)) {
                        // Read the first 1KB from the stored log file
                        const fs = require('fs').promises;
                        const fileContent = await fs.readFile(storedLogPath, { encoding: 'utf8', flag: 'r' });
                        logBody = fileContent.substring(0, 1024);
                        Logger.debug(
                            `Using stored log file for method name: ${storedLogPath}`,
                            'ExpressServer.setupDebugLogRoutes',
                        );
                    } else {
                        // Get the connection to Salesforce
                        const connection = await SFUtils.getConnection();
                        const instanceUrl = connection.instanceUrl;
                        const accessToken = connection.accessToken;

                        // Make sure we have a valid access token
                        if (!accessToken) {
                            throw new Error('No valid access token available');
                        }

                        // Use the getLogBody method to get log content - limit to 1KB
                        logBody = await this.getLogBody(logId, instanceUrl, accessToken, true);
                    }

                    // Find the first CODE_UNIT_STARTED line
                    const codeUnitLine = logBody
                        .split('\n')
                        .find((line) => line.includes('|CODE_UNIT_STARTED|[EXTERNAL]|'));
                    let methodName = 'NO_METHOD_NAME_FOUND';
                    if (codeUnitLine) {
                        const parts = codeUnitLine.split('|');
                        let rawName = parts[parts.length - 1].trim();
                        // Format Apex method names
                        if (rawName.startsWith('apex://')) {
                            // Example: apex://NotesManagerController/ACTION$getLatestInProgressTask
                            const match = rawName.match(/^apex:\/\/([^/]+)\/ACTION\$(.+)$/);
                            if (match) {
                                methodName = `${match[1]}.${match[2]}`;
                            } else {
                                methodName = rawName; // fallback
                            }
                        } else {
                            methodName = rawName;
                        }
                    }

                    res.json({
                        success: true,
                        methodName,
                        logId,
                    });
                } catch (sfError) {
                    Logger.error(`Error extracting method name from log:`, 'ExpressServer.getLogBody', sfError);
                    res.status(500).json({
                        success: false,
                        error: sfError instanceof Error ? sfError.message : String(sfError),
                        methodName: 'ERROR_EXTRACTING_METHOD_NAME',
                    });
                }
            } catch (error: unknown) {
                Logger.error(`Error in method name API:`, 'ExpressServer.getLogBody', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Delete a debug log
        this.app.delete('/api/debugLogs/:id', async (req, res) => {
            try {
                const logId = req.params.id;
                Logger.debug(`API request received to delete log: ${logId}`, 'ExpressServer.deleteDebugLog');

                // Return a success response without actually deleting anything
                res.json({
                    success: true,
                    message: `This is a placeholder. Debug log deletion is not implemented in the server API yet.`,
                });
            } catch (error: unknown) {
                Logger.error(`Error deleting debug log via API:`, 'ExpressServer.deleteDebugLog', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Bulk delete debug logs for a user or all users
        this.app.post('/api/debugLogs/delete', async (req, res) => {
            try {
                const userName = req.body.userName;
                const sfconnection = await SFUtils.getConnection();
                let query = 'SELECT Id FROM ApexLog';

                Logger.debug(`Deleting debug logs for user: ${userName}`, 'ExpressServer.bulkDeleteDebugLogs');

                if (userName && userName !== 'all') {
                    query += ` WHERE LogUser.Name = '${userName.replace(/'/g, "\\'")}'`;
                }

                Logger.debug(`Executing query: ${query}`, 'ExpressServer.bulkDeleteDebugLogs');

                const logs = await sfconnection.query(query);

                Logger.debug(`Retrieved ${JSON.stringify(logs)} debug logs`, 'ExpressServer.bulkDeleteDebugLogs');

                const logIds = logs.records.map((log: any) => log.Id);
                let deleted = 0,
                    failed = 0;
                const batchSize = 10;
                for (let i = 0; i < logIds.length; i += batchSize) {
                    const batch = logIds.slice(i, i + batchSize);
                    Logger.debug(
                        `Deleting batch ${i / batchSize + 1}: ${batch.length} logs`,
                        'ExpressServer.bulkDeleteDebugLogs',
                    );
                    const results = await Promise.allSettled(
                        batch.map(async (logId) => {
                            try {
                                await sfconnection.request({
                                    url: `/services/data/v56.0/sobjects/ApexLog/${logId}`,
                                    method: 'DELETE',
                                });
                                Logger.debug(`Deleted log ${logId}`, 'ExpressServer.bulkDeleteDebugLogs');
                                return 'deleted';
                            } catch (err) {
                                Logger.error(
                                    `Failed to delete log ${logId}:`,
                                    'ExpressServer.bulkDeleteDebugLogs',
                                    err,
                                );
                                return 'failed';
                            }
                        }),
                    );
                    deleted += results.filter((r) => r.status === 'fulfilled' && r.value === 'deleted').length;
                    failed += results.filter((r) => r.status === 'fulfilled' && r.value === 'failed').length;
                    failed += results.filter((r) => r.status === 'rejected').length;
                }
                res.json({
                    success: true,
                    deleted,
                    failed,
                    total: logIds.length,
                });
            } catch (error) {
                Logger.error('Error bulk deleting debug logs:', 'ExpressServer.bulkDeleteDebugLogs', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Check if a log exists locally
        this.app.get('/api/debugLogs/:id/exists', async (req, res) => {
            try {
                const logId = req.params.id;
                Logger.debug(
                    `API request received to check if log exists locally: ${logId}`,
                    'ExpressServer.setupDebugLogRoutes',
                );

                try {
                    const storedLogPath = await this.getStoredLogPath(logId);
                    const exists = await this.fileExists(storedLogPath);

                    res.json({
                        success: true,
                        exists,
                        logId,
                    });
                } catch (error) {
                    Logger.error(`Error checking if log exists:`, 'ExpressServer.setupDebugLogRoutes', error);
                    res.status(500).json({
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            } catch (error) {
                Logger.error(`Error in exists API:`, 'ExpressServer.setupDebugLogRoutes', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
    }

    /**
     * Save log content to a temporary file
     * @param logId The ID of the log
     * @param content The log content to save
     * @returns Path to the temporary file
     */
    private async saveTempLogFile(logId: string, content: string): Promise<string> {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        // Create a temporary file
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `salesforce_log_${logId}.log`);

        // Write the content to the file
        await fs.promises.writeFile(tempFilePath, content, 'utf8');

        Logger.debug(`Saved log content to temporary file: ${tempFilePath}`, 'ExpressServer.saveTempLogFile');
        return tempFilePath;
    }

    /**
     * Get the path where a log file should be stored in _multi-tool folder
     * @param logId The ID of the log
     * @returns Path to the stored log file
     */
    private async getStoredLogPath(logId: string): Promise<string> {
        const path = require('path');
        const fs = require('fs');

        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('No workspace folder found to store logs');
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const sfdxFolder = path.join(rootPath, '.sfdx');
        const multiToolFolder = path.join(sfdxFolder, '_multi-tool');
        const logsFolder = path.join(multiToolFolder, 'debug-logs');

        // Create folders if they don't exist
        await this.ensureFolderExists(sfdxFolder);
        await this.ensureFolderExists(multiToolFolder);
        await this.ensureFolderExists(logsFolder);

        // Get organization identifier for organization-specific storage
        const connection = await SFUtils.getConnection();
        const orgId = connection?.instanceUrl
            ? connection.instanceUrl
                  .replace(/^https?:\/\//, '')
                  .replace(/[^a-zA-Z0-9.-]/g, '-')
                  .toLowerCase()
            : 'unknown-org';

        const orgFolder = path.join(logsFolder, orgId);
        await this.ensureFolderExists(orgFolder);

        return path.join(orgFolder, `${logId}.log`);
    }

    /**
     * Check if a file exists
     * @param filePath Path to the file
     * @returns True if the file exists, false otherwise
     */
    private async fileExists(filePath: string): Promise<boolean> {
        const fs = require('fs').promises;
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Save log content to a file in the _multi-tool folder
     * @param logId The ID of the log
     * @param content The log content to save
     * @returns Path to the saved file
     */
    private async saveLogFile(logId: string, content: string): Promise<string> {
        const fs = require('fs').promises;

        // Get the path where the log should be stored
        const logFilePath = await this.getStoredLogPath(logId);

        // Write the content to the file
        await fs.writeFile(logFilePath, content, 'utf8');

        Logger.debug(`Saved log content to file: ${logFilePath}`, 'ExpressServer.saveLogFile');
        return logFilePath;
    }

    /**
     * Ensure a folder exists, creating it if necessary
     * @param folderPath Path to the folder
     */
    private async ensureFolderExists(folderPath: string): Promise<void> {
        const fs = require('fs').promises;
        try {
            await fs.mkdir(folderPath, { recursive: true });
        } catch (error) {
            // If folder already exists, that's fine
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Retrieves the body of an Apex log from the Salesforce REST API.
     *
     * This method constructs a URL to access the log body for a given log ID,
     * makes an HTTPS GET request to the Salesforce API, and returns the log body
     * as a string. The method handles the response by accumulating data chunks
     * and resolving the promise with the complete log body once the response ends.
     * If limitToOneKb is true, it will stop receiving data after 1KB to limit
     * network usage for method name extraction.
     *
     * @param {string} logId - The ID of the log whose body is to be retrieved.
     * @param {string} instanceUrl - The Salesforce instance URL
     * @param {string} authToken - The access token for authentication
     * @param {boolean} limitToOneKb - Whether to limit download to 1KB
     * @returns {Promise<string>} A promise that resolves to the log body as a string.
     * @throws {Error} If there is an error during the HTTPS request.
     */
    private getLogBody(
        logId: string,
        instanceUrl: string,
        authToken: string,
        limitToOneKb: boolean = false,
    ): Promise<string> {
        const https = require('https');
        const { IncomingMessage } = require('http');
        const restApiUrl = `${instanceUrl}/services/data/v59.0/sobjects/ApexLog/${logId}/Body`;

        Logger.debug(
            `Fetching ${limitToOneKb ? '1KB of' : 'full'} log body for ID: ${logId}`,
            'ExpressServer.getLogBody',
        );

        return new Promise((resolve, reject) => {
            let buff = Buffer.alloc(0);
            const startTime = Date.now();

            https
                .get(
                    restApiUrl,
                    {
                        headers: {
                            Authorization: `Bearer ${authToken}`,
                        },
                    },
                    (response: typeof IncomingMessage) => {
                        // Log response code
                        Logger.debug(
                            `Log API response status: ${response.statusCode} ${response.statusMessage}`,
                            'ExpressServer.getLogBody',
                        );

                        if (response.statusCode !== 200) {
                            return reject(new Error(`API returned status code ${response.statusCode}`));
                        }

                        response.on('data', (chunk: Uint8Array) => {
                            buff = Buffer.concat([buff, chunk]);
                            if (limitToOneKb && buff.length > 1024) {
                                // If we're limiting to 1KB and we've got enough data, stop receiving
                                response.destroy();
                                return resolve(buff.toString().substring(0, 1024));
                            }
                        });

                        response.on('end', () => {
                            const endTime = Date.now();
                            const duration = endTime - startTime;
                            const size = buff.length;

                            Logger.debug(
                                `Log download complete: ${logId}, Size: ${size} bytes, Duration: ${duration}ms`,
                                'ExpressServer.getLogBody',
                            );

                            resolve(buff.toString());
                        });

                        response.on('error', (error: Error) => {
                            Logger.error(
                                `Error in response stream: ${error.message}`,
                                'ExpressServer.getLogBody',
                                error,
                            );
                            reject(error);
                        });
                    },
                )
                .on('error', (error: Error) => {
                    Logger.error(`HTTPS request error: ${error.message}`, 'ExpressServer.getLogBody', error);
                    reject(error);
                });
        });
    }

    /**
     * Setup routes for File Switcher feature
     */
    private setupFileSwitcherRoutes(): void {
        // List directory contents
        this.app.get('/api/files', (req, res) => {
            try {
                const dirPath = req.query.path as string;
                if (!dirPath) {
                    res.status(400).json({ success: false, error: 'Missing path parameter' });
                    return;
                }

                const fs = require('fs');
                const path = require('path');

                // Check if directory exists
                if (!fs.existsSync(dirPath)) {
                    res.status(404).json({
                        success: false,
                        error: 'Directory not found',
                    });
                    return;
                }

                // Read directory contents
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });

                // Filter out hidden files and format the response
                const files = entries
                    .filter((entry: any) => !entry.name.startsWith('.'))
                    .map((entry: any) => {
                        const entryPath = path.join(dirPath, entry.name);
                        return {
                            name: entry.name,
                            path: entryPath,
                            isDirectory: entry.isDirectory(),
                        };
                    })
                    .sort((a: any, b: any) => {
                        // Sort directories first, then files alphabetically
                        if (a.isDirectory && !b.isDirectory) {
                            return -1;
                        } else if (!a.isDirectory && b.isDirectory) {
                            return 1;
                        } else {
                            return a.name.localeCompare(b.name);
                        }
                    });

                res.json({ success: true, files });
            } catch (error: unknown) {
                Logger.error(`Error listing directory via API:`, 'ExpressServer.setupFileSwitcherRoutes', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Open a file
        this.app.post('/api/files/open', (req, res) => {
            try {
                const filePath = req.body.path;
                if (!filePath) {
                    res.status(400).json({ success: false, error: 'Missing path parameter' });
                    return;
                }

                const fs = require('fs');

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    res.status(404).json({
                        success: false,
                        error: 'File not found',
                    });
                    return;
                }

                // We use VS Code command here because opening a file in the editor is VS Code specific
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
                res.json({ success: true });
            } catch (error: unknown) {
                Logger.error(`Error opening file via API:`, 'ExpressServer.setupFileSwitcherRoutes', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // Get component files
        this.app.get('/api/components', async (req, res) => {
            try {
                const { MetadataUtils } = require('./metadataUtils');
                const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;

                if (!currentFile) {
                    res.status(400).json({
                        success: false,
                        error: 'No active file',
                    });
                    return;
                }

                const components = await MetadataUtils.findComponentFiles(currentFile);
                res.json({ success: true, components });
            } catch (error: unknown) {
                Logger.error('Error fetching component data via API:', 'ExpressServer.setupFileSwitcherRoutes', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
    }

    /**
     * Register a new route handler
     * @param method HTTP method
     * @param path Route path
     * @param handler Request handler function
     */
    public registerRoute(
        method: 'get' | 'post' | 'put' | 'delete' | 'patch',
        path: string,
        handler: express.RequestHandler,
    ): void {
        if (!this.app) {
            return;
        }

        this.app[method](path, handler);
        Logger.debug(`Registered ${method.toUpperCase()} route: ${path}`, 'ExpressServer.registerRoute');
    }
}

/**
 * Dispose the server when extension is deactivated
 */
export async function disposeExpressServer(): Promise<void> {
    try {
        const server = ExpressServer.getInstance();
        if (server.isRunning()) {
            await server.stop();
        }
    } catch (err) {
        Logger.error('Error disposing Express server:', 'ExpressServer.disposeExpressServer', err);
    }
}
