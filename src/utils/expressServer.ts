import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import * as vscode from 'vscode';
import cors from 'cors';
import { Logger } from './logger';

/**
 * ExpressServer class for handling HTTP requests within the extension
 * Implemented as a singleton to ensure only one server instance
 */
export class ExpressServer {
    private static instance: ExpressServer;
    private app: express.Application;
    private server: Server | null = null;
    private port: number = 0;  // Will be assigned dynamically
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
                Logger.info(`Express server started`); // Don't log the URL/port
            });
            
            // Wait for the server to start
            await new Promise<void>((resolve) => {
                this.server?.once('listening', () => resolve());
            });
            
            return this.baseUrl;
        } catch (error) {
            Logger.error('Failed to start Express server');
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
                    Logger.error('Error stopping Express server:', err);
                    reject(err);
                    return;
                }
                
                this.server = null;
                this.port = 0;
                this.baseUrl = '';
                Logger.info('Express server stopped');
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
            const userAgent = req.headers['user-agent'] || '';
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
                    error: 'Access denied'
                });
            }
        });
        
        // Add logging middleware
        this.app.use((req, res, next) => {
            Logger.debug(`Express request: ${req.method} ${req.url}`);
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
                timestamp: new Date().toISOString()
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
                Logger.debug('API request received for /api/debugLogs');
                
                // Return an empty array for now - actual implementation would come from your DebugLogProvider
                res.json({ 
                    success: true, 
                    logs: [],
                    message: 'This is a placeholder. Debug logs fetching is not implemented in the server API yet.'
                });
            } catch (error: unknown) {
                Logger.error('Error fetching debug logs via API:', error);
                res.status(500).json({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
        });

        // Get a specific debug log
        this.app.get('/api/debugLogs/:id', async (req, res) => {
            try {
                const logId = req.params.id;
                Logger.debug(`API request received for debug log: ${logId}`);
                
                // Return a placeholder response
                res.json({ 
                    success: true, 
                    logContent: `This is a placeholder for log ID: ${logId}. Debug log content fetching is not implemented in the server API yet.`
                });
            } catch (error: unknown) {
                Logger.error(`Error fetching debug log via API:`, error);
                res.status(500).json({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
        });

        // Delete a debug log
        this.app.delete('/api/debugLogs/:id', async (req, res) => {
            try {
                const logId = req.params.id;
                Logger.debug(`API request received to delete log: ${logId}`);
                
                // Return a success response without actually deleting anything
                res.json({ 
                    success: true,
                    message: `This is a placeholder. Debug log deletion is not implemented in the server API yet.`
                });
            } catch (error: unknown) {
                Logger.error(`Error deleting debug log via API:`, error);
                res.status(500).json({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
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
                        error: 'Directory not found' 
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
                            isDirectory: entry.isDirectory()
                        };
                    })
                    .sort((a: any, b: any) => {
                        // Sort directories first, then files alphabetically
                        if (a.isDirectory && !b.isDirectory) return -1;
                        if (!a.isDirectory && b.isDirectory) return 1;
                        return a.name.localeCompare(b.name);
                    });
                
                res.json({ success: true, files });
            } catch (error: unknown) {
                Logger.error(`Error listing directory via API:`, error);
                res.status(500).json({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
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
                        error: 'File not found' 
                    });
                    return;
                }
                
                // We use VS Code command here because opening a file in the editor is VS Code specific
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
                res.json({ success: true });
            } catch (error: unknown) {
                Logger.error(`Error opening file via API:`, error);
                res.status(500).json({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
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
                        error: 'No active file'
                    });
                    return;
                }
                
                const components = await MetadataUtils.findComponentFiles(currentFile);
                res.json({ success: true, components });
            } catch (error: unknown) {
                Logger.error('Error fetching component data via API:', error);
                res.status(500).json({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
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
        handler: express.RequestHandler
    ): void {
        if (!this.app) return;
        
        this.app[method](path, handler);
        Logger.debug(`Registered ${method.toUpperCase()} route: ${path}`);
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
        Logger.error('Error disposing Express server:', err);
    }
} 