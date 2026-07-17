import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { SFUtils } from '../../utils/sfutils';
import { extractMethodNameFromLog } from './logParser';
import { buildApexLogQuery, buildUserSearchQuery, buildBulkDeleteApexLogQuery, SF_API_VERSION } from '../../utils/sfQueries';
import { DebugLogProvider } from './debugLogProvider';

export class DebugLogService {
    public static async getDebugLogs(userFilter?: string, size?: number, sizeDirection?: string) {
        const connection = await SFUtils.getConnection();
        const query = buildApexLogQuery(userFilter);
        const logs = await connection.query(query);

        let logRecords: any = logs.totalSize > 0 ? logs : { records: [], totalSize: 0 };

        if (logRecords.records && size && (sizeDirection === 'above' || sizeDirection === 'below')) {
            logRecords.records = logRecords.records.filter((log: any) =>
                sizeDirection === 'above' ? log.LogLength > size : log.LogLength < size,
            );
            logRecords.totalSize = logRecords.records.length;
        }

        return logRecords;
    }

    public static async getUsers(searchTerm?: string) {
        const connection = await SFUtils.getConnection();
        const query = buildUserSearchQuery(searchTerm);
        const users = await connection.query(query);

        const userIds = users.records.map((user: any) => user.Id);
        let usersWithTraceFlags = users.records;

        if (userIds.length > 0) {
            try {
                const traceFlagMap = await DebugLogProvider.getActiveTraceFlagsForUsers(userIds);
                usersWithTraceFlags = users.records.map((user: any) => {
                    const traceFlag = traceFlagMap.get(user.Id);
                    return {
                        ...user,
                        TraceFlagId: traceFlag?.Id || null,
                        TraceFlagActive: !!traceFlag,
                        TraceFlagExpirationDate: traceFlag?.ExpirationDate || null,
                    };
                });
            } catch (err) {
                Logger.error('Error getting trace flag information', 'DebugLogService', err);
            }
        }

        const currentUserInfo = await connection.identity();
        return { users: usersWithTraceFlags, currentUser: currentUserInfo };
    }

    public static async bulkDeleteLogs(userName?: string) {
        const connection = await SFUtils.getConnection();
        const query = buildBulkDeleteApexLogQuery(userName);
        const logs = await connection.query(query);
        const logIds = logs.records.map((log: any) => log.Id);

        let deleted = 0, failed = 0;
        const batchSize = 10;
        for (let i = 0; i < logIds.length; i += batchSize) {
            const batch = logIds.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(async (logId) => {
                    await connection.request({
                        url: `/services/data/${SF_API_VERSION}/sobjects/ApexLog/${logId}`,
                        method: 'DELETE',
                    });
                    return 'deleted';
                })
            );
            deleted += results.filter((r) => r.status === 'fulfilled' && r.value === 'deleted').length;
            failed += results.filter((r) => r.status === 'rejected').length;
        }

        return { deleted, failed, total: logIds.length };
    }

    public static async downloadAndOpenLog(logId: string) {
        const connection = await SFUtils.getConnection();
        const storedLogPath = await this.getStoredLogPath(logId, connection);
        let logFilePath: string;

        if (await this.fileExists(storedLogPath)) {
            logFilePath = storedLogPath;
        } else {
            const logContent = await connection.request({
                url: `/services/data/${SF_API_VERSION}/sobjects/ApexLog/${logId}/Body`,
                method: 'GET'
            }) as string;
            logFilePath = await this.saveLogFile(logId, logContent, connection);
        }

        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(logFilePath));
        return logFilePath;
    }

    public static async getMethodName(logId: string) {
        const connection = await SFUtils.getConnection();
        const storedLogPath = await this.getStoredLogPath(logId, connection);
        if (await this.fileExists(storedLogPath)) {
            return await this.extractMethodNameFromStoredLog(storedLogPath);
        } else {
            const logContent = await connection.request({
                url: `/services/data/${SF_API_VERSION}/sobjects/ApexLog/${logId}/Body`,
                method: 'GET'
            }) as string;
            const methodName = extractMethodNameFromLog(logContent);
            return methodName;
        }
    }

    public static async getStoredLogPath(logId: string, connection: any): Promise<string> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('No workspace folder found to store logs');
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const sfdxFolder = path.join(rootPath, '.sfdx');
        const multiToolFolder = path.join(sfdxFolder, '_multi-tool');
        const logsFolder = path.join(multiToolFolder, 'debug-logs');

        await fs.promises.mkdir(logsFolder, { recursive: true });

        const orgId = connection?.instanceUrl
            ? connection.instanceUrl
                  .replace(/^https?:\/\//, '')
                  .replace(/[^a-zA-Z0-9.-]/g, '-')
                  .toLowerCase()
            : 'unknown-org';

        const orgFolder = path.join(logsFolder, orgId);
        await fs.promises.mkdir(orgFolder, { recursive: true });

        return path.join(orgFolder, `${logId}.log`);
    }

    private static async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private static async saveLogFile(logId: string, content: string, connection: any): Promise<string> {
        const logFilePath = await this.getStoredLogPath(logId, connection);
        await fs.promises.writeFile(logFilePath, content, 'utf8');
        return logFilePath;
    }

    private static async extractMethodNameFromStoredLog(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 });
            let buffer = '';
            let methodName = 'NO_METHOD_NAME_FOUND';
            const timeout = setTimeout(() => {
                stream.destroy();
                resolve('PROCESSING_TIMEOUT');
            }, 5000);

            stream.on('data', (chunk: any) => {
                buffer += chunk;
                const lastNewline = buffer.lastIndexOf('\\n');
                if (lastNewline !== -1) {
                    const completeLines = buffer.substring(0, lastNewline);
                    buffer = buffer.substring(lastNewline + 1);
                    const extracted = extractMethodNameFromLog(completeLines);
                    if (extracted !== 'NO_METHOD_NAME_FOUND') {
                        methodName = extracted;
                        stream.destroy();
                    }
                }
            });

            stream.on('end', () => {
                clearTimeout(timeout);
                if (methodName === 'NO_METHOD_NAME_FOUND' && buffer) {
                    const extracted = extractMethodNameFromLog(buffer);
                    if (extracted !== 'NO_METHOD_NAME_FOUND') {methodName = extracted;}
                }
                resolve(methodName);
            });

            stream.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
            
            stream.on('close', () => {
                clearTimeout(timeout);
                resolve(methodName);
            });
        });
    }
}
