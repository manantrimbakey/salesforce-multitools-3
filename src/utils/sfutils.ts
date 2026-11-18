import type * as SfCore from '@salesforce/core';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Logger } from './logger';

type SfCoreModule = typeof SfCore;

export interface AuthorizedOrg {
    username: string;
    alias?: string;
    isDefault: boolean;
    isSandbox: boolean;
    isScratchOrg: boolean;
}

/**
 * Environment the bundled @salesforce/core logger needs.
 *
 * When @salesforce/core is bundled with esbuild, its Pino logger cannot resolve its transform stream
 * from disk ("unable to determine transport target for '..\..\lib\logger\transformStream'"), so file
 * logging must be disabled before the root logger is created. process.env is shared with every other
 * extension in the extension host, so the values are applied only while the library initializes and
 * the previous values are restored right after.
 */
const SF_CORE_ENV: Record<string, string> = {
    SFDX_DISABLE_LOG_FILE: 'true',
    SF_DISABLE_LOG_FILE: 'true',
    SF_LOG_LEVEL: 'error',
    SF_LOG_DIR: '.',
    SF_LOG_FILE: 'false',
};

const CONFIG_CHANGE_DEBOUNCE_MS = 300;

/**
 * Salesforce org/connection helper. `@salesforce/core` is loaded lazily so the extension does not
 * pay for it until a feature actually needs an org connection.
 */
export class SFUtils {
    private static corePromise: Promise<SfCoreModule> | undefined;
    private static connectionPromise: Promise<SfCore.Connection> | undefined;
    /** Connections to specific (non-default) orgs, keyed by username */
    private static readonly orgConnections = new Map<string, Promise<SfCore.Connection>>();
    private static watchers: vscode.Disposable[] = [];
    private static debounceTimer: NodeJS.Timeout | undefined;
    private static readonly orgChanged = new vscode.EventEmitter<void>();

    /** Fires when the default org (or its config) changed and cached connections were dropped. */
    public static readonly onDidChangeOrg = this.orgChanged.event;

    /**
     * Load @salesforce/core once, with the logger environment applied only during initialization.
     */
    private static loadCore(): Promise<SfCoreModule> {
        this.corePromise ??= (async () => {
            const previous = new Map(Object.keys(SF_CORE_ENV).map((key) => [key, process.env[key]]));
            Object.assign(process.env, SF_CORE_ENV);
            try {
                // Plain require (not import()): esbuild redirects it to the lazily loaded dist/sfcore.js bundle,
                // and a native import() of that CJS file would not expose the named exports.
                const core = require('@salesforce/core') as SfCoreModule;
                await core.Logger.root();
                return core;
            } finally {
                for (const [key, value] of previous) {
                    if (value === undefined) {
                        delete process.env[key];
                    } else {
                        process.env[key] = value;
                    }
                }
            }
        })().catch((error) => {
            this.corePromise = undefined;
            throw error;
        });
        return this.corePromise;
    }

    /**
     * Drop cached connection state so the next request resolves the org again.
     */
    public static refresh(): void {
        Logger.debug('Refreshing SFUtils cached connection state', 'SFUtils.refresh');
        this.connectionPromise = undefined;
        this.orgConnections.clear();
        this.orgChanged.fire();
    }

