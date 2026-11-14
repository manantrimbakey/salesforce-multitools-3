import * as vscode from 'vscode';
import { DebugLogService } from '../../services/debugLogService';
import { Logger } from '../../utils/logger';

/** Log summary shaped for the (legacy) message based UI. */
export interface DebugLogSummary {
    id: string;
    logUser: string;
    logLength: number;
    operation: string;
    application: string;
    status: string;
    logDate: string;
    requestId: string;
}

/**
 * VS Code facing operations on Salesforce debug logs. Salesforce access, caching and storage live
 * in DebugLogService / LogStorage.
 */
export class DebugLogProvider {
    /**
     * Fetch the latest debug logs from Salesforce
     */
    public static async fetchDebugLogs(): Promise<DebugLogSummary[]> {
        try {
            const { records } = await DebugLogService.listLogs();
            return records.map((log) => ({
                id: log.Id,
                logUser: log.LogUser?.Name ?? 'Unknown User',
                logLength: log.LogLength,
                operation: log.Operation,
                application: log.Application,
                status: log.Status,
                logDate: log.StartTime,
                requestId: log.RequestIdentifier,
            }));
        } catch (error) {
            Logger.error('Error fetching debug logs:', 'DebugLogProvider.fetchDebugLogs', error);
            throw error;
        }
    }

    /**
     * Delete a debug log in Salesforce (and its stored local copy)
     */
    public static async deleteDebugLog(logId: string): Promise<void> {
        try {
            await DebugLogService.deleteLog(logId);
        } catch (error) {
            Logger.error(`Error deleting log with ID ${logId}:`, 'DebugLogProvider.deleteDebugLog', error);
            throw error;
        }
    }

    /**
     * Make sure the log is stored locally and return the path of the stored file
     */
    public static async downloadDebugLog(logId: string): Promise<string> {
        try {
            const filePath = await DebugLogService.ensureLogStored(logId);
            Logger.debug(`Debug log stored at: ${filePath}`, 'DebugLogProvider.downloadDebugLog');
            return filePath;
        } catch (error) {
            Logger.error(`Error downloading log with ID ${logId}:`, 'DebugLogProvider.downloadDebugLog', error);
            throw error;
        }
    }

    /**
     * Open the stored log file in an editor tab
     */
    public static async viewDebugLog(logId: string): Promise<void> {
        try {
            const filePath = await this.downloadDebugLog(logId);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath), {
                preview: false,
                viewColumn: vscode.ViewColumn.One,
            });
        } catch (error) {
            Logger.error(`Error viewing log with ID ${logId}:`, 'DebugLogProvider.viewDebugLog', error);
            throw error;
        }
    }
}
