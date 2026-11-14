import type { Connection } from '@salesforce/core';
import { SFUtils } from '../utils/sfutils';
import { Logger } from '../utils/logger';
import { isSalesforceId, soqlEscape, soqlLikeEscape } from '../utils/validation';
import { extractMethodName } from './apexLogParser';
import { ConcurrencyLimiter, LruCache } from './asyncUtils';
import { openLogBody, readLogHead } from './logBodyClient';
import { LogStorage } from './logStorage';

export type ApexLogRecord = {
    Id: string;
    LogUser: { Name: string } | null;
    LogLength: number;
    Operation: string;
    Application: string;
    Status: string;
    StartTime: string;
    RequestIdentifier: string;
};

export type ApexLogList = {
    records: ApexLogRecord[];
    totalSize: number;
    done: boolean;
};

export type LogSizeFilter = { direction: 'above' | 'below'; bytes: number };

export type LogFilter = {
    /** Log user display name; undefined / 'all' means every user */
    userName?: string;
    size?: LogSizeFilter;
};

export type SalesforceUser = { Id: string; Name: string; Username: string };

export type SalesforceUserWithTraceFlag = SalesforceUser & {
    TraceFlagId: string | null;
    TraceFlagActive: boolean;
    TraceFlagExpirationDate: string | null;
    TraceFlagDebugLevel: string | null;
};

export type DebugLevelRecord = { Id: string; DeveloperName: string; MasterLabel: string };

export type CurrentUser = { display_name: string; username: string };

export type TraceFlagRecord = {
    Id: string;
    TracedEntityId: string;
    ExpirationDate: string;
    DebugLevel: { DeveloperName: string } | null;
};

export type BulkDeleteResult = { deleted: number; failed: number; total: number };

type SaveError = { message?: string; statusCode?: string };
type SaveResult = { success: boolean; id?: string; errors?: SaveError[] };

const LOG_LIST_LIMIT = 200;
const USER_SEARCH_LIMIT = 25;
const DELETE_CHUNK_SIZE = 200; // sObject collections API limit
const MAX_BULK_DELETE_RECORDS = 100_000;
const REMOTE_HEAD_BYTES = 10 * 1024;
const STORED_HEAD_BYTES = 50 * 1024;
const METHOD_NAME_CACHE_SIZE = 500;
const METHOD_NAME_CONCURRENCY = 5;
const TRACE_FLAG_DURATION_MS = 60 * 60 * 1000;
// Versioned so levels created by older releases (everything at FINEST) are not reused
const DEBUG_LEVEL_NAME = 'SF_Multitools_Debug_v2';
const DEBUG_LEVEL_LIST_LIMIT = 200;

const ALL_USERS_VALUES = new Set(['', 'all', 'All Users']);

/** Per-connection caches; a new connection (org switch) naturally gets fresh entries. */
const currentUsers = new WeakMap<Connection, Promise<CurrentUser>>();
const debugLevelIds = new WeakMap<Connection, Promise<string>>();

/** Stored-log paths currently being downloaded, so concurrent requests share one download. */
const inFlightDownloads = new Map<string, Promise<void>>();

const methodNameCache = new LruCache<string, Promise<string>>(METHOD_NAME_CACHE_SIZE);
const methodNameLimiter = new ConcurrencyLimiter(METHOD_NAME_CONCURRENCY);

function formatSaveErrors(errors: SaveError[] | undefined): string {
    if (!errors?.length) {
        return 'unknown error';
    }
    return errors.map((error) => error.message ?? error.statusCode ?? JSON.stringify(error)).join(', ');
}

function assertId(value: string, kind: string): void {
    if (!isSalesforceId(value)) {
        throw new Error(`Invalid ${kind} id`);
    }
}

function userClause(userName: string | undefined): string | undefined {
    return userName === undefined || ALL_USERS_VALUES.has(userName)
        ? undefined
        : `LogUser.Name = '${soqlEscape(userName)}'`;
}

function toLogRecord(row: Partial<ApexLogRecord>): ApexLogRecord {
    return {
        Id: row.Id as string,
        LogUser: row.LogUser ? { Name: row.LogUser.Name } : null,
        LogLength: row.LogLength as number,
        Operation: row.Operation as string,
        Application: row.Application as string,
        Status: row.Status as string,
        StartTime: row.StartTime as string,
        RequestIdentifier: row.RequestIdentifier as string,
    };
}

/**
 * Salesforce debug log operations used by the webview RPC routes and the DebugLogProvider.
 */