    /**
     * Watch the project/CLI config files that select the default org and refresh when they change.
     */
    public static startWatching(context: vscode.ExtensionContext): void {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            return;
        }

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folder, '{.sf/config.json,.sfdx/sfdx-config.json}'),
        );
        const onChange = () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                Logger.info('Org config changed, resetting connection', 'SFUtils.startWatching');
                this.refresh();
            }, CONFIG_CHANGE_DEBOUNCE_MS);
        };
        this.watchers.push(
            watcher,
            watcher.onDidChange(onChange),
            watcher.onDidCreate(onChange),
            watcher.onDidDelete(onChange),
        );
        context.subscriptions.push({ dispose: () => SFUtils.dispose() });
    }

    /**
     * Read the configured default org (alias or username) from project config, then global config.
     * Supports both the `sf` (`target-org`) and legacy `sfdx` (`defaultusername`) formats.
     */
    private static async readConfiguredOrg(): Promise<string | undefined> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const candidates: Array<{ file: string; keys: string[] }> = [];
        if (workspaceRoot) {
            candidates.push(
                { file: path.join(workspaceRoot, '.sf', 'config.json'), keys: ['target-org'] },
                {
                    file: path.join(workspaceRoot, '.sfdx', 'sfdx-config.json'),
                    keys: ['target-org', 'defaultusername'],
                },
            );
        }
        candidates.push(
            { file: path.join(os.homedir(), '.sf', 'config.json'), keys: ['target-org'] },
            { file: path.join(os.homedir(), '.sfdx', 'sfdx-config.json'), keys: ['defaultusername'] },
        );

        for (const { file, keys } of candidates) {
            try {
                const config = JSON.parse(await fs.promises.readFile(file, 'utf-8')) as Record<string, unknown>;
                for (const key of keys) {
                    const value = config[key];
                    if (typeof value === 'string' && value.length > 0) {
                        return value;
                    }
                }
            } catch {
                // Missing or unreadable config file: try the next candidate
            }
        }
        return undefined;
    }

    /**
     * Resolve the default org to a username (aliases are resolved, usernames pass through).
     */
    public static async getDefaultUsername(): Promise<string> {
        const configured = await this.readConfiguredOrg();
        if (!configured) {
            Logger.warn('No default org configured for this project', 'SFUtils.getDefaultUsername');
            return '';
        }

        const core = await this.loadCore();
        const stateAggregator = await core.StateAggregator.getInstance();
        const username = stateAggregator.aliases.resolveUsername(configured);
        Logger.debug(`Default org "${configured}" resolved to "${username}"`, 'SFUtils.getDefaultUsername');
        return username;
    }

    /**
     * Get the shared connection for the default org. Concurrent callers share one in-flight request.
     */
    public static getConnection(): Promise<SfCore.Connection> {
        if (!this.connectionPromise) {
            const pending = this.createConnection();
            this.connectionPromise = pending;
            pending.catch(() => {
                // Do not cache failures; the next caller retries
                if (this.connectionPromise === pending) {
                    this.connectionPromise = undefined;
                }
            });
        }
        return this.connectionPromise;
    }

    private static async createConnection(): Promise<SfCore.Connection> {
        const username = await this.getDefaultUsername();
        if (!username) {
            throw new Error('No default Salesforce org found. Authorize an org and set it as the default.');
        }
        return this.connect(username);
    }

    private static async connect(username: string): Promise<SfCore.Connection> {
        const core = await this.loadCore();
        Logger.debug('Creating connection for username:', 'SFUtils.getConnection', username);
        const connection = await core.Connection.create({
            authInfo: await core.AuthInfo.create({ username }),
        });
        Logger.info('Salesforce connection created successfully', 'SFUtils.getConnection');
        return connection;
    }

    /**
     * Get a connection to a specific authorized org (not necessarily the default one).
     * @throws Error when `username` is not one of the orgs authorized on this machine
     */
    public static getConnectionForUsername(username: string): Promise<SfCore.Connection> {
        let pending = this.orgConnections.get(username);
        if (!pending) {
            const created = (async () => {
                const known = await this.listAuthorizedOrgs();
                if (!known.some((org) => org.username === username)) {
                    throw new Error(`Org is not authorized on this machine: ${username}`);
                }
                return this.connect(username);
            })();
            pending = created;
            this.orgConnections.set(username, created);
            created.catch(() => {
                if (this.orgConnections.get(username) === created) {
                    this.orgConnections.delete(username);
                }
            });
        }
        return pending;
    }

    /**
     * Orgs authorized with the Salesforce CLI on this machine (expired ones are left out).
     * Flags the project's default org.
     */
    public static async listAuthorizedOrgs(): Promise<AuthorizedOrg[]> {
        const core = await this.loadCore();
        const [authorizations, defaultUsername] = await Promise.all([
            core.AuthInfo.listAllAuthorizations(),
            this.getDefaultUsername().catch(() => ''),
        ]);
        return authorizations
            .filter((auth) => auth.isExpired !== true && !auth.error)
            .map((auth) => ({
                username: auth.username,
                alias: auth.aliases?.[0] ?? undefined,
                isDefault: auth.username === defaultUsername,
                isSandbox: auth.isSandbox === true,
                isScratchOrg: auth.isScratchOrg === true,
            }))
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.username.localeCompare(b.username));
    }

    /**
     * Clean up watchers and timers when the extension is deactivated
     */
    public static dispose(): void {
        Logger.debug('Disposing SFUtils resources', 'SFUtils.dispose');
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
        this.watchers.forEach((watcher) => watcher.dispose());
        this.watchers = [];
    }
}
