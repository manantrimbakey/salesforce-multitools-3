// Import SF Core config first to configure environment variables
import './sfcoreConfig';

import * as sfcore from '@salesforce/core';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

export class SFUtils {
    private static authInfos: sfcore.OrgAuthorization[];
    private static myLocalConfig: sfcore.ConfigFile;
    private static configWatcher: fs.FSWatcher | undefined;
    private static connection: any;
    private static currentOrgUrl: string = '';
    private static currentUsername: string = '';
    private static isInitialized: boolean = false;

    /**
     * Initialize Salesforce core components
     * @param forceRefresh Force re-initialization even if already initialized
     */
    public static async initialize(forceRefresh: boolean = false) {
        if (this.isInitialized && !forceRefresh) {
            return;
        }

        // Reset cached data if forcing refresh
        if (forceRefresh) {
            Logger.debug('Force refreshing SFUtils static members');
            this.myLocalConfig = undefined as unknown as sfcore.ConfigFile;
            this.authInfos = undefined as unknown as sfcore.OrgAuthorization[];
            this.connection = undefined;
        }

        // Initialize logger to prevent transport target error
        try {
            // Initialize the logger with memory logging
            const logger = new sfcore.Logger({
                level: 50, // 50 = ERROR level
                useMemoryLogger: true,
                name: 'salesforce-multitools',
                fields: {},
            } as sfcore.LoggerOptions);

            this.isInitialized = true;
            Logger.debug('SFUtils initialized successfully');
        } catch (error) {
            Logger.error('Error initializing Salesforce utilities:', error);
        }
    }

    public static async getDefaultUsername() {
        await this.initialize();

        if (vscode.workspace && vscode.workspace.workspaceFolders) {
            await this.initLocalConfig();

            const localValue = this.myLocalConfig.get('defaultusername');
            Logger.debug('Default username from config:', localValue);

            const authInfos = await this.listAllAuthorizations();

            const authInfo = authInfos.find((authInfo) => authInfo?.aliases?.includes(localValue as string));

            if (!authInfo) {
                Logger.warn(`No authentication info found for username: ${localValue}`);
            }

            return authInfo?.username ?? '';
        }
    }

    public static async getConnection(): Promise<any> {
        await this.initialize();

        if (!this.connection) {
            const defaultusername = await this.getDefaultUsername();
            Logger.debug('Getting connection for username:', defaultusername);

            this.connection = await sfcore.Connection.create({
                authInfo: await sfcore.AuthInfo.create({ username: defaultusername }),
            });
            Logger.info('Salesforce connection created successfully');
        }
        return this.connection;
    }

    private static async initLocalConfig() {
        if (!this.myLocalConfig && vscode.workspace && vscode.workspace.workspaceFolders) {
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const configPath = path.join(rootPath, '.sfdx', 'sfdx-config.json');

            Logger.debug(`Initializing config file from: ${configPath}`);

            try {
                this.myLocalConfig = await sfcore.ConfigFile.create({
                    isGlobal: false,
                    rootFolder: path.join(rootPath, '.sfdx'),
                    filename: 'sfdx-config.json',
                });

                // Setup file watcher for config changes
                this.setupConfigWatcher(configPath);
            } catch (error) {
                Logger.error('Failed to initialize config file:', error);
                throw error;
            }
        }
        return this.myLocalConfig;
    }

    private static setupConfigWatcher(configPath: string) {
        // Dispose any existing watcher
        if (this.configWatcher) {
            this.configWatcher.close();
        }

        try {
            this.configWatcher = fs.watch(configPath, (eventType) => {
                if (eventType === 'change') {
                    Logger.info('Config file changed, resetting cache');
                    // Reset the cached config so it will be reloaded on next request
                    this.myLocalConfig = undefined as unknown as sfcore.ConfigFile;
                    // Also reset the connection since it depends on config
                    this.connection = undefined;

                    // Notify the extension that connection needs to be refreshed
                    vscode.commands.executeCommand('salesforce-multitools-3.refreshConnection');
                }
            });
            Logger.debug(`File watcher set up for: ${configPath}`);
        } catch (error) {
            // If the file doesn't exist yet or other errors
            Logger.error('Error setting up config file watcher:', error);
            throw error;
        }
    }

    private static async listAllAuthorizations() {
        if (!this.authInfos) {
            Logger.debug('Loading all Salesforce authorizations');
            this.authInfos = await sfcore.AuthInfo.listAllAuthorizations();
        }
        return this.authInfos;
    }

    // Clean up watchers when extension is deactivated
    public static dispose() {
        Logger.debug('Disposing SFUtils resources');
        if (this.configWatcher) {
            this.configWatcher.close();
            this.configWatcher = undefined;
        }
    }
}