export class DebugLogService {
    /** The single implementation of the ApexLog list query. */
    public static async listLogs(filter: LogFilter = {}, limit: number = LOG_LIST_LIMIT): Promise<ApexLogList> {
        const connection = await SFUtils.getConnection();

        const conditions: string[] = [];
        const user = userClause(filter.userName);
        if (user) {
            conditions.push(user);
        }
        if (filter.size) {
            if (!Number.isFinite(filter.size.bytes)) {
                throw new Error('Invalid size filter');
            }
            const operator = filter.size.direction === 'above' ? '>' : '<';
            conditions.push(`LogLength ${operator} ${Math.trunc(filter.size.bytes)}`);
        }

        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const result = await connection.query<ApexLogRecord>(
            `SELECT Id, LogUser.Name, LogLength, Operation, Application, Status, StartTime, RequestIdentifier ` +
                `FROM ApexLog${where} ORDER BY StartTime DESC LIMIT ${Math.trunc(limit)}`,
        );

        const records = result.records.map(toLogRecord);
        Logger.debug(`Retrieved ${records.length} debug logs`, 'DebugLogService.listLogs');
        return { records, totalSize: records.length, done: true };
    }

    public static async searchUsers(searchTerm: string | undefined): Promise<{
        users: SalesforceUserWithTraceFlag[];
        currentUser: CurrentUser;
    }> {
        const connection = await SFUtils.getConnection();

        let query = 'SELECT Id, Name, Username FROM User WHERE IsActive = true';
        if (searchTerm) {
            const escaped = soqlLikeEscape(searchTerm);
            query += ` AND (Name LIKE '%${escaped}%' OR Username LIKE '%${escaped}%')`;
        }
        query += ` ORDER BY Name LIMIT ${USER_SEARCH_LIMIT}`;

        const [result, currentUser] = await Promise.all([
            connection.query<SalesforceUser>(query),
            this.getCurrentUser(connection),
        ]);

        const baseUsers: SalesforceUser[] = result.records.map(({ Id, Name, Username }) => ({ Id, Name, Username }));

        let traceFlags = new Map<string, TraceFlagRecord>();
        try {
            traceFlags = await this.getActiveTraceFlags(baseUsers.map((user) => user.Id));
        } catch (error) {
            // Trace flag info is optional decoration; still return the users
            Logger.error('Error getting trace flag information:', 'DebugLogService.searchUsers', error);
        }

        const users = baseUsers.map((user) => {
            const traceFlag = traceFlags.get(user.Id);
            return {
                ...user,
                TraceFlagId: traceFlag?.Id ?? null,
                TraceFlagActive: !!traceFlag,
                TraceFlagExpirationDate: traceFlag?.ExpirationDate ?? null,
                TraceFlagDebugLevel: traceFlag?.DebugLevel?.DeveloperName ?? null,
            };
        });
        return { users, currentUser };
    }

    private static getCurrentUser(connection: Connection): Promise<CurrentUser> {
        let cached = currentUsers.get(connection);
        if (!cached) {
            cached = connection.identity().then((identity) => ({
                display_name: identity.display_name,
                username: identity.username,
            }));
            cached.catch(() => currentUsers.delete(connection));
            currentUsers.set(connection, cached);
        }
        return cached;
    }

    // ---- Trace flags -------------------------------------------------------------------------

    public static async getActiveTraceFlags(userIds: string[]): Promise<Map<string, TraceFlagRecord>> {
        const flags = new Map<string, TraceFlagRecord>();
        if (userIds.length === 0) {
            return flags;
        }
        userIds.forEach((id) => assertId(id, 'user'));

        const connection = await SFUtils.getConnection();
        const idList = userIds.map((id) => `'${id}'`).join(', ');
        const result = await connection.tooling.query<TraceFlagRecord>(
            `SELECT Id, TracedEntityId, ExpirationDate, DebugLevel.DeveloperName FROM TraceFlag ` +
                `WHERE TracedEntityId IN (${idList}) AND ExpirationDate > ${new Date().toISOString()}`,
        );
        for (const record of result.records) {
            flags.set(record.TracedEntityId, record);
        }
        return flags;
    }

    /**
     * The org's debug levels for the level picker. The managed default level is left out: it is what
     * "no level selected" resolves to, and it only exists once it was first used.
     */
    public static async listDebugLevels(): Promise<DebugLevelRecord[]> {
        const connection = await SFUtils.getConnection();
        const result = await connection.tooling.query<DebugLevelRecord>(
            `SELECT Id, DeveloperName, MasterLabel FROM DebugLevel ORDER BY MasterLabel LIMIT ${DEBUG_LEVEL_LIST_LIMIT}`,
        );
        return result.records
            .filter((level) => level.DeveloperName !== DEBUG_LEVEL_NAME)
            .map(({ Id, DeveloperName, MasterLabel }) => ({ Id, DeveloperName, MasterLabel }));
    }

    /**
     * @param requestedDebugLevelId an existing DebugLevel to use; the managed default level is used when omitted
     */
    public static async createTraceFlag(userId: string, requestedDebugLevelId?: string): Promise<string> {
        assertId(userId, 'user');
        if (requestedDebugLevelId !== undefined) {
            assertId(requestedDebugLevelId, 'debug level');
        }
        const connection = await SFUtils.getConnection();

        const existing = await this.getActiveTraceFlags([userId]);
        if (existing.size > 0) {
            throw new Error('User already has an active trace flag');
        }

        const debugLevelId = requestedDebugLevelId ?? (await this.getDebugLevelId(connection));
        const now = Date.now();
        const result = (await connection.tooling.sobject('TraceFlag').create({
            TracedEntityId: userId,
            LogType: 'USER_DEBUG',
            DebugLevelId: debugLevelId,
            StartDate: new Date(now).toISOString(),
            ExpirationDate: new Date(now + TRACE_FLAG_DURATION_MS).toISOString(),
        })) as SaveResult;

        if (!result.success || !result.id) {
            throw new Error(`Failed to create trace flag: ${formatSaveErrors(result.errors)}`);
        }
        Logger.debug(`Created trace flag ${result.id}`, 'DebugLogService.createTraceFlag');
        return result.id;
    }

    public static async deleteTraceFlag(traceFlagId: string): Promise<void> {
        assertId(traceFlagId, 'trace flag');
        const connection = await SFUtils.getConnection();
        const result = (await connection.tooling.sobject('TraceFlag').delete(traceFlagId)) as SaveResult;
        if (!result.success) {
            throw new Error(`Failed to delete trace flag: ${formatSaveErrors(result.errors)}`);
        }
        Logger.debug(`Deleted trace flag ${traceFlagId}`, 'DebugLogService.deleteTraceFlag');
    }

    private static getDebugLevelId(connection: Connection): Promise<string> {
        let cached = debugLevelIds.get(connection);
        if (!cached) {
            cached = this.findOrCreateDebugLevel(connection);
            cached.catch(() => debugLevelIds.delete(connection));
            debugLevelIds.set(connection, cached);
        }
        return cached;
    }

    private static async findOrCreateDebugLevel(connection: Connection): Promise<string> {
        const existing = await connection.tooling.query<{ Id: string }>(
            `SELECT Id FROM DebugLevel WHERE DeveloperName = '${DEBUG_LEVEL_NAME}' LIMIT 1`,
        );
        if (existing.records.length > 0) {
            return existing.records[0].Id;
        }

        const result = (await connection.tooling.sobject('DebugLevel').create({
            DeveloperName: DEBUG_LEVEL_NAME,
            MasterLabel: 'Salesforce Multitools Debug Level',
            ApexCode: 'FINE',
            ApexProfiling: 'NONE',
            Callout: 'INFO',
            Database: 'INFO',
            System: 'DEBUG',
            Validation: 'INFO',
            Visualforce: 'INFO',
            Workflow: 'INFO',
        })) as SaveResult;

        if (!result.success || !result.id) {
            throw new Error(`Failed to create debug level: ${formatSaveErrors(result.errors)}`);
        }
        Logger.debug(`Created debug level ${result.id}`, 'DebugLogService.findOrCreateDebugLevel');
        return result.id;
    }

    // ---- Stored logs -------------------------------------------------------------------------

    /** Path of the stored copy of the log, downloading it first when it is not stored yet. */
    public static async ensureLogStored(logId: string): Promise<string> {
        assertId(logId, 'log');
        const connection = await SFUtils.getConnection();
        const filePath = await LogStorage.getLogPath(connection.instanceUrl, logId);

        if (await LogStorage.exists(filePath)) {
            return filePath;
        }

        let download = inFlightDownloads.get(filePath);
        if (!download) {
            Logger.debug(`Downloading log ${logId}`, 'DebugLogService.ensureLogStored');
            download = openLogBody(connection, logId)
                .then((body) => LogStorage.write(filePath, body))
                .finally(() => inFlightDownloads.delete(filePath));
            inFlightDownloads.set(filePath, download);
        }
        await download;
        return filePath;
    }

    public static async isLogStored(logId: string): Promise<boolean> {
        assertId(logId, 'log');
        const connection = await SFUtils.getConnection();
        return LogStorage.exists(await LogStorage.getLogPath(connection.instanceUrl, logId));
    }

    /**
     * Entry point name of a log (class.method, trigger or flow), or '' when none was found.
     * Results are cached (LRU) and lookups are limited to a few concurrent requests.
     */
    public static getMethodName(logId: string): Promise<string> {
        assertId(logId, 'log');
        let cached = methodNameCache.get(logId);
        if (!cached) {
            cached = methodNameLimiter.run(() => this.resolveMethodName(logId));
            // Failures are not cached so a later request can retry
            cached.catch(() => methodNameCache.delete(logId));
            methodNameCache.set(logId, cached);
        }
        return cached;
    }

    private static async resolveMethodName(logId: string): Promise<string> {
        const connection = await SFUtils.getConnection();
        const storedPath = await LogStorage.getLogPath(connection.instanceUrl, logId);

        const head = (await LogStorage.exists(storedPath))
            ? await LogStorage.readHead(storedPath, STORED_HEAD_BYTES)
            : await readLogHead(connection, logId, REMOTE_HEAD_BYTES);

        return extractMethodName(head.text, { truncated: head.truncated }) ?? '';
    }

    // ---- Deletion ----------------------------------------------------------------------------

    public static async deleteLog(logId: string): Promise<void> {
        assertId(logId, 'log');
        const connection = await SFUtils.getConnection();

        const result = (await connection.sobject('ApexLog').destroy(logId)) as SaveResult;
        if (!result.success) {
            throw new Error(`Failed to delete log: ${formatSaveErrors(result.errors)}`);
        }
        methodNameCache.delete(logId);

        // The local copy is only a cache; failing to remove it must not fail the delete
        try {
            await LogStorage.remove(await LogStorage.getLogPath(connection.instanceUrl, logId));
        } catch (error) {
            Logger.warn(`Could not remove stored copy of log ${logId}: ${String(error)}`, 'DebugLogService.deleteLog');
        }
        Logger.debug(`Deleted debug log ${logId}`, 'DebugLogService.deleteLog');
    }

    /** Remove local cached copies of logs; the cache is best effort, so failures are ignored. */
    private static async removeStoredCopies(instanceUrl: string, logIds: string[]): Promise<void> {
        await Promise.all(
            logIds.map(async (id) => {
                try {
                    await LogStorage.remove(await LogStorage.getLogPath(instanceUrl, id));
                } catch {
                    // stale cache entry at worst
                }
            }),
        );
    }

    /** Delete every log (optionally of one user), paging through all matching records. */
    public static async deleteLogs(userName: string | undefined): Promise<BulkDeleteResult> {
        const connection = await SFUtils.getConnection();
        const user = userClause(userName);
        const query = `SELECT Id FROM ApexLog${user ? ` WHERE ${user}` : ''}`;

        const result = await connection.query<{ Id: string }>(query, {
            autoFetch: true,
            maxFetch: MAX_BULK_DELETE_RECORDS,
        });
        const ids = result.records.map((record) => record.Id);

        let deleted = 0;
        let failed = 0;
        for (let start = 0; start < ids.length; start += DELETE_CHUNK_SIZE) {
            const chunk = ids.slice(start, start + DELETE_CHUNK_SIZE);
            try {
                const results = (await connection
                    .sobject('ApexLog')
                    .destroy(chunk, { allOrNone: false })) as SaveResult[];
                const succeededIds = chunk.filter((_, index) => results[index]?.success);
                deleted += succeededIds.length;
                failed += chunk.length - succeededIds.length;
                succeededIds.forEach((id) => methodNameCache.delete(id));
                await this.removeStoredCopies(connection.instanceUrl, succeededIds);
            } catch (error) {
                Logger.error(`Failed to delete a chunk of ${chunk.length} logs`, 'DebugLogService.deleteLogs', error);
                failed += chunk.length;
            }
        }
        Logger.debug(`Bulk delete: ${deleted} deleted, ${failed} failed`, 'DebugLogService.deleteLogs');
        return { deleted, failed, total: ids.length };
    }
}
